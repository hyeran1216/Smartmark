const VISIT_DATA_KEY = 'SmartMarkVisitData';

// 유틸리티 점수 가중치 (Recency가 가장 중요)
const WEIGHTS = {
    RECENCY: 0.5,     // 마지막 접속 시간 (가장 높음)
    FREQUENCY: 0.3,   // 총 방문 횟수
    ENGAGEMENT: 0.2,  // 총 체류 시간
};
// 현재 시간의 타임스탬프 (밀리초)
const NOW_MS = Date.now();

/**
 * Recency 점수 계산 (경과 시간에 반비례, 로그 스케일 적용)
 * @param {number} lastVisitedMs 마지막 방문 타임스탬프 (밀리초)
 * @returns {number} 0.0 ~ 1.0 사이의 점수
 */
function calculateRecencyScore(lastVisitedMs) {
    if (lastVisitedMs === 0) return 0;
    
    // 경과 시간 (시간 단위)
    const timeElapsedHours = (NOW_MS - lastVisitedMs) / (1000 * 60 * 60);
    
    // 로그 스케일을 사용하여 시간이 지날수록 점수가 급격히 감소하도록 설계
    // 1시간 내 방문: 1.0, 10시간: ~0.5, 100시간: ~0.3
    return 1 / (1 + Math.log10(timeElapsedHours + 1));
}

/**
 * Frequency와 Engagement 점수를 정규화합니다.
 * @param {number} value 현재 북마크의 값
 * @param {number} maxValue 폴더 내 북마크들의 최댓값
 * @returns {number} 0.0 ~ 1.0 사이의 점수
 */
function normalizeScore(value, maxValue) {
    if (maxValue === 0) return 0;
    return value / maxValue;
}

document.addEventListener('DOMContentLoaded', initializeManager);

// ******************************************************
// 참고: 이 파일에서는 popup.js에 정의된 getBookmarkSummary 함수를 사용합니다.
//       manager.html에 popup.js를 먼저 로드했는지 확인하세요.
// ******************************************************

const OUTPUT_ELEMENT = document.getElementById('bookmark-output');
let bookmarkSummaries = {}; // 로컬 스토리지에서 모든 요약을 미리 로드할 변수
let validBookmarksWithFolders = []; // 유효한 북마크들과 폴더 정보
let folderMap = {}; // 폴더 ID -> 폴더 정보 매핑

/**
 * 관리 페이지 초기화 함수
 */
async function initializeManager() {
    try {
        OUTPUT_ELEMENT.innerHTML = '<h2>북마크 데이터 로딩 중...</h2>';
        
        // 1. 모든 요약 데이터를 한 번에 로컬 스토리지에서 미리 로드
        await loadAllSummaries();
        
        // 2. 삭제된 북마크들을 스토리지에서 정리
        await cleanupInvalidBookmarks();
        
        // 3. 폴더 정보 로드
        await loadFolderInformation();
        
        // 4. 요약 데이터가 있는 북마크들을 직접 찾아서 렌더링
        await loadValidBookmarksWithFolders();
        
        // 5. 폴더 드롭다운 채우기
        populateFolderDropdown();
        
        // 6. 초기 렌더링
        renderFilteredBookmarks('all');
        
        // 7. 이벤트 리스너 추가
        setupEventListeners();
        
        // 스마트 북마크가 없다면 메시지 표시
        if (validBookmarksWithFolders.length === 0) {
            OUTPUT_ELEMENT.innerHTML = '<h2>저장된 스마트 북마크가 없습니다.</h2><p>북마크를 저장할 때 AI 요약이 생성된 북마크만 여기에 표시됩니다.</p>';
        }

    } catch (error) {
        console.error("북마크 관리 페이지 로드 중 오류 발생:", error);
        OUTPUT_ELEMENT.innerHTML = `<h2>오류 발생: ${error.message}</h2>`;
    }
}

/**
 * 로컬 스토리지에서 모든 요약 데이터를 한 번에 가져와 메모리에 저장합니다.
 */
