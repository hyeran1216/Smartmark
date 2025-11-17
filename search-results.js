// 검색 결과 페이지 스크립트

document.addEventListener('DOMContentLoaded', async () => {
    const queryText = document.getElementById('query-text');
    const resultsContainer = document.getElementById('results-output');

    // Loading 표시
    resultsContainer.innerHTML = '<div class="loading">검색 결과 불러오는 중...</div>';

    try {
        // Background에서 검색 결과 가져오기
        const searchResults = await chrome.runtime.sendMessage({ type: 'GET_SEARCH_RESULTS' });

        if (!searchResults || !searchResults.bookmarks || searchResults.bookmarks.length === 0) {
            displayNoResults();
            return;
        }

        // 검색어 표시
        queryText.textContent = searchResults.query;

        // 결과 표시 (manager 스타일 사용)
        displayResults(searchResults.bookmarks);
    } catch (error) {
        console.error('검색 결과 로드 실패:', error);
        displayNoResults();
    }
});

/**
 * 검색 결과 표시 (manager.html 스타일)
 */
function displayResults(bookmarks) {
    const resultsContainer = document.getElementById('results-output');
    
    resultsContainer.innerHTML = bookmarks.map((bookmark) => `
        <div class="result-card" onclick="openBookmark('${escapeHtml(bookmark.url)}')">
            <div class="result-thumbnail">
                ${bookmark.thumbnail ? `<img src="${bookmark.thumbnail}" alt="thumbnail" onerror="this.style.display='none'">` : '<span style="color: #999;">No Image</span>'}
            </div>
            <div class="result-title">
                <span class="result-score">${bookmark.score}% 일치</span>
                ${escapeHtml(bookmark.title)}
            </div>
            <div class="result-url">${escapeHtml(bookmark.url)}</div>
            <div class="result-summary">${escapeHtml(bookmark.summary)}</div>
        </div>
    `).join('');
}

/**
 * 결과 없음 표시
 */
function displayNoResults() {
    const resultsContainer = document.getElementById('results-output');
    resultsContainer.innerHTML = `
        <div class="no-results">
            <h2>검색 결과가 없습니다</h2>
            <p>검색 세션이 만료되었거나 관련 북마크를 찾을 수 없습니다.</p>
        </div>
    `;
}

/**
 * 북마크 열기
 */
function openBookmark(url) {
    chrome.tabs.create({ url: url });
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

