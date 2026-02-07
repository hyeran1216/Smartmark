import { aiManager } from '../utils/ai-manager.js';
import { getStorageKey } from '../utils/storage.js';
import { cosineSimilarity } from '../utils/math.js';
import { openBookmark as openBookmarkUrl } from '../utils/navigation.js';
import {
    isYouTubeUrl,
    extractYouTubeVideoId,
    getYouTubeCaptionText,
    extractYouTubeCaptionFromPage,
} from '../utils/youtube.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

let currentUrl = '';
let currentTitle = '';
let currentMode = 'save';

const saveModeDiv = document.getElementById('save-bookmark-mode');
const searchModeDiv = document.getElementById('search-mode');
const saveModeButton = document.getElementById('saveModeButton');
const searchModeButton = document.getElementById('searchModeButton');
async function main() {
    try {
        await getCurrentTabInfo();
        updateUiWithCurrentTab();
        await populateFolderSelect();

        document.getElementById('saveButton').addEventListener('click', handleSave);
        document.getElementById('manageButton').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("pages/manager.html") });
            window.close();
        });
        document.getElementById('status').textContent = 'Please check the information to save.';

        saveModeButton.addEventListener('click', () => switchMode('save'));
        searchModeButton.addEventListener('click', () => switchMode('search'));

        document.getElementById('searchButton').addEventListener('click', handleSearch);
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
    } catch (error) {
        document.getElementById('status').textContent = `Error: ${error.message}`;
    }
}

function switchMode(mode) {
    if (mode === currentMode) return;

    currentMode = mode;
    if (mode === 'save') {
        saveModeDiv.style.display = 'block';
        searchModeDiv.style.display = 'none';
        saveModeButton.classList.add('active-mode');
        searchModeButton.classList.remove('active-mode');
    } else {
        saveModeDiv.style.display = 'none';
        searchModeDiv.style.display = 'block';
        searchModeButton.classList.add('active-mode');
        saveModeButton.classList.remove('active-mode');
    }
}

/** 현재 활성화된 탭의 URL과 제목을 가져와 전역 변수에 저장합니다. */
async function getCurrentTabInfo() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        currentUrl = tab.url;
        currentTitle = tab.title;

        const favIconUrl = tab.favIconUrl || '';
        const favIconElement = document.getElementById('favIcon');
        if (favIconUrl) {
            favIconElement.src = favIconUrl;
            favIconElement.style.display = 'inline-block';
        } else {
            favIconElement.style.display = 'none';
        }
    } else {
        throw new Error("No active tab");
    }
}
/** 획득한 정보로 UI 입력 필드를 업데이트합니다. */
function updateUiWithCurrentTab() {
    document.getElementById('titleInput').value = currentTitle;
    document.getElementById('urlInput').value = currentUrl;
}
/** 북마크 트리를 순회하며 폴더 목록을 드롭다운에 채웁니다. */
async function populateFolderSelect() {
    const folderSelect = document.getElementById('folderSelect');
    folderSelect.innerHTML = '';

    const bookmarks = await chrome.bookmarks.getTree();

    if (bookmarks.length > 0 && bookmarks[0].children) {
        traverseBookmarks(bookmarks[0], folderSelect, 0);
    }

    if (folderSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = '1';
        option.textContent = 'No bookmarks found (save to Other bookmarks)';
        folderSelect.appendChild(option);
    }
}

