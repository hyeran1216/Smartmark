// 설정은 config.js에서 로드됩니다
document.addEventListener('DOMContentLoaded', main);

// 전역 변수 설정
let currentUrl = '';
let currentTitle = '';
// 설정 값들은 config.js에서 가져옵니다 

let currentMode = 'save';
const saveModeDiv = document.getElementById('save-bookmark-mode');
const searchModeDiv = document.getElementById('search-mode');
const saveModeButton = document.getElementById('saveModeButton');
const searchModeButton = document.getElementById('searchModeButton');
/**
 * 메인 함수: 팝업이 로드되면 모든 초기화 작업을 시작합니다.
 */
async function main() {
    try {
        await getCurrentTabInfo();
        updateUiWithCurrentTab();
        await populateFolderSelect();
        
        document.getElementById('saveButton').addEventListener('click', handleSave);
        
        document.getElementById('manageButton').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
            window.close();
        });
        document.getElementById('status').textContent = '저장할 정보를 확인해주세요.';

        saveModeButton.addEventListener('click', () => switchMode('save'));
        searchModeButton.addEventListener('click', () => switchMode('search'));
    } catch (error) {
        console.error("초기화 중 오류 발생:", error);
        document.getElementById('status').textContent = `오류: ${error.message}`;
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

/**
 * //현재 활성화된 탭의 URL과 제목을 가져와 전역 변수에 저장합니다.
 */
async function getCurrentTabInfo() {
    // activeTab 권한을 통해 현재 활성화된 탭의 정보를 쿼리합니다.
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        currentUrl = tab.url;
        currentTitle = tab.title;
        
        // 파비콘 처리
        const favIconUrl = tab.favIconUrl || '';
        const favIconElement = document.getElementById('favIcon');
        if (favIconUrl) {
            favIconElement.src = favIconUrl;
            favIconElement.style.display = 'inline-block';
        } else {
            favIconElement.style.display = 'none';
        }
    } else {
        throw new Error("활성화된 탭 정보를 찾을 수 없습니다.");
    }
}
/**
 * //획득한 정보로 UI 입력 필드를 업데이트합니다.
 */
function updateUiWithCurrentTab() {
    document.getElementById('titleInput').value = currentTitle;
    document.getElementById('urlInput').value = currentUrl;
}
/**
 * //북마크 트리를 순회하며 폴더 목록을 드롭다운에 채웁니다.
 */
async function populateFolderSelect() {
    const folderSelect = document.getElementById('folderSelect');
    folderSelect.innerHTML = ''; // 초기 옵션 제거
    
    // 북마크 트리 전체를 가져옵니다.
    const bookmarks = await chrome.bookmarks.getTree();
    
    // 루트 노드(ID: 0)의 자식부터 탐색을 시작합니다.
    if (bookmarks.length > 0 && bookmarks[0].children) {
        traverseBookmarks(bookmarks[0], folderSelect, 0);
    }
    
    // 폴더가 하나도 없을 경우 기본 옵션을 추가합니다.
    if (folderSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = '1'; // '기타 북마크' 폴더 ID (크롬 기본값)
        option.textContent = '북마크 폴더 없음 (기타 북마크에 저장)';
        folderSelect.appendChild(option);
    }
}

/**
 * 재귀적으로 북마크 트리를 탐색하여 폴더만 드롭다운에 추가합니다.
 * @param {object} node 현재 북마크 노드
 * @param {HTMLElement} selectElement <select> 요소
 * @param {number} level 현재 깊이 (들여쓰기용)
 */
function traverseBookmarks(node, selectElement, level) {
    // 폴더인 경우 (URL이 없고 children이 있음)
    if (node.children) {
        // 루트 노드(ID: 0)와 '북마크 바' (ID: 1), '기타 북마크' (ID: 2) 등 크롬 기본 폴더도 포함하여 option을 만듭니다.
        if (node.id !== '0') { 
            const prefix = '— '.repeat(level - 1 > 0 ? level - 1 : 0);
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = prefix + node.title;
            selectElement.appendChild(option);
        }
        
        // 자식 노드를 순회합니다.
        for (const child of node.children) {
            // 자식 노드가 폴더일 경우에만 재귀 호출 (북마크 항목은 건너뜀)
            if (child.children) {
                 traverseBookmarks(child, selectElement, level + 1);
            }
        }
    }
}/**
 * //북마크 저장 버튼 클릭 핸들러 (다음 단계에서 실제 로직이 됩니다.)
 */
