// 2026-03-24 更新：轉向 Clasp git 分離架構。

// 存放 JSON 檔案的 Google Drive 資料夾 ID，確保私密性，改從PropertiesService讀取
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty('MYVIEW_FOLDER_ID');
const CACHE_KEY = 'MYVIEW_DB_CACHE';
const CACHE_TIME = 10800; // 快取存活時間 (秒)，10800秒 = 3小時

function doGet(e) {
  // 2026-03-24 更新：為了讓 GitHub Pages 抓資料，將資料轉為 JSON 字串回傳
  
  // 1. 處理強制刷新快取的邏輯
  // 網址加上 ?refresh=true 依然可以手動清除快取
  if (e.parameter.refresh === 'true') {
    clearCache();
  }
  
  try {
    // 2. 取得資料 
    const data = getAllDataFromDrive();

    // 3. 輸出純 JSON 資料
    // 這是最精簡的 API 回傳方式
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // 4. 錯誤處理：如果讀取過程出錯，回傳錯誤資訊的 JSON
    const errorResponse = {
      status: "error",
      message: err.toString(),
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}



  //return HtmlService.createTemplateFromFile('Index')
  //    .evaluate()
  //    .setTitle('🌿 MyView Helper 🌿 ')
  //    .addMetaTag('viewport', 'width=device-width, initial-scale=1');


/**
 * 讀取資料的主入口
 * 先看快取有沒有，沒有才去 Drive 讀取
 */
function getAllDataFromDrive() {
  const cache = CacheService.getScriptCache();
  
  // 1. 嘗試從快取讀取
  const cachedData = getLargeCache(cache, CACHE_KEY);
  if (cachedData) {
    Logger.log("✅ 命中快取！直接回傳資料");
    return JSON.parse(cachedData);
  }

  // 2. 快取沒資料，才去 Drive 慢慢讀
  Logger.log("⚠️ 快取無資料，正在掃描 Drive...");
  const db = fetchFromDriveAndBuildDB();

  // 3. 寫入快取 (供下次使用)
  // 將物件轉成字串並存入，有效時間 0.5 小時
  try {
    const jsonString = JSON.stringify(db);
    putLargeCache(cache, CACHE_KEY, jsonString, CACHE_TIME);
    Logger.log("💾 資料已寫入快取");
  } catch (err) {
    Logger.log("快取寫入失敗 (可能資料過大): " + err);
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
    
    // 只處理 JSON 檔案
    if (file.getMimeType() === 'application/json' || file.getName().endsWith('.json')) {
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
 * 按需載入：根據 ID 取得單一單元的完整資料
 */
function getUnitData(id) {
  if (!id) {
    throw new Error("Unit ID is required.");
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
  return texts.map(function(text) {
    return LanguageApp.translate(text, 'en', 'zh-TW');
  });
}