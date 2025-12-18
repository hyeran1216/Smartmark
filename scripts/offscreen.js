// Offscreen Document Script for SmartMark
// Multi-model embeddings: USE (WebGL) + BERT (WASM)

console.log('[OFFSCREEN] Multi-model Offscreen document 초기화 중...');

// Model status tracking
let useEmbedderReady = false;
let bertEmbedderReady = false;
let loadingError = null;
const loadStartTime = Date.now();

/**
 * Background에 로딩 상태 알림
 */
function notifyBackground(message) {
    try {
        chrome.runtime.sendMessage({ 
            type: 'OFFSCREEN_STATUS', 
            ...message 
        }).catch(e => {
            // Background가 아직 준비 안 됐을 수 있음
            console.log('[OFFSCREEN] Background 메시지 전송 실패 (정상):', e.message);
        });
    } catch (error) {
        console.log('[OFFSCREEN] 메시지 전송 불가:', error.message);
    }
}

// USE (TextEmbedder) 초기화
(async () => {
    try {
        console.log('[OFFSCREEN] USE 모델 로드 확인 중...');
        notifyBackground({ status: 'script_loaded', message: 'USE 모델 로드 시작...' });
        
        // textEmbedder 객체 존재 확인
        if (!window.textEmbedder) {
            const errorMsg = 'textEmbedder 객체를 찾을 수 없습니다.';
            console.error(`[OFFSCREEN] ${errorMsg}`);
            loadingError = errorMsg;
            notifyBackground({ status: 'error', message: errorMsg });
            return;
        }
        
        console.log('[OFFSCREEN-USE] TensorFlow.js 버전:', tf.version.tfjs);
        console.log('[OFFSCREEN-USE] 초기 백엔드:', tf.getBackend());
        
        notifyBackground({ 
            status: 'loading', 
            message: 'USE 모델 다운로드 중... (첫 실행 시 1-2분)',
            backend: tf.getBackend()
        });
        
        const progressInterval = setInterval(() => {
            const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(0);
            console.log(`[OFFSCREEN-USE] 로딩 중... (${elapsed}초)`);
        }, 10000);
        
        await window.textEmbedder.initialize();
        clearInterval(progressInterval);
        
        const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(2);
        useEmbedderReady = true;
        
        console.log(`[OFFSCREEN-USE] ✅ 로드 완료! (${loadTime}초, 512차원)`);
        console.log(`[OFFSCREEN-USE] 백엔드: ${tf.getBackend()}`);
        
        notifyBackground({ 
            status: 'ready', 
            message: `USE 모델 로드 완료 (${loadTime}초)`,
            model: 'USE',
            dimension: 512,
            backend: tf.getBackend(),
            loadTime: parseFloat(loadTime)
        });
    } catch (error) {
        console.error('[OFFSCREEN-USE] ❌ 초기화 실패:', error);
        loadingError = error.message;
        notifyBackground({ 
            status: 'error', 
            message: `USE 초기화 실패: ${error.message}`,
            model: 'USE',
            error: error.message
        });
    }
})();

// BERT 모델 상태 모니터링
setInterval(() => {
    if (window.bertEmbedder && window.bertEmbedder.ready()) {
        if (!bertEmbedderReady) {
            bertEmbedderReady = true;
            console.log('[OFFSCREEN] ✅ BERT 모델도 준비 완료!');
        }
    }
}, 1000);