async function loadAllSummaries() {
    // STORAGE_KEY는 config.js에 정의되어 있습니다.
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey); 
    
    // 1. 로드된 raw 데이터 확인
    console.log(`[MANAGER DEBUG] 로드된 raw 데이터:`, allSummaries);
    
    // 2. storageKey로 실제 맵을 추출
    bookmarkSummaries = allSummaries[storageKey] || {};
    
    // 3. 추출된 맵의 내용 확인
    console.log("요약 데이터 로드 완료:", Object.keys(bookmarkSummaries).length, "개");
}

/**
 * 삭제된 북마크들을 스토리지에서 정리합니다.
 */
async function cleanupInvalidBookmarks() {
    const summaryIds = Object.keys(bookmarkSummaries);
    const invalidIds = [];
    
    console.log(`[CLEANUP DEBUG] 정리 시작: ${summaryIds.length}개 요약 데이터 확인`);
    
    for (const bookmarkId of summaryIds) {
        try {
            await chrome.bookmarks.get(bookmarkId);
        } catch (error) {
            console.log(`[CLEANUP DEBUG] 삭제된 북마크 발견: ID ${bookmarkId}`);
            invalidIds.push(bookmarkId);
        }
    }
    
    if (invalidIds.length > 0) {
        // 삭제된 북마크들을 스토리지에서 제거
        for (const invalidId of invalidIds) {
            delete bookmarkSummaries[invalidId];
        }
        
        // 업데이트된 데이터를 스토리지에 저장
        const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
        await chrome.storage.local.set({ [storageKey]: bookmarkSummaries });
        
        console.log(`[CLEANUP DEBUG] 정리 완료: ${invalidIds.length}개 삭제된 북마크 제거`);
    } else {
        console.log(`[CLEANUP DEBUG] 정리할 데이터 없음`);
    }
}

/**
 * 폴더 정보를 로드합니다.
 */
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
    
    if (tree && tree.length > 0) {
        collectFolders(tree[0]);
    }
    
    console.log(`[FOLDER DEBUG] 폴더 정보 로드 완료: ${Object.keys(folderMap).length}개`);
}

/**
 * 유효한 북마크들을 폴더 정보와 함께 로드합니다.
 */
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
                const folderInfo = folderMap[bookmark.parentId] || { title: '알 수 없는 폴더', id: bookmark.parentId };

                const summaryObject = bookmarkSummaries[bookmark.id] || { uiSummary: "No summary information", thumbnail: "" }; 

                const visitData = visitDataMap[bookmark.id] || {
                    frequency: 0,
                    totalTimeSpentMs: 0,
                    lastVisited: 0
                };

                validBookmarksWithFolders.push({
                    ...bookmark,
                    folderInfo: folderInfo,
                    uiSummary: summaryObject.uiSummary,      // 💡 요약 텍스트 분리
                    thumbnail: summaryObject.thumbnail,  // 💡 썸네일 URL 분리
                    visitData: visitData 
                });
                
                console.log(`[FOLDER DEBUG] 북마크 로드: "${bookmark.title}" in "${folderInfo.title}" uiSummary: "${summaryObject.uiSummary}"`);
            }
        } catch (error) {
            console.warn(`[FOLDER DEBUG] 북마크 ID ${bookmarkId} 로드 실패:`, error.message);
        }
    }
    
    console.log(`[FOLDER DEBUG] 유효한 북마크 로드 완료: ${validBookmarksWithFolders.length}개`);
}

/**
 * 요약 데이터가 있는 북마크들을 직접 찾아서 렌더링합니다.
 */
async function renderBookmarksWithSummaries() {
    const summaryIds = Object.keys(bookmarkSummaries);
    console.log(`[SUMMARY DEBUG] 요약이 있는 북마크 ID들:`, summaryIds);
    
    if (summaryIds.length === 0) {
        console.log(`[SUMMARY DEBUG] 요약 데이터가 없음`);
        return;
    }
    
    // 각 북마크 ID에 대해 실제 북마크 정보를 가져와서 렌더링
    const validBookmarks = [];
    
    for (const bookmarkId of summaryIds) {
        try {
            const bookmarkArray = await chrome.bookmarks.get(bookmarkId);
            if (bookmarkArray && bookmarkArray.length > 0) {
                const bookmark = bookmarkArray[0];
                console.log(`[SUMMARY DEBUG] 북마크 발견: ID=${bookmark.id}, 제목="${bookmark.title}"`);
                validBookmarks.push(bookmark);
            }
        } catch (error) {
            console.warn(`[SUMMARY DEBUG] 북마크 ID ${bookmarkId} 찾기 실패:`, error.message);
        }
    }
    
    if (validBookmarks.length > 0) {
        // "스마트 북마크" 섹션으로 렌더링
        renderSmartBookmarksSection(validBookmarks);
    }
}