async function handleSave() {
    const title = document.getElementById('titleInput').value;
    const selectedFolderId = document.getElementById('folderSelect').value;
    
    if (!selectedFolderId) {
        alert("저장할 폴더를 선택해야 합니다.");
        return;
    }

    document.getElementById('status').textContent = '페이지 분석 및 요약 생성 중...';

    try {
        // 0. 중복 URL 확인
        console.log('[DEBUG] 0. 중복 URL 확인...');
        const existingBookmark = await findExistingBookmarkByUrl(currentUrl);
        if (existingBookmark) {
            const shouldReplace = confirm(`이미 같은 URL의 북마크가 있습니다:\n"${existingBookmark.title}"\n\n기존 북마크를 새로운 요약으로 업데이트하시겠습니까?`);
            if (shouldReplace) {
                // 기존 북마크 삭제
                await chrome.bookmarks.remove(existingBookmark.id);
                // 기존 요약도 삭제
                await removeSummaryFromLocal(existingBookmark.id);
                console.log('[DEBUG] 기존 중복 북마크 삭제 완료');
            } else {
                document.getElementById('status').textContent = '저장이 취소되었습니다.';
                return;
            }
        }
        
        // 1. 페이지 콘텐츠 추출 및 요약 생성 (가장 오래 걸리는 단계)
        console.log('[DEBUG] 1. 페이지 콘텐츠 추출 시도...');
        const content = await getPageContentForSummary();
        let summary = "요약 정보 없음";

        if (content) {
            console.log(`[DEBUG] 2. 콘텐츠 추출 성공. 텍스트 길이: ${content.length}`);
            
            document.getElementById('status').textContent = 'Gemini API 호출 중...';
            console.log('[DEBUG] 3. Gemini API 호출 시도...');
            summary = await summarizePageContent(content);
            console.log('[DEBUG] 4. Gemini API 호출 성공.');
        } else {
            // 이 로그가 뜬다면 content.js 또는 manifest.json 설정 문제일 수 있습니다.
            console.warn('[DEBUG] 2. 페이지 텍스트 추출 실패. 요약 없이 저장.');
            document.getElementById('status').textContent = '페이지 텍스트 추출 실패. 요약 없이 저장합니다.';
        }

        // 2. 썸네일 API 호출
        document.getElementById('status').textContent = '썸네일 생성 중...';
        console.log('[DEBUG] GCF 호출 직전!');
        const thumbnailUrl = await getThumbnailUrl(currentUrl);
        console.log('[DEBUG] GCF 호출 완료. URL:', thumbnailUrl); 
        
        // 3. 실제 북마크 저장
        document.getElementById('status').textContent = '북마크 저장 중...';
        const newBookmark = await saveBookmark(title, currentUrl, selectedFolderId);
        
        // 4. 요약 정보와 썸네일 URL을 로컬 스토리지에 저장
        await saveSummaryAndThumbnail(newBookmark.id, summary, thumbnailUrl);
        
        // 저장 성공 시 상태 업데이트 및 팝업 닫기
        document.getElementById('status').textContent = `저장 완료! 요약: "${summary}"`;
        
        // setTimeout(() => {
        //      window.close();
        // }, 1500); 

    } catch (error) {
        console.error("북마크 저장 중 오류 발생:", error);
        document.getElementById('status').textContent = `저장 실패: ${error.message}`;
        alert("저장 실패. Gemini API 키와 권한을 확인해주세요.");
    }
}

//북마크 ID를 키로 하여 요약 내용을 로컬 스토리지에 저장
// async function saveSummaryToLocal(bookmarkId, summaryText) {
//     console.log(`[STORAGE DEBUG] 저장 시도: 북마크 ID ${bookmarkId}, 요약: ${summaryText.substring(0, 15)}...`);

