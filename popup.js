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
        // 일반적인 초기화
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
        
        // 검색 기능 이벤트 리스너 추가
        document.getElementById('searchButton').addEventListener('click', handleSearch);
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
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
        let content = "";

        // YouTube URL인 경우 자막 추출
        if (isYouTubeUrl(currentUrl)) {
            const videoId = extractYouTubeVideoId(currentUrl);
            if (videoId) {
                console.log(`[DEBUG] YouTube 동영상 감지: ${videoId}`);
                document.getElementById('status').textContent = 'YouTube 자막 추출 중...';
                try {
                    content = await getYouTubeCaptionText(videoId);
                    if (content) {
                        console.log(`[DEBUG] YouTube 자막 추출 성공. 텍스트 길이: ${content.length}`);
                    } else {
                        console.warn('[DEBUG] YouTube 자막을 찾을 수 없습니다.');
                        document.getElementById('status').textContent = 'YouTube 자막을 찾을 수 없습니다. 일반 페이지로 처리합니다.';
                        content = await getPageContentForSummary();
                    }
                } catch (error) {
                    console.error('[DEBUG] YouTube 자막 추출 실패:', error);
                    document.getElementById('status').textContent = 'YouTube 자막 추출 실패. 일반 페이지로 처리합니다.';
                    content = await getPageContentForSummary();
                }
            } else {
                console.warn('[DEBUG] YouTube URL이지만 video ID를 추출할 수 없습니다.');
                content = await getPageContentForSummary();
            }
        } else {
            // 일반 웹페이지 처리
            content = await getPageContentForSummary();
        }

        let summary = "No summary information";

        if (content) {
            console.log(`[DEBUG] 2. 콘텐츠 추출 성공. 텍스트 길이: ${content.length}`);
            
            document.getElementById('status').textContent = 'Gemini API 호출 중...';
            console.log('[DEBUG] 3. Gemini API 호출 시도...');
            const result = await summarizePageContent(content); 
            englishSummary = result.summary;
            englishKeySnippet = result.keySnippet;
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
        const englishTitleForEmbedding = await window.textEmbedder._translateText(title, 'en');
        
        // 4. 임베딩 생성을 위한 메타데이터 준비
        // 폴더 이름 가져오기
        const folderName = await getFolderNameById(selectedFolderId);
        const englishFolderName = await window.textEmbedder._translateText(folderName, 'en');
        
        const metadata = {
            url: newBookmark.url || currentUrl,
            title: englishTitleForEmbedding,
            details: englishSummary,
            fullContent: englishKeySnippet,
            category: englishFolderName,
            dateAdded: newBookmark.dateAdded || Date.now(),
            id: newBookmark.id,
        };
        console.log('[DEBUG] 4. 임베딩 생성을 위한 메타데이터 준비:', metadata);
        
        // 5. 임베딩 생성 (textEmbedder 사용)
        document.getElementById('status').textContent = 'AI 임베딩 생성 중...';
        let embeddingDetails = null;
        console.log('[DEBUG] AI 임베딩 생성중');
        
        if (window.textEmbedder) {
            try {
                // textEmbedder 초기화 (필요시)
                if (!window.textEmbedder.isModelLoaded()) {
                    await window.textEmbedder.initialize({
                        onProgress: (progress) => {
                            document.getElementById('status').textContent = `임베딩 모델 로딩: ${(progress.progress * 100).toFixed(0)}%`;
                        }
                    });
                }

                // TF-IDF 모델 로드 및 설정
                const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
                const savedTfIdfModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
                if (savedTfIdfModel[TFIDF_MODEL_KEY] && window.TFIDF) {
                    const tfidfModel = new window.TFIDF();
                    tfidfModel.deserialize(savedTfIdfModel[TFIDF_MODEL_KEY]);
                    window.textEmbedder.setTfIdfModel(tfidfModel);
                    console.log('[DEBUG] TF-IDF 모델 로드 및 설정 완료');
                }
                
                embeddingDetails = await window.textEmbedder.detailsEmbedding(metadata);
                console.log('[DEBUG] USE 임베딩 생성 완료 (512차원)');
            } catch (error) {
                console.error('[DEBUG] USE 임베딩 생성 실패:', error);
                embeddingDetails = metadata; // 임베딩 없이 저장
            }
        } else {
            console.warn('[DEBUG] textEmbedder를 사용할 수 없습니다.');
            embeddingDetails = metadata; // 임베딩 없이 저장
        }
        
        // 4.5. BERT 임베딩 생성 및 KeyBERT 태그 추출 (선택적)
        document.getElementById('status').textContent = 'BERT 임베딩 및 키워드 추출 시도 중...';
        let bertEmbedding = null;
        let autoTags = [];
        
        try {
            // BERT 임베딩 생성 (384차원) - 실패 시 건너뜀
            const fullText = `${title}. ${englishSummary}. ${englishKeySnippet}`;
            console.log('[DEBUG] BERT 임베딩 생성 요청 (선택적)...');
            
            const bertResponse = await chrome.runtime.sendMessage({
                type: 'GENERATE_BERT_EMBEDDING',
                text: fullText
            });
            
            if (bertResponse && bertResponse.success) {
                bertEmbedding = bertResponse.embedding;
                console.log(`[DEBUG] ✅ BERT 임베딩 생성 완료 (${bertResponse.dimension}차원, ${bertResponse.responseTime}ms)`);
                
                // KeyBERT 키워드 추출 (N-gram → 임베딩 유사도)
                console.log('[DEBUG] KeyBERT 키워드 추출 시작...');
                const ngramResponse = await chrome.runtime.sendMessage({
                    type: 'EXTRACT_NGRAMS',
                    text: fullText
                });
                
                if (ngramResponse && ngramResponse.success) {
                    console.log(`[DEBUG] N-gram 추출 완료: ${ngramResponse.ngrams.length}개`);
                    
                    // 상위 30개 n-gram으로 키워드 추출
                    const topCandidates = ngramResponse.ngrams.slice(0, 30);
                    const keywordResponse = await chrome.runtime.sendMessage({
                        type: 'EXTRACT_KEYWORDS',
                        text: fullText,
                        candidates: topCandidates
                    });
                    
                    if (keywordResponse && keywordResponse.success) {
                        autoTags = keywordResponse.keywords.map(k => k.keyword);
                        console.log(`[DEBUG] ✅ KeyBERT 키워드 추출 완료:`, autoTags);
                    }
                }
            } else {
                console.log('[DEBUG] ℹ️ BERT 사용 불가 - USE + TF-IDF로 계속 진행');
            }
        } catch (error) {
            console.log('[DEBUG] ℹ️ BERT 임베딩/키워드 추출 실패 - USE + TF-IDF로 계속 진행');
            console.log('[DEBUG] 오류 상세:', error.message);
        }

        // const userTargetLangCode = await getUserTargetLanguage();
        const userTargetLangCode = 'ko';
        const uiSummary = await window.textEmbedder._translateText(englishSummary, userTargetLangCode);
        console.log('[DEBUG] UI 표시용 번역 완료:', uiSummary);

        // 6. 요약 정보, 썸네일 URL, 임베딩, 태그를 로컬 스토리지에 저장
        await saveSummaryAndThumbnailWithEmbedding(
            newBookmark.id, 
            title, 
            englishSummary, 
            englishKeySnippet, 
            uiSummary, 
            englishFolderName, 
            thumbnailUrl, 
            embeddingDetails?.embedding, 
            embeddingDetails?.tfidfVector,
            bertEmbedding,
            autoTags
        );

        // 7. TF-IDF 모델 재구축 (새 북마크 추가됨)
        await rebuildTfIdfModel();
        
        // 임베딩 정보 콘솔에 출력 (디버그용)
        if (embeddingDetails?.embedding) {
            console.log('[DEBUG] 생성된 임베딩 정보:', {
                dimension: embeddingDetails.embedding.length,
                sample: embeddingDetails.embedding.slice(0, 5) // 처음 5개 값만 표시
            });
        }
        
        // 저장 성공 시 상태 업데이트 및 팝업 닫기
        document.getElementById('status').textContent = `saved! summary: "${uiSummary}"`;
        
        // setTimeout(() => {
        //      window.close();
        // }, 1500); 

    } catch (error) {
        console.error("북마크 저장 중 오류 발생:", error);
        document.getElementById('status').textContent = `저장 실패: ${error.message}`;
        alert("저장 실패. Gemini API 키와 권한을 확인해주세요.");
    }
}

