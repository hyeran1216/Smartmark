import { getStorageKey } from '../utils/storage.js';
import { cosineSimilarity } from '../utils/math.js';

const VISIT_DATA_KEY = 'SmartMarkVisitData';
const WEIGHTS = { RECENCY: 0.5, FREQUENCY: 0.3, ENGAGEMENT: 0.2 };

function calculateRecencyScore(lastVisitedMs) {
    if (lastVisitedMs === 0) return 0;
    const timeElapsedHours = (Date.now() - lastVisitedMs) / (1000 * 60 * 60);
    return 1 / (1 + Math.log10(timeElapsedHours + 1));
}

function normalizeScore(value, maxValue) {
    if (maxValue === 0) return 0;
    return value / maxValue;
}

document.addEventListener('DOMContentLoaded', initializeManager);

const OUTPUT_ELEMENT = document.getElementById('bookmark-output');
let bookmarkSummaries = {};
let validBookmarksWithFolders = [];
let folderMap = {};

async function initializeManager() {
    try {
        OUTPUT_ELEMENT.innerHTML = '<h2>Loading bookmarks...</h2>';
        await loadAllSummaries();
        await cleanupInvalidBookmarks();
        await loadFolderInformation();
        await loadValidBookmarksWithFolders();
        populateFolderDropdown();
        renderFilteredBookmarks('all');
        setupEventListeners();
        if (validBookmarksWithFolders.length === 0) {
            OUTPUT_ELEMENT.innerHTML = '<h2>No bookmarks found.</h2><p>Only bookmarks with AI summaries will appear here.</p>';
        }
    } catch (error) {
        console.error('Manager load error:', error);
        OUTPUT_ELEMENT.innerHTML = `<h2>Error: ${error.message}</h2>`;
    }
}

async function loadAllSummaries() {
    const storageKey = getStorageKey();
    const allSummaries = await chrome.storage.local.get(storageKey);
    bookmarkSummaries = allSummaries[storageKey] || {};
}

async function cleanupInvalidBookmarks() {
    const summaryIds = Object.keys(bookmarkSummaries);
    const invalidIds = [];
    for (const bookmarkId of summaryIds) {
        try {
            await chrome.bookmarks.get(bookmarkId);
        } catch (error) {
            invalidIds.push(bookmarkId);
        }
    }
    if (invalidIds.length > 0) {
        for (const id of invalidIds) delete bookmarkSummaries[id];
        const storageKey = getStorageKey();
        await chrome.storage.local.set({ [storageKey]: bookmarkSummaries });
    }
}

async function loadFolderInformation() {
    const tree = await chrome.bookmarks.getTree();

    function collectFolders(node) {
        if (!node.url && node.children && node.id !== '0') {
            folderMap[node.id] = {
                id: node.id,
                title: node.title,
                parentId: node.parentId
            };
        }

        if (node.children) {
            for (const child of node.children) {
                collectFolders(child);
            }
        }
    }

    if (tree && tree.length > 0) collectFolders(tree[0]);
}

async function loadValidBookmarksWithFolders() {
    const allVisitData = await chrome.storage.local.get(VISIT_DATA_KEY);
    const visitDataMap = allVisitData[VISIT_DATA_KEY] || {};

    const summaryIds = Object.keys(bookmarkSummaries);
    validBookmarksWithFolders = [];

    for (const bookmarkId of summaryIds) {
        try {
            const bookmarkArray = await chrome.bookmarks.get(bookmarkId);
            if (bookmarkArray && bookmarkArray.length > 0) {
                const bookmark = bookmarkArray[0];
                const folderInfo = folderMap[bookmark.parentId] || { title: 'Others', id: bookmark.parentId };

                const summaryObject = bookmarkSummaries[bookmark.id] || { uiSummary: "No summary information", thumbnail: "" };

                const visitData = visitDataMap[bookmark.id] || {
                    frequency: 0,
                    totalTimeSpentMs: 0,
                    lastVisited: 0
                };

                validBookmarksWithFolders.push({
                    ...bookmark,
                    folderInfo: folderInfo,
                    uiSummary: summaryObject.uiSummary,
                    thumbnail: summaryObject.thumbnail,
                    tags: summaryObject.tags || [],
                    visitData: visitData
                });
            }
        } catch (error) { }
    }
}

function sortBookmarksByUtilityScore(bookmarks) {
    if (bookmarks.length === 0) return [];
    const maxFrequency = Math.max(...bookmarks.map((b) => b.visitData.frequency));
    const maxTimeSpent = Math.max(...bookmarks.map((b) => b.visitData.totalTimeSpentMs));
    const scoredBookmarks = bookmarks.map((bookmark) => {
        const data = bookmark.visitData;
        const recencyScore = calculateRecencyScore(data.lastVisited);
        const frequencyScore = normalizeScore(data.frequency, maxFrequency);
        const engagementScore = normalizeScore(data.totalTimeSpentMs, maxTimeSpent);
        bookmark.utilityScore = WEIGHTS.RECENCY * recencyScore + WEIGHTS.FREQUENCY * frequencyScore + WEIGHTS.ENGAGEMENT * engagementScore;
        return bookmark;
    });
    return scoredBookmarks.sort((a, b) => b.utilityScore - a.utilityScore);
}