//     // 1. 기존 데이터 로드 (STORAGE_KEY로 로드)
//     const allSummaries = await chrome.storage.local.get(STORAGE_KEY);
    
//     // 2. allSummaries 객체의 내용 확인
//     console.log(`[STORAGE DEBUG] 1. 로드된 raw 데이터:`, allSummaries);

//     // 3. STORAGE_KEY로 실제 맵을 추출하거나, 없으면 빈 객체로 초기화
//     // chrome.storage.local.get(키)는 {키: 값} 형태의 객체를 반환합니다.
//     const summariesMap = allSummaries[STORAGE_KEY] || {};
    
//     // 4. 추출된 맵의 내용 확인
//     console.log(`[STORAGE DEBUG] 2. 추출된 summariesMap의 북마크 수:`, Object.keys(summariesMap).length);
    
//     summariesMap[bookmarkId] = summaryText; // 새 요약 추가
    
//     // 5. 저장
//     await chrome.storage.local.set({ [STORAGE_KEY]: summariesMap });
    
//     console.log(`[STORAGE DEBUG] 3. 저장 완료. 총 북마크 수:`, Object.keys(summariesMap).length);
// }

/**
 * Chrome 북마크 시스템에 새 북마크를 생성하는 핵심 로직입니다.
 * @param {string} title 저장할 북마크의 제목
 * @param {string} url 저장할 웹페이지의 URL
 * @param {string} parentId 북마크를 저장할 폴더의 ID
 * @returns {Promise<object>} 생성된 북마크 객체 (ID, URL 등 포함)
 */
function saveBookmark(title, url, parentId) {
    // chrome.bookmarks.create를 사용하여 북마크를 생성합니다.
    return chrome.bookmarks.create({
        parentId: parentId, // 선택한 폴더 ID
        title: title,       // 입력 필드의 제목
        url: url            // 현재 탭의 URL
    });
}

/**
 * Gemini API를 사용하여 텍스트 내용을 한 줄로 요약합니다.
 * @param {string} content 요약할 페이지의 전체 텍스트 내용
 * @returns {Promise<string>} Gemini가 생성한 한 줄 요약
 */
async function summarizePageContent(content) {
    if (!window.CONFIG || !window.CONFIG.GEMINI_API_KEY || window.CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        throw new Error("Gemini API 키가 설정되지 않았습니다. config.js 파일을 확인해주세요.");
    }
    
    // API 호출을 위한 프롬프트 정의
    const prompt = `다음 텍스트를 분석하고, 핵심 내용을 100자 이내의 한국어 한 줄로 간결하게 요약해 주세요. 절대 100자를 넘기지 마세요. 텍스트: "${content.substring(0, 10000)}..."`; // 10000자로 제한

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${window.CONFIG.GEMINI_MODEL}:generateContent?key=${window.CONFIG.GEMINI_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                "generationConfig": { 
                    // 응답이 짧고 빠르게 나오도록 설정
                    "temperature": 0.1 
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API 호출 실패: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // 결과에서 텍스트 추출
        const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (!summary) {
            return "요약을 생성할 수 없습니다.";
        }
        
        return summary;
    } catch (error) {
        console.error("Gemini 요약 API 오류:", error);
        return "요약 서비스 오류 발생";
    }
}

/**
 * 콘텐츠 스크립트를 통해 현재 탭의 텍스트 내용을 요청합니다.
 * @returns {Promise<string>} 웹페이지의 텍스트 콘텐츠
 */
async function getPageContentForSummary() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return "";

    const tabId = tabs[0].id;
    
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        console.log('[DEBUG] 1.5. content.js 주입 완료. 메시지 전송 시도.');

        // 메시지를 보내 텍스트 콘텐츠를 요청합니다.
        const response = await chrome.tabs.sendMessage(tabId, { action: "getPageContent" });

        if (response && response.success) {
            return response.content;
        } else {
            console.error("페이지 콘텐츠 추출 실패: content.js 응답 문제");
            return "";
        }
    } catch (e) {
        // 스크립트 주입 또는 권한 문제 (chrome.tabs.query/sendMessage) 발생 시
        console.error("Fatal Error: content.js 주입 실패 또는 통신 오류", e);
        // 사용자에게 현재 페이지가 접근 가능한지 확인하도록 안내
        return ""; 
    }
}

