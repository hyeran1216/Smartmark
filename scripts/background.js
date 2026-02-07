// SmartMark Background Script
importScripts('../config.js');
importScripts('../utils/tfidf.js');
importScripts('../utils/math-global.js');
importScripts('background-visit.js');
importScripts('background-search.js');

const VISIT_DATA_KEY = 'SmartMarkVisitData';
const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';

let activeTabId = null;
let activeTabUrl = null;
let activeTabStartTime = 0;
let bookmarkUrls = {};
let tfidfModel = null;
let offscreenDocumentReady = false;
let lastSearchResults = { query: '', bookmarks: [], timestamp: 0 };

function getDocTextFromSummary(s) {
  if (!s) return '';
  return [s.title, s.summary, s.keySnippet, s.folderName].filter((t) => t && String(t).trim()).join(' ').trim();
}

function getTfIdfTextFromBookmarkData(data) {
  return [data.title, ...(data.tags || []), data.summary, data.keySnippet, data.folderName, data.url].filter(Boolean).join(' ');
}

async function cleanupChildren(children, removeFn) {
  let n = 0;
  for (const child of children) {
    if (child.url && (await removeFn(child.id))) n++;
    if (child.children?.length) n += await cleanupChildren(child.children, removeFn);
  }
  return n;
}

async function initialize() {
  await initializeBookmarkMap();
  setTimeout(() => checkInactiveBookmarks(), 5000);
}

function isYouTubeUrl(url) {
  return /youtube\.com|youtu\.be/.test(url);
}

function extractYouTubeVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/) || url.match(/youtube\.com\/watch\?.*v=([^&\n?#]+)/);
  return m?.[1] || null;
}

async function getThumbnailUrl(url) {
  if (isYouTubeUrl(url)) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
  }
  return 'https://storage.googleapis.com/codemark-placeholders/default-placeholder.webp';
}

async function processBookmarkEmbeddingsBackground(data) {
  try {
    await setupOffscreenDocument();

    let thumbnailUrl = data.thumbnailUrl;
    if (data.needsThumbnail && !thumbnailUrl) thumbnailUrl = await getThumbnailUrl(data.url);

    const fullText = `${data.title}. ${data.summary || ''}. ${data.keySnippet || ''}. ${data.folderName || ''}`;
    const tfidfText = getTfIdfTextFromBookmarkData(data);

    let tfidfVector = null;
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
      const t = new TFIDF();
      t.deserialize(savedModel[TFIDF_MODEL_KEY]);
      tfidfVector = t.computeTFIDFVector(tfidfText);
    }

    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const existingData = summariesMap[data.bookmarkId];
    let bertEmbedding = null;
    let tags = [];

    if (existingData?.bertEmbedding?.length) {
      bertEmbedding = existingData.bertEmbedding;
      tags = existingData.tags || [];
    } else {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'BERT_FULL_PROCESS', text: fullText });
        if (res?.success) {
          bertEmbedding = res.embedding;
          tags = res.tags || [];
        }
      } catch (e) {}
    }

    summariesMap[data.bookmarkId] = {
      id: data.bookmarkId,
      title: data.title,
      url: data.url,
      summary: data.summary,
      uiSummary: data.uiSummary || data.summary,
      keySnippet: data.keySnippet,
      folderName: data.folderName,
      thumbnail: thumbnailUrl,
      bertEmbedding,
      tfidfVector,
      tags,
      dateAdded: data.dateAdded,
    };
    await chrome.storage.local.set({ [storageKey]: summariesMap });
    await rebuildTfIdfModelBackground();
  } catch (error) {
    console.error('[BG EMBED]', error);
  }
}