/** 재귀적으로 북마크 트리를 탐색하여 폴더만 드롭다운에 추가합니다. */
function traverseBookmarks(node, selectElement, level) {
    if (node.children) {
        if (node.id !== '0') {
            const prefix = '— '.repeat(level - 1 > 0 ? level - 1 : 0);
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = prefix + node.title;
            selectElement.appendChild(option);
        }

        for (const child of node.children) {
            if (child.children) {
                traverseBookmarks(child, selectElement, level + 1);
            }
        }
    }
}
/** 저장 버튼 클릭 처리 */
async function handleSave() {
    const title = document.getElementById('titleInput').value;
    const selectedFolderId = document.getElementById('folderSelect').value;

    if (!selectedFolderId) {
        alert("Please select a folder to save.");
        return;
    }

    document.getElementById('status').textContent = 'Analyzing page and generating summary...';

    try {
        let reuseExistingSummary = false;
        let existingSummaryData = null;

        const existingBookmark = await findExistingBookmarkByUrl(currentUrl);
        if (existingBookmark) {
            const storageKey = getStorageKey();
            const allSummaries = await chrome.storage.local.get(storageKey);
            const summariesMap = allSummaries[storageKey] || {};
            existingSummaryData = summariesMap[existingBookmark.id];

            if (existingSummaryData && existingSummaryData.summary) {
                const shouldReuse = confirm(
                    `Bookmark with this URL already exists:\n"${existingBookmark.title}"\n\n` +
                    `Reuse existing summary?\n` +
                    `(OK: Reuse | Cancel: Generate New)`
                );

                if (shouldReuse) {
                    reuseExistingSummary = true;
                }

                await chrome.bookmarks.remove(existingBookmark.id);
            } else {
                const shouldReplace = confirm(
                    `Bookmark with this URL already exists:\n"${existingBookmark.title}"\n\n` +
                    `Update with new summary?`
                );
                if (shouldReplace) {
                    await chrome.bookmarks.remove(existingBookmark.id);
                    await removeSummaryFromLocal(existingBookmark.id);
                } else {
                    document.getElementById('status').textContent = 'Save cancelled.';
                    return;
                }
            }
        }

        let content = "";

        if (!reuseExistingSummary) {
            if (isYouTubeUrl(currentUrl)) {
                const videoId = extractYouTubeVideoId(currentUrl);
                if (videoId) {
                    document.getElementById('status').textContent = 'Extracting YouTube transcript...';
                    try {
                        content = await getYouTubeCaptionText(videoId);
                        if (!content) {
                            throw new Error("Transcript empty");
                        }
                    }
                    catch (error) {
                        document.getElementById('status').textContent = 'YouTube transcript failed: Please open the transcript panel.';

                        await new Promise(resolve => setTimeout(resolve, 2500));

                        content = await getPageContentForSummary();
                    }
                } else {
                    content = await getPageContentForSummary();
                }
            } else {
                content = await getPageContentForSummary();
            }
        }

        let summary = "No summary information";
        let englishSummary = "No summary information";
        let englishKeySnippet = "No key snippet";
        let result;

        document.getElementById('status').textContent = 'Saving summary and bookmark...';

        if (reuseExistingSummary && existingSummaryData) {
            result = {
                summary: existingSummaryData.summary,
                keySnippet: existingSummaryData.keySnippet
            };

            const [newBookmark, folderName] = await Promise.all([
                saveBookmark(title, currentUrl, selectedFolderId),
                getFolderNameById(selectedFolderId)
            ]);

            document.getElementById('status').textContent = `Saved! Summary: "${result.summary}"`;

            chrome.runtime.sendMessage({
                type: 'PROCESS_BOOKMARK_EMBEDDINGS',
                bookmarkId: newBookmark.id,
                title: title,
                summary: result.summary,
                keySnippet: result.keySnippet,
                folderName: folderName,
                thumbnailUrl: existingSummaryData.thumbnail || null,
                needsThumbnail: !existingSummaryData.thumbnail,
                url: newBookmark.url || currentUrl,
                dateAdded: newBookmark.dateAdded || Date.now()
            }).catch(() => { });

            window.close();
            return;
        }

        const [newBookmark, folderName] = await Promise.all([
            saveBookmark(title, currentUrl, selectedFolderId),
            getFolderNameById(selectedFolderId)
        ]);

        let thumbnailUrl = null;
        try {
            if (isYouTubeUrl(currentUrl)) {
                const videoId = extractYouTubeVideoId(currentUrl);
                if (videoId) thumbnailUrl = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
            } else {
                thumbnailUrl = await captureTabThumbnail();
            }
        } catch (e) { }

        let summaryResult = "No summary available";
        let uiSummaryResult = "No summary available";
        let aiSuccess = false;

        document.getElementById('status').textContent = 'Generating summary...';

        try {
            const isYouTube = isYouTubeUrl(currentUrl);

            summaryResult = await aiManager.summarize(content, {
                type: 'tldr',
                format: 'plain-text',
                length: 'short',
                outputLanguage: 'en',
                forceCloud: isYouTube
            });

            // Translate summary for UI
            // try {
            //     const targetLang = window.CONFIG?.TARGET_LANGUAGE || 'ko';
            //     document.getElementById('status').textContent = 'Translating summary...';
            //     const translatedSummary = await aiManager.translate(summaryResult, targetLang);
            //     uiSummaryResult = translatedSummary;
            // } catch (tError) {
            //     console.warn('Translation failed, using original summary:', tError);
            //     uiSummaryResult = summaryResult;
            // }
            uiSummaryResult = summaryResult;

            document.getElementById('status').innerText = `Success!`;
            aiSuccess = true;
        } catch (aiError) {
            summaryResult = "Summary failed: check on-device AI or API key";
            uiSummaryResult = "Summary failed";
            document.getElementById('status').innerText = summaryResult;
            aiSuccess = false;
        }

        try {
            await saveInitialMetadata(newBookmark.id, {
                title: title,
                url: newBookmark.url || currentUrl,
                folderName: folderName,
                summary: summaryResult,
                uiSummary: uiSummaryResult,
                thumbnail: thumbnailUrl,
                dateAdded: newBookmark.dateAdded || Date.now()
            });

            if (aiSuccess) {
                chrome.runtime.sendMessage({
                    type: 'PROCESS_BOOKMARK_EMBEDDINGS',
                    bookmarkId: newBookmark.id,
                    title: title,
                    summary: summaryResult,
                    keySnippet: summaryResult,
                    uiSummary: uiSummaryResult,
                    folderName: folderName,
                    thumbnailUrl: thumbnailUrl,
                    needsThumbnail: !thumbnailUrl,
                    url: newBookmark.url || currentUrl,
                    dateAdded: newBookmark.dateAdded || Date.now()
                }).catch(() => { });

                document.getElementById('status').innerText = 'Success! (Background processing...)';

                setTimeout(() => {
                    window.close();
                }, 700);
            }

        } catch (saveError) {
            document.getElementById('status').textContent = 'Save Failed!';
        }

        return;

    } catch (error) {
        document.getElementById('status').textContent = `Save failed: ${error.message}`;
        alert("Save failed. Please check Gemini API Key and permissions.");
    }
}

