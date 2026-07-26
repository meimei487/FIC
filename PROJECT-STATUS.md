# 火線暴走：鋼鐵縱隊 — 專案進度總覽

當前版本：**v8.5.6**
狀態：**原始碼已與線上版同步**（原始碼可自行 build 出 v8.5.6）

---

## 一、這次做了什麼：原始碼重建

### 起因

repo 的工作流程長期是「在對話裡改程式碼 → 下載 build 好的 HTML → 覆蓋 `docs/index.html` 推上去」。
結果建置成品一路跟到 v8.5.6，但 **原始碼從未推回 repo**，`src/` 停在 v8.5.3，而且連 v8.5.3 就有的 Supabase 排行榜都不在裡面。

發現時的落差：

| | 版本 |
|---|---|
| `docs/index.html`（線上實際跑的） | v8.5.6 ✅ |
| `src/`（原始碼） | v8.5.3，且缺排行榜 |
| 根目錄 `index.html` | **完全不存在** |

最後一項最嚴重——那是 Vite 的進入點，少了它 `npm run build` 直接失敗，等於整個專案無法從原始碼建置。

### 重建方法

v8.5.6 的建置檔本身就是最完整的規格書。壓縮只改了變數名稱，邏輯結構完好，所以逐項從壓縮碼反推回乾淨的原始碼，每補一項就 build 一次，用檔案大小與關鍵字計數驗證進度。

```
起始差距  4,254 bytes
補完 #1   3,923 bytes
補完 #4#5 2,986 bytes
補完 #6     223 bytes  ← 剩餘差異為程式碼去重造成，非功能缺漏
```

### 補回的項目

**0. Supabase 排行榜（資料庫端 + 客戶端）**

- `supabase-schema.sql`：從 Supabase 匯出的五段 SQL 中辨識出現行版本（第 5 段），還原成 repo 內的結構文件
- `src/leaderboard.js`（新檔）：三分類 view 對照、暱稱清洗、個人紀錄判定、上傳／查詢／排名
- `src/storage.js`：匿名 `client_id` 生成（`crypto.randomUUID` 優先，不支援時手刻 UUIDv4）、profile 新增 `nickname` / `leaderboardClientId` / `leaderboardBest` / `hazardGraduated` 四個欄位與對應清洗
- `src/ui.js`：排行榜畫面、分類頁籤、結算畫面的暱稱輸入與上傳區塊
- `src/main.js`：`openLeaderboard` / `switchLeaderboardCategory` / `loadLeaderboardCategory` / `handleSubmitScore` 四個處理器
- `src/styles.css`：排行榜全部樣式

**1. 根目錄 `index.html`（原本不存在）**

從建置檔反推重建，含載入提示區塊。提示刻意放在 module script **之前**——單檔建置會把整個遊戲含音訊內嵌成一個巨大 script，提示若排在後面，瀏覽器得下載完 23MB 才畫得出東西，等於形同虛設。放在前面約 62KB 就能顯示。

這個順序錯了遊戲照樣能跑（只是退回白畫面），一般測試抓不到，所以另外加了 `tests/entry-html.test.js` 專門守它。

**2. 結算畫面手機版可捲動**

排行榜上傳區塊讓結算畫面在小螢幕上超出容器高度，「返回集結區」被裁到畫面外。`.result` 改為 `justify-content: flex-start` + `overflow-y: auto`。

**3. 積分成就漸進式顯示**

- 新增兩階隱藏天花板：`score50m`（戰史封神，5000萬）、`score100m`（縱隊神話，1億）
- 只顯示「已達成的」＋「緊接的下一階」，更後面全部隱藏
- 區段標題從 `積分 3/10` 改為 `積分已達成 3 項`——原本的分母會把總階數洩漏出去，隱藏就失去意義

**4. 最快通關排行榜（方案B）**