/**
 * TF-IDF 모델 재구축 (새 북마크 추가 시)
 */
async function rebuildTfIdfModel() {
    console.log('[TF-IDF REBUILD] 모델 재구축 및 벡터 갱신 시작...');
    
    // popup.js는 브라우저 환경이므로 window.CONFIG 사용
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    
    try {
        const allSummaries = await chrome.storage.local.get(storageKey);
        const summariesMap = allSummaries[storageKey] || {};
        
        const documents = [];
        const bookmarkIds = Object.keys(summariesMap);
        
        // 1. 모든 북마크의 텍스트 수집
        for (const bookmarkId of bookmarkIds) {
            const summaryData = summariesMap[bookmarkId];
            if (summaryData) {
                // 저장 로직과 동일하게 텍스트를 결합
                const docText = [
                    summaryData.title || '',
                    summaryData.englishSummary || '',
                    summaryData.englishKeySnippet || '',
                    summaryData.englishFolderName || ''
                ].filter(text => text.trim() !== '').join(' ');
                
                if (docText.trim()) {
                    documents.push(docText);
                }
            }
        }
        
        // window.TFIDF 사용 (popup.js는 브라우저 환경)
        if (documents.length === 0 || !window.TFIDF) {
            console.warn('[TF-IDF REBUILD] 문서나 TFIDF 클래스가 없어 재구축 건너뜀.');
            return;
        }
        
        // 2. 새 TF-IDF 모델 구축 (새로운 Vocabulary 생성)
        const newTfidfModel = new window.TFIDF();
        newTfidfModel.buildVocabulary(documents);
        
        // 3. 모델 저장 (새 모델 덮어쓰기)
        const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
        await chrome.storage.local.set({
            [TFIDF_MODEL_KEY]: newTfidfModel.serialize()
        });
        
        // 4. 모든 북마크 벡터 갱신 (차원 동기화)
        let updatedSummariesCount = 0;
        for (const bookmarkId of bookmarkIds) {
            const summaryData = summariesMap[bookmarkId];
            if (summaryData) {
                const docText = [
                    summaryData.title || '',
                    summaryData.englishSummary || '',
                    summaryData.englishKeySnippet || '',
                    summaryData.englishFolderName || ''
                ].filter(text => text.trim() !== '').join(' ');
                
                // 새로운 모델을 사용하여 벡터 재계산 및 덮어쓰기
                summaryData.tfidfVector = newTfidfModel.computeTFIDFVector(docText);
                updatedSummariesCount++;
            }
        }
        
        // 5. 갱신된 summariesMap을 로컬 스토리지에 저장
        await chrome.storage.local.set({
            [storageKey]: summariesMap
        });
        
        console.log(`[TF-IDF REBUILD] 모델 구축 완료 (Vocab 크기: ${newTfidfModel.vocabulary.size}). ${updatedSummariesCount}개 북마크 벡터 갱신 완료.`);
    } catch (error) {
        console.error('[TF-IDF] 모델 재구축 실패:', error);
    }
}

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
    if (!window.textEmbedder || typeof window.textEmbedder._translateText !== 'function') {
        throw new Error("TextEmbedder가 초기화되지 않았거나 번역 기능이 없습니다. 번역 로직을 확인해주세요.");
    }
    
    // 1. 콘텐츠를 영어로 번역 (TextEmbedder의 번역 기능을 활용)
    const translatedEnglishContent = await window.textEmbedder._translateText(content.substring(0, 10000), 'en');

    // 2. API 호출을 위한 영어 프롬프트 정의
    const prompt = `
    Analyze the following web page text and respond in JSON format.
    Exclude advertisements, copyright notices, navigation links, and generic filler text.
    
    All text in the response, including keySnippet and summary fields, **MUST be written in plain English**, without any foreign characters, explanations, or added text.
    
    The response MUST follow this exact JSON schema:
    {
      "keySnippet": "[A concise, well-formed English sentence summarizing the core content, max 300 characters.]",
      "summary": "[A brief, single-line English summary representing the entire page content.]"
    }
    
    Text to analyze: "${translatedEnglishContent}"`;

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
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (!rawText) {
            return { summary: "Could not generate summary.", keySnippet: "No refined content found" };
        }
        
        // JSON 응답 파싱 및 안전한 데이터 반환
        try {
            const cleanJsonText = rawText.replace(/```json\s*/, '').replace(/\s*```/, '');
            const jsonResponse = JSON.parse(cleanJsonText);
            
            return {
                summary: jsonResponse.summary?.trim() || "Summary failed",
                keySnippet: jsonResponse.keySnippet?.trim() || "No refined content found"
            };

        } catch (e) {
            console.error("Gemini Response JSON Parsing Failed:", e, "Raw Text:", rawText);
            // JSON 파싱 실패 시, 원본 텍스트를 요약으로 사용하지 않고, 오류 메시지를 영어로 반환
            return { summary: "Summary parsing failed", keySnippet: "Error in key snippet extraction" };
        }

    } catch (error) {
        console.error("Gemini Summarization API Error:", error);
        return { summary: "Summarization service error", keySnippet: "Summarization service error" };
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
 * 썸네일 URL을 가져옵니다.
 * YouTube URL인 경우 YouTube 공식 썸네일 URL을 사용합니다.
 * 그 외의 경우 Cloud Function을 호출합니다.
 */
async function getThumbnailUrl(url) {
    // YouTube URL인 경우 YouTube 공식 썸네일 URL 사용
    if (isYouTubeUrl(url)) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
            // 표준화질 썸네일 (640×480)
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
            console.log(`[YouTube] 썸네일 URL 생성: ${thumbnailUrl}`);
            return thumbnailUrl;
        } else {
            console.warn('[YouTube] video ID를 추출할 수 없어 기본 썸네일 사용');
            return 'placeholder_url';
        }
    }
    
    // 일반 웹페이지인 경우 Cloud Function 호출
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