/** Chrome에 새 북마크 저장 */
function saveBookmark(title, url, parentId) {
    return chrome.bookmarks.create({
        parentId: parentId,
        title: title,
        url: url
    });
}

/** 콘텐츠 스크립트로 페이지 본문 요청 */
async function getPageContentForSummary() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return "";

    const tabId = tabs[0].id;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['scripts/content.js']
        });

        const response = await chrome.tabs.sendMessage(tabId, { action: "getPageContent" });

        if (response && response.success) {
            return response.content;
        }
        return "";
    } catch (e) {
        return "";
    }
}

/** URL로 기존 북마크 검색 */
async function findExistingBookmarkByUrl(url) {
    try {
        const bookmarks = await chrome.bookmarks.search({ url: url });

        if (bookmarks && bookmarks.length > 0) {
            return bookmarks[0];
        }

        return null;
    } catch (error) {
        return null;
    }
}

/** 로컬 스토리지에서 요약 제거 */
async function removeSummaryFromLocal(bookmarkId) {
    const storageKey = getStorageKey();
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};

    if (summariesMap[bookmarkId]) {
        delete summariesMap[bookmarkId];
        await chrome.storage.local.set({ [storageKey]: summariesMap });
    }
}

/** 탭 썸네일 캡처 */
async function captureTabThumbnail() {
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 });
        return await resizeImage(dataUrl, 640);
    } catch (error) {
        return 'https://storage.googleapis.com/codemark-placeholders/default-placeholder.webp';
    }
}

/** 이미지 리사이즈 */
function resizeImage(dataUrl, targetWidth) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const aspect = img.height / img.width;

            canvas.width = targetWidth;
            canvas.height = targetWidth * aspect;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL('image/webp', 0.8));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

/** 북마크 초기 메타데이터 저장 */
async function saveInitialMetadata(bookmarkId, data) {
    const storageKey = getStorageKey();
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};

    summariesMap[bookmarkId] = {
        title: data.title,
        url: data.url,
        folderName: data.folderName,
        dateAdded: data.dateAdded,

        summary: data.summary,
        uiSummary: data.uiSummary,
        keySnippet: data.summary,

        thumbnail: data.thumbnail,

        bertEmbedding: null,
        tfidfVector: null,
        tags: []
    };

    await chrome.storage.local.set({ [storageKey]: summariesMap });
}

