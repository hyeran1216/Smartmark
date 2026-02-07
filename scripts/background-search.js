/**
 * SmartMark Background - Search detection, offscreen, similarity, notifications
 * Expects globals: offscreenDocumentReady, lastSearchResults, CONFIG, TFIDF_MODEL_KEY, TFIDF
 */

let lastSearchQuery = '';
let lastSearchTabId = null;
let searchProcessing = false;

const SEARCH_ENGINES = [
  { name: 'Google', pattern: '*://www.google.com/search*', param: 'q' },
  { name: 'Google', pattern: '*://www.google.co.kr/search*', param: 'q' },
  { name: 'Naver', pattern: '*://search.naver.com/search.naver*', param: 'query' },
  { name: 'Bing', pattern: '*://www.bing.com/search*', param: 'q' },
  { name: 'DuckDuckGo', pattern: '*://duckduckgo.com/*', param: 'q' },
  { name: 'Yahoo', pattern: '*://search.yahoo.com/search*', param: 'p' },
];

async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existingContexts.length > 0) {
    if (!offscreenDocumentReady) await waitForEmbedderReady();
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'BERT embedding generation',
    });
    chrome.runtime.sendMessage({ type: 'INIT_BERT' }).catch(() => { });
    await waitForEmbedderReady();
  } catch (error) {
    console.error('[OFFSCREEN] Failed to create:', error);
  }
}

async function waitForEmbedderReady() {
  const maxAttempts = 180;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_READY' });
      if (response?.ready) {
        offscreenDocumentReady = true;
        return true;
      }
      if (response?.error) return false;
    } catch (e) { }
  }
  console.error('[OFFSCREEN] Timeout (90 seconds)');
  return false;
}

function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);
    for (const engine of SEARCH_ENGINES) {
      const hostname = new URL(engine.pattern.replace('*://', 'https://').replace('*', '')).hostname;
      if (url.includes(hostname)) {
        const query = urlObj.searchParams.get(engine.param);
        if (query) return decodeURIComponent(query);
      }
    }
  } catch (e) { }
  return null;
}

async function generateEmbedding(text) {
  for (let i = 0; i < 10; i++) {
    if (offscreenDocumentReady) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!offscreenDocumentReady) return null;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GENERATE_EMBEDDING', text });
    return response?.success ? response.embedding : null;
  } catch (e) {
    return null;
  }
}

async function findSimilarBookmarks(queryEmbedding, searchQuery, threshold = 0.3) {
  const storageKey = CONFIG.STORAGE_KEY;
  const allSummaries = await chrome.storage.local.get(storageKey);
  const summariesMap = allSummaries[storageKey] || {};
  const similarBookmarks = [];
  let tfidfModelInstance = null;
  let queryTfIdfVector = null;
  const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
  if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
    tfidfModelInstance = new TFIDF();
    tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
    queryTfIdfVector = tfidfModelInstance.computeTFIDFVector(searchQuery);
  }
  const ALPHA = 0.7, BETA = 0.3;

  for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
    if (!summaryData?.bertEmbedding) continue;
    const targetEmbedding = summaryData.bertEmbedding;
    if (!queryEmbedding || queryEmbedding.length !== targetEmbedding.length) continue;
    const bertScore = cosineSimilarity(queryEmbedding, targetEmbedding);
    let keywordScore = 0;
    if (tfidfModelInstance && queryTfIdfVector && summaryData.tfidfVector)
      keywordScore = tfidfModelInstance.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
    const finalScore = ALPHA * bertScore + BETA * keywordScore;
    if (finalScore >= threshold) {
      similarBookmarks.push({
        id: bookmarkId,
        title: summaryData.title || 'Untitled',
        similarity: finalScore,
        url: summaryData.url || '',
        folderName: summaryData.koreanFolderName || summaryData.folderName || 'Others',
        summary: summaryData.uiSummary || summaryData.summary || '',
        thumbnail: summaryData.thumbnail || '',
        score: Math.round(finalScore * 100),
      });
    }
  }
  similarBookmarks.sort((a, b) => b.similarity - a.similarity);
  return similarBookmarks.slice(0, 10);
}

function showNotificationAndSaveResults(query, bookmarks, title, message, priority = 2) {
  if (bookmarks.length === 0) return;
  lastSearchResults.query = query;
  lastSearchResults.bookmarks = bookmarks;
  lastSearchResults.timestamp = Date.now();
  const safeMessage = String(message).substring(0, 100).replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ().%,-]/g, ' ').trim();
  chrome.notifications.create(`smartmark-search-${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('bang.png'),
    title,
    message: safeMessage,
    priority,
  }).catch((e) => console.error('[NOTIFICATION]', e));
}

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const searchQuery = extractSearchQuery(details.url);
    if (!searchQuery) return;
    if (searchQuery === lastSearchQuery && details.tabId === lastSearchTabId && searchProcessing) return;
    lastSearchQuery = searchQuery;
    lastSearchTabId = details.tabId;
    searchProcessing = true;

    try {
      if (!offscreenDocumentReady) await setupOffscreenDocument();
      const embedding = await generateEmbedding(searchQuery);
      if (!embedding) return;
      const similarBookmarks = await findSimilarBookmarks(embedding, searchQuery, 0.3);
      if (similarBookmarks.length > 0) {
        const top = similarBookmarks[0];
        showNotificationAndSaveResults(
          searchQuery,
          similarBookmarks,
          `Related bookmarks: ${similarBookmarks.length}`,
          `${top.title || 'Untitled'} (${top.score}% match)`,
          2
        );
      }
    } catch (error) {
      console.error('[SEARCH]', error);
    } finally {
      setTimeout(() => { searchProcessing = false; }, 1000);
    }
  },
  { urls: SEARCH_ENGINES.map((e) => e.pattern) }
);

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('smartmark-search-') || notificationId.startsWith('smartmark-inactive-')) {
    chrome.windows.create({
      url: chrome.runtime.getURL('pages/search-results.html'),
      type: 'popup',
      width: 1000,
      height: 700,
      focused: true,
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_STATUS') {
    if (message.status === 'ready') offscreenDocumentReady = true;
    if (message.status === 'error') console.error('[OFFSCREEN]', message.message || message.error);
    return;
  }
  if (message.type === 'BERT_STATUS') {
    if (message.status === 'error') console.error('[BERT]', message.error);
    return true;
  }
  if (message.type === 'GET_SEARCH_RESULTS') {
    sendResponse(lastSearchResults);
    return false;
  }
});