//요약 정보, 썸네일 URL, 임베딩을 로컬 스토리지에 저장
async function saveSummaryAndThumbnailWithEmbedding(bookmarkId, title, englishSummary, englishKeySnippet, uiSummary, englishFolderName, thumbnailUrl, embedding, tfidfVector, bertEmbedding, tags) {
    const storageKey = window.CONFIG ? window.CONFIG.STORAGE_KEY : 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    
    summariesMap[bookmarkId] = {
        title: title,
        englishSummary: englishSummary,
        englishKeySnippet: englishKeySnippet,
        uiSummary: uiSummary,
        englishFolderName: englishFolderName,
        thumbnail: thumbnailUrl,
        embedding: embedding || null,           // USE 임베딩 (512차원)
        tfidfVector: tfidfVector || null,       // TF-IDF 벡터
        bertEmbedding: bertEmbedding || null,   // BERT 임베딩 (384차원)
        tags: tags || [],                        // KeyBERT 자동 태그
        url: currentUrl || null                  // URL 추가 (검색 결과 표시용)
    };  
    await chrome.storage.local.set({ [storageKey]: summariesMap });
    console.log(`[STORAGE] 북마크 저장 완료: ID=${bookmarkId}, USE=${!!embedding}, TF-IDF=${!!tfidfVector}, BERT=${!!bertEmbedding}, Tags=${tags?.length || 0}`);
}

