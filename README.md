# MyView Helper Google Apps Script 專案

## 總覽

此專案是一個基於 Google Apps Script (GAS) 的「MyView 小幫手」應用程式。它利用 Google Drive 作為後端資料儲存庫，存放教育內容（JSON 檔案），並透過部署為 Web App 的 GAS 服務，直接向使用者提供一個互動式的前端介面。

專案的核心設計理念是：
*   **資料集中管理**：所有課程和考試資料都以 JSON 格式儲存在 Google Drive 的指定資料夾中。
*   **高效能存取**：透過 Google Apps Script 的 `CacheService` 實作快取機制，大幅減少對 Google Drive 的重複讀取，提升應用程式的反應速度。
*   **單一服務部署**：前端 HTML 介面直接由 Google Apps Script 服務提供，簡化了部署流程。
*   **豐富的互動功能**：前端包含課程瀏覽、單字練習、測驗等功能，並支援語音朗讀。

## 功能特色

### 後端 (`Code.js`)
*   **Google Drive 資料庫**：將課程單元、考試設定等教育內容以 JSON 檔案形式儲存在指定的 Google Drive 資料夾中。
*   **智慧快取機制**：
    *   利用 `CacheService` 儲存從 Drive 讀取的資料，快取時間設定為 0.5 小時 (1800 秒)。
    *   實作了 `putLargeCache` 和 `getLargeCache` 函式，支援將超過 100KB 限制的大型資料分塊儲存和讀取，有效克服 Apps Script 快取大小限制。
*   **Web App 服務**：`doGet(e)` 函式作為 Web App 的入口點，直接回傳 `Index.html` 頁面。
*   **資料動態載入**：
    *   `getAllDataFromDrive()`：負責從快取或 Google Drive 讀取所有課程和考試的元數據 (metadata)。
    *   `getUnitData(id)`：根據單元 ID 按需載入單一單元的完整詳細內容，支援在主資料夾和 `legacy` 子資料夾中搜尋，以實現向下相容。
*   **資料整理與排序**：`fetchFromDriveAndBuildDB()` 函式會遍歷 Drive 中的 JSON 檔案，根據 `grade` 屬性將課程分類到 `grade1` 和 `grade2`，並將考試設定儲存到 `exams`。所有課程列表會按 `unit` 和 `week` 進行排序。
*   **快取清除**：支援透過 URL 參數 `?refresh=true` 手動清除快取。
*   **翻譯工具**：`translateList(texts)` 函式利用 `LanguageApp.translate` 進行英翻繁體中文的批次翻譯。

### 前端 (`Index.html`)
*   **單頁應用程式 (SPA)**：所有介面切換都在單一 HTML 頁面內完成，提供流暢的使用者體驗。
*   **響應式設計**：採用 Tailwind CSS 框架，確保在不同裝置上都能良好顯示。
*   **動態資料載入**：
    *   `fetchDataFromDrive()`：在應用程式啟動時，透過 `google.script.run` 呼叫後端 `getAllDataFromDrive()` 獲取所有課程和考試的元數據。
    *   `loadUnitData(gradeDbKey, id)`：當使用者點擊特定單元時，透過 `google.script.run` 呼叫後端 `getUnitData(id)` 獲取該單元的完整內容。
    *   **本地測試模式**：如果偵測到不在 Google Apps Script 環境中執行 (例如在本地瀏覽器打開檔案)，會自動載入 `mockData` 進行測試，方便開發。
*   **語音朗讀功能**：
    *   利用瀏覽器的 `SpeechSynthesis` API 實現中英文雙語朗讀。
    *   `speakDual()` 函式支援同時朗讀英文和中文，並提供語速調整。
    *   `playAllSequence()` 函式支援循序播放列表中的所有內容。
    *   智慧選擇最佳語音（Google、Microsoft、Premium 等）。
*   **互動式測驗**：
    *   **單字閃卡 (Words Flashcards)**：整合 Spelling、High Frequency Words (HFW) 和 Vocabulary 練習。
    *   **意義測驗 (Meaning Quiz)**：多選題形式，測試單字的中文意義。
    *   **拼寫測驗 (Spelling Test)**：聽寫單字，並輸入拼寫。
*   **導覽與狀態管理**：透過 `currentView` 等全域變數管理應用程式的當前狀態和導覽流程，支援「回上一頁」功能。
*   **美觀介面**：採用「Sage Style」設計風格，提供柔和的色彩和流暢的動畫效果。

## 設定與部署

### 1. Google Drive 資料夾結構

您需要在 Google Drive 中建立一個專門用於存放 JSON 資料檔案的資料夾。

*   **主資料夾**：所有課程單元檔案 (例如 `1_1.json`, `2_5.json`) 和 `exams.json` 檔案應直接放在此資料夾中。
*   **`legacy` 子資料夾 (可選)**：如果您的專案有舊版或不同來源的單元 JSON 檔案，可以將它們放在名為 `legacy` 的子資料夾中，`getUnitData` 函式會自動在此處搜尋。

### 2. Google Apps Script 專案設定

此專案是為 Google Apps Script 設計的。建議使用 `clasp` 工具進行本地開發和同步。

#### a. 設定 `FOLDER_ID`