async function rebuildTfIdfModelBackground() {
  try {
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const documents = [];
    for (const [, s] of Object.entries(summariesMap)) {
      const doc = getDocTextFromSummary(s);
      if (doc) documents.push(doc);
    }
    if (documents.length === 0 || typeof TFIDF === 'undefined') return;
    const t = new TFIDF();
    t.buildVocabulary(documents);
    await chrome.storage.local.set({ [TFIDF_MODEL_KEY]: t.serialize() });
  } catch (error) {
    console.error('[BG TFIDF]', error);
  }
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.bookmarks.onCreated.addListener(initializeBookmarkMap);
chrome.bookmarks.onRemoved.addListener(initializeBookmarkMap);
chrome.bookmarks.onChanged.addListener(initializeBookmarkMap);

async function initializeBookmarkMap() {
  const tree = await chrome.bookmarks.getTree();
  bookmarkUrls = {};
  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url) bookmarkUrls[node.url] = node.id;
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);
  await initializeTfIdfModel();
}

async function initializeTfIdfModel() {
  try {
    const storageKey = typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    if (savedModel[TFIDF_MODEL_KEY]) {
      tfidfModel = new TFIDF();
      tfidfModel.deserialize(savedModel[TFIDF_MODEL_KEY]);
      return;
    }
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const documents = [];
    for (const [, s] of Object.entries(summariesMap)) {
      const doc = getDocTextFromSummary(s);
      if (doc) documents.push(doc);
    }
    if (documents.length === 0) return;
    tfidfModel = new TFIDF();
    tfidfModel.buildVocabulary(documents);
    await chrome.storage.local.set({ [TFIDF_MODEL_KEY]: tfidfModel.serialize() });
  } catch (error) {
    console.error('[TF-IDF INIT]', error);
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'CHECK_INACTIVE_BOOKMARKS') {
    await checkInactiveBookmarks();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'PROCESS_BOOKMARK_EMBEDDINGS') {
    processBookmarkEmbeddingsBackground(message).catch((e) => console.error('[BG]', e));
    sendResponse({ success: true, message: 'Background processing started' });
    return true;
  }
  if (message.type === 'UPDATE_BOOKMARK_SUMMARY') {
    processBookmarkEmbeddingsBackground({
      bookmarkId: message.bookmarkId,
      title: message.title,
      summary: message.summary,
      uiSummary: message.summary,
      keySnippet: message.keySnippet,
      folderName: message.folderName,
      thumbnailUrl: message.thumbnailUrl,
      url: message.url,
      dateAdded: Date.now(),
      needsThumbnail: false,
    });
    return true;
  }
  if (message.type === 'AI_UNAVAILABLE_FALLBACK') {
    processBookmarkEmbeddingsBackground({
      bookmarkId: message.bookmarkId,
      title: message.title,
      summary: 'Summary unavailable (On-device model optional)',
      keySnippet: 'N/A',
      folderName: message.folderName,
      thumbnailUrl: message.thumbnailUrl,
      url: message.url,
      dateAdded: Date.now(),
      needsThumbnail: false,
    });
    return true;
  }
  return true;
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    await removeEmbeddingData(id);
    await removeVisitData(id);
    if (removeInfo.node?.children) {
      await cleanupChildren(removeInfo.node.children, removeEmbeddingData);
      await cleanupChildren(removeInfo.node.children, removeVisitData);
    }
  } catch (error) {
    console.error('[BOOKMARK DELETE]', id, error);
  }
});

async function removeEmbeddingData(bookmarkId) {
  try {
    const storageKey = typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    if (summariesMap[bookmarkId]) {
      delete summariesMap[bookmarkId];
      await chrome.storage.local.set({ [storageKey]: summariesMap });
      return true;
    }
  } catch (error) {
    console.error('[BOOKMARK DELETE]', error);
    throw error;
  }
  return false;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'smartmark-bookmark', title: 'SmartMark로 북마크 저장', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'smartmark-manage', title: 'SmartMark 관리 페이지 열기', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'smartmark-bookmark') chrome.action.openPopup();
  if (info.menuItemId === 'smartmark-manage') chrome.tabs.create({ url: chrome.runtime.getURL('pages/manager.html') });
});

setupOffscreenDocument();