/**
 * 검색 버튼 클릭 핸들러
 */
async function handleSearch() {
    const searchQuery = document.getElementById('searchInput').value.trim();
    const statusElement = document.getElementById('search-status');
    const resultsElement = document.getElementById('results-output');
    
    if (!searchQuery) {
        statusElement.textContent = '검색어를 입력해주세요.';
        return;
    }
    
    statusElement.textContent = '검색 중...';
    resultsElement.innerHTML = '';
    
    try {
        // 1. textEmbedder 초기화 확인
        if (!window.textEmbedder) {
            throw new Error('textEmbedder를 사용할 수 없습니다.');
        }
        
        if (!window.textEmbedder.isModelLoaded()) {
            statusElement.textContent = '임베딩 모델 로딩 중...';
            await window.textEmbedder.initialize({
                onProgress: (progress) => {
                    statusElement.textContent = `임베딩 모델 로딩: ${(progress.progress * 100).toFixed(0)}%`;
                }
            });
        }
        
        // 2. 검색어 임베딩 생성
        statusElement.textContent = '검색어 분석 중...';
        const queryEmbedding = await window.textEmbedder.embedText(searchQuery);
        
        // 3. 저장된 북마크들과 임베딩 가져오기
        statusElement.textContent = '북마크 검색 중...';
        const searchResults = await searchBookmarksByEmbedding(queryEmbedding, searchQuery);
        
        // 4. 결과 표시
        displaySearchResults(searchResults, resultsElement, statusElement);
        
    } catch (error) {
        console.error('[SEARCH ERROR]', error);
        statusElement.textContent = `검색 실패: ${error.message}`;
    }
}

