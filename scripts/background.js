// SmartMark Background Script
// Multi-model Search System

importScripts('../config.js');
importScripts('../utils/tfidf.js');
importScripts('search-methods.js');

const VISIT_DATA_KEY = 'SmartMarkVisitData';
const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';

let activeTabId = null;     // 현재 활성화된 탭 ID
let activeTabUrl = null;    // 현재 활성화된 탭의 URL
let activeTabStartTime = 0; // 현재 탭이 활성화된 시점의 타임스탬프
let bookmarkUrls = {};      // 북마크 ID를 URL로 매핑한 맵
let tfidfModel = null;

async function initialize() {
    await initializeBookmarkMap();
    setTimeout(() => checkInactiveBookmarks(), 5000);
}

/**
 * 백그라운드에서 북마크 임베딩 처리 (비동기)
 */
async function processBookmarkEmbeddingsBackground(data) {
    console.log(`[BG EMBED] 백그라운드 임베딩 처리 시작: ${data.title}`);
    const startTime = Date.now();
    
    try {
        // Offscreen document 준비
        await setupOffscreenDocument();
        
        const metadata = {
            url: data.url,
            title: data.englishTitle,
            details: data.englishSummary,
            fullContent: data.englishKeySnippet,
            category: data.englishFolderName,
            dateAdded: data.dateAdded,
            id: data.bookmarkId,
        };
        
        // 1. USE 임베딩 생성
        console.log('[BG EMBED] USE 임베딩 생성 중...');
        const useEmbedding = await generateEmbedding(
            `${metadata.title}. ${metadata.fullContent}. ${metadata.details}. ${metadata.category}`
        );
        
        // 2. TF-IDF 벡터 생성
        console.log('[BG EMBED] TF-IDF 벡터 생성 중...');
        let tfidfVector = null;
        const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
        if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
            const tfidfModelInstance = new TFIDF();
            tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
            const combined = `${metadata.title} ${metadata.fullContent} ${metadata.details} ${metadata.category}`;
            tfidfVector = tfidfModelInstance.computeTFIDFVector(combined);
        }
        
        // 3. BERT 임베딩 및 키워드 추출
        console.log('[BG EMBED] BERT 통합 처리 중...');
        let bertEmbedding = null;
        let tags = [];
        
        try {
            const fullText = `${data.englishTitle}. ${data.englishSummary}. ${data.englishKeySnippet}`;
            const bertResponse = await chrome.runtime.sendMessage({
                type: 'BERT_FULL_PROCESS',
                text: fullText
            });
            
            if (bertResponse?.success) {
                bertEmbedding = bertResponse.embedding;
                tags = bertResponse.tags || []; 
                console.log(`[BG EMBED] BERT 완료: 키워드 ${tags.length}개`);
            }
        } catch (error) {
            console.log('[BG EMBED] BERT 실패 (무시):', error.message);
        }
        
        // 4. 저장
        console.log('[BG EMBED] 스토리지 저장 중...');
        const storageKey = CONFIG.STORAGE_KEY;
        const allSummaries = await chrome.storage.local.get(storageKey);
        const summariesMap = allSummaries[storageKey] || {};
        
        summariesMap[data.bookmarkId] = {
            id: data.bookmarkId,
            title: data.title,
            englishTitle: data.englishTitle,
            url: data.url,
            summary: data.englishSummary,
            keySnippet: data.englishKeySnippet,
            uiSummary: data.uiSummary,
            folderName: data.englishFolderName,
            koreanFolderName: data.folderName,
            thumbnail: data.thumbnailUrl,
            embedding: useEmbedding,
            tfidfVector: tfidfVector,
            bertEmbedding: bertEmbedding,
            tags: tags,
            dateAdded: data.dateAdded
        };
        
        await chrome.storage.local.set({ [storageKey]: summariesMap });
        
        // 5. TF-IDF 모델 재구축 (백그라운드)
        console.log('[BG EMBED] TF-IDF 모델 재구축 중...');
        await rebuildTfIdfModelBackground();
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[BG EMBED] ✅ 백그라운드 처리 완료 (${elapsed}초)`);
        
    } catch (error) {
        console.error('[BG EMBED] 백그라운드 처리 실패:', error);
    }
}

/**
 * TF-IDF 모델 재구축 (백그라운드용)
 */
async function rebuildTfIdfModelBackground() {
    try {
        const storageKey = CONFIG.STORAGE_KEY;
        const allSummaries = await chrome.storage.local.get(storageKey);
        const summariesMap = allSummaries[storageKey] || {};
        
        // 1. 모든 문서 텍스트 수집
        const documents = [];
        for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
            if (summaryData) {
                const docText = [
                    summaryData.englishTitle || summaryData.title || '',
                    summaryData.summary || '',
                    summaryData.keySnippet || '',
                    summaryData.folderName || ''
                ].filter(text => text && text.trim() !== '').join(' ');
                
                if (docText.trim()) {
                    documents.push(docText);
                }
            }
        }
        
        if (documents.length === 0 || typeof TFIDF === 'undefined') {
            console.warn('[BG TFIDF] 문서나 TFIDF 클래스가 없어 재구축 건너뜀.');
            return;
        }
        
        // 2. 새 TF-IDF 모델 구축
        const tfidfModel = new TFIDF();
        tfidfModel.buildVocabulary(documents);
        
        // 3. 모델 저장
        const serialized = tfidfModel.serialize();
        await chrome.storage.local.set({ [TFIDF_MODEL_KEY]: serialized });
        
        console.log(`[BG TFIDF] 모델 재구축 완료: ${Object.keys(summariesMap).length}개 문서`);
    } catch (error) {
        console.error('[BG TFIDF] 재구축 실패:', error);
    }
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

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
  // 90일 경과 북마크 체크 요청
  if (message.type === 'CHECK_INACTIVE_BOOKMARKS') {
    await checkInactiveBookmarks();
    sendResponse({ success: true });
    return true;
  }
  
  // 북마크 임베딩 백그라운드 처리
  if (message.type === 'PROCESS_BOOKMARK_EMBEDDINGS') {
    processBookmarkEmbeddingsBackground(message).catch(err => {
      console.error('[BG] 백그라운드 임베딩 처리 실패:', err);
    });
    sendResponse({ success: true, message: 'Background processing started' });
    return true;
  }
  
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
      url: chrome.runtime.getURL("pages/manager.html"),
    });
  }
});

// ============================================================
// 검색 엔진 키워드 감지 및 북마크 추천 기능
// ============================================================

let offscreenDocumentReady = false;

/**
 * Offscreen document 생성 및 초기화
 */
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) {
    console.log('[OFFSCREEN] Offscreen document가 이미 존재합니다.');
    // 이미 존재하는 경우에도 준비 상태 확인
    if (!offscreenDocumentReady) {
      console.log('[OFFSCREEN] 기존 document의 준비 상태 확인 중...');
      await waitForEmbedderReady();
    }
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'WebGL을 사용한 임베딩 생성',
    });
    console.log('[OFFSCREEN] Offscreen document 생성 완료.');
    
    // 임베더 로딩 대기
    await waitForEmbedderReady();
  } catch (error) {
    console.error('[OFFSCREEN] Offscreen document 생성 실패:', error);
  }
}

/**
 * TextEmbedder가 준비될 때까지 대기 (최대 90초)
 * 첫 로드 시 USE 모델 다운로드로 인해 시간이 오래 걸릴 수 있음
 */
async function waitForEmbedderReady() {
  const maxAttempts = 180; // 90초 (500ms * 180)
  let lastElapsed = 0;
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_READY' });
      
      // 진행 상황 로그 (10초마다)
      if (response && response.elapsed && Math.floor(response.elapsed / 10) > Math.floor(lastElapsed / 10)) {
        console.log(`[OFFSCREEN] 모델 로딩 중... (${response.elapsed.toFixed(1)}초 경과)`);
        lastElapsed = response.elapsed;
      }
      
      if (response && response.ready) {
        offscreenDocumentReady = true;
        console.log(`[OFFSCREEN] ✅ TextEmbedder 준비 완료! (${response.elapsed.toFixed(1)}초 소요)`);
        return true;
      }
      
      if (response && response.error) {
        console.error(`[OFFSCREEN] TextEmbedder 로딩 실패: ${response.error}`);
        return false;
      }
    } catch (error) {
      // 아직 준비 안 됨, 계속 대기
    }
  }
  
  console.error('[OFFSCREEN] ❌ TextEmbedder 로딩 타임아웃 (90초)');
  console.error('[OFFSCREEN] 해결 방법: chrome://extensions/ → SmartMark → "Inspect views: offscreen.html" 클릭하여 오류 확인');
  return false;
}

/**
 * 검색 엔진별 URL 패턴과 쿼리 파라미터
 */
const SEARCH_ENGINES = [
  { name: 'Google', pattern: '*://www.google.com/search*', param: 'q' },
  { name: 'Google', pattern: '*://www.google.co.kr/search*', param: 'q' },
  { name: 'Naver', pattern: '*://search.naver.com/search.naver*', param: 'query' },
  { name: 'Bing', pattern: '*://www.bing.com/search*', param: 'q' },
  { name: 'DuckDuckGo', pattern: '*://duckduckgo.com/*', param: 'q' },
  { name: 'Yahoo', pattern: '*://search.yahoo.com/search*', param: 'p' },
];

/**
 * URL에서 검색어 추출
 * @param {string} url - 검색 엔진 URL
 * @returns {string|null} 검색어 또는 null
 */
function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);
    
    // 검색 엔진별로 쿼리 파라미터 확인
    for (const engine of SEARCH_ENGINES) {
      if (url.includes(new URL(engine.pattern.replace('*://', 'https://').replace('*', '')).hostname)) {
        const query = urlObj.searchParams.get(engine.param);
        if (query) {
          console.log(`[SEARCH DETECT] ${engine.name} 검색 감지: "${query}"`);
          return decodeURIComponent(query);
        }
      }
    }
  } catch (error) {
    console.error('[SEARCH DETECT] URL 파싱 실패:', error);
  }
  return null;
}

/**
 * USE 임베딩 생성 (512차원)
 * @param {string} text - 임베딩을 생성할 텍스트
 * @returns {Promise<number[]|null>} 임베딩 벡터 또는 null
 */
async function generateEmbedding(text) {
  if (!offscreenDocumentReady) {
    console.log('[EMBEDDING-USE] Embedder 준비 대기 중...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (offscreenDocumentReady) break;
    }
    
    if (!offscreenDocumentReady) {
      console.error('[EMBEDDING-USE] Embedder 타임아웃 (5초)');
      return null;
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      text: text,
    });

    if (response && response.success) {
      console.log(`[EMBEDDING-USE] ✅ 생성 완료 (${response.dimension}차원, ${response.responseTime}ms)`);
      return response.embedding;
    } else {
      console.error('[EMBEDDING-USE] 생성 실패:', response?.error);
      return null;
    }
  } catch (error) {
    console.error('[EMBEDDING-USE] 요청 실패:', error);
    return null;
  }
}

/**
 * BERT 임베딩 생성 (384차원)
 * @param {string} text - 임베딩을 생성할 텍스트
 * @returns {Promise<number[]|null>} 임베딩 벡터 또는 null
 */
async function generateBERTEmbedding(text) {
  if (!offscreenDocumentReady) {
    console.log('[EMBEDDING-BERT] Embedder 준비 대기 중...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (offscreenDocumentReady) break;
    }
    
    if (!offscreenDocumentReady) {
      console.error('[EMBEDDING-BERT] Embedder 타임아웃 (5초)');
      return null;
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_BERT_EMBEDDING',
      text: text,
    });

    if (response && response.success) {
      console.log(`[EMBEDDING-BERT] ✅ 생성 완료 (${response.dimension}차원, ${response.responseTime}ms)`);
      return response.embedding;
    } else {
      console.error('[EMBEDDING-BERT] 생성 실패:', response?.error);
      return null;
    }
  } catch (error) {
    console.error('[EMBEDDING-BERT] 요청 실패:', error);
    return null;
  }
}

/**
 * KeyBERT 키워드 추출
 * @param {string} text - 원본 텍스트
 * @param {string[]} candidates - 후보 n-gram 목록
 * @returns {Promise<Array|null>} 키워드 목록 또는 null
 */
async function extractKeywords(text, candidates) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXTRACT_KEYWORDS',
      text: text,
      candidates: candidates
    });

    if (response && response.success) {
      console.log(`[KeyBERT] ✅ 키워드 추출 완료 (${response.responseTime}ms):`, response.keywords);
      return response.keywords;
    } else {
      console.error('[KeyBERT] 추출 실패:', response?.error);
      return null;
    }
  } catch (error) {
    console.error('[KeyBERT] 요청 실패:', error);
    return null;
  }
}

/**
 * N-gram 추출
 * @param {string} text - 텍스트
 * @returns {Promise<Array|null>} n-gram 목록 또는 null
 */
async function extractNGrams(text) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXTRACT_NGRAMS',
      text: text
    });

    if (response && response.success) {
      console.log(`[N-gram] ✅ ${response.ngrams.length}개 추출 완료`);
      return response.ngrams;
    } else {
      console.error('[N-gram] 추출 실패:', response?.error);
      return null;
    }
  } catch (error) {
    console.error('[N-gram] 요청 실패:', error);
    return null;
  }
}

/**
 * 코사인 유사도 계산
 * @param {number[]} vecA - 벡터 A
 * @param {number[]} vecB - 벡터 B
 * @returns {number} 코사인 유사도 (0~1)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * 검색어와 유사한 북마크 찾기 (하이브리드: 임베딩 + TF-IDF)
 * @param {number[]} queryEmbedding - 검색어 임베딩
 * @param {string} searchQuery - 원본 검색어 (TF-IDF용)
 * @param {number} threshold - 유사도 임계값 (기본값: 0.3)
 * @returns {Promise<Array>} 유사한 북마크 배열
 */
async function findSimilarBookmarks(queryEmbedding, searchQuery, threshold = 0.3) {
  console.log(`[DEBUG] findSimilarBookmarks 시작 - 검색어: "${searchQuery}", 임계값: ${threshold}`);
  
  const storageKey = CONFIG.STORAGE_KEY;
  const allSummaries = await chrome.storage.local.get(storageKey);
  const summariesMap = allSummaries[storageKey] || {};
  const similarBookmarks = [];
  const allScores = []; // 모든 점수 저장

  console.log(`[DEBUG] 총 ${Object.keys(summariesMap).length}개 북마크 검사`);

  // TF-IDF 모델 로드
  const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
  const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
  let queryTfIdfVector = null;
  
  if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
    console.log(`[DEBUG] TF-IDF 모델 로드 성공`);
    const tfidfModelInstance = new TFIDF();
    tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
    
    // 검색어 번역 (한글 → 영어)
    let searchQueryForTfidf = searchQuery;
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(searchQuery);
    
    if (hasKorean) {
      try {
        console.log(`[TF-IDF] 한글 검색어 감지, 번역 시도: "${searchQuery}"`);
        const translateResponse = await fetch(CONFIG.DEEPL_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${CONFIG.DEEPL_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'text': searchQuery,
            'target_lang': 'EN-US'
          })
        });

        if (translateResponse.ok) {
          const data = await translateResponse.json();
          searchQueryForTfidf = data.translations[0].text;
          console.log(`[TF-IDF] 검색어 번역 완료: "${searchQuery}" → "${searchQueryForTfidf}"`);
        } else {
          console.warn(`[TF-IDF] 번역 API 실패 (${translateResponse.status}), 원본 사용`);
        }
      } catch (error) {
        console.warn('[TF-IDF] 번역 오류, 원본 사용:', error.message);
      }
    }
    
    queryTfIdfVector = tfidfModelInstance.computeTFIDFVector(searchQueryForTfidf);
    console.log(`[DEBUG] TF-IDF 검색어 벡터 생성 완료 (차원: ${queryTfIdfVector.length})`);
    
    // 하이브리드 스코어링 가중치
    const ALPHA = 0.4; // 임베딩 가중치
    const BETA = 0.6;  // TF-IDF 가중치
    console.log(`[DEBUG] 가중치 - Semantic: ${ALPHA}, Keyword: ${BETA}`);

    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
      if (summaryData && summaryData.embedding) {
        const semanticScore = cosineSimilarity(queryEmbedding, summaryData.embedding);
        
        let keywordScore = 0;
        if (summaryData.tfidfVector && queryTfIdfVector) {
          if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
            const minLength = Math.min(queryTfIdfVector.length, summaryData.tfidfVector.length);
            const queryVec = queryTfIdfVector.slice(0, minLength);
            const bookmarkVec = summaryData.tfidfVector.slice(0, minLength);
            keywordScore = tfidfModelInstance.cosineSimilarity(queryVec, bookmarkVec);
          } else {
            keywordScore = tfidfModelInstance.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
          }
        }
        
        const finalScore = (ALPHA * semanticScore) + (BETA * keywordScore);
        
        allScores.push({
          title: summaryData.title || 'Untitled',
          semantic: semanticScore,
          keyword: keywordScore,
          final: finalScore
        });
        
        if (finalScore >= threshold) {
          similarBookmarks.push({
            id: bookmarkId,
            title: summaryData.title || 'Untitled',
            similarity: finalScore,
            url: summaryData.url || '',
            folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
            summary: summaryData.uiSummary || 'No summary information',
            thumbnail: summaryData.thumbnail || '',
            score: Math.round(finalScore * 100)
          });
        }
      }
    }
  } else {
    console.log(`[DEBUG] TF-IDF 모델 없음 - 임베딩만 사용`);
    // TF-IDF 없이 임베딩만 사용 (폴백)
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
      if (summaryData && summaryData.embedding) {
        const similarity = cosineSimilarity(queryEmbedding, summaryData.embedding);
        
        allScores.push({
          title: summaryData.title || 'Untitled',
          semantic: similarity,
          keyword: 0,
          final: similarity
        });
        
        if (similarity >= threshold) {
          similarBookmarks.push({
            id: bookmarkId,
            title: summaryData.title || 'Untitled',
            similarity: similarity,
            url: summaryData.url || '',
            folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
            summary: summaryData.uiSummary || 'No summary information',
            thumbnail: summaryData.thumbnail || '',
            score: Math.round(similarity * 100)
          });
        }
      }
    }
  }

  // 유사도 내림차순 정렬
  allScores.sort((a, b) => b.final - a.final);
  similarBookmarks.sort((a, b) => b.similarity - a.similarity);
  
  // 상위 20개 점수 출력
  console.log(`\n========== 📊 유사도 점수 (상위 20개) ==========`);
  allScores.slice(0, 20).forEach((score, idx) => {
    const emoji = score.final >= threshold ? '✅' : '❌';
    console.log(`${emoji} ${idx + 1}. [${(score.final * 100).toFixed(1)}%] ${score.title}`);
    console.log(`   Semantic: ${(score.semantic * 100).toFixed(1)}% | Keyword: ${(score.keyword * 100).toFixed(1)}%`);
  });
  console.log(`\n✅ 임계값 이상: ${similarBookmarks.length}개`);
  console.log(`❌ 임계값 미만: ${allScores.length - similarBookmarks.length}개`);
  console.log(`==========================================\n`);
  
  const result = similarBookmarks.slice(0, 10);
  console.log(`[DEBUG] findSimilarBookmarks 완료 - 반환 결과: ${result.length}개`);
  return result;
}

// 검색 결과를 임시 저장할 변수
let lastSearchResults = {
  query: '',
  bookmarks: [],
  timestamp: 0
};

/**
 * 알림 표시 및 검색 결과 저장
 * @param {string} searchQuery - 검색어
 * @param {Array} bookmarks - 유사한 북마크 배열
 */
async function showBookmarkNotification(searchQuery, bookmarks) {
  console.log(`[NOTIFICATION] showBookmarkNotification 호출 - 북마크 ${bookmarks.length}개`);
  
  if (bookmarks.length === 0) {
    console.log(`[NOTIFICATION] 북마크가 없어 알림 생성 중단`);
    return;
  }

  // 검색 결과 저장
  console.log(`[NOTIFICATION] 검색 결과 저장 중...`);
  lastSearchResults = {
    query: searchQuery,
    bookmarks: bookmarks,
    timestamp: Date.now()
  };
  console.log(`[NOTIFICATION] ✅ 검색 결과 저장 완료`);

  // 알림 생성
  const notificationId = `smartmark-search-${Date.now()}`;
  const topBookmark = bookmarks[0];
  const count = bookmarks.length;
  
  console.log(`[NOTIFICATION] 알림 생성 시도...`);
  console.log(`[NOTIFICATION] - ID: ${notificationId}`);
  console.log(`[NOTIFICATION] - 1위: ${topBookmark.title} (${topBookmark.score}%)`);
  
  // 제목과 메시지를 안전하게 처리 (길이 제한 및 특수문자 제거)
  const safeTitle = String(topBookmark.title || 'Untitled')
    .substring(0, 50)
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, ' ')
    .trim();
  
  const safeQuery = String(searchQuery)
    .substring(0, 30)
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ]/g, ' ')
    .trim();
  
  console.log(`[NOTIFICATION] Safe title: "${safeTitle}"`);
  console.log(`[NOTIFICATION] Safe query: "${safeQuery}"`);
  
  try {
    const notificationOptions = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('bang.png'),
      title: `해당 내용과 관련된 북마크 ${count}개가 있습니다!`,
      message: `검색 결과: ${safeTitle} (${topBookmark.score}%)`,
      priority: 2,
    };
    
    console.log(`[NOTIFICATION] Options:`, JSON.stringify(notificationOptions, null, 2));
    
    const createdId = await chrome.notifications.create(notificationId, notificationOptions);
    
    if (chrome.runtime.lastError) {
      console.error(`[NOTIFICATION] ❌ runtime.lastError:`, chrome.runtime.lastError);
      console.error(`[NOTIFICATION] 실패한 옵션:`, notificationOptions);
    } else {
      console.log(`[NOTIFICATION] ✅ 알림 생성 성공 - 반환된 ID: ${createdId}`);
    }
    
    // 알림이 실제로 생성되었는지 확인
    setTimeout(() => {
      chrome.notifications.getAll((notifications) => {
        console.log(`[NOTIFICATION] 현재 활성 알림 목록:`, Object.keys(notifications));
        if (notifications[notificationId] || notifications[createdId]) {
          console.log(`[NOTIFICATION] ✅ 알림 확인됨`);
        } else {
          console.warn(`[NOTIFICATION] ⚠️ 알림을 찾을 수 없음`);
          console.warn(`[NOTIFICATION] 찾으려던 ID: ${notificationId}`);
        }
      });
    }, 100);
    
  } catch (error) {
    console.error(`[NOTIFICATION] ❌ 알림 생성 실패:`, error);
    throw error;
  }
}

/**
 * 90일 이상 방문하지 않은 북마크 찾기
 * @returns {Promise<Array>} 90일 경과 북마크 배열
 */
async function findInactiveBookmarks() {
  console.log(`[INACTIVE] 90일 경과 북마크 검사 시작...`);
  
  try {
    // 방문 데이터 로드
    const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
    const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
    
    // 북마크 요약 정보 로드
    const storageKey = typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    
    const now = Date.now();
    const thresholdTime = now - (DAYS_THRESHOLD * MS_PER_DAY);
    const inactiveBookmarks = [];
    
    // 모든 북마크 순회
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
      if (!summaryData || !summaryData.url) continue;
      
      const visitData = visitDataMap[bookmarkId];
      const lastVisited = visitData?.lastVisited || 0;
      
      // 90일 경과 체크
      if (lastVisited > 0 && lastVisited < thresholdTime) {
        const daysSinceVisit = Math.floor((now - lastVisited) / MS_PER_DAY);
        
        inactiveBookmarks.push({
          id: bookmarkId,
          title: summaryData.title || 'Untitled',
          url: summaryData.url,
          folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
          lastVisited: lastVisited,
          daysSinceVisit: daysSinceVisit,
          // 추가 정보: 썸네일, 요약, 태그
          thumbnail: summaryData.thumbnail || '',
          summary: summaryData.uiSummary || '',
          tags: summaryData.tags || [],
        });
      }
    }
    
    // 날짜순 정렬 (오래된 것부터)
    inactiveBookmarks.sort((a, b) => a.lastVisited - b.lastVisited);
    
    console.log(`[INACTIVE] ✅ 검사 완료: ${inactiveBookmarks.length}개 북마크 발견`);
    return inactiveBookmarks;
    
  } catch (error) {
    console.error('[INACTIVE] ❌ 검사 실패:', error);
    return [];
  }
}

// 90일 비활성 알림을 보낸 북마크들의 lastVisited를 현재로 리셋
async function resetInactiveBookmarks(inactiveBookmarks) {
  try {
    const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
    const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
    const now = Date.now();

    for (const b of inactiveBookmarks) {
      const data = visitDataMap[b.id] || {
        frequency: 0,
        totalTimeSpentMs: 0,
        lastVisited: 0
      };
      data.lastVisited = now;
      visitDataMap[b.id] = data;
    }

    await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
    console.log(`[INACTIVE] lastVisited 갱신 완료: ${inactiveBookmarks.length}개 북마크를 ${new Date(now).toISOString()}로 리셋`);
  } catch (error) {
    console.error('[INACTIVE] lastVisited 리셋 실패:', error);
  }
}

/**
 * 90일 경과 북마크 알림 표시
 * @param {Array} inactiveBookmarks - 90일 경과 북마크 배열
 */
async function showInactiveBookmarkNotification(inactiveBookmarks) {
  console.log(`[INACTIVE NOTIFICATION] 알림 생성 시작 - ${inactiveBookmarks.length}개 북마크`);
  
  if (inactiveBookmarks.length === 0) {
    console.log(`[INACTIVE NOTIFICATION] 북마크가 없어 알림 생성 중단`);
    return;
  }
  
  try {
    // 검색 결과 페이지(search-results.html)에서 재사용할 수 있도록
    // 비활성 북마크를 검색 결과 형식으로 저장
    lastSearchResults = {
      query: '90일 넘게 방문하지 않은 북마크',
      bookmarks: inactiveBookmarks.map((b) => ({
        id: b.id,
        title: b.title || 'Untitled',
        url: b.url,
        folderName: b.folderName || '기타',
        // 원래 저장된 요약을 사용
        summary: b.summary || '',
        // 썸네일과 태그도 그대로 전달
        thumbnail: b.thumbnail || '',
        tags: b.tags || [],
        // 비활성 북마크 전용 필드
        daysSinceVisit: b.daysSinceVisit,
        // 유사도/점수는 표시하지 않음
        similarity: 0,
        score: 0,
      })),
      timestamp: Date.now(),
    };
    console.log('[INACTIVE NOTIFICATION] 검색 결과 형식으로 lastSearchResults 저장 완료');

    const notificationId = `smartmark-inactive-${Date.now()}`;
    const count = inactiveBookmarks.length;
    
    // 상위 3개 북마크 제목 추출
    const topTitles = inactiveBookmarks.slice(0, 3).map(b => b.title);
    const titlesText = topTitles.join(', ');
    
    // 제목과 메시지 생성
    const title = `90일 넘게 방문하지 않은 북마크가 ${count}개 있습니다!`;
    let message = '';
    
    if (count === 1) {
      message = `${topTitles[0]}`;
    } else if (count <= 3) {
      message = `${titlesText}`;
    } else {
      message = `${titlesText} 외 ${count - 3}개`;
    }
    
    // 안전하게 처리 (길이 제한)
    const safeMessage = message.substring(0, 100).trim();
    
    console.log(`[INACTIVE NOTIFICATION] - ID: ${notificationId}`);
    console.log(`[INACTIVE NOTIFICATION] - 제목: ${title}`);
    console.log(`[INACTIVE NOTIFICATION] - 메시지: ${safeMessage}`);
    
    const notificationOptions = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('bang.png'),
      title: title,
      message: safeMessage,
      priority: 1, // 검색 알림보다 낮은 우선순위
    };
    
    console.log(`[INACTIVE NOTIFICATION] Options:`, JSON.stringify(notificationOptions, null, 2));
    
    const createdId = await chrome.notifications.create(notificationId, notificationOptions);
    
    if (chrome.runtime.lastError) {
      console.error(`[INACTIVE NOTIFICATION] ❌ runtime.lastError:`, chrome.runtime.lastError);
    } else {
      console.log(`[INACTIVE NOTIFICATION] ✅ 알림 생성 성공 - 반환된 ID: ${createdId}`);
    }
    await resetInactiveBookmarks(inactiveBookmarks);
    
  } catch (error) {
    console.error(`[INACTIVE NOTIFICATION] ❌ 알림 생성 실패:`, error);
  }
}

/**
 * 90일 경과 북마크 체크 및 알림
 */
async function checkInactiveBookmarks() {
  const now = Date.now();
  
  // 24시간마다 한 번만 체크
  if (now - lastInactiveCheck < INACTIVE_CHECK_INTERVAL) {
    console.log(`[INACTIVE] 체크 스킵 (최근 체크됨)`);
    return;
  }
  
  lastInactiveCheck = now;
  console.log(`[INACTIVE] 90일 경과 북마크 체크 시작...`);
  
  const inactiveBookmarks = await findInactiveBookmarks();
  
  if (inactiveBookmarks.length > 0) {
    await showInactiveBookmarkNotification(inactiveBookmarks);
  } else {
    console.log(`[INACTIVE] 90일 경과 북마크 없음`);
  }
}

// 검색 처리 중복 방지를 위한 변수
let lastSearchQuery = '';
let lastSearchTabId = null;
let searchProcessing = false;

// 90일 경과 북마크 알림 관련 변수
const DAYS_THRESHOLD = 90; // 90일
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INACTIVE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24시간마다 체크
let lastInactiveCheck = 0;

/**
 * 검색 요청 감지 및 처리
 */
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const searchQuery = extractSearchQuery(details.url);
    
    if (!searchQuery) {
      return;
    }

    // 같은 탭에서 같은 검색어는 중복 처리 방지
    if (searchQuery === lastSearchQuery && details.tabId === lastSearchTabId && searchProcessing) {
      console.log(`[SEARCH] 중복 요청 무시: "${searchQuery}"`);
      return;
    }

    lastSearchQuery = searchQuery;
    lastSearchTabId = details.tabId;
    searchProcessing = true;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 [SEARCH] 검색어 감지: "${searchQuery}"`);
    console.log(`${'='.repeat(70)}`);

    try {
      // Offscreen document가 없으면 생성
      console.log('[SEARCH] 1. Offscreen document 확인 중...');
      if (!offscreenDocumentReady) {
        console.log('[SEARCH] Offscreen document 초기화 필요');
        await setupOffscreenDocument();
      }
      console.log('[SEARCH] ✅ Offscreen document 준비 완료');

      // 임베딩 생성
      console.log(`[SEARCH] 2. "${searchQuery}" 임베딩 생성 시작...`);
      const embedding = await generateEmbedding(searchQuery);
      if (!embedding) {
        console.error('[SEARCH] ❌ 임베딩 생성 실패 - 검색 중단');
        return;
      }
      console.log(`[SEARCH] ✅ 임베딩 생성 완료 (차원: ${embedding.length})`);

      // 유사한 북마크 검색 (하이브리드: 임베딩 + TF-IDF, 임계값: 0.3)
      console.log(`[SEARCH] 3. 북마크 유사도 분석 시작...`);
      const similarBookmarks = await findSimilarBookmarks(embedding, searchQuery, 0.3);
      console.log(`[SEARCH] ✅ 유사도 분석 완료 - ${similarBookmarks.length}개 발견`);

      // 알림 표시
      if (similarBookmarks.length > 0) {
        console.log(`[SEARCH] 4. 알림 생성 시작...`);
        await showBookmarkNotification(searchQuery, similarBookmarks);
        console.log(`[SEARCH] ✅ 알림 생성 완료`);
      } else {
        console.log(`[SEARCH] ℹ️ 임계값 이상의 북마크가 없어 알림 생성하지 않음`);
      }
      
      console.log(`[SEARCH] 🎉 검색 처리 완료`);
      console.log(`${'='.repeat(70)}\n`);
    } catch (error) {
      console.error('[SEARCH] ❌ 검색 처리 중 오류:', error);
      console.error('[SEARCH] 오류 스택:', error.stack);
    } finally {
      // 1초 후 플래그 초기화
      setTimeout(() => {
        searchProcessing = false;
        console.log('[SEARCH] 중복 방지 플래그 초기화');
      }, 1000);
    }
  },
  {
    urls: SEARCH_ENGINES.map(engine => engine.pattern),
  }
);