/**
 * 북마크 리스트를 유틸리티 점수 순으로 정렬합니다.
 * @param {Array<Object>} bookmarks 정렬할 북마크 객체 배열
 * @returns {Array<Object>} 정렬된 북마크 객체 배열
 */
function sortBookmarksByUtilityScore(bookmarks) {
    if (bookmarks.length === 0) return [];
    
    // 1. 폴더 내 최댓값 찾기 (정규화를 위함)
    const maxFrequency = Math.max(...bookmarks.map(b => b.visitData.frequency));
    const maxTimeSpent = Math.max(...bookmarks.map(b => b.visitData.totalTimeSpentMs));
    
    // 2. 각 북마크의 최종 유틸리티 점수 계산
    const scoredBookmarks = bookmarks.map(bookmark => {
        const data = bookmark.visitData;
        
        // Recency 점수 (시간 경과에 따라 계산)
        const recencyScore = calculateRecencyScore(data.lastVisited);
        
        // Frequency 점수 (폴더 내 최댓값 대비 정규화)
        const frequencyScore = normalizeScore(data.frequency, maxFrequency);
        
        // Engagement 점수 (폴더 내 최댓값 대비 정규화)
        const engagementScore = normalizeScore(data.totalTimeSpentMs, maxTimeSpent);
        
        // 최종 가중치 합산 점수
        const finalScore = 
            (WEIGHTS.RECENCY * recencyScore) +
            (WEIGHTS.FREQUENCY * frequencyScore) +
            (WEIGHTS.ENGAGEMENT * engagementScore);
            
        // 디버깅 및 정렬을 위해 점수 추가
        bookmark.utilityScore = finalScore;
        
        console.log(`[SORT DEBUG] ${bookmark.title}: R(${recencyScore.toFixed(2)}) x ${WEIGHTS.RECENCY} + F(${frequencyScore.toFixed(2)}) x ${WEIGHTS.FREQUENCY} + E(${engagementScore.toFixed(2)}) x ${WEIGHTS.ENGAGEMENT} = Score ${finalScore.toFixed(4)}`);
        
        return bookmark;
    });
    
    // 3. 점수 순으로 내림차순 정렬
    return scoredBookmarks.sort((a, b) => b.utilityScore - a.utilityScore);
}

/**
 * 스마트 북마크 섹션을 렌더링합니다.
 * @param {Array} bookmarks 렌더링할 북마크 배열
 */
