-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Creates the leaderboard table plus the access rules that let the game read
-- and write scores from the browser without needing real user accounts.
--
-- WARNING: the reset snippet below WILL destroy live player scores. It was
-- written back when the table held nothing worth keeping; the leaderboard is
-- now in production. Do not run it unless you genuinely intend to wipe every
-- submitted score. There is no undo.
--
--   drop view if exists leaderboard_best;
--   drop view if exists leaderboard_fastest;
--   drop view if exists leaderboard_bosskills;
--   drop table if exists leaderboard;
--
-- To change an existing constraint instead, use ALTER TABLE ... DROP
-- CONSTRAINT / ADD CONSTRAINT, which leaves the data untouched.

create table if not exists leaderboard (
  id bigint generated always as identity primary key,
  -- Anonymous per-browser id (a random UUID generated client-side and cached
  -- in localStorage) — NOT tied to any real identity. This exists only so two
  -- different players who happen to pick the same nickname don't silently
  -- overwrite each other's spot on the leaderboard; nickname alone is not a
  -- reliable "who is this" key.
  client_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 16),
  -- Upper bound is deliberately far above any achievement target. It was
  -- originally 100000000, which collided with the in-game "縱隊神話" goal of
  -- exactly 100,000,000 points — a legitimate run that hit the cap would be
  -- rejected by this constraint and the player would just see a silent upload
  -- failure. This is an endless arcade grinder with no ending, so the cap
  -- exists only to reject absurd garbage data, not to bound real play.
  score integer not null check (score >= 0 and score <= 2000000000),
  boss_kills integer not null default 0 check (boss_kills >= 0 and boss_kills <= 1000),
  commander text,
  clear_seconds numeric check (clear_seconds is null or (clear_seconds >= 0 and clear_seconds <= 36000)),
  victory boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_client_id_idx on leaderboard (client_id);

alter table leaderboard enable row level security;

-- Anyone can read the leaderboard (needed to display it in the game).
create policy "Anyone can read leaderboard"
  on leaderboard for select
  using (true);

-- Anyone can submit a score. There is no account system, so this is
-- self-reported and not cheat-proof — an accepted tradeoff for keeping this
-- backend-free-tier-simple. If it's ever abused, the fastest fix is to
-- disable or tighten this policy from the Supabase dashboard — no redeploy
-- of the game needed.
create policy "Anyone can insert a score"
  on leaderboard for insert
  with check (true);

-- Three leaderboards, each showing one row per real player (deduped by
-- client_id, not nickname) — best total score, fastest clear, most boss
-- kills. A player's own best in each category surfaces independently, even
-- if their best-score run wasn't also their fastest-clear run.
create or replace view leaderboard_best as
select distinct on (client_id)
  client_id, nickname, score, boss_kills, commander, clear_seconds, victory, created_at
from leaderboard
order by client_id, score desc;

create or replace view leaderboard_fastest as
select distinct on (client_id)
  client_id, nickname, score, boss_kills, commander, clear_seconds, victory, created_at
from leaderboard
where victory = true and clear_seconds is not null
order by client_id, clear_seconds asc;

create or replace view leaderboard_bosskills as
select distinct on (client_id)
  client_id, nickname, score, boss_kills, commander, clear_seconds, victory, created_at
from leaderboard
order by client_id, boss_kills desc;