// 알림 클릭 리스너
// - 검색 결과 알림: 검색 결과 전용 팝업 창 열기
// - 비활성(90일 경과) 알림: Manager 페이지 새 탭으로 열기
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('smartmark-search-')) {
    console.log('[NOTIFICATION] 알림 클릭됨 - 검색 결과 페이지 열기');
    chrome.windows.create({
      url: chrome.runtime.getURL('pages/search-results.html'),
      type: 'popup',
      width: 1000,
      height: 700,
      focused: true
    });
  } else if (notificationId.startsWith('smartmark-inactive-')) {
    console.log('[INACTIVE NOTIFICATION] 알림 클릭됨 - 비활성 북마크 결과 페이지 열기');
    chrome.windows.create({
      url: chrome.runtime.getURL('pages/search-results.html'),
      type: 'popup',
      width: 1000,
      height: 700,
      focused: true
    });
  }
});

// Offscreen document에서 보내는 상태 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_STATUS') {
    const prefix = '[OFFSCREEN→BG]';
    
    switch (message.status) {
      case 'script_loaded':
        console.log(`${prefix} 📄 ${message.message}`);
        break;
      case 'loading':
        console.log(`${prefix} ⏳ ${message.message}`);
        break;
      case 'ready':
        console.log(`${prefix} ✅ ${message.message}`);
        offscreenDocumentReady = true;
        break;
      case 'error':
        console.error(`${prefix} ❌ ${message.message}`);
        if (message.stack) {
          console.error(`${prefix} 스택:`, message.stack);
        }
        break;
      default:
        console.log(`${prefix} ${message.message || JSON.stringify(message)}`);
    }
  }
  
  // BERT 모델 상태 메시지 (선택적 기능)
  if (message.type === 'BERT_STATUS') {
    if (message.status === 'ready') {
      console.log(`[BERT→BG] ✅ BERT 모델 준비 완료 (${message.modelName}, ${message.dimension}차원)`);
      console.log(`[BERT→BG] 💡 향상된 검색: USE + TF-IDF + BERT 앙상블 사용 가능`);
      console.log(`[BERT→BG] ⏱️ 로드 시간: ${message.loadTime}초`);
    } else if (message.status === 'disabled') {
      console.log(`[BERT→BG] ℹ️ BERT: ${message.message}`);
      console.log(`[BERT→BG] ✅ USE (512차원) + TF-IDF 하이브리드 검색 사용 중`);
      if (message.info) {
        console.log(`[BERT→BG] 💡 ${message.info}`);
      }
    } else if (message.status === 'error') {
      console.error(`[BERT→BG] ❌ BERT 로드 실패: ${message.error}`);
      if (message.errorDetails) {
        console.error(`[BERT→BG] 🔍 에러 카테고리: ${message.errorDetails.category}`);
        console.error(`[BERT→BG] 🔍 에러 타입: ${message.errorDetails.type}`);
        console.error(`[BERT→BG] 🔍 에러 메시지: ${message.errorDetails.message}`);
        console.error(`[BERT→BG] 🔍 스택:`, message.errorDetails.stack);
      }
      console.log(`[BERT→BG] ℹ️ USE + TF-IDF 검색은 정상 작동합니다`);
    } else if (message.status === 'loading') {
      console.log(`[BERT→BG] ⏳ ${message.message || 'BERT 모델 로딩 중...'}`);
    } else {
      console.log(`[BERT→BG] ${message.status}: ${message.message || ''}`);
    }
    return true; // async response 처리
  }
  
  // 팝업에서 검색 결과 요청 시
  if (message.type === 'GET_SEARCH_RESULTS') {
    sendResponse(lastSearchResults);
    return false;
  }
  
  // 평가 모드: 모든 검색 메서드 비교 실행
  if (message.type === 'START_EVALUATION') {
    (async () => {
      try {
        console.log(`[EVALUATION] 평가 시작: "${message.query}"`);
        
        // USE 임베딩 생성
        const useEmbedding = await generateEmbedding(message.query);
        
        // BERT 임베딩 생성
        const bertEmbedding = await generateBERTEmbedding(message.query);
        
        // 모든 검색 메서드 비교
        const comparison = await compareAllSearchMethods(
          message.query,
          useEmbedding,
          bertEmbedding
        );
        
        console.log(`[EVALUATION] ✅ 평가 완료:`, comparison);
        sendResponse({ success: true, comparison: comparison });
      } catch (error) {
        console.error('[EVALUATION] 평가 실패:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 비동기 응답
  }
});

// 확장 프로그램 시작 시 Offscreen document 설정
setupOffscreenDocument();