function renderSmartBookmarksSection(bookmarks) {
    console.log(`[SMART DEBUG] 스마트 북마크 섹션 렌더링: ${bookmarks.length}개`);
    
    // 기존 로딩 메시지 제거
    OUTPUT_ELEMENT.innerHTML = '';
    
    const folderSection = document.createElement('div');
    folderSection.classList.add('folder-section');
    
    // 폴더 제목
    const titleElement = document.createElement('div');
    titleElement.classList.add('folder-title');
    titleElement.textContent = '📚 스마트 북마크 (AI 요약 포함)';
    folderSection.appendChild(titleElement);
    
    // 북마크 카드 컨테이너
    const container = document.createElement('div');
    container.classList.add('bookmark-container');

    bookmarks.forEach(bookmark => {
        const summaryObject = bookmarkSummaries[bookmark.id] || { uiSummary: "No summary information", thumbnail: "" };
        const summaryText = summaryObject.uiSummary;
        console.log(`[SMART DEBUG] summaryText: "${summaryText}"`);
        const thumbnailUrl = summaryObject.thumbnail;
        
        console.log(`[SMART DEBUG] 북마크 카드 생성: ID=${bookmark.id}, 제목="${bookmark.title}"`);
        
        const card = document.createElement('div');
        card.classList.add('bookmark-card');

        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            chrome.tabs.create({ url: bookmark.url });
        });
        
        // const img = document.createElement('img');
        // img.classList.add('card-image');
        // img.alt = bookmark.title;
        // // 기본 이미지나 파비콘 사용
        // img.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
        // img.onerror = function() {
        //     this.style.display = 'none';
        // };
        // card.appendChild(img);
        
        // 1. 이미지 (썸네일 URL 사용)
        const img = document.createElement('img');
        img.classList.add('card-image');
        img.alt = bookmark.title;

        if (thumbnailUrl && thumbnailUrl !== 'placeholder_url' && thumbnailUrl !== '') {
            img.src = thumbnailUrl; 
        } else {
            // 썸네일이 없으면 바로 파비콘 사용
            img.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            img.style.width = '30px';
            img.style.height = '30px';
        }
        
        img.onerror = function() {
            // 썸네일 로드 실패 시 파비콘 또는 기본 이미지 사용
            this.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            this.onerror = null;
            this.style.width = '30px';
            this.style.height = '30px';
        };
        card.appendChild(img);
        
        // 2. 제목
        const titleLink = document.createElement('div');
        titleLink.classList.add('card-title');
        titleLink.textContent = bookmark.title;
        card.appendChild(titleLink);

        // 3. URL
        const urlElement = document.createElement('div');
        urlElement.classList.add('card-url');
        urlElement.textContent = bookmark.url;
        card.appendChild(urlElement);
        
        // 4. 한 줄 요약
        const summaryElement = document.createElement('div');
        summaryElement.classList.add('card-summary');
        summaryElement.textContent = summaryText;
        card.appendChild(summaryElement);

        container.appendChild(card);
    });
    
    folderSection.appendChild(container);
    OUTPUT_ELEMENT.appendChild(folderSection);
    
    console.log(`[SMART DEBUG] 스마트 북마크 섹션 렌더링 완료`);
}

/**
 * 폴더 드롭다운을 채웁니다.
 */
function populateFolderDropdown() {
    const folderSelect = document.getElementById('folderFilter');
    
    // 기존 옵션들 제거 (첫 번째 "모든 스마트 북마크" 옵션 제외)
    while (folderSelect.children.length > 1) {
        folderSelect.removeChild(folderSelect.lastChild);
    }
    
    // 북마크가 있는 폴더들만 추출
    const foldersWithBookmarks = new Set();
    validBookmarksWithFolders.forEach(bookmark => {
        foldersWithBookmarks.add(bookmark.folderInfo.id);
    });
    
    // 폴더 옵션 추가
    foldersWithBookmarks.forEach(folderId => {
        const folderInfo = folderMap[folderId] || { title: '알 수 없는 폴더' };
        const option = document.createElement('option');
        option.value = folderId;
        option.textContent = `📁 ${folderInfo.title}`;
        folderSelect.appendChild(option);
    });
    
    console.log(`[DROPDOWN DEBUG] 폴더 드롭다운 채우기 완료: ${foldersWithBookmarks.size}개 폴더`);
}

/**
 * 선택된 폴더에 따라 필터링된 북마크들을 렌더링합니다.
 */
