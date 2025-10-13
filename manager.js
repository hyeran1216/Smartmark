// manager.js

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
    const summaryIds = Object.keys(bookmarkSummaries);
    validBookmarksWithFolders = [];
    
    for (const bookmarkId of summaryIds) {
        try {
            const bookmarkArray = await chrome.bookmarks.get(bookmarkId);
            if (bookmarkArray && bookmarkArray.length > 0) {
                const bookmark = bookmarkArray[0];
                const folderInfo = folderMap[bookmark.parentId] || { title: '알 수 없는 폴더', id: bookmark.parentId };
                
                // 💡 수정된 부분: bookmarkSummaries[bookmark.id]가 이제 객체입니다.
                const summaryObject = bookmarkSummaries[bookmark.id] || { summary: "요약 정보 없음", thumbnail: "" }; 

                validBookmarksWithFolders.push({
                    ...bookmark,
                    folderInfo: folderInfo,
                    summary: summaryObject.summary,      // 💡 요약 텍스트 분리
                    thumbnail: summaryObject.thumbnail   // 💡 썸네일 URL 분리
                });
                
                console.log(`[FOLDER DEBUG] 북마크 로드: "${bookmark.title}" in "${folderInfo.title}"`);
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
        const summaryObject = bookmarkSummaries[bookmark.id] || { summary: "Gemini 요약 정보 없음", thumbnail: "" };
        const summaryText = summaryObject.summary;
        const thumbnailUrl = summaryObject.thumbnail;
        
        console.log(`[SMART DEBUG] 북마크 카드 생성: ID=${bookmark.id}, 제목="${bookmark.title}"`);
        
        const card = document.createElement('div');
        card.classList.add('bookmark-card');
        
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
        
        // 2. 제목 (클릭하면 북마크로 이동)
        const titleLink = document.createElement('a');
        titleLink.href = bookmark.url;
        titleLink.target = '_blank';
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
    
    Object.values(bookmarksByFolder).forEach(folderGroup => {
        renderFolderGroup(folderGroup.folderInfo, folderGroup.bookmarks);
    });
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
        const titleLink = document.createElement('a');
        titleLink.href = bookmark.url;
        titleLink.target = '_blank';
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
        summaryElement.textContent = bookmark.summary; 
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