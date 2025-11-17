// Offscreen Document Script for SmartMark
// WebGL을 사용한 임베딩 생성을 백그라운드에서 처리

console.log('[OFFSCREEN] Offscreen document 초기화 중...');

let embedderReady = false;
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

// TextEmbedder 초기화
(async () => {
    try {
        console.log('[OFFSCREEN] 스크립트 로드 확인 중...');
        notifyBackground({ status: 'script_loaded', message: '스크립트 로드 확인 중...' });
        
        // textEmbedder 객체 존재 확인
        if (!window.textEmbedder) {
            const errorMsg = 'textEmbedder 객체를 찾을 수 없습니다. textEmbedder.js가 로드되지 않았을 수 있습니다.';
            console.error(`[OFFSCREEN] ${errorMsg}`);
            loadingError = errorMsg;
            notifyBackground({ status: 'error', message: errorMsg });
            return;
        }
        
        console.log('[OFFSCREEN] TextEmbedder 발견. 모델 로드 시작...');
        console.log(`[OFFSCREEN] TensorFlow.js 버전: ${tf.version.tfjs}`);
        console.log(`[OFFSCREEN] 초기 백엔드: ${tf.getBackend()}`);
        
        notifyBackground({ 
            status: 'loading', 
            message: 'USE 모델 다운로드 및 로드 중... (첫 실행 시 1-2분 소요될 수 있습니다)',
            backend: tf.getBackend()
        });
        
        // 10초마다 진행 상황 알림
        const progressInterval = setInterval(() => {
            const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(0);
            console.log(`[OFFSCREEN] 모델 로딩 중... (${elapsed}초 경과)`);
            notifyBackground({ 
                status: 'loading', 
                message: `모델 로딩 중... (${elapsed}초 경과)` 
            });
        }, 10000);
        
        // textEmbedder.initialize() 메서드 호출 (loadModel이 아님)
        await window.textEmbedder.initialize();
        
        clearInterval(progressInterval);
        
        const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(2);
        embedderReady = true;
        
        console.log(`[OFFSCREEN] ✅ TextEmbedder 로드 완료! (${loadTime}초 소요)`);
        console.log(`[OFFSCREEN] 최종 백엔드: ${tf.getBackend()}`);
        console.log(`[OFFSCREEN] 메모리 사용: ${JSON.stringify(tf.memory())}`);
        
        notifyBackground({ 
            status: 'ready', 
            message: `TextEmbedder 로드 완료 (${loadTime}초 소요)`,
            backend: tf.getBackend(),
            loadTime: parseFloat(loadTime)
        });
    } catch (error) {
        const loadTime = ((Date.now() - loadStartTime) / 1000).toFixed(2);
        console.error(`[OFFSCREEN] ❌ TextEmbedder 초기화 실패 (${loadTime}초 후):`, error);
        console.error('[OFFSCREEN] 오류 스택:', error.stack);
        
        loadingError = error.message;
        notifyBackground({ 
            status: 'error', 
            message: `TextEmbedder 초기화 실패: ${error.message}`,
            error: error.message,
            stack: error.stack
        });
    }
})();

// Background.js로부터 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[OFFSCREEN] 메시지 수신:', message);

    if (message.type === 'GENERATE_EMBEDDING') {
        handleEmbeddingRequest(message.text, sendResponse);
        return true; // 비동기 응답을 위해 true 반환
    }

    if (message.type === 'CHECK_READY') {
        const elapsed = ((Date.now() - loadStartTime) / 1000).toFixed(1);
        sendResponse({ 
            ready: embedderReady,
            error: loadingError,
            elapsed: parseFloat(elapsed)
        });
        return false;
    }

    return false;
});

/**
 * 임베딩 생성 요청 처리
 * @param {string} text - 임베딩을 생성할 텍스트
 * @param {Function} sendResponse - 응답 콜백
 */
async function handleEmbeddingRequest(text, sendResponse) {
    if (!embedderReady) {
        console.warn('[OFFSCREEN] TextEmbedder가 아직 준비되지 않았습니다.');
        sendResponse({ success: false, error: 'Embedder not ready' });
        return;
    }

    try {
        console.log(`[OFFSCREEN] 임베딩 생성 시작: "${text.substring(0, 50)}..."`);
        const embedding = await window.textEmbedder.embedText(text);
        console.log(`[OFFSCREEN] 임베딩 생성 완료. 차원: ${embedding.length}`);
        
        sendResponse({ 
            success: true, 
            embedding: embedding 
        });
    } catch (error) {
        console.error('[OFFSCREEN] 임베딩 생성 실패:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

console.log('[OFFSCREEN] Offscreen document 준비 완료.');