/** 검색 버튼/엔터 처리 */
async function handleSearch() {
    const searchQuery = document.getElementById('searchInput').value.trim();
    const statusElement = document.getElementById('search-status');
    const resultsElement = document.getElementById('results-output');

    if (!searchQuery) {
        statusElement.textContent = 'Please enter a search term.';
        return;
    }

    statusElement.textContent = 'Searching...';
    resultsElement.innerHTML = '';

    try {
        statusElement.textContent = 'Analyzing search term...';
        let queryEmbedding = null;
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_BERT_EMBEDDING',
                text: searchQuery
            });
            if (response && response.success) {
                queryEmbedding = response.embedding;
            } else {
                throw new Error(response.error || 'Embedding generation failed');
            }
        } catch (e) {
            throw new Error('Search term analysis failed.');
        }

        statusElement.textContent = 'Searching bookmarks...';
        const searchResults = await searchBookmarksByEmbedding(queryEmbedding, searchQuery);

        displaySearchResults(searchResults, resultsElement, statusElement);

    } catch (error) {
        statusElement.textContent = `Search failed: ${error.message}`;
    }
}

/** 임베딩 기반 북마크 검색 */
async function searchBookmarksByEmbedding(queryEmbedding, searchQuery) {
    const allBookmarks = await chrome.bookmarks.getTree();
    const bookmarkList = [];

    function flattenBookmarks(nodes) {
        for (const node of nodes) {
            if (node.url) {
                bookmarkList.push(node);
            }
            if (node.children) {
                flattenBookmarks(node.children);
            }
        }
    }

    flattenBookmarks(allBookmarks);

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

    const results = [];
    const ALPHA = 0.7;
    const BETA = 0.3;

    for (const bookmark of bookmarkList) {
        const summaryData = summariesMap[bookmark.id];
        if (!summaryData) continue;

        const targetEmbedding = summaryData.bertEmbedding;
        if (!targetEmbedding) continue;

        let bertScore = 0;
        if (queryEmbedding.length === targetEmbedding.length) {
            bertScore = cosineSimilarity(queryEmbedding, targetEmbedding);
        } else {
            continue;
        }

        let keywordScore = 0;
        if (tfidfModel && queryTfIdfVector && summaryData.tfidfVector) {
            if (queryTfIdfVector.length === summaryData.tfidfVector.length) {
                keywordScore = tfidfModel.cosineSimilarity(
                    queryTfIdfVector,
                    summaryData.tfidfVector
                );
            }
        }

        const finalScore = (ALPHA * bertScore) + (BETA * keywordScore);

        if (finalScore > 0.15) {
            results.push({
                bookmark: bookmark,
                summary: summaryData.uiSummary || summaryData.summary || 'No summary information',
                thumbnail: summaryData.thumbnail || '',
                tags: summaryData.tags || [],
                similarity: finalScore,
                semanticScore: bertScore,
                keywordScore: keywordScore,
                bertScore: bertScore,
                score: Math.round(finalScore * 100)
            });
        }
    }

    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);
}

/** 검색 결과 렌더링 */
function displaySearchResults(results, resultsElement, statusElement) {
    if (results.length === 0) {
        statusElement.textContent = 'No search results found.';
        resultsElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No search results found.<br>Please ensure bookmarks have generated embeddings.</div>';
        return;
    }

    statusElement.textContent = `Found ${results.length} results.`;

    resultsElement.innerHTML = results.map(result => {
        const tagsHtml = result.tags && result.tags.length > 0
            ? `<div class="result-tags">
                ${result.tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
               </div>`
            : '';

        return `
            <div class="result-card" data-url="${result.bookmark.url}" style="cursor: pointer;">
                <div class="result-thumbnail"><img src="${result.thumbnail}" alt="thumbnail"></div>
                <div class="result-title">${escapeHtml(result.bookmark.title)}</div>
                <div class="result-url">${result.bookmark.url}</div>
                <div class="result-score">${result.score}% Match</div>
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">${result.summary}</div>
                ${tagsHtml}
            </div>
        `;
    }).join('');

    document.querySelectorAll('.result-card').forEach(card => {
        card.addEventListener('click', () => {
            const url = card.getAttribute('data-url');
            openBookmarkUrl(url);
            window.close();
        });
    });
}

/** HTML 이스케이프 (XSS 방지) */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** 폴더 ID로 폴더 이름 조회 */
async function getFolderNameById(folderId) {
    try {
        const bookmarks = await chrome.bookmarks.get(folderId);
        if (bookmarks && bookmarks.length > 0) {
            return bookmarks[0].title || 'Others';
        }
        return 'Others';
    } catch (error) {
        return 'Others';
    }
}