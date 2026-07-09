# MyView 小幫手 Google Apps Script

## 總覽
此 Google Apps Script 專案 (`Code.js`) 作為 "MyView 小幫手" 應用程式的後端。它利用 Google Drive 儲存教育內容 (JSON 檔案)，並透過網頁應用程式 URL 提供這些資料。專案整合了強大的快取機制以提升效能，並處理跨來源請求，以便與 GitHub Pages 等前端應用整合。

## 功能特色
*   **以 Google Drive 作為資料庫：** 包含課程單元和考試設定的 JSON 檔案，會直接儲存在指定的 Google Drive 資料夾中進行管理。
*   **快取機制：** 利用 Google Apps Script 的 `CacheService` 儲存常用資料，大幅減少 Drive API 的呼叫次數並改善回應時間。包含一個「分塊」機制以繞過 100KB 的快取項目大小限制。
*   **網頁應用程式端點：** 提供一個 `doGet` 函式，可部署為 Google Apps Script 網頁應用程式。
*   **JSON API：** 提供 `?type=json` 端點來回傳原始 JSON 資料，適合由外部前端（例如 GitHub Pages）使用。
*   **預設 HTML 介面：** 當直接存取網址且未帶 `?type=json` 參數時，會提供一個基本的 HTML 頁面 (`Index.html`)。
*   **按需載入單元資料：** `getUnitData(id)` 函式允許依據 ID 取得特定單元的完整詳細資料，並支援目前和「舊版」(legacy) 的檔案位置。
*   **快取管理：** 支援透過 `?refresh=true` URL 參數手動清除快取。
*   **國際化工具：** 包含一個 `translateList` 函式，可使用 `LanguageApp` 進行批次翻譯。

## 設定與部署

### 1. Google Drive 資料夾結構
建立一個 Google Drive 資料夾，用來存放您的 JSON 資料檔案。
*   課程單元檔案 (例如 `unit1_week1.json`, `unit2_week3.json`) 應直接放在此資料夾中。
*   `exams.json` 檔案 (若有使用) 也應放在此資料夾中。
*   您可以選擇性地建立一個名為 `legacy` 的子資料夾，用來存放舊版的單元 JSON 檔案。

### 2. Google Apps Script 專案
此專案設計為使用 Google Apps Script (GAS) 搭配 Clasp 進行部署。

#### a. 克隆儲存庫 (如果適用)
如果這是某個較大專案的一部分，請克隆它。

#### b. 設定 `MYVIEW_FOLDER_ID`
該腳本需要一個 Google Drive 資料夾 ID 來存放您的 JSON 資料。為安全起見，此 ID 應設定為腳本屬性。

1.  前往您的 Google Apps Script 專案。
2.  導覽至 `專案設定` (左側邊欄的齒輪圖示)。
3.  在 `指令碼屬性` 下，點擊 `新增指令碼屬性`。
4.  將 `屬性` 設定為 `MYVIEW_FOLDER_ID`，並將 `值` 設定為您 Google Drive 資料夾的實際 ID。

#### c. 部署為網頁應用程式
1.  在 Google Apps Script 編輯器中，點擊 `部署` > `新增部署作業`。
2.  選擇 `網頁應用程式` 作為類型。
3.  設定：
    *   `執行身分`：`我` (您的 Google 帳戶)。
    *   `誰可以存取`：`任何人` (為了讓 API/網頁應用程式可公開存取)。
4.  點擊 `部署`。您將會得到一個網頁應用程式的 URL。

## API 端點

部署後的網頁應用程式 URL 可用於存取資料。

### 1. 取得所有資料 (JSON API)
若要以 JSON 字串形式擷取所有彙整資料 (一年級、二年級課程與考試)：

```
YOUR_WEB_APP_URL?type=json
```

**Example Response Structure:**
```json
{
  "grade1": [
    { "id": "unit1_week1", "grade": 1, "unit": 1, "week": 1, "title": "...", "subtitle": "...", "type": "...", "icon": "...", "colorClass": "..." },
    // ... more grade 1 units
  ],
  "grade2": [
    { "id": "unit2_week1", "grade": 2, "unit": 2, "week": 1, "title": "...", "subtitle": "...", "type": "...", "icon": "...", "colorClass": "..." },
    // ... more grade 2 units
  ],
  "exams": [
    // ... exam configuration objects
  ]
}
```

### 2. Clear Cache
To force a refresh of the cached data (useful after updating JSON files in Google Drive):

```
YOUR_WEB_APP_URL?refresh=true
```
This will clear the cache and the next request will re-read data from Google Drive.

### 3. Default HTML Page
Accessing the web app URL without any parameters will serve the `Index.html` file.

```
YOUR_WEB_APP_URL
```

## Data Structure in Google Drive

The script expects JSON files in the specified `MYVIEW_FOLDER_ID`.

### Lesson Unit Files
Each lesson unit should be a JSON file (e.g., `unit1_week1.json`) containing an object with at least the following properties:

```json
{
  "id": "unique_unit_id",
  "grade": 1,
  "unit": 1,
  "week": 1,
  "title": "Lesson Title",
  "subtitle": "Lesson Subtitle",
  "type": "vocabulary",
  "icon": "book",
  "colorClass": "blue",
  "content": {
    // ... full lesson content
  }
}
```
The `fetchFromDriveAndBuildDB` function extracts a "lightweight" version of these objects for the main data structure, containing only `id`, `grade`, `unit`, `week`, `title`, `subtitle`, `type`, `icon`, `colorClass`. The full `content` is only loaded by `getUnitData`.

