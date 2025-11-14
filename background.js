// SmartMark Background Script
// Chrome Extension API 사용

importScripts('utils/tfidf.js');
importScripts('config.js');

const VISIT_DATA_KEY = 'SmartMarkVisitData';
const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';

let activeTabId = null;     // 현재 활성화된 탭 ID
let activeTabUrl = null;    // 현재 활성화된 탭의 URL
let activeTabStartTime = 0; // 현재 탭이 활성화된 시점의 타임스탬프
let bookmarkUrls = {};      // 북마크 ID를 URL로 매핑한 맵
let tfidfModel = null;

// 확장 프로그램 설치/업데이트/시작 시 북마크 URL 맵을 로드
chrome.runtime.onInstalled.addListener(initializeBookmarkMap);
chrome.runtime.onStartup.addListener(initializeBookmarkMap);

chrome.bookmarks.onCreated.addListener(initializeBookmarkMap);
chrome.bookmarks.onRemoved.addListener(initializeBookmarkMap);
chrome.bookmarks.onChanged.addListener(initializeBookmarkMap);

async function initializeBookmarkMap() {
    console.log('[BG INIT] 북마크 URL 맵 초기화 중...');
    const tree = await chrome.bookmarks.getTree();
    bookmarkUrls = {};
    
    // 북마크 트리를 탐색하여 ID: URL 맵 생성
    function traverse(nodes) {
        for (const node of nodes) {
            if (node.url) {
                bookmarkUrls[node.url] = node.id;
            }
            if (node.children) {
                traverse(node.children);
            }
        }
    }
    
    traverse(tree);
    console.log(`[BG INIT] 북마크 URL 맵 로드 완료: ${Object.keys(bookmarkUrls).length}개 URL 감지`);
    await initializeTfIdfModel();
}

/**
 * TF-IDF 모델 초기화
 */
async function initializeTfIdfModel() {
  try {
      console.log('[TF-IDF INIT] TF-IDF 모델 초기화 시작...');

      const storageKey = typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
      
      // 1. 저장된 TF-IDF 모델 로드 시도
      const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
      if (savedModel[TFIDF_MODEL_KEY]) {
          tfidfModel = new TFIDF();
          tfidfModel.deserialize(savedModel[TFIDF_MODEL_KEY]);
          console.log('[TF-IDF INIT] 저장된 모델 로드 완료');
          return;
      }
      
      // 2. 새 모델 구축
      const allSummaries = await chrome.storage.local.get(storageKey);
      const summariesMap = allSummaries[storageKey] || {};
      
      // 3. 모든 북마크의 텍스트 수집
      const documents = [];
      const bookmarkIds = Object.keys(summariesMap);
      
      for (const bookmarkId of bookmarkIds) {
          const summaryData = summariesMap[bookmarkId];
          if (summaryData) {
              // title, englishSummary, englishKeySnippet, englishFolderName 결합
              const docText = [
                summaryData.title || '',
                summaryData.englishSummary || '',
                summaryData.englishKeySnippet || '',
                summaryData.englishFolderName || ''
            ].filter(text => text.trim() !== '').join(' ');
            
            if (docText.trim()) {
                documents.push(docText);
            }
        }
    }
    
    if (documents.length === 0) {
        console.log('[TF-IDF INIT] 문서가 없어 모델 구축 건너뜀');
        return;
    }
    
    // 4. TF-IDF 모델 구축
    tfidfModel = new TFIDF();
    tfidfModel.buildVocabulary(documents);
    
    // 5. 모델 저장
    await chrome.storage.local.set({
        [TFIDF_MODEL_KEY]: tfidfModel.serialize()
    });
    
    console.log('[TF-IDF INIT] TF-IDF 모델 구축 및 저장 완료');
    
} catch (error) {
    console.error('[TF-IDF INIT] 모델 초기화 실패:', error);
}
}


// 탭이 활성화되었을 때 (사용자가 탭을 전환했을 때)
chrome.tabs.onActivated.addListener(handleTabActivated);

// 탭의 상태나 URL이 변경되었을 때 (페이지 로드, 주소창 이동 등)
chrome.tabs.onUpdated.addListener(handleTabUpdated);

// 탭이 닫혔을 때
chrome.tabs.onRemoved.addListener(handleTabRemoved);

// 탭 활성화 시 이전 탭의 체류 시간을 기록하고 새 탭을 추적
async function handleTabActivated(activeInfo) {
  // 1. 이전 활성 탭 정리 (체류 시간 기록)
  await recordEngagementTime(activeTabId, activeTabUrl);

  // 2. 새 활성 탭 상태 설정
  activeTabId = activeInfo.tabId;
  activeTabStartTime = Date.now();
  
  try {
      const tab = await chrome.tabs.get(activeTabId);
      activeTabUrl = tab.url;
  } catch (e) {
      // 탭 정보 가져오기 실패 (Chrome 페이지 등)
      activeTabUrl = null;
  }
}

// 탭 URL이 변경되었을 때 (페이지 로드, 주소창 이동)
async function handleTabUpdated(tabId, changeInfo, tab) {
  if (tabId !== activeTabId || !changeInfo.url) {
      // 활성 탭이 아니거나 URL 변경이 없으면 무시
      return;
  }

  // 1. 이전 URL 정리 (현재 탭이 새 URL로 이동했으므로)
  await recordEngagementTime(tabId, activeTabUrl); 
  
  // 2. 새 URL 상태 설정
  activeTabUrl = changeInfo.url;
  activeTabStartTime = Date.now();
}