腳本需要知道您的 Google Drive 資料夾 ID。為安全起見，此 ID 應設定為指令碼屬性，而不是直接寫在程式碼中。

1.  前往您的 Google Apps Script 專案。
2.  點擊左側邊欄的 `專案設定` (齒輪圖示)。
3.  在 `指令碼屬性` 下，點擊 `新增指令碼屬性`。
4.  將 `屬性` 設定為 `MYVIEW_FOLDER_ID`，並將 `值` 設定為您 Google Drive 資料夾的實際 ID。

#### b. 部署為 Web App

1.  在 Google Apps Script 編輯器中，點擊 `部署` > `新增部署作業`。
2.  選擇 `網頁應用程式` 作為類型。
3.  配置以下選項：
    *   `執行身分`：`我` (您的 Google 帳戶)。
    *   `誰可以存取`：`任何人` (為了讓 Web App 可公開存取)。
4.  點擊 `部署`。您將會得到一個 Web App URL。

### 3. 前端檔案 (`Index.html`)

將 `Index.html` 檔案上傳到您的 Google Apps Script 專案中。在 Apps Script 編輯器中，點擊左側的 `檔案` > `新增檔案` > `HTML`，然後將 `Index.html` 的內容貼入。

## 使用方式

### 1. 存取 Web App

直接在瀏覽器中打開您部署後獲得的 Web App URL。應用程式將會自動載入資料並顯示首頁介面。

### 2. 清除快取

如果您更新了 Google Drive 中的 JSON 資料檔案，但應用程式沒有立即顯示最新內容，您可以透過在 Web App URL 後面加上 `?refresh=true` 參數來強制清除快取：

```
您的Web應用程式URL?refresh=true
```

這將會清除快取，下一次的請求將會從 Google Drive 重新讀取資料。

## Google Drive 中的資料結構

腳本預期在指定的 `MYVIEW_FOLDER_ID` 中找到以下 JSON 檔案：

### 課程單元檔案

每個課程單元都應為一個 JSON 檔案 (例如 `1_1.json`, `G2_U2_W2.json`)，其中包含一個至少具有以下屬性的物件：

```json
{
  "id": "唯一的單元ID (例如: 1_1, G2_U2_W2)",
  "grade": 1,
  "unit": 1,
  "week": 1,
  "title": "課程標題",
  "subtitle": "課程副標題",
  "type": "Informational Text",
  "icon": "fa-cloud-sun",
  "colorClass": "sage-green",
  "video": "https://www.youtube.com/watch?v=...", // (可選) 相關影片連結
  "content": [
    // 完整的課程內容，每個物件代表一個段落或句子
    { "title": "1", "en": "English sentence.", "zh": "中文翻譯。" }
  ],
  "highlights": [
    // 課程重點或摘要
    { "title": "Spring 🌱", "en": "English highlight.", "zh": "中文重點。" }
  ],
  "qa": [
    // 問答練習
    { "title": "Q&A 練習", "en": "English question?", "zh": "中文問題？" }
  ],
  "vocab": [
    // 單字列表
    { "word": "Spring", "zh": "春天", "def": "English definition.", "zhDef": "中文定義。", "example": "English example.", "zhExample": "中文例句。" }
  ],
  "spelling": [
    // 拼寫單字
    { "word": "Sunday", "zh": "星期日", "def": "English definition.", "zhDef": "中文定義。", "example": "English example.", "zhExample": "中文例句。" }
  ],
  "HFW": [
    // 高頻單字
    { "word": "air", "zh": "空氣", "def": "English definition.", "zhDef": "中文定義。", "example": "English example.", "zhExample": "中文例句。" }
  ]
}
```

`fetchFromDriveAndBuildDB` 函式會為主要資料結構提取這些物件的「輕量級」版本，僅包含 `id`, `grade`, `unit`, `week`, `title`, `subtitle`, `type`, `icon`, `colorClass`。完整的 `content`、`highlights`、`qa`、`vocab`、`spelling`、`HFW` 僅由 `getUnitData` 函式按需載入。

### 考試設定檔 (`exams.json`)

此檔案應包含一個 JSON 陣列，每個物件代表一個考試設定：

```json
[
  {
    "title": "🌿 Review Test 1",
    "ranges": ["1_1", "1_5"] // 包含的單元 ID 列表
  },
  {
    "title": "🍂 Review Test 2",
    "ranges": ["G2_U2_W2"]
  }
]
```

## 開發筆記

*   **Clasp 整合**：此專案可透過 `clasp` 工具進行本地開發和版本控制，方便程式碼管理和協作。
*   **快取時間**：`CACHE_TIME` 設定為 0.5 小時 (1800 秒)。您可以根據資料更新頻率和對資料新鮮度的要求來調整此值。
*   **前端資料獲取**：前端 `Index.html` 透過 `google.script.run` 直接與後端 `Code.js` 互動。這表示整個應用程式是作為一個 Google Apps Script Web App 部署和運行的。
*   **本地測試**：前端 `Index.html` 內建了 `mockData`，當在非 Apps Script 環境中（例如直接在瀏覽器中打開 `Index.html` 檔案）運行時，會自動使用這些模擬資料，方便開發和測試。

---