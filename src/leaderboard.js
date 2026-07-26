// Supabase-backed leaderboard.
//
// There is no account system. Scores are self-reported by the browser and are
// not cheat-proof — an accepted tradeoff to keep the backend on a free tier
// with no server of our own. If it is ever abused, the fastest fix is to
// tighten the insert policy from the Supabase dashboard; no redeploy needed.
//
// The publishable key below is safe to ship: it only grants what the row level
// security policies in supabase-schema.sql allow (read all rows, insert one).

const SUPABASE_URL = "https://dznepfbjczroppghztsi.supabase.co";
const SUPABASE_KEY = "sb_publishable_rVOZ3Nugw92TGlIdRDr_sQ_ZchTtyID";

export const LEADERBOARD_ENABLED = Boolean(SUPABASE_KEY);
export const NICKNAME_MAX = 16;

// Three separate boards. Each view already dedupes to one row per client_id,
// so a player's best score, fastest clear and highest boss count can each
// surface independently — they do not have to come from the same run.
const CATEGORIES = {
  score: { view: "leaderboard_best", order: "score.desc" },
  fastest: { view: "leaderboard_fastest", order: "clear_seconds.asc" },
  bosskills: { view: "leaderboard_bosskills", order: "boss_kills.desc" }
};

const SELECT_COLUMNS =
  "client_id,nickname,score,boss_kills,commander,clear_seconds,victory,created_at";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export function sanitizeNickname(value) {
  return String(value ?? "")
    .trim()
    .slice(0, NICKNAME_MAX)
    .replace(/[<>"'`]/g, "");
}

/**
 * Would this run improve on the player's own stored bests in any category?
 * Used to warn before uploading a run that beats nothing — the upload is still
 * allowed, the player just gets asked to confirm.
 */
export function isPersonalRecord(best, { score, bossKills, clearSeconds, victory }) {
  if (score > (best?.score || 0) || bossKills > (best?.bossKills || 0)) return true;
  if (victory && Number.isFinite(clearSeconds)) {
    const previous = best?.clearSeconds;
    if (previous == null || clearSeconds < previous) return true;
  }
  return false;
}

export async function submitScore({
  clientId,
  nickname,
  score,
  bossKills,
  commander,
  clearSeconds,
  victory
}) {
  if (!LEADERBOARD_ENABLED) return false;
  const name = sanitizeNickname(nickname);
  if (!name || !clientId) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard`, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        client_id: clientId,
        nickname: name,
        score: Math.max(0, Math.floor(Number(score) || 0)),
        boss_kills: Math.max(0, Math.floor(Number(bossKills) || 0)),
        commander: commander || null,
        // clear_seconds is only meaningful on a run that actually cleared.
        clear_seconds:
          victory && Number.isFinite(clearSeconds) ? Math.max(0, Math.round(clearSeconds)) : null,
        victory: Boolean(victory)
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLeaderboard(category = "score", limit = 20) {
  if (!LEADERBOARD_ENABLED) return null;
  const target = CATEGORIES[category] || CATEGORIES.score;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${target.view}?select=${SELECT_COLUMNS}&order=${target.order}&limit=${limit}`,
      { headers: headers() }
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Where this client sits in a category, or null if outside searchLimit.
 * Deliberately a plain scan of the top N rather than a server-side rank query —
 * the boards are small and this keeps the schema free of extra functions.
 */
export async function fetchRank(category, clientId, { searchLimit = 100 } = {}) {
  if (!LEADERBOARD_ENABLED || !clientId) return null;
  const rows = await fetchLeaderboard(category, searchLimit);
  if (!rows) return null;
  const index = rows.findIndex((row) => row.client_id === clientId);
  return index === -1 ? null : index + 1;
}

export { CATEGORIES as LEADERBOARD_CATEGORIES };