// 탭이 닫혔을 때 (체류 시간 기록의 마지막 기회)
async function handleTabRemoved(tabId, removeInfo) {
  if (tabId === activeTabId) {
      // 활성 탭이 닫히는 경우에만 기록
      await recordEngagementTime(tabId, activeTabUrl);
      // 상태 초기화
      activeTabId = null;
      activeTabUrl = null;
      activeTabStartTime = 0;
  }
}

// 체류 시간을 기록하고 방문 데이터를 업데이트하는 핵심 함수
async function recordEngagementTime(tabId, url) {
  if (!url || !bookmarkUrls[url]) {
      // 북마크되지 않은 URL은 기록하지 않음
      return;
  }

  const bookmarkId = bookmarkUrls[url];
  const durationMs = Date.now() - activeTabStartTime; // 체류 시간 계산 (밀리초)

  if (durationMs < 1000) {
      // 1초 미만은 오클릭/빠른 이동으로 간주하고 무시
      return;
  }

  const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
  const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};

  const data = visitDataMap[bookmarkId] || {
      frequency: 0,
      totalTimeSpentMs: 0,
      lastVisited: 0
  };

  // 1. 방문 횟수 증가 (Frequency)
  data.frequency += 1;
  
  // 2. 총 체류 시간 누적 (Engagement)
  data.totalTimeSpentMs += durationMs;
  
  // 3. 마지막 방문 시간 업데이트 (Recency)
  data.lastVisited = Date.now();

  visitDataMap[bookmarkId] = data;

  await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
  
  console.log(`[VISIT DATA] ID ${bookmarkId} 업데이트: ${data.frequency}회 방문, ${Math.round(data.totalTimeSpentMs / 1000)}초 체류`);
}

// SmartMark에서는 popup.js에서 직접 처리하므로 background script는 최소화
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // 필요시 여기에 background 작업 추가
  return true;
});

// 북마크 삭제 시 임베딩 데이터도 함께 제거
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  console.log(`[BOOKMARK DELETE] 북마크 삭제됨: ID ${id}`);
  
  try {
    await removeEmbeddingData(id);
    await removeVisitData(id);
    
    // 폴더가 삭제된 경우, 하위 북마크들의 임베딩도 정리
    if (removeInfo.node && removeInfo.node.children) {
      console.log(`[BOOKMARK DELETE] 폴더 삭제 감지, 하위 항목들 정리 중...`);
      await cleanupChildrenEmbeddings(removeInfo.node.children);
      await cleanupChildrenVisitData(removeInfo.node.children);
    }
  } catch (error) {
    console.error(`[BOOKMARK DELETE] 삭제 처리 실패: ID ${id}`, error);
  }
});

// 방문 기록 제거
async function removeVisitData(bookmarkId) {
  const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
  const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
  
  if (visitDataMap[bookmarkId]) {
      delete visitDataMap[bookmarkId];
      await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
      console.log(`[BOOKMARK DELETE] 방문 기록 삭제 완료: ID ${bookmarkId}`);
      return true;
  }
  return false;
}

// 하위 북마크들의 방문 기록 정리 (cleanupChildrenEmbeddings와 유사)
async function cleanupChildrenVisitData(children) {
  let cleanedCount = 0;
  for (const child of children) {
      if (child.url) {
          const removed = await removeVisitData(child.id);
          if (removed) cleanedCount++;
      }
      if (child.children && child.children.length > 0) {
          cleanedCount += await cleanupChildrenVisitData(child.children);
      }
  }
  return cleanedCount;
}

// 임베딩 데이터 제거 함수
async function removeEmbeddingData(bookmarkId) {
  try {
    // 설정 키 가져오기 (기본값 사용)
    const storageKey = 'SmartMarkSummaries';
    
    // 기존 데이터 로드
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    
    // 해당 북마크의 임베딩 데이터 확인 및 삭제
    if (summariesMap[bookmarkId]) {
      delete summariesMap[bookmarkId];
      
      // 업데이트된 데이터 저장
      await chrome.storage.local.set({ [storageKey]: summariesMap });
      
      console.log(`[BOOKMARK DELETE] 임베딩 데이터 삭제 완료: ID ${bookmarkId}`);
      console.log(`[BOOKMARK DELETE] 남은 임베딩 데이터: ${Object.keys(summariesMap).length}개`);
      return true;
    } else {
      console.log(`[BOOKMARK DELETE] 삭제할 임베딩 데이터 없음: ID ${bookmarkId}`);
      return false;
    }
  } catch (error) {
    console.error(`[BOOKMARK DELETE] 임베딩 데이터 삭제 실패: ID ${bookmarkId}`, error);
    throw error;
  }
}

// 하위 북마크들의 임베딩 데이터 정리
async function cleanupChildrenEmbeddings(children) {
  let cleanedCount = 0;
  
  for (const child of children) {
    if (child.url) {
      // 실제 북마크인 경우
      const removed = await removeEmbeddingData(child.id);
      if (removed) cleanedCount++;
    }
    
    // 하위 폴더가 있는 경우 재귀적으로 처리
    if (child.children && child.children.length > 0) {
      cleanedCount += await cleanupChildrenEmbeddings(child.children);
    }
  }
  
  console.log(`[BOOKMARK DELETE] 하위 항목 ${cleanedCount}개의 임베딩 데이터 정리 완료`);
  return cleanedCount;
}
// SmartMark 컨텍스트 메뉴 생성
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "smartmark-bookmark",
    title: "SmartMark로 북마크 저장",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "smartmark-manage",
    title: "SmartMark 관리 페이지 열기",
    contexts: ["page"],
  });
});

// 컨텍스트 메뉴 클릭 처리
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "smartmark-bookmark") {
    // 팝업 열기
    chrome.action.openPopup();
  }
  if (info.menuItemId === "smartmark-manage") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("manager.html"),
    });
  }
});