### Exam Configuration File (`exams.json`)
This file should contain a JSON array:

```json
[
  {
    "examId": "midterm_grade1",
    "title": "Grade 1 Midterm",
    "units": ["unit1_week1", "unit1_week2", "unit2_week1"]
  },
  {
    "examId": "final_grade2",
    "title": "Grade 2 Final",
    "units": ["unit3_week1", "unit3_week2", "unit4_week1"]
  }
]
```

## Internal Functions

### `getUnitData(id)`
This function is designed to be called internally by other Apps Script functions (e.g., from an `Index.html` scriptlet or another `doGet` handler for specific unit requests). It retrieves the *full* JSON content for a single unit by its `id`.

```javascript
// Example usage within another Apps Script function:
function serveUnitPage(e) {
  const unitId = e.parameter.id;
  if (unitId) {
    try {
      const unitContent = getUnitData(unitId);
      // Process unitContent, e.g., pass it to an HTML template
      return HtmlService.createTemplateFromFile('UnitPage')
          .evaluate({ unit: unitContent })
          .setTitle(unitContent.title);
    } catch (err) {
      return ContentService.createTextOutput(`Error: ${err.message}`);
    }
  }
  return HtmlService.createHtmlOutput("Please provide a unit ID.");
}
```

### `translateList(texts)`
A utility function for translating an array of strings from English to Traditional Chinese.

```javascript
// Example usage:
const englishWords = ["hello", "world", "apple"];
const translatedWords = translateList(englishWords);
Logger.log(translatedWords); // Output: [你好, 世界, 蘋果]
```

## Development Notes
*   **Clasp Integration:** The comment `// 2026-03-24 更新：轉向 Clasp git 分離架構。` indicates this project is managed with `clasp`, allowing local development and version control.
*   **Cache Time:** The `CACHE_TIME` is set to 3 hours (10800 seconds). Adjust this based on how frequently your data changes and how fresh you need the data to be.

---

## `Code.js` 檔案功能詳解

這份 `Code.js` 檔案是應用程式的核心後端，其主要職責是管理和提供來自 Google Drive 的課程資料。

### 1. 全域設定 (Global Configuration)
*   `FOLDER_ID`: 存放所有課程 JSON 檔案的 Google Drive 資料夾 ID。此 ID 是透過 `PropertiesService` 從「指令碼屬性」中讀取，避免將其寫死在程式碼中，增加了安全性與彈性。
*   `CACHE_KEY`: 用於在快取中儲存和讀取資料庫的唯一鍵值。
*   `CACHE_TIME`: 設定快取的有效期限（預設為 3 小時），在此時間內程式會優先使用快取資料，大幅提升效能。

### 2. `doGet(e)` - 主要進入點 (Main Entry Point)
此函式是網頁應用程式的統一入口，它會根據 URL 參數執行不同的操作：
*   **手動更新快取 (`?refresh=true`)**: 強制清除快取，以便在更新 Google Drive 檔案後能立即看到變更。
*   **JSON API 模式 (`?type=json`)**: 回傳純 JSON 格式的所有課程資料，主要供外部前端（如 GitHub Pages）呼叫使用。
*   **預設 HTML 模式**: 回傳 `Index.html` 範本，作為在 Google Apps Script 網址上直接瀏覽的網頁介面。

### 3. `getAllDataFromDrive()` - 資料讀取與快取策略
這是資料處理的核心，採用「快取優先」策略：
1.  **命中快取 (Cache Hit)**: 優先嘗試從 `CacheService` 讀取資料，若成功則直接回傳，速度最快。
2.  **錯失快取 (Cache Miss)**: 若快取中無資料，則呼叫 `fetchFromDriveAndBuildDB()` 從 Google Drive 讀取。
3.  **寫入快取**: 從 Drive 取得資料後，會將其存入快取，供下次請求使用。

### 4. `fetchFromDriveAndBuildDB()` - 實際資料處理
此函式負責與 Google Drive 互動，是整個流程中最耗時的部分：
*   遍歷指定資料夾中的所有 `.json` 檔案。
*   根據檔案內容進行分類：陣列視為 `exams.json`，包含 `grade` 屬性的物件視為課程單元。
*   為了優化主資料包的大小，它只會抽取出課程單元的「元數據」（如 ID、標題等）建立一個輕量級物件。
*   最後，對各年級的課程列表進行排序（先按單元，再按週次）。

### 5. `getUnitData(id)` - 按需載入完整資料
當前端需要特定單元的完整內容時，才會呼叫此函式。它會根據傳入的 `id` 找到對應的 `.json` 檔案，讀取並回傳完整的 JSON 內容。此函式還支援在 `legacy` 子資料夾中搜尋，以實現向下相容。

### 6. `clearCache()` - 快取清除
一個輔助函式，用於手動移除所有相關的快取資料。

### 7. `putLargeCache()` & `getLargeCache()` - 快取分塊處理
這是一組應對 Google Apps Script `CacheService` 每個鍵值對 100KB 大小限制的工具函式。
*   `putLargeCache`: 當資料大小超過限制時，會自動將其切割成數個「區塊」分別儲存。
*   `getLargeCache`: 讀取時，會自動將所有區塊重新組合成完整的原始資料。

### 8. `translateList(texts)` - 翻譯工具
一個使用內建 `LanguageApp` 將英文單字陣列批次翻譯成繁體中文的工具函式。