擊破第 3 隻 Boss（Moloch）的當下記錄耗時並標記 `firstClearAchieved`，但**不中斷對局**。這是無限刷分街機，在此結束會讓玩家損失分數。該紀錄之後永久有效，即使該局最終戰敗，上傳成績仍會帶上。

**5. 難度爬坡（方案C）**

```
未通關帳號：第一輪無機制 → 第二輪三選一 → 第三輪三選二 → 第四輪起全開
已通關帳號：hazardGraduated 永久標記，任何新局第一輪就全開
```

舊存檔依「機甲屠夫」成就（單局擊破 3 座機甲堡壘）自動追溯判定為已畢業，老玩家不必重爬。MAX 出擊不受爬坡影響，一律全開。

**6. 前三戰區專屬場地機制**

原本只有後三區有，現在六區全補齊：

| 戰區 | 機制 | 設計意圖 |
|---|---|---|
| 破曉港區 | 灘頭炮擊 | 兩側固定砲擊，中央永遠安全——開場區，答案好懂 |
| 赤砂峽谷 | 裝甲彈幕 | 三條隨機窄帶，縫隙位置每次不同 |
| 鋼鐵都城 | 空優轟炸 | 鎖定當前位置的大圓、預警長——罰站定不罰手殘 |
| 熔爐工業帶 | 熔爐洩壓 | （原有） |
| 零號雪原 | 極寒脈衝 | （原有） |
| 天穹防線 | 高空鎖定 | （原有） |

### 順手修掉的潛在 bug

`leaderboard` 資料表的分數上限原本卡在 **1 億**，與遊戲內「縱隊神話」成就的目標值完全相同。任何真的打破 1 億的成績會被 check constraint 擋下，客戶端的 `catch { return false }` 只會顯示「上傳失敗」，查不出原因——而且**專挑最強的玩家發生**。

已在 Supabase 執行 `ALTER TABLE` 放寬到 21 億（integer 上限附近），不影響既有資料，`supabase-schema.sql` 也已同步。

---

## 一之二、建置流程的三個隱形失效

重建完成後在補文件時，交叉核對又挖出三個問題。共同點是**全都不會報錯**：測試照過、build 照成功、遊戲照跑，只有玩家看得到症狀。

### 1. 戰區危害間隔漏了三個值

v8.5.6 對每個戰區有各自的觸發間隔，我補場地機制時只留了 `skyfront` 與 `foundry`，三個新戰區全部吃到預設的 10 秒。

驗證方法的盲點：我比對的是機制名稱字串的出現次數，而這三個是純數值，不會反映在計數上。是核對 GAME-MECHANICS.md 的間隔表才浮出來的。

已補齊：`skyfront 7.5 / canyon 8 / foundry 8.5 / harbor 9 / capital 9.5 / 其他 10`。

### 2. Vite 把 script 提升到 head，載入畫面形同虛設

Vite 會把建置後的 `<script type="module">` 移進 `<head>`，導致 23MB 的酬載排在載入畫面**前面**。瀏覽器要串流完整份文件才會解析到提示的標記——玩家整段下載都盯著白畫面，提示在載入完成的瞬間才出現。

這個問題**在重建的每一版都存在**，因為當時只驗證了 `#boot-loading` 字串「存在」（計數相符），沒驗證它的「位置」。

修法：`vite.config.js` 加 `keep-script-at-end-of-body` 外掛，趁 script 還是小小的 `src="..."` 引用時把它移回 `</body>` 前，再交給 singlefile 就地內嵌。

### 3. pack-portable 抓錯 script

`pack-portable.mjs` 原本抓「第一個 `<script>`」。載入進度腳本插到前面後，它把那段一點五KB的計時器當成遊戲打包，壓出 87KB 的空殼並**覆蓋掉 `dist/index.html`**。

已改為明確匹配 `type="module"`。

### 為此加的兩道守衛

原始碼層的測試守不住這類問題——**原始碼測試全過，建置產物照樣是壞的**。

