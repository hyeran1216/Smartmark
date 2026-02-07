import { openBookmark } from '../utils/navigation.js';

document.addEventListener('DOMContentLoaded', async () => {
    const queryText = document.getElementById('query-text');
    const resultsContainer = document.getElementById('results-output');

    resultsContainer.innerHTML = '<div class="loading">Loading search results...</div>';

    try {
        const searchResults = await chrome.runtime.sendMessage({ type: 'GET_SEARCH_RESULTS' });

        if (!searchResults || !searchResults.bookmarks || searchResults.bookmarks.length === 0) {
            displayNoResults();
            return;
        }

        queryText.textContent = searchResults.query;

        displayResults(searchResults.bookmarks);
    } catch (error) {
        console.error('Search results load failed:', error);
        displayNoResults();
    }
});

/**
 * 검색 결과 표시 (manager.html 스타일)
 */
function displayResults(bookmarks) {
    const resultsContainer = document.getElementById('results-output');

    resultsContainer.innerHTML = bookmarks.map((bookmark, index) => {
        const tagsHtml =
            bookmark.tags && bookmark.tags.length > 0
                ? `<div class="result-tags">
                ${bookmark.tags
                    .slice(0, 3)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}
               </div>`
                : '';

        const hasScore = typeof bookmark.score === 'number' && bookmark.score > 0;
        const scoreHtml = hasScore
            ? `<span class="result-score">${bookmark.score}% match</span>`
            : '';

        const inactiveHtml =
            typeof bookmark.daysSinceVisit === 'number'
                ? `<div class="result-inactive">${bookmark.daysSinceVisit} days since last visit</div>`
                : '';

        return `
            <div class="result-card" data-index="${index}">
                <div class="result-thumbnail">
                    ${bookmark.thumbnail
                ? `<img src="${bookmark.thumbnail}" alt="thumbnail" onerror="this.style.display='none'">`
                : '<span style="color: #999;">No Image</span>'
            }
                </div>
                <div class="result-title">
                    ${scoreHtml}
                    ${escapeHtml(bookmark.title)}
                </div>
                <div class="result-url">${escapeHtml(bookmark.url)}</div>
                <div class="result-summary">${escapeHtml(bookmark.summary || '')}</div>
                ${inactiveHtml}
                ${tagsHtml}
            </div>
        `;
    }).join('');

    const cards = resultsContainer.querySelectorAll('.result-card');
    cards.forEach((card) => {
        const index = parseInt(card.getAttribute('data-index'), 10);
        const bookmark = bookmarks[index];
        if (!bookmark || !bookmark.url) return;

        card.addEventListener('click', () => {
            openBookmark(bookmark.url);
        });
    });
}

/**
 * 결과 없음 표시
 */
function displayNoResults() {
    const resultsContainer = document.getElementById('results-output');
    resultsContainer.innerHTML = `
        <div class="no-results">
            <h2>No results found</h2>
            <p>Search session has expired or no relevant bookmarks were found.</p>
        </div>
    `;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