function populateFolderDropdown() {
    const folderSelect = document.getElementById('folderFilter');

    while (folderSelect.children.length > 1) folderSelect.removeChild(folderSelect.lastChild);
    const foldersWithBookmarks = new Set();
    validBookmarksWithFolders.forEach((b) => foldersWithBookmarks.add(b.folderInfo.id));
    foldersWithBookmarks.forEach((folderId) => {
        const folderInfo = folderMap[folderId] || { title: 'Others' };
        const option = document.createElement('option');
        option.value = folderId;
        option.textContent = `📁 ${folderInfo.title}`;
        folderSelect.appendChild(option);
    });
}

function renderFilteredBookmarks(selectedFolderId) {
    const filteredBookmarks = selectedFolderId === 'all'
        ? validBookmarksWithFolders
        : validBookmarksWithFolders.filter((b) => b.folderInfo.id === selectedFolderId);

    if (filteredBookmarks.length === 0) {
        OUTPUT_ELEMENT.innerHTML = '<h2>No bookmarks found in the selected folder.</h2>';
        return;
    }
    const bookmarksByFolder = {};
    filteredBookmarks.forEach((bookmark) => {
        const folderId = bookmark.folderInfo.id;
        if (!bookmarksByFolder[folderId]) bookmarksByFolder[folderId] = { folderInfo: bookmark.folderInfo, bookmarks: [] };
        bookmarksByFolder[folderId].bookmarks.push(bookmark);
    });
    OUTPUT_ELEMENT.innerHTML = '';
    Object.values(bookmarksByFolder).forEach((folderGroup) => {
        renderFolderGroup(folderGroup.folderInfo, sortBookmarksByUtilityScore(folderGroup.bookmarks));
    });
}

function renderFolderGroup(folderInfo, bookmarks) {
    const folderSection = document.createElement('div');
    folderSection.classList.add('folder-section');
    const titleElement = document.createElement('div');
    titleElement.classList.add('folder-title');
    titleElement.textContent = `📁 ${folderInfo.title} (${bookmarks.length}개)`;
    folderSection.appendChild(titleElement);
    const container = document.createElement('div');
    container.classList.add('bookmark-container');

    bookmarks.forEach((bookmark) => {
        const card = document.createElement('div');
        card.classList.add('bookmark-card');
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => chrome.tabs.create({ url: bookmark.url }));

        const img = document.createElement('img');
        img.classList.add('card-image');
        img.alt = bookmark.title;
        if (bookmark.thumbnail && bookmark.thumbnail !== 'placeholder_url' && bookmark.thumbnail !== '') {
            img.src = bookmark.thumbnail;
        } else {
            img.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            img.style.width = '30px';
            img.style.height = '30px';
        }
        img.onerror = function () {
            this.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            this.onerror = null;
            this.style.width = '30px';
            this.style.height = '30px';
        };
        card.appendChild(img);

        const titleLink = document.createElement('div');
        titleLink.classList.add('card-title');
        titleLink.textContent = bookmark.title;
        card.appendChild(titleLink);
        const urlElement = document.createElement('div');
        urlElement.classList.add('card-url');
        urlElement.textContent = bookmark.url;
        card.appendChild(urlElement);
        const summaryElement = document.createElement('div');
        summaryElement.classList.add('card-summary');
        summaryElement.textContent = bookmark.uiSummary;
        card.appendChild(summaryElement);
        if (bookmark.tags && bookmark.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.classList.add('card-tags');
            bookmark.tags.slice(0, 3).forEach((tag) => {
                const tagEl = document.createElement('span');
                tagEl.classList.add('tag');
                tagEl.textContent = tag;
                tagsContainer.appendChild(tagEl);
            });
            card.appendChild(tagsContainer);
        }
        container.appendChild(card);
    });

    folderSection.appendChild(container);
    OUTPUT_ELEMENT.appendChild(folderSection);
}

function setupEventListeners() {
    const folderSelect = document.getElementById('folderFilter');
    const refreshButton = document.getElementById('refreshButton');

    folderSelect.addEventListener('change', (e) => {
        renderFilteredBookmarks(e.target.value);
    });

    refreshButton.addEventListener('click', () => {
        location.reload();
    });

    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');

    if (searchButton) {
        searchButton.addEventListener('click', handleSearchInManager);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearchInManager();
        });
    }
}

