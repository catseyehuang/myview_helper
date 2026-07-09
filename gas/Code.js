// 2026-07-09 更新：結構重整（移至 gas/），優化快取機制（導入 db_index.json 編譯模式）、增加 Token 驗證與單一單元 API 路由。

// 存放 JSON 檔案的 Google Drive 資料夾 ID，確保私密性，改從PropertiesService讀取
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty('MYVIEW_FOLDER_ID');
const CACHE_KEY = 'MYVIEW_DB_CACHE';
const CACHE_TIME = 10800; // 快取存活時間 (秒)，10800秒 = 3小時

function doGet(e) {
  // 1. 處理快取與資料庫強制重新整理 (需要 token 驗證防惡意刷配額)
  if (e.parameter.refresh === 'true') {
    const adminToken = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
    if (e.parameter.token === adminToken) {
      clearCache();
      rebuildAndSaveDatabaseIndex();
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Database index compiled and cache refreshed." }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized. Invalid token." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2. 判斷請求類型：判斷是否為 API 請求
  if (e.parameter.type === 'json') {
    try {
      let data;
      if (e.parameter.id) {
        // 抓取單一單元完整資料 (支援 fileId 加速與防錯模式)
        data = getUnitData(e.parameter.id, e.parameter.fileId);
      } else {
        // 抓取整個 Metadata 資料庫 (優先讀取編譯好的 db_index.json)
        data = getAllDataFromDrive();
      }
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 3. 預設模式：回傳原本的 HTML 網頁 (在 GAS 網址開啟時使用)
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('🌿 MyView Helper 🌿 ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}



/**
 * 讀取資料的主入口
 * 先看快取有沒有，快取沒有就嘗試讀取 db_index.json 檔案，最後才掃描資料夾重建
 */
function getAllDataFromDrive() {
  const cache = CacheService.getScriptCache();

  // 1. 嘗試從快取讀取
  const cachedData = getLargeCache(cache, CACHE_KEY);
  if (cachedData) {
    Logger.log("✅ 命中快取！直接回傳資料");
    return JSON.parse(cachedData);
  }

  Logger.log("⚠️ 快取無資料，嘗試從 Drive 讀取已彙整的 db_index.json...");

  let db;
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFilesByName('db_index.json');
    if (files.hasNext()) {
      const file = files.next();
      const content = file.getBlob().getDataAsString();
      db = JSON.parse(content);
      Logger.log("✅ 成功自 Drive 讀取 db_index.json");
    }
  } catch (err) {
    Logger.log("讀取 db_index.json 失敗: " + err);
  }

  // 如果找不到已彙整檔案，才進行全資料夾掃描（Fallback 機制）
  if (!db) {
    Logger.log("⚠️ 找不到 db_index.json，進行全資料夾掃描與編譯...");
    db = rebuildAndSaveDatabaseIndex();
  } else {
    // 寫入快取
    try {
      const jsonString = JSON.stringify(db);
      putLargeCache(cache, CACHE_KEY, jsonString, CACHE_TIME);
      Logger.log("💾 彙整資料已載入並寫入快取");
    } catch (err) {
      Logger.log("快取寫入失敗: " + err);
    }
  }

  return db;
}

/**
 * 重新掃描 Drive 並產生/更新彙整的 db_index.json 檔案，同時寫入快取
 */
function rebuildAndSaveDatabaseIndex() {
  const db = fetchFromDriveAndBuildDB();
  const jsonString = JSON.stringify(db);

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFilesByName('db_index.json');

  if (files.hasNext()) {
    const file = files.next();
    file.setContent(jsonString);
    Logger.log("📝 已更新現有的 db_index.json 檔案");
  } else {
    folder.createFile('db_index.json', jsonString, 'application/json');
    Logger.log("📝 已建立新的 db_index.json 檔案");
  }

  // 寫入快取
  const cache = CacheService.getScriptCache();
  try {
    putLargeCache(cache, CACHE_KEY, jsonString, CACHE_TIME);
    Logger.log("💾 重新編譯資料已寫入快取");
  } catch (err) {
    Logger.log("快取寫入失敗: " + err);
  }

  return db;
}

/**
 * 實際去 Drive 抓檔案的邏輯 (最花時間的部分)
 */
function fetchFromDriveAndBuildDB() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  // 初始化資料結構
  const db = {
    grade1: [],
    grade2: [],
    exams: []
  };

  while (files.hasNext()) {
    const file = files.next();

    // 只處理 JSON 檔案且排除編譯出的索引檔案 db_index.json
    if ((file.getMimeType() === 'application/json' || file.getName().endsWith('.json')) && file.getName() !== 'db_index.json') {
      try {
        const content = file.getBlob().getDataAsString();
        const json = JSON.parse(content);

        // --- 關鍵修改：根據 JSON 內部的 grade 參數分類 ---

        // 1. 如果是陣列，視為考試範圍設定檔 (exams.json)
        if (Array.isArray(json)) {
          db.exams = json;
        }
        // 2. 如果是物件且有 grade，視為課程檔案
        else if (json.grade) {
          // 建立一個只包含 metadata 的輕量物件
          const lightweightUnit = {
            id: json.id,
            fileId: file.getId(), // 儲存 Google Drive File ID 以利 O(1) 直接讀取
            grade: json.grade,
            unit: json.unit,
            week: json.week,
            title: json.title,
            subtitle: json.subtitle,
            type: json.type,
            icon: json.icon,
            colorClass: json.colorClass
          };

          if (parseInt(lightweightUnit.grade) === 1) {
            db.grade1.push(lightweightUnit);
          } else if (parseInt(lightweightUnit.grade) === 2) {
            db.grade2.push(lightweightUnit);
          }
        } else {
          // 如果 JSON 裡忘了寫 grade，這裡可以做備用處理 (例如看 id)
          Logger.log("檔案缺少 grade 參數: " + file.getName());
        }
      } catch (e) {
        Logger.log("解析檔案錯誤: " + file.getName());
      }
    }
  }

  // --- 關鍵修改：自定義排序邏輯 (Unit -> Week) ---
  const sortLessons = (a, b) => {
    // 先比 Unit
    if (a.unit !== b.unit) {
      return a.unit - b.unit;
    }
    // Unit 一樣，再比 Week
    return a.week - b.week;
  };

  db.grade1.sort(sortLessons);
  db.grade2.sort(sortLessons);

  return db;
}

/**
 * 按需載入：根據 ID 或 Google Drive File ID 取得單一單元的完整資料
 */
function getUnitData(id, fileId) {
  if (!id && !fileId) {
    throw new Error("Unit ID or File ID is required.");
  }

  // 1. 如果有提供 fileId，優先以 O(1) 直接載入，完全避免檔名大小寫或變更造成無法讀取的問題
  if (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const content = file.getBlob().getDataAsString();
      return JSON.parse(content);
    } catch (e) {
      Logger.log(`無法藉由 fileId (${fileId}) 取得單元 ${id} 的檔案，將改用檔名搜尋。錯誤: ${e.message}`);
    }
  }

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const fileName = id + '.json';

  // 輔助函式：在指定資料夾中尋找並解析檔案
  const findAndParse = (targetFolder, name) => {
    const files = targetFolder.getFilesByName(name);
    if (files.hasNext()) {
      const file = files.next();
      try {
        const content = file.getBlob().getDataAsString();
        return JSON.parse(content);
      } catch (e) {
        Logger.log(`Error parsing file ${name} in folder ${targetFolder.getName()}: ${e.message}`);
        throw new Error(`Could not parse data for unit ${id}.`);
      }
    }
    return null;
  };

  // 1. 在主資料夾中搜尋
  let unitData = findAndParse(folder, fileName);
  if (unitData) return unitData;

  // 2. 如果找不到，在 'legacy' 子資料夾中搜尋
  const legacyFolders = folder.getFoldersByName('legacy');
  if (legacyFolders.hasNext()) {
    const legacyFolder = legacyFolders.next();
    unitData = findAndParse(legacyFolder, fileName);
    if (unitData) return unitData;
  }

  // 3. 如果都找不到，拋出錯誤
  Logger.log(`File not found: ${fileName}`);
  throw new Error(`Unit data for '${id}' not found.`);
}
/**
 * 輔助功能：清除快取
 * 當你上傳新檔案後，App 不會馬上看到，除非執行這個或等待 6 小時
 */
function clearCache() {
  const cache = CacheService.getScriptCache();
  cache.remove(CACHE_KEY);
  // 也移除分塊的 key
  let i = 1;
  while (cache.get(CACHE_KEY + "_" + i)) {
    cache.remove(CACHE_KEY + "_" + i);
    i++;
  }
  Logger.log("🗑️ 快取已清除");
}

// --- 以下是處理超過 100KB 快取的黑魔法 (Chunking) ---

function putLargeCache(cache, key, value, time) {
  const chunkSize = 100000; // 每個區塊 100KB (GAS 上限)
  const jsonStr = value;

  if (jsonStr.length < chunkSize) {
    cache.put(key, jsonStr, time);
  } else {
    // 如果資料太大，切成好幾塊存: KEY_1, KEY_2, KEY_3...
    let i = 0;
    while (i * chunkSize < jsonStr.length) {
      const chunk = jsonStr.substr(i * chunkSize, chunkSize);
      const chunkKey = key + "_" + (i + 1); // KEY_1, KEY_2...
      cache.put(chunkKey, chunk, time);
      i++;
    }
    // 主 KEY 存總共有幾塊
    cache.put(key, "CHUNKED|" + i, time);
  }
}

function getLargeCache(cache, key) {
  const result = cache.get(key);
  if (!result) return null;

  // 如果是分塊儲存的標記
  if (result.startsWith("CHUNKED|")) {
    const numChunks = parseInt(result.split("|")[1]);
    let combinedStr = "";
    for (let i = 1; i <= numChunks; i++) {
      const chunk = cache.get(key + "_" + i);
      if (!chunk) return null; // 如果任何一塊遺失，視為快取失效
      combinedStr += chunk;
    }
    return combinedStr;
  }

  // 沒分塊，直接回傳
  return result;
}

/**
 * 輔助功能：批次翻譯 (供前端 Spelling/HFW 使用)
 */
function translateList(texts) {
  if (!texts || !Array.isArray(texts)) return [];
  return texts.map(function (text) {
    return LanguageApp.translate(text, 'en', 'zh-TW');
  });
}