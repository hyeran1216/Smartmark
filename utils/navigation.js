/** 북마크 URL을 새 탭에서 열고 창 포커스 */
export function openBookmark(url) {
    chrome.tabs.create({ url, active: true }, (tab) => {
        if (chrome.runtime.lastError) return;
        if (tab && tab.windowId != null) {
            chrome.windows.update(tab.windowId, { focused: true });
        }
    });
}