- `tests/entry-html.test.js`：檢查 `index.html` 的元素順序（提示在前、進度腳本是 classic script、掛在 `#root` 內）
- `scripts/verify-build.mjs`：檢查**建置產物**，接進 `npm run build` 且排在 `pack-portable` **之後**，驗的是最終檔案。順序錯了會 exit 非零，擋下建置

建置順序現為 `vite build → pack-portable → verify-build`。

---

## 一之三、載入畫面與內建瀏覽器

### 載入畫面

原本只有轉圈動畫加靜態文字。23MB 在 4G 上要 30~60 秒，轉一分鐘毫無變化，玩家會認為當掉。

現在有三樣會動的東西：

- **進度條**——先快後慢的漸近曲線，封頂 92%，不會假裝跑完
- **已等待 N 秒**——精確計時，這才是真正讓人確認「沒當掉」的東西
- **分階段文案**——20 / 45 / 90 秒各換一句，讓等待有預期

進度條是**時間估算不是實際位元組**。單檔架構下所有東西都在同一個 inline script 裡，沒有獨立資源可以掛 progress 監聽，腳本拿不到自己的下載進度。

顯示條件天然正確：`#boot-loading` 掛在 `#root` 裡，由 `mount()` 覆寫時消失。有真的在下載才看得到，快取命中時一閃而過。

### LINE 內建瀏覽器的實測

同一支手機（Android 12，320×694），LINE 內建瀏覽器 vs 一般 Chrome：

| | LINE | Chrome |
| --- | ---: | ---: |
| innerHeight | 500 | 548 |
| 100dvh | 500.74 | 547.85 |
| 100vh / 100lvh | 500.74 | 603.85 |
| game-shell 實算 | 281.8 × 500.74 | 308.31 × 547.85 |

`dvh` 兩邊都支援。差別在 LINE 的標題列**收不掉**，所以 `vh / dvh / svh / lvh` 四個值塌成同一個，沒有「大視窗」狀態；而且比 Chrome 還多吃 47px。畫面寬度由高度換算，於是整體小約 8.6%。

**全螢幕在 LINE 裡可以正常使用**，而且一按就把版面問題完全解決。（先前曾誤判為不支援——`requestFullscreen` 方法存在不代表允許，但 LINE 的 `document.fullscreenEnabled` 確實是 `true`。）

診斷用的 `docs/viewport-check.html` 留在 repo 裡，之後遇到類似問題可以直接請人開來取數字。

### 隨之而來的兩個修正

**選單在矮視窗會疊字。** `.overlay` 用 `overflow: hidden`，內容超出容器時不捲動而是被裁掉，flex 項目又被壓縮到比內容還矮，文字於是溢出自己的框、疊到下一個元素上。LINE 未全螢幕時特別明顯。

修法：`.menu` 改為 `justify-content: flex-start` + `overflow-y: auto`，並對子項目加 `flex-shrink: 0`。

**內建瀏覽器提示。** 偵測到 LINE / Facebook / Instagram / Messenger 的 WebView 且**尚未全螢幕**時，選單顯示一行提示，指向眼前那個一按就好的全螢幕按鈕。進入全螢幕後自動消失——那時問題已經解決，再占版面沒有意義。

---

## 二、目前的 repo 狀態

```
FIC-main/
├─ index.html              進入點（2.5KB，含載入提示）
├─ package.json            version 8.5.6
├─ vite.config.js          Vite + singlefile + keep-script-at-end-of-body 外掛
├─ supabase-schema.sql     後端結構文件
├─ docs/index.html         建置成品，GitHub Pages 由此 host
├─ src/
│  ├─ config.js            戰區、成就、難度參數、ZONES
│  ├─ main.js              應用主體與事件分派
│  ├─ ui.js                所有畫面渲染
│  ├─ leaderboard.js       Supabase 網路層
│  ├─ storage.js           profile 讀寫與清洗
│  ├─ audio.js / music-score.js / audio-assets.js
│  ├─ fullscreen-layout.js
│  ├─ styles.css           （import generated/legacy.css）
│  ├─ assets/audio/        11 首 AI 生成配樂
│  ├─ generated/           art.js、legacy.css（自動產生，勿手改）
│  └─ game/
│     ├─ combat.js         戰鬥引擎、Boss、場地機制
│     ├─ render.js         canvas 繪製
│     └─ state.js          run 狀態、序列化、存檔遷移
├─ tests/                  175 個測試，全數通過
└─ scripts/                pack-portable.mjs、extract-legacy.mjs、verify-build.mjs
```