function renderFilteredBookmarks(selectedFolderId) {
    let filteredBookmarks;
    
    if (selectedFolderId === 'all') {
        filteredBookmarks = validBookmarksWithFolders;
    } else {
        filteredBookmarks = validBookmarksWithFolders.filter(bookmark => 
            bookmark.folderInfo.id === selectedFolderId
        );
    }
    
    console.log(`[FILTER DEBUG] 필터링 결과: ${filteredBookmarks.length}개 북마크 (폴더: ${selectedFolderId})`);
    
    if (filteredBookmarks.length === 0) {
        OUTPUT_ELEMENT.innerHTML = '<h2>선택한 폴더에 스마트 북마크가 없습니다.</h2>';
        return;
    }
    
    // 폴더별로 그룹화
    const bookmarksByFolder = {};
    filteredBookmarks.forEach(bookmark => {
        const folderId = bookmark.folderInfo.id;
        if (!bookmarksByFolder[folderId]) {
            bookmarksByFolder[folderId] = {
                folderInfo: bookmark.folderInfo,
                bookmarks: []
            };
        }
        bookmarksByFolder[folderId].bookmarks.push(bookmark);
    });
    
    // 렌더링
    OUTPUT_ELEMENT.innerHTML = '';

    // 정렬 로직 적용
    Object.values(bookmarksByFolder).forEach(folderGroup => {
        const sortedBookmarks = sortBookmarksByUtilityScore(folderGroup.bookmarks);
        renderFolderGroup(folderGroup.folderInfo, sortedBookmarks); 
    });
    
    // Object.values(bookmarksByFolder).forEach(folderGroup => {
    //     renderFolderGroup(folderGroup.folderInfo, folderGroup.bookmarks);
    // });
}

/**
 * 폴더 그룹을 렌더링합니다.
 */
function renderFolderGroup(folderInfo, bookmarks) {
    const folderSection = document.createElement('div');
    folderSection.classList.add('folder-section');
    
    // 폴더 제목
    const titleElement = document.createElement('div');
    titleElement.classList.add('folder-title');
    titleElement.textContent = `📁 ${folderInfo.title} (${bookmarks.length}개)`;
    folderSection.appendChild(titleElement);
    
    // 북마크 카드 컨테이너
    const container = document.createElement('div');
    container.classList.add('bookmark-container');

    bookmarks.forEach(bookmark => {
        const card = document.createElement('div');
        card.classList.add('bookmark-card');
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            chrome.tabs.create({ url: bookmark.url });
        });

        // 1. 이미지 (썸네일 URL 사용)
        const img = document.createElement('img');
        img.classList.add('card-image');
        img.alt = bookmark.title;

        if (bookmark.thumbnail && bookmark.thumbnail !== 'placeholder_url' && bookmark.thumbnail !== '') {
            img.src = bookmark.thumbnail; 
        } else {
            // 썸네일이 없으면 바로 파비콘 사용
            img.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            img.style.width = '30px';
            img.style.height = '30px';
        }
        
        img.onerror = function() {
            // 썸네일 로드 실패 시 파비콘 또는 기본 이미지 사용
            this.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
            this.onerror = null; // 오류가 또 나면 더 이상 처리하지 않음
            this.style.width = '30px'; // 파비콘은 작게 표시
            this.style.height = '30px';
        };
        card.appendChild(img);
        
        // 1. 이미지 (파비콘)
        // const img = document.createElement('img');
        // img.classList.add('card-image');
        // img.alt = bookmark.title;
        // img.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=128`;
        // img.onerror = function() {
        //     this.style.display = 'none';
        // };
        // card.appendChild(img);
        
        // 2. 제목 (클릭하면 북마크로 이동)
        const titleLink = document.createElement('div');
        titleLink.classList.add('card-title');
        titleLink.textContent = bookmark.title;
        card.appendChild(titleLink);

        // 3. URL
        const urlElement = document.createElement('div');
        urlElement.classList.add('card-url');
        urlElement.textContent = bookmark.url;
        card.appendChild(urlElement);
        
        // 4. 한 줄 요약
        const summaryElement = document.createElement('div');
        summaryElement.classList.add('card-summary');
        // bookmark.summary는 이미 loadValidBookmarksWithFolders에서 분리하여 텍스트만 저장했습니다.
        summaryElement.textContent = bookmark.uiSummary; 
        card.appendChild(summaryElement);

        container.appendChild(card);
    });
    
    folderSection.appendChild(container);
    OUTPUT_ELEMENT.appendChild(folderSection);
}

/**
 * 이벤트 리스너를 설정합니다.
 */
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
            if (e.key === 'Enter') {
                handleSearchInManager();
            }
        });
    }
}


// manager.js 파일의 traverseAndRenderBookmarks 함수 수정

/**
 * 재귀적으로 북마크 트리를 탐색하고 폴더별 섹션을 렌더링합니다.
 * @param {object} node 현재 북마크 노드
 * @param {object} parentNode 이 노드의 부모 노드 (최초 호출 시 null)
 */