/**
 * 임베딩을 사용하여 북마크 검색
 */
async function searchBookmarksByEmbedding(queryEmbedding, searchQuery) {
    // 1. 모든 북마크 가져오기
    const allBookmarks = await chrome.bookmarks.getTree();
    const bookmarkList = [];
    
    // 북마크 트리를 평면화
    function flattenBookmarks(nodes) {
        for (const node of nodes) {
            if (node.url) { // 실제 북마크인 경우
                bookmarkList.push(node);
            }
            if (node.children) {
                flattenBookmarks(node.children);
            }
        }
    }
    
    flattenBookmarks(allBookmarks);
    console.log(`[SEARCH DEBUG] 총 ${bookmarkList.length}개 북마크 발견`);
    
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
    }
    
    // 4. 하이브리드 스코어링
    const results = [];
    const ALPHA = 0.7; // 임베딩 가중치
    const BETA = 0.3;  // TF-IDF 가중치
    
    for (const bookmark of bookmarkList) {
        const summaryData = summariesMap[bookmark.id];
        
        if (summaryData && summaryData.embedding) {
            // Semantic 점수 (임베딩 기반 코사인 유사도)
            const semanticScore = window.textEmbedder.cosineSimilarity(
                queryEmbedding, 
                summaryData.embedding
            );
            
            // Keyword 점수 (TF-IDF 기반 코사인 유사도)
            let keywordScore = 0;
            if (tfidfModel && queryTfIdfVector && summaryData.tfidfVector) {
                // 벡터 차원 확인
                if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
                    console.warn(`[SEARCH DEBUG] "${bookmark.title}" - 벡터 차원 불일치: query=${queryTfIdfVector.length}, bookmark=${summaryData.tfidfVector.length}`);
                } else {
                    keywordScore = tfidfModel.cosineSimilarity(
                        queryTfIdfVector,
                        summaryData.tfidfVector
                    );
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
                tags: summaryData.tags || [],
                similarity: finalScore,
                semanticScore: semanticScore,
                keywordScore: keywordScore,
                score: Math.round(finalScore * 100)
            });
        }
    }
    
    // 4. 유사도 순으로 정렬하고 상위 10개만 반환
    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10)
        .filter(result => result.similarity > 0.2); // 최소 유사도 20%로 상향 조정
}

/**
 * 검색 결과를 UI에 표시
 */
function displaySearchResults(results, resultsElement, statusElement) {
    if (results.length === 0) {
        statusElement.textContent = '검색 결과가 없습니다.';
        resultsElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">검색 결과가 없습니다.<br>임베딩이 생성된 북마크가 있는지 확인해주세요.</div>';
        return;
    }
    
    statusElement.textContent = `${results.length}개의 결과를 찾았습니다.`;
    
    resultsElement.innerHTML = results.map(result => {
        // 태그 HTML 생성 (상위 3개만)
        const tagsHtml = result.tags && result.tags.length > 0
            ? `<div class="result-tags">
                ${result.tags.slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
               </div>`
            : '';
        
        return `
            <div class="result-card">
                <div class="result-thumbnail"><img src="${result.thumbnail}" alt="thumbnail"></div>
                <div class="result-title" onclick="openBookmark('${result.bookmark.url}')">${result.bookmark.title}</div>
                <div class="result-url">${result.bookmark.url}</div>
                <div class="result-score">${result.score}% 일치</div>
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">${result.summary}</div>
                ${tagsHtml}
            </div>
        `;
    }).join('');
}

/**
 * HTML 이스케이프 (XSS 방지)
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 북마크 열기
 */
function openBookmark(url) {
    chrome.tabs.create({ url: url });
    window.close();
}

/**
 * 폴더 ID로 폴더 이름 가져오기
 */