// Background.js로부터 메시지 수신 (Multi-model support)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[OFFSCREEN] 메시지 수신:', message);

    // USE 임베딩 생성 (기본, 512차원)
    if (message.type === 'GENERATE_EMBEDDING') {
        handleUSEEmbeddingRequest(message.text, sendResponse);
        return true;
    }
    
    // BERT 임베딩 생성 (384차원)
    if (message.type === 'GENERATE_BERT_EMBEDDING') {
        handleBERTEmbeddingRequest(message.text, sendResponse);
        return true;
    }
    
    // KeyBERT 키워드 추출
    if (message.type === 'EXTRACT_KEYWORDS') {
        handleKeywordExtraction(message.text, message.candidates, sendResponse);
        return true;
    }
    
    // N-gram 추출
    if (message.type === 'EXTRACT_NGRAMS') {
        handleNGramExtraction(message.text, sendResponse);
        return true;
    }
    
    // 텍스트 번역 (DeepL)
    if (message.type === 'TRANSLATE_TEXT') {
        handleTranslation(message.text, message.targetLang, sendResponse);
        return true;
    }
    
    // BERT 통합 처리 (임베딩 + 키워드 추출)
    if (message.type === 'BERT_FULL_PROCESS') {
        handleBERTFullProcess(message.text, sendResponse);
        return true;
    }

    // 모델 준비 상태 확인
    if (message.type === 'CHECK_READY') {
        const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(1);
        const ready = useEmbedderReady;
        sendResponse({ 
            ready: ready,
            use: useEmbedderReady,
            bert: bertEmbedderReady,
            error: loadingError,
            elapsed: parseFloat(elapsed)
        });
        return false;
    }

    return false;
});

/**
 * USE 임베딩 생성 요청 처리 (512차원)
 */
async function handleUSEEmbeddingRequest(text, sendResponse) {
    if (!useEmbedderReady) {
        console.warn('[OFFSCREEN] USE 모델이 아직 준비되지 않았습니다.');
        sendResponse({ success: false, error: 'USE not ready' });
        return;
    }

    try {
        const startTime = performance.now();
        console.log(`[OFFSCREEN-USE] 임베딩 생성: "${text.substring(0, 50)}..."`);
        
        const embedding = await window.textEmbedder.embedText(text);
        const elapsedTime = (performance.now() - startTime).toFixed(2);
        
        console.log(`[OFFSCREEN-USE] ✅ 완료 (${elapsedTime}ms, ${embedding.length}차원)`);
        
        sendResponse({ 
            success: true, 
            embedding: embedding,
            dimension: embedding.length,
            model: 'USE',
            responseTime: parseFloat(elapsedTime)
        });
    } catch (error) {
        console.error('[OFFSCREEN-USE] 임베딩 생성 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message,
            model: 'USE'
        });
    }
}

/**
 * BERT 임베딩 생성 요청 처리 (384차원)
 */
async function handleBERTEmbeddingRequest(text, sendResponse) {
    if (!bertEmbedderReady || !window.bertEmbedder) {
        console.warn('[OFFSCREEN] BERT 모델이 아직 준비되지 않았습니다.');
        sendResponse({ success: false, error: 'BERT not ready' });
        return;
    }

    try {
        const startTime = performance.now();
        console.log(`[OFFSCREEN-BERT] 임베딩 생성: "${text.substring(0, 50)}..."`);
        
        const embedding = await window.bertEmbedder.embed(text);
        const elapsedTime = (performance.now() - startTime).toFixed(2);
        
        console.log(`[OFFSCREEN-BERT] ✅ 완료 (${elapsedTime}ms, ${embedding.length}차원)`);
        
        sendResponse({ 
            success: true, 
            embedding: embedding,
            dimension: embedding.length,
            model: 'BERT',
            responseTime: parseFloat(elapsedTime)
        });
    } catch (error) {
        console.error('[OFFSCREEN-BERT] 임베딩 생성 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message,
            model: 'BERT'
        });
    }
}

/**
 * KeyBERT 키워드 추출
 */