function traverseAndRenderBookmarks(node) {
    console.log(`[TRAVERSE DEBUG] 노드 탐색: ID=${node.id}, 제목="${node.title}", URL=${node.url || 'null'}, 자식수=${node.children ? node.children.length : 0}`);
    
    // 1. 현재 노드가 북마크를 포함하는 '폴더'라면 렌더링을 시도합니다.
    // URL이 없고 자식이 있는 노드가 '폴더'입니다.
    if (!node.url && node.children) {
        // 루트 노드('0')는 폴더 섹션으로 렌더링하지 않고 하위 노드만 렌더링합니다.
        if (node.id !== '0') {
            console.log(`[RENDER DEBUG] 폴더 렌더링 시도: "${node.title}" (ID: ${node.id})`);
            // 이 폴더 노드에 속한 북마크들을 먼저 렌더링합니다.
            renderFolderSection(node);
        }
        
        // 2. 모든 자식 노드를 순회하여 폴더를 재귀적으로 탐색합니다.
        for (const child of node.children) {
            // 자식 노드가 폴더인 경우에만 재귀 호출
            if (child.children) {
                traverseAndRenderBookmarks(child);
            } else {
                // 북마크 항목인 경우 로그 출력
                console.log(`[TRAVERSE DEBUG] 북마크 발견: ID=${child.id}, 제목="${child.title}", URL=${child.url}`);
            }
        }
    }
}

/**
 * 특정 폴더의 북마크 항목들을 카드 형태로 렌더링합니다.
 * @param {object} folderNode 렌더링할 폴더 노드
 */
function renderFolderSection(folderNode) {
    const bookmarks = folderNode.children.filter(item => !item.children); // 북마크 항목만 필터링
    
    console.log(`[FOLDER DEBUG] 폴더 "${folderNode.title}" 분석: 전체 자식 ${folderNode.children.length}개, 북마크 ${bookmarks.length}개`);
    
    if (bookmarks.length === 0) {
        console.log(`[FOLDER DEBUG] 폴더 "${folderNode.title}"에 북마크가 없어 건너뜀`);
        return; // 북마크가 없으면 폴더도 표시하지 않음
    }

    const folderSection = document.createElement('div');
    folderSection.classList.add('folder-section');
    
    // 폴더 제목
    const titleElement = document.createElement('div');
    titleElement.classList.add('folder-title');
    titleElement.textContent = folderNode.title;
    folderSection.appendChild(titleElement);
    
    // 북마크 카드 컨테이너
    const container = document.createElement('div');
    container.classList.add('bookmark-container');

    console.log(`[FOLDER DEBUG] 폴더 "${folderNode.title}"에서 ${bookmarks.length}개 북마크 렌더링 시작`);
    
    bookmarks.forEach(bookmark => {
        // 로컬에 저장된 요약 정보 가져오기 (미리 로드한 데이터 사용)
        const summaryText = bookmarkSummaries[bookmark.id] || "Gemini 요약 정보 없음";
        
        console.log(`[BOOKMARK DEBUG] 북마크 렌더링: ID=${bookmark.id}, 제목="${bookmark.title}", 요약="${summaryText}"`);
        
        const card = document.createElement('div');
        card.classList.add('bookmark-card');
        
        // 1. 이미지 (임시로 기본 이미지 사용, 추후 썸네일 URL 사용)
        const img = document.createElement('img');
        img.classList.add('card-image');
        // ⚠️ 실제 썸네일 URL이 구현되면 여기에 src를 넣습니다.
        // img.src = bookmark.thumbnailUrl || 'placeholder.png'; 
        img.alt = bookmark.title;
        card.appendChild(img);
        
        // 2. 제목 (클릭하면 북마크로 이동)
        const titleLink = document.createElement('a');
        titleLink.href = bookmark.url;
        titleLink.target = '_blank'; // 새 탭에서 열기
        titleLink.classList.add('card-title');
        titleLink.textContent = bookmark.title;
        card.appendChild(titleLink);

        // 3. URL
        const urlElement = document.createElement('div');
        urlElement.classList.add('card-url');
        urlElement.textContent = bookmark.url;
        card.appendChild(urlElement);
        
        // 4. 한 줄 요약
        const summaryElement = document.createElement('div');
        summaryElement.classList.add('card-summary');
        summaryElement.textContent = summaryText;
        card.appendChild(summaryElement);

        container.appendChild(card);
    });
    
    folderSection.appendChild(container);
    OUTPUT_ELEMENT.appendChild(folderSection);
    
    console.log(`[FOLDER DEBUG] 폴더 "${folderNode.title}" 렌더링 완료 - DOM에 추가됨`);
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
    
    // 검색 모드일 때는 기존 북마크 출력을 숨김
    bookmarkOutput.style.display = 'none';
    
    statusElement.textContent = 'searching...';
    resultsElement.innerHTML = '';
    
    try {
        // popup.js의 handleSearch 함수 재사용
        // 하지만 결과 표시는 manager에 맞게 커스터마이즈
        if (!window.textEmbedder) {
            throw new Error('textEmbedder를 사용할 수 없습니다.');
        }
        
        if (!window.textEmbedder.isModelLoaded()) {
            statusElement.textContent = 'loading embedding model...';
            await window.textEmbedder.initialize({
                onProgress: (progress) => {
                    statusElement.textContent = `loading embedding model: ${(progress.progress * 100).toFixed(0)}%`;
                }
            });
        }

        statusElement.textContent = 'analyzing search query...';
        const queryEmbedding = await window.textEmbedder.embedText(searchQuery);
        
        statusElement.textContent = 'searching bookmarks...';
        const searchResults = await searchBookmarksByEmbedding(queryEmbedding, searchQuery);
        
        // Manager 페이지에 맞게 결과 표시
        displaySearchResultsInManager(searchResults, resultsElement, statusElement);
        
    } catch (error) {
        console.error('[SEARCH ERROR]', error);
        statusElement.textContent = `search failed: ${error.message}`;
        bookmarkOutput.style.display = 'block'; // 오류 시 다시 표시
    }
}

