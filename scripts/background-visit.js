/**
 * SmartMark Background - Visit tracking & 90-day inactive bookmarks
 * Expects globals: bookmarkUrls, activeTabId, activeTabUrl, activeTabStartTime, VISIT_DATA_KEY, lastSearchResults
 */

const DAYS_THRESHOLD = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INACTIVE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
let lastInactiveCheck = 0;

chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);

async function handleTabActivated(activeInfo) {
  await recordEngagementTime(activeTabId, activeTabUrl);
  activeTabId = activeInfo.tabId;
  activeTabStartTime = Date.now();
  try {
    const tab = await chrome.tabs.get(activeTabId);
    activeTabUrl = tab.url;
  } catch (e) {
    activeTabUrl = null;
  }
}

async function handleTabUpdated(tabId, changeInfo) {
  if (tabId !== activeTabId || !changeInfo.url) return;
  await recordEngagementTime(tabId, activeTabUrl);
  activeTabUrl = changeInfo.url;
  activeTabStartTime = Date.now();
}

async function handleTabRemoved(tabId) {
  if (tabId === activeTabId) {
    await recordEngagementTime(tabId, activeTabUrl);
    activeTabId = null;
    activeTabUrl = null;
    activeTabStartTime = 0;
  }
}

async function recordEngagementTime(tabId, url) {
  if (!url || !bookmarkUrls[url]) return;
  const bookmarkId = bookmarkUrls[url];
  const durationMs = Date.now() - activeTabStartTime;
  if (durationMs < 1000) return;

  const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
  const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
  const data = visitDataMap[bookmarkId] || { frequency: 0, totalTimeSpentMs: 0, lastVisited: 0 };
  data.frequency += 1;
  data.totalTimeSpentMs += durationMs;
  data.lastVisited = Date.now();
  visitDataMap[bookmarkId] = data;
  await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
}

async function removeVisitData(bookmarkId) {
  const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
  const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
  if (visitDataMap[bookmarkId]) {
    delete visitDataMap[bookmarkId];
    await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
    return true;
  }
  return false;
}

async function findInactiveBookmarks() {
  try {
    const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
    const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
    const storageKey = typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const now = Date.now();
    const thresholdTime = now - (DAYS_THRESHOLD * MS_PER_DAY);
    const inactiveBookmarks = [];

    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
      if (!summaryData?.url) continue;
      const lastVisited = visitDataMap[bookmarkId]?.lastVisited || 0;
      if (lastVisited > 0 && lastVisited < thresholdTime) {
        inactiveBookmarks.push({
          id: bookmarkId,
          title: summaryData.title || 'Untitled',
          url: summaryData.url,
          folderName: summaryData.koreanFolderName || summaryData.folderName || 'Others',
          lastVisited,
          daysSinceVisit: Math.floor((now - lastVisited) / MS_PER_DAY),
          thumbnail: summaryData.thumbnail || '',
          summary: summaryData.uiSummary || '',
          tags: summaryData.tags || [],
        });
      }
    }
    inactiveBookmarks.sort((a, b) => a.lastVisited - b.lastVisited);
    return inactiveBookmarks;
  } catch (error) {
    console.error('[INACTIVE] Failed to check:', error);
    return [];
  }
}

async function resetInactiveBookmarks(inactiveBookmarks) {
  try {
    const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
    const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};
    const now = Date.now();
    for (const b of inactiveBookmarks) {
      const data = visitDataMap[b.id] || { frequency: 0, totalTimeSpentMs: 0, lastVisited: 0 };
      data.lastVisited = now;
      visitDataMap[b.id] = data;
    }
    await chrome.storage.local.set({ [VISIT_DATA_KEY]: visitDataMap });
  } catch (error) {
    console.error('[INACTIVE] Failed to reset lastVisited:', error);
  }
}

async function showInactiveBookmarkNotification(inactiveBookmarks) {
  if (inactiveBookmarks.length === 0) return;
  lastSearchResults.query = 'Bookmarks not visited for over 90 days';
  lastSearchResults.bookmarks = inactiveBookmarks.map((b) => ({
    id: b.id,
    title: b.title || 'Untitled',
    url: b.url,
    folderName: b.folderName || 'Others',
    summary: b.summary || '',
    thumbnail: b.thumbnail || '',
    tags: b.tags || [],
    daysSinceVisit: b.daysSinceVisit,
    similarity: 0,
    score: 0,
  }));
  lastSearchResults.timestamp = Date.now();

  const count = inactiveBookmarks.length;
  const topTitles = inactiveBookmarks.slice(0, 3).map((b) => b.title);
  const title = `There are ${count} bookmarks that have not been visited for over 90 days!`;
  const message = count === 1 ? topTitles[0] : count <= 3 ? topTitles.join(', ') : `${topTitles.join(', ')} 외 ${count - 3}개`;
  const safeMessage = message.substring(0, 100).trim();

  try {
    await chrome.notifications.create(`smartmark-inactive-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('bang.png'),
      title,
      message: safeMessage,
      priority: 1,
    });
    await resetInactiveBookmarks(inactiveBookmarks);
  } catch (error) {
    console.error('[INACTIVE] Failed to create notification:', error);
  }
}

async function checkInactiveBookmarks() {
  const now = Date.now();
  if (now - lastInactiveCheck < INACTIVE_CHECK_INTERVAL) return;
  lastInactiveCheck = now;
  const inactiveBookmarks = await findInactiveBookmarks();
  if (inactiveBookmarks.length > 0) await showInactiveBookmarkNotification(inactiveBookmarks);
}