async function getFolderNameById(folderId) {
    try {
        const bookmarks = await chrome.bookmarks.get(folderId);
        if (bookmarks && bookmarks.length > 0) {
            return bookmarks[0].title || '기타 북마크';
        }
        return '기타 북마크';
    } catch (error) {
        console.error('[FOLDER DEBUG] 폴더 이름 가져오기 실패:', error);
        return '기타 북마크';
    }
}
/**
 * YouTube URL에서 video ID 추출
 * @param {string} url YouTube URL
 * @returns {string|null} video ID 또는 null
 */
function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

/**
 * YouTube URL인지 확인
 * @param {string} url 확인할 URL
 * @returns {boolean} YouTube URL 여부
 */
function isYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
}


/**
 * YouTube 페이지에서 직접 자막 추출 (Content Script 사용)
 * @param {string} videoId YouTube 동영상 ID (사용하지 않지만 호환성을 위해 유지)
 * @returns {Promise<string>} 자막 텍스트
 */
async function extractYouTubeCaptionFromPage(videoId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return "";
    
    const tabId = tabs[0].id;
    
    // YouTube 페이지가 아니면 자막을 추출할 수 없음
    if (!tabs[0].url.includes('youtube.com')) {
        console.warn('[YouTube] 현재 탭이 YouTube 페이지가 아닙니다.');
        return "";
    }
    
    try {
        // Content Script 주입하여 자막 추출
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractCaptionFromYouTubePage
        });
        
        if (results && results[0] && results[0].result) {
            return results[0].result;
        }
        
        return "";
    } catch (error) {
        console.error('[YouTube] 페이지에서 자막 추출 실패:', error);
        return "";
    }
}

/**
 * YouTube 페이지에서 자막을 추출하는 함수 (Content Script에서 실행)
 * 자막 패널(ytd-transcript-renderer)의 DOM 구조를 직접 쿼리하여 추출
 * 이 함수는 executeScript로 주입되어 실행됩니다.
 */
function extractCaptionFromYouTubePage() {
    try {
        // YouTube 자막 패널에서 자막 세그먼트 추출
        // ytd-transcript-segment-renderer 요소의 segment-text 클래스를 사용
        const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
        
        if (transcriptSegments.length > 0) {
            console.log(`[YouTube] 자막 세그먼트 발견: ${transcriptSegments.length}개`);
            
            const captionTexts = Array.from(transcriptSegments)
                .map(segment => {
                    // segment-text 클래스를 가진 요소에서 텍스트 추출
                    const segmentText = segment.querySelector('.segment-text');
                    if (segmentText) {
                        return segmentText.textContent || segmentText.innerText || '';
                    }
                    // segment-text가 없으면 세그먼트 자체의 텍스트 사용
                    return segment.textContent || segment.innerText || '';
                })
                .filter(text => text.trim().length > 0)
                .join(' ');
            
            if (captionTexts.trim()) {
                console.log(`[YouTube] 자막 추출 성공: ${captionTexts.length}자`);
                return captionTexts.trim();
            }
        }
        
        // 자막 패널이 열려있지 않은 경우를 대비한 대체 방법
        // 자막 패널을 찾을 수 없으면 빈 문자열 반환
        console.warn('[YouTube] 자막 패널을 찾을 수 없습니다. 자막 패널이 열려있는지 확인해주세요.');
        return "";
        
    } catch (error) {
        console.error('[YouTube] 자막 추출 오류:', error);
        return "";
    }
}

/**
 * YouTube 자막을 가져와서 텍스트로 변환
 * 자막 패널(ytd-transcript-renderer)의 DOM 구조를 직접 쿼리하여 추출
 * @param {string} videoId YouTube 동영상 ID
 * @returns {Promise<string>} 자막 텍스트
 */
async function getYouTubeCaptionText(videoId) {
    try {
        console.log('[YouTube] 페이지에서 자막 추출 시도...');
        const captionText = await extractYouTubeCaptionFromPage(videoId);
        
        if (captionText && captionText.trim()) {
            console.log(`[YouTube] ✅ 자막 추출 성공: ${captionText.length}자`);
            return captionText;
        }
        
        throw new Error("YouTube 자막을 찾을 수 없습니다. 자막 패널이 열려있는지 확인해주세요.");
        
    } catch (error) {
        console.error('[YouTube] 자막 가져오기 실패:', error);
        throw error;
    }
}