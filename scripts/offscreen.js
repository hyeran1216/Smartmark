// Offscreen Document Script for SmartMark
// BERT-only embeddings via @xenova/transformers

console.log('[OFFSCREEN] Offscreen document 초기화 중...');

// Model status tracking
// bertEmbedder keeps its own state, we just relay
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

// Background.js로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log('[OFFSCREEN] 메시지 수신:', message.type);

    // Multilingual BERT 임베딩 생성 (384차원)
    // 기존 USE 요청도 BERT로 처리하도록 통합
    if (message.type === 'GENERATE_EMBEDDING' || message.type === 'GENERATE_BERT_EMBEDDING') {
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

    // BERT 통합 처리 (임베딩 + 키워드 추출)
    // Multilingual Model은 문서 임베딩과 키워드 추출을 한 번에 처리하기 좋음
    if (message.type === 'BERT_FULL_PROCESS') {
        handleBERTFullProcess(message.text, sendResponse);
        return true;
    }

    // Handle INIT_BERT mostly for explicit initialization from BG
    if (message.type === 'INIT_BERT') {
        console.log('[OFFSCREEN] INIT_BERT received');
        if (window.bertEmbedder && window.bertEmbedder.init) {
            window.bertEmbedder.init().then(() => {
                console.log('[OFFSCREEN] BERT Initialized via INIT_BERT');
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[OFFSCREEN] BERT Init failed:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true; // async response
        } else {
            console.error('[OFFSCREEN] BERT Embedder or init not found');
            sendResponse({ success: false, error: 'Embedder not ready' });
        }
        return false;
    }

    // 모델 준비 상태 확인
    if (message.type === 'CHECK_READY') {
        const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(1);
        const ready = window.bertEmbedder ? window.bertEmbedder.ready() : false;
        sendResponse({
            ready: ready,
            elapsed: parseFloat(elapsed),
            lazy: true // Indicate lazy loading support
        });
        return false;
    }

    return false;
});

/**
 * BERT 임베딩 생성 요청 처리
 */
async function handleBERTEmbeddingRequest(text, sendResponse) {
    // Lazy Load: We don't check for ready() because embed() handles ensuring loaded.
    if (!window.bertEmbedder) {
        sendResponse({ success: false, error: 'BERT embedder script not loaded' });
        return;
    }

    try {
        const startTime = performance.now();
        // console.log(`[OFFSCREEN-BERT] 임베딩 생성: "${text.substring(0, 30)}..."`);

        const embedding = await window.bertEmbedder.embed(text);
        const elapsedTime = (performance.now() - startTime).toFixed(2);

        sendResponse({
            success: true,
            embedding: embedding,
            dimension: embedding.length,
            model: 'Multilingual-BERT',
            responseTime: parseFloat(elapsedTime)
        });
    } catch (error) {
        console.error('[OFFSCREEN-BERT] 임베딩 생성 실패:', error);
        sendResponse({
            success: false,
            error: error.message,
            model: 'Multilingual-BERT'
        });
    }
}

/**
 * KeyBERT 키워드 추출
 */
async function handleKeywordExtraction(text, candidates, sendResponse) {
    if (!window.bertEmbedder) {
        sendResponse({ success: false, error: 'BERT embedder not loaded' });
        return;
    }

    try {
        const keywords = await window.bertEmbedder.extractKeywords(text, candidates);
        sendResponse({ success: true, keywords: keywords });
    } catch (error) {
        console.error('[KeyBERT] 키워드 추출 실패:', error);
        sendResponse({ success: false, error: error.message });
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
        sendResponse({ success: true, ngrams: ngrams });
    } catch (error) {
        console.error('[N-gram] 추출 실패:', error);
        sendResponse({ success: false, error: error.message });
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
        const startTime = performance.now();

        // 1. 문서 임베딩 생성
        const docEmbedding = await window.bertEmbedder.embed(text);

        // 2. N-gram 추출
        const ngrams = window.bertEmbedder.extractNGrams(text);

        // 3. 키워드 추출 (상위 30개 후보 중 Top 5)
        const candidates = ngrams.slice(0, 30);
        const keywordResults = await window.bertEmbedder.extractKeywords(text, candidates); // text, candidates 필요
        // 주의: extractKeywords 함수 내부 구현에 따라 text가 불필요할 수도 있지만, 
        // 현 구조에서는 text를 받아 다시 임베딩하거나, 최적화된 내부 로직을 쓸 수 있음.
        // offscreen-bert.js의 extractKeywords는 text를 받아 다시 임베딩하므로 비효율적일 수 있음.
        // 하지만 일단 인터페이스 유지.

        const topKeywords = keywordResults.map(k => k.keyword);

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