async function handleSearchInManager() {
    const searchQuery = document.getElementById('searchInput').value.trim();
    const statusElement = document.getElementById('search-status');
    const resultsElement = document.getElementById('results-output');
    const bookmarkOutput = document.getElementById('bookmark-output');

    if (!searchQuery) {
        statusElement.textContent = 'please enter the content to search...';
        return;
    }
    bookmarkOutput.style.display = 'none';

    statusElement.textContent = 'searching...';
    resultsElement.innerHTML = '';

    try {
        statusElement.textContent = 'analyzing search query (BERT)...';
        let queryEmbedding = null;
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GENERATE_BERT_EMBEDDING', text: searchQuery });
            if (response?.success) queryEmbedding = response.embedding;
            else throw new Error(response?.error || 'Embedding generation failed');
        } catch (e) {
            throw new Error('Failed to analyze search query.');
        }
        statusElement.textContent = 'searching bookmarks...';
        const searchResults = await searchBookmarksByEmbedding(queryEmbedding, searchQuery);
        displaySearchResultsInManager(searchResults, resultsElement, statusElement);

        const existingBackButton = document.getElementById('manager-back-btn');
        if (existingBackButton) existingBackButton.remove();

        const backButton = document.createElement('button');
        backButton.id = 'manager-back-btn';
        backButton.innerHTML = '← Back';
        backButton.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            padding: 8px 16px;
            background-color: rgba(108, 117, 125, 0.9);
            color: white;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            transition: all 0.2s ease;
        `;
        backButton.onmouseover = () => {
            backButton.style.backgroundColor = 'rgba(90, 98, 104, 0.95)';
            backButton.style.transform = 'scale(1.05)';
        };
        backButton.onmouseout = () => {
            backButton.style.backgroundColor = 'rgba(108, 117, 125, 0.9)';
            backButton.style.transform = 'scale(1)';
        };
        backButton.addEventListener('click', () => {
            bookmarkOutput.style.display = 'block';
            resultsElement.innerHTML = '';
            statusElement.textContent = '';
            document.getElementById('searchInput').value = '';
            backButton.remove();
        });
        document.body.appendChild(backButton);
    } catch (error) {
        statusElement.textContent = `search failed: ${error.message}`;
        bookmarkOutput.style.display = 'block';
    }
}

function displaySearchResultsInManager(results, resultsElement, statusElement) {
    if (results.length === 0) {
        statusElement.textContent = 'No results found.';
        resultsElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No results found.<br>Check if you have bookmarks with embeddings.</div>';
        return;
    }

    statusElement.textContent = `${results.length} results found.`;

    resultsElement.innerHTML = results.map((result) => {
        const tagsHtml = result.tags && result.tags.length > 0
            ? `<div class="result-tags">
                ${result.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>`
            : '';
        return `
            <div class="result-card" data-url="${result.bookmark.url}">
                <div class="result-thumbnail">
                    <img src="${result.thumbnail}" alt="thumbnail" onerror="this.src='https://www.google.com/s2/favicons?domain=${new URL(result.bookmark.url).hostname}&sz=128'; this.style.width='50px'; this.style.height='50px';">
                </div>
                <div class="result-title">${result.bookmark.title}</div>
                <div class="result-url">${result.bookmark.url}</div>
                <div class="result-summary">${result.uiSummary || result.summary}</div>
                ${tagsHtml}
                <div class="result-score">${result.score}% match</div>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.result-card').forEach((card) => {
        card.addEventListener('click', () => {
            const url = card.getAttribute('data-url');
            chrome.tabs.create({ url: url });
        });
    });
}

async function searchBookmarksByEmbedding(queryEmbedding, searchQuery) {
    const allBookmarks = await chrome.bookmarks.getTree();
    const bookmarkList = [];
    function flatten(nodes) {
        for (const node of nodes) {
            if (node.url) bookmarkList.push(node);
            if (node.children) flatten(node.children);
        }
    }
    flatten(allBookmarks);

    const storageKey = getStorageKey();
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    let tfidfModel = null;
    let queryTfIdfVector = null;
    if (savedModel[TFIDF_MODEL_KEY] && window.TFIDF) {
        tfidfModel = new window.TFIDF();
        tfidfModel.deserialize(savedModel[TFIDF_MODEL_KEY]);
        queryTfIdfVector = tfidfModel.computeTFIDFVector(searchQuery);
    }
    const ALPHA = 0.7, BETA = 0.3;
    const results = [];

    for (const bookmark of bookmarkList) {
        const summaryData = summariesMap[bookmark.id];
        if (!summaryData?.bertEmbedding) continue;
        if (queryEmbedding.length !== summaryData.bertEmbedding.length) continue;
        const bertScore = cosineSimilarity(queryEmbedding, summaryData.bertEmbedding);
        let keywordScore = 0;
        if (tfidfModel && queryTfIdfVector && summaryData.tfidfVector?.length === queryTfIdfVector.length) {
            keywordScore = tfidfModel.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
        }
        const finalScore = ALPHA * bertScore + BETA * keywordScore;
        if (finalScore > 0.15) {
            results.push({
                bookmark,
                summary: summaryData.uiSummary || summaryData.summary || '',
                thumbnail: summaryData.thumbnail || '',
                tags: summaryData.tags || [],
                similarity: finalScore,
                semanticScore: bertScore,
                keywordScore,
                bertScore,
                score: Math.round(finalScore * 100)
            });
        }
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}