**建置與部署**

```bash
npm install
npm test                 # 175 tests
npm run build            # → dist/index.html
cp dist/index.html docs/index.html
git commit && git push   # 等 1-2 分鐘部署，強制重新整理測試
```

---

## 三、未完成項目

三項都已有明確方向，但**完全還沒動手**。

### 多國語言版（英／日／越）

已完整盤點：**569 個字串，分布在 6 個檔案**。

⚠️ 最大風險點：`src/game/render.js` 的 canvas 文字是**寫死座標、不會自動換行**。中文短、英文長、日文有假名混排，德語式的長複合詞會直接衝出畫面。這不是翻譯工作量的問題，是版面工程的問題。

建議先做一支「最長字串模擬器」測 canvas 區塊的容納上限，再決定要改成自動換行還是縮字級。

### 後期軍備點消耗系統

方向初定「外觀消耗 ＋ 排行榜身分象徵」。

未解問題：**沒有美術資源**，外觀只能用程式碼畫幾何圖形。要做成什麼樣子（機體塗裝？縱隊隊形變化？排行榜名字旁的徽記？）還沒談清楚。

### 每輪隨機突變機制（roguelite modifier）

公認是解決「刷久會膩」最治本的方向，但**工程量是所有選項裡最大的**，一直被排在最後。

---

## 三之二、待你目視確認

選單溢出的修正（`flex-shrink: 0` + `overflow-y: auto`）沒有辦法自動驗證，需要實際看畫面：

- LINE 未全螢幕時，疊字是否消失
- **LINE 全螢幕時排版有沒有變差**——那個狀態本來就是好的，別讓它退步
- 桌機瀏覽器的選單有沒有多出不該有的捲動

如果全螢幕狀態被改壞了，把捲動修正限定在矮視窗才套用（加 `@media (height <= 520px)` 之類的條件）即可。

---

## 四、已知限制（設計選擇，不是 bug）

- **沒有真正的破關結局**。三隻 Boss 都打倒後，戰區持續洗牌循環。這是刻意保留的無限刷分街機玩法。
- **排行榜沒有防作弊**，成績由玩家端自行回報。當初就選定「純好玩」的方向，換取後端維持在免費層、不需自架伺服器。若之後真的被濫用，最快的處理是去 Supabase 後台關閉或收緊 insert policy，**不需重新部署遊戲**。

---

## 五、給未來的自己

這次會需要花整段時間重建，根本原因是**程式碼只活在對話裡**。對話一刪，v8.5.4 到 v8.5.6 的所有原始碼就沒了，只剩建置成品。

之後的習慣：

1. **改完就推 `src/`**，不要只推 `docs/`。原始碼與成品必須一起走。
2. `npm run build` 之前先 `npm test`。175 個測試跑完不到 2 秒。
3. 重要的設計決策（像方案B、方案C 的取捨理由）寫進 commit message 或這份文件，不要只留在對話裡。
4. 根目錄 `index.html` 和 `docs/index.html` **不是同一個東西**——前者是 5.9KB 的進入點，後者是 23MB 的建置成品。不要互相覆蓋。
5. **「字串存在」不等於「功能正常」。** 這次三個隱形失效裡有兩個，都是因為驗證停在「有沒有這個字串」而沒問「它在對的位置嗎、值對嗎」。會通過測試又照樣壞掉的東西，要嘛用產物層的檢查守住，要嘛就得真的用眼睛看。