/**
 * 저장된 북마크 ID를 사용하여 로컬 스토리지에서 요약을 가져옵니다.
 * @param {string} bookmarkId 북마크 ID
 * @returns {Promise<string>} 요약 텍스트
 */
async function getBookmarkSummary(bookmarkId) {
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summaries = allSummaries[storageKey] || {};
    
    const summaryObject = summaries[bookmarkId];
    if (summaryObject && typeof summaryObject === 'object') {
        return summaryObject.summary || "요약 정보 없음";
    }
    
    // 이전 버전 호환성 (문자열로 저장된 경우)
    return summaryObject || "요약 정보 없음";
}

/**
 * 특정 URL과 일치하는 기존 북마크를 찾습니다.
 * @param {string} url 찾을 URL
 * @returns {Promise<object|null>} 찾은 북마크 객체 또는 null
 */
async function findExistingBookmarkByUrl(url) {
    try {
        // Chrome 북마크 API를 사용하여 URL로 검색
        const bookmarks = await chrome.bookmarks.search({ url: url });
        
        if (bookmarks && bookmarks.length > 0) {
            console.log(`[DUPLICATE DEBUG] 중복 URL 발견: ${bookmarks.length}개`);
            return bookmarks[0]; // 첫 번째 일치하는 북마크 반환
        }
        
        return null;
    } catch (error) {
        console.error('[DUPLICATE DEBUG] URL 검색 중 오류:', error);
        return null;
    }
}

/**
 * 로컬 스토리지에서 특정 북마크의 요약을 삭제합니다.
 * @param {string} bookmarkId 삭제할 북마크 ID
 */
async function removeSummaryFromLocal(bookmarkId) {
    console.log(`[STORAGE DEBUG] 요약 삭제 시도: 북마크 ID ${bookmarkId}`);

    // 1. 기존 데이터 로드
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    
    // 2. 해당 북마크 ID 삭제
    if (summariesMap[bookmarkId]) {
        delete summariesMap[bookmarkId];
        
        // 3. 업데이트된 데이터 저장
        await chrome.storage.local.set({ [storageKey]: summariesMap });
        
        console.log(`[STORAGE DEBUG] 요약 삭제 완료. 남은 북마크 수: ${Object.keys(summariesMap).length}`);
    } else {
        console.log(`[STORAGE DEBUG] 삭제할 요약이 없음: 북마크 ID ${bookmarkId}`);
    }
}

/**
 * Cloud Function을 호출하여 썸네일 URL을 가져옵니다.
 */
async function getThumbnailUrl(url) {
    if (!window.CONFIG || !window.CONFIG.THUMBNAIL_API_URL || window.CONFIG.THUMBNAIL_API_URL.includes('YOUR_THUMBNAIL_API_URL_HERE')) {
         console.warn("썸네일 API URL이 설정되지 않았습니다. 플레이스홀더를 사용합니다.");
         return 'placeholder_url'; // API 설정 전 임시 URL
    }
    
    try {
        const response = await fetch(window.CONFIG.THUMBNAIL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ targetUrl: url })
        });
        
        if (!response.ok) {
            console.warn(`썸네일 API 호출 실패: ${response.status}`);
        }
        
        const data = await response.json();
        return data.thumbnail_url || 'placeholder_url';
    } catch (error) {
        console.error('썸네일 API 호출 중 오류:', error);
        return 'placeholder_url';
    }
}

//요약 정보와 썸네일 URL을 로컬 스토리지에 저장
async function saveSummaryAndThumbnail(bookmarkId, summaryText, thumbnailUrl) {
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    
    summariesMap[bookmarkId] = {
        summary: summaryText,
        thumbnail: thumbnailUrl
    };
    
    await chrome.storage.local.set({ [storageKey]: summariesMap });
}