async function handleKeywordExtraction(text, candidates, sendResponse) {
    if (!bertEmbedderReady || !window.bertEmbedder) {
        sendResponse({ success: false, error: 'BERT not ready for keyword extraction' });
        return;
    }

    try {
        const startTime = performance.now();
        console.log(`[KeyBERT] 키워드 추출 시작: ${candidates.length}개 후보`);
        
        const keywords = await window.bertEmbedder.extractKeywords(text, candidates);
        const elapsedTime = (performance.now() - startTime).toFixed(2);
        
        console.log(`[KeyBERT] ✅ 완료 (${elapsedTime}ms):`, keywords);
        
        sendResponse({ 
            success: true, 
            keywords: keywords,
            responseTime: parseFloat(elapsedTime)
        });
    } catch (error) {
        console.error('[KeyBERT] 키워드 추출 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * N-gram 추출
 */
async function handleNGramExtraction(text, sendResponse) {
    if (!window.bertEmbedder) {
        sendResponse({ success: false, error: 'BERT embedder not loaded' });
        return;
    }

    try {
        const ngrams = window.bertEmbedder.extractNGrams(text);
        console.log(`[N-gram] ${ngrams.length}개 추출 완료`);
        
        sendResponse({ 
            success: true, 
            ngrams: ngrams 
        });
    } catch (error) {
        console.error('[N-gram] 추출 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * DeepL 번역
 */
async function handleTranslation(text, targetLang, sendResponse) {
    try {
        const deeplLang = targetLang === 'en' ? 'EN-US' : targetLang.toUpperCase();
        
        const response = await fetch(CONFIG.DEEPL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${CONFIG.DEEPL_API_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'text': text,
                'target_lang': deeplLang
            })
        });

        if (!response.ok) {
            throw new Error(`DeepL API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[TRANSLATE] 번역 완료: "${text.substring(0, 50)}..." → "${data.translations[0].text.substring(0, 50)}..."`);
        
        sendResponse({ 
            success: true, 
            translatedText: data.translations[0].text 
        });
    } catch (error) {
        console.error('[TRANSLATE] 번역 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

/**
 * BERT 통합 처리 (임베딩 + 키워드 추출)
 */
async function handleBERTFullProcess(text, sendResponse) {
    if (!window.bertEmbedder) {
        sendResponse({ success: false, error: 'BERT embedder not loaded' });
        return;
    }

    try {
        console.log('[BERT FULL] 통합 처리 시작');
        const startTime = performance.now();
        
        // 1. 문서 임베딩 생성 (1번만)
        const docEmbedding = await window.bertEmbedder.embed(text);
        console.log(`[BERT FULL] 문서 임베딩 완료 (${(performance.now() - startTime).toFixed(0)}ms)`);
        
        // 2. N-gram 추출 (BERT 사용 안 함)
        const ngrams = window.bertEmbedder.extractNGrams(text);
        console.log(`[BERT FULL] N-gram ${ngrams.length}개 추출`);
        
        // 3. 키워드 추출 (문서 임베딩 재사용)
        const candidates = ngrams.slice(0, 30);
        const keywordResults = [];
        
        for (const candidate of candidates) {
            const candEmbedding = await window.bertEmbedder.embed(candidate);
            
            // 코사인 유사도 계산
            let dotProduct = 0;
            let normA = 0;
            let normB = 0;
            
            for (let i = 0; i < docEmbedding.length; i++) {
                dotProduct += docEmbedding[i] * candEmbedding[i];
                normA += docEmbedding[i] * docEmbedding[i];
                normB += candEmbedding[i] * candEmbedding[i];
            }
            
            const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            keywordResults.push({ keyword: candidate, score: similarity });
        }
        
        // 상위 5개 키워드 선택
        const topKeywords = keywordResults
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(k => k.keyword);
        
        const totalTime = (performance.now() - startTime).toFixed(0);
        console.log(`[BERT FULL] ✅ 완료 (${totalTime}ms): 키워드 ${topKeywords.length}개`);
        
        sendResponse({ 
            success: true, 
            embedding: docEmbedding,
            tags: topKeywords
        });
    } catch (error) {
        console.error('[BERT FULL] 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

console.log('[OFFSCREEN] Offscreen document 준비 완료.');