/**
 * Manager 페이지용 검색 결과 표시
 */
function displaySearchResultsInManager(results, resultsElement, statusElement) {
    if (results.length === 0) {
        statusElement.textContent = '검색 결과가 없습니다.';
        resultsElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">검색 결과가 없습니다.<br>임베딩이 생성된 북마크가 있는지 확인해주세요.</div>';
        return;
    }
    
    statusElement.textContent = `${results.length}개의 결과를 찾았습니다.`;
    
    resultsElement.innerHTML = results.map(result => `
        <div class="result-card" onclick="window.open('${result.bookmark.url}', '_blank')">
            <div class="result-thumbnail">
                <img src="${result.thumbnail}" alt="thumbnail" onerror="this.src='https://www.google.com/s2/favicons?domain=${new URL(result.bookmark.url).hostname}&sz=128'; this.style.width='50px'; this.style.height='50px';">
            </div>
            <div class="result-title">${result.bookmark.title}</div>
            <div class="result-url">${result.bookmark.url}</div>
            <div class="result-summary">${result.summary}</div>
            <div class="result-score">${result.score}% 일치</div>
        </div>
    `).join('');
}

async function searchBookmarksByEmbedding(queryEmbedding, searchQuery) {
    // 1. 모든 북마크 가져오기
    const allBookmarks = await chrome.bookmarks.getTree();
    const bookmarkList = [];
    
    // 북마크 트리를 평면화
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
    
    // 2. 저장된 임베딩 정보 가져오기
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};

    // 3. TF-IDF 모델 로드
    const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    let tfidfModel = null;
    let queryTfIdfVector = null;
    
    if (savedModel[TFIDF_MODEL_KEY] && window.TFIDF) {
        tfidfModel = new window.TFIDF();
        tfidfModel.deserialize(savedModel[TFIDF_MODEL_KEY]);
        console.log(`[SEARCH DEBUG] 복원된 모델 Vocab 크기: ${tfidfModel.vocabulary.size}, TotalDocs: ${tfidfModel.totalDocuments}`);
        
        // 검색어의 TF-IDF 벡터 계산
        queryTfIdfVector = tfidfModel.computeTFIDFVector(searchQuery);
        console.log(`[SEARCH DEBUG] 검색어 TF-IDF 벡터 생성 완료. 길이: ${queryTfIdfVector.length}`);
    }
    
    // 4. 하이브리드 스코어링
    const results = [];
    const ALPHA = 0.7; // 임베딩 가중치
    const BETA = 0.3;  // TF-IDF 가중치
    
    for (const bookmark of bookmarkList) {
        const summaryData = summariesMap[bookmark.id];
        console.log(`[SEARCH DEBUG] 북마크 ID ${bookmark.id}: summaryData 존재=${!!summaryData}, embedding 존재=${!!(summaryData?.embedding)}, tfidfVector 존재=${!!(summaryData?.tfidfVector)}`);
        
        if (summaryData && summaryData.embedding) {
            // Semantic 점수 (임베딩 기반 코사인 유사도)
            const semanticScore = window.textEmbedder.cosineSimilarity(
                queryEmbedding, 
                summaryData.embedding
            );
            
            // Keyword 점수 (TF-IDF 기반 코사인 유사도)
            let keywordScore = 0;
            if (tfidfModel && queryTfIdfVector && summaryData.tfidfVector) {
                // 벡터 차원 확인 및 조정
                if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
                    console.warn(`[SEARCH DEBUG] "${bookmark.title}" - 벡터 차원 불일치: query=${queryTfIdfVector.length}, bookmark=${summaryData.tfidfVector.length}`);
                    
                    // 공통 차원까지만 사용하여 계산
                    const minLength = Math.min(queryTfIdfVector.length, summaryData.tfidfVector.length);
                    const queryVec = queryTfIdfVector.slice(0, minLength);
                    const bookmarkVec = summaryData.tfidfVector.slice(0, minLength);
                    
                    keywordScore = tfidfModel.cosineSimilarity(queryVec, bookmarkVec);
                    console.log(`[SEARCH DEBUG] "${bookmark.title}" - 차원 조정 후 TF-IDF 계산: ${minLength}차원 사용, keywordScore=${keywordScore.toFixed(4)}`);
                } else {
                    keywordScore = tfidfModel.cosineSimilarity(
                        queryTfIdfVector,
                        summaryData.tfidfVector
                    );
                    console.log(`[SEARCH DEBUG] "${bookmark.title}" - TF-IDF 계산: keywordScore=${keywordScore.toFixed(4)}`);
                }
            } else {
                // 왜 Keyword 점수가 0인지 명확히 로그
                if (!tfidfModel) {
                    console.log(`[SEARCH DEBUG] "${bookmark.title}" - TF-IDF 모델 없음`);
                } else if (!queryTfIdfVector) {
                    console.log(`[SEARCH DEBUG] "${bookmark.title}" - 검색어 TF-IDF 벡터 없음`);
                } else if (!summaryData.tfidfVector) {
                    console.log(`[SEARCH DEBUG] "${bookmark.title}" - 북마크 TF-IDF 벡터 없음 (구버전 북마크일 수 있음)`);
                }
            }
            
            // 최종 점수: α * Semantic + β * Keyword
            const finalScore = (ALPHA * semanticScore) + (BETA * keywordScore);
            
            // 디버그 정보 출력
            console.log(`[SEARCH DEBUG] "${bookmark.title}" - Semantic: ${(semanticScore * 100).toFixed(1)}%, Keyword: ${(keywordScore * 100).toFixed(1)}%, Final: ${(finalScore * 100).toFixed(1)}%`);
            
            results.push({
                bookmark: bookmark,
                summary: summaryData.uiSummary || 'No summary information',
                thumbnail: summaryData.thumbnail || '',
                similarity: finalScore,
                semanticScore: semanticScore,
                keywordScore: keywordScore,
                score: Math.round(finalScore * 100)
            });
        }
    }
    
    // 5. 유사도 순으로 정렬하고 상위 10개만 반환
    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10)
        .filter(result => result.similarity > 0.2); // 최소 유사도 20%로 설정 (popup.js와 동일)
}