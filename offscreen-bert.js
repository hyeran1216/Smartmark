// BERT Embedder using ONNX Runtime Web (Direct)
// Offscreen Document Script for WASM-based BERT embeddings

console.log('[BERT] 초기화 시작 (ONNX Runtime 직접 사용)...');

let bertSession = null;
let bertReady = false;
let bertLoadingError = null;
const bertLoadStartTime = Date.now();

// BERT 설정
const BERT_CONFIG = {
    modelUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx',
    modelName: 'all-MiniLM-L6-v2',
    dimension: 384,
    maxLength: 128
};

/**
 * BERT 모델 초기화 (ONNX Runtime 직접 사용)
 */
async function initializeBERT() {
    try {
        console.log('[BERT] ONNX Runtime 대기 중...');
        console.log('[BERT] 확인 중인 전역 객체:', Object.keys(window).filter(k => k.toLowerCase().includes('ort')));
        
        // ort.min.js가 로드될 때까지 대기 (다양한 가능성 확인)
        let retries = 0;
        const maxRetries = 50; // 5초
        
        while (retries < maxRetries) {
            if (typeof window.ort !== 'undefined') {
                console.log('[BERT] ✅ window.ort 발견!');
                break;
            }
            if (typeof window.onnxruntime !== 'undefined') {
                console.log('[BERT] ✅ window.onnxruntime 발견!');
                window.ort = window.onnxruntime;
                break;
            }
            if (typeof ort !== 'undefined') {
                console.log('[BERT] ✅ 전역 ort 발견!');
                window.ort = ort;
                break;
            }
            if (retries % 10 === 0) {
                console.log(`[BERT] ${retries * 100}ms 경과... 여전히 대기 중`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
        
        if (typeof window.ort === 'undefined' && typeof ort === 'undefined') {
            console.error('[BERT] 사용 가능한 전역 객체:', Object.keys(window).slice(0, 20));
            throw new Error('ONNX Runtime이 로드되지 않았습니다 (5초 타임아웃)');
        }
        
        // ort 참조 설정
        const ortRuntime = window.ort || ort;
        
        console.log('[BERT] ✅ ONNX Runtime 로드 완료');
        console.log('[BERT] 버전:', ortRuntime.env.versions);
        console.log('[BERT] 사용 가능한 백엔드:', ortRuntime.env.backends);
        
        // WASM 경로 설정
        const wasmPath = chrome.runtime.getURL('');
        console.log('[BERT] WASM 경로 설정:', wasmPath);
        ortRuntime.env.wasm.wasmPaths = wasmPath;
        ortRuntime.env.wasm.numThreads = 1; // 단일 스레드 (안정성)
        
        console.log('[BERT] WASM 설정:');
        console.log('  - wasmPaths:', ortRuntime.env.wasm.wasmPaths);
        console.log('  - numThreads:', ortRuntime.env.wasm.numThreads);
        
        notifyBertStatus({
            status: 'loading',
            message: 'BERT 모델 다운로드 중... (첫 실행 시 ~5MB, 30-60초 소요)'
        });
        
        console.log(`[BERT] 📥 모델 다운로드 시작`);
        console.log(`[BERT] URL: ${BERT_CONFIG.modelUrl}`);
        console.log(`[BERT] 다운로드 크기: 약 5MB (양자화 모델)`);
        
        // Progress 모니터링
        const progressInterval = setInterval(() => {
            const elapsed = ((Date.now() - bertLoadStartTime) / 1000).toFixed(0);
            console.log(`[BERT] ⏳ 모델 로딩 중... (${elapsed}초 경과)`);
        }, 10000);
        
        // ONNX 모델 로드 시도
        console.log('[BERT] 🔧 InferenceSession 생성 시작...');
        try {
            bertSession = await ortRuntime.InferenceSession.create(BERT_CONFIG.modelUrl, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            console.log('[BERT] ✅ InferenceSession 생성 완료');
        } catch (sessionError) {
            console.error('[BERT] ❌ InferenceSession 생성 실패:', sessionError);
            throw sessionError;
        }
        
        clearInterval(progressInterval);
        
        bertReady = true;
        const loadTime = ((Date.now() - bertLoadStartTime) / 1000).toFixed(2);
        
        console.log(`[BERT] ✅ 모델 로드 완료! (${loadTime}초 소요)`);
        console.log(`[BERT] 모델: ${BERT_CONFIG.modelName} (${BERT_CONFIG.dimension}차원)`);
        console.log('[BERT] 입력:', bertSession.inputNames);
        console.log('[BERT] 출력:', bertSession.outputNames);
        
        notifyBertStatus({
            status: 'ready',
            message: `BERT 모델 로드 완료 (${loadTime}초)`,
            modelName: BERT_CONFIG.modelName,
            dimension: BERT_CONFIG.dimension,
            loadTime: parseFloat(loadTime)
        });
        
    } catch (error) {
        const loadTime = ((Date.now() - bertLoadStartTime) / 1000).toFixed(2);
        console.error(`[BERT] ❌ 모델 로드 실패 (${loadTime}초)`);
        console.error('[BERT] 에러 타입:', error.constructor.name);
        console.error('[BERT] 에러 메시지:', error.message);
        console.error('[BERT] 전체 에러:', error);
        console.error('[BERT] 스택:', error.stack);
        
        // 에러 원인 분석
        let errorDetails = {
            type: error.constructor.name,
            message: error.message,
            stack: error.stack
        };
        
        if (error.message.includes('Failed to fetch')) {
            console.error('[BERT] 🔍 네트워크 오류: 모델 다운로드 실패');
            console.error(`[BERT] 시도한 URL: ${BERT_CONFIG.modelUrl}`);
            console.error('[BERT] 가능한 원인:');
            console.error('  1. CSP connect-src 설정 확인 필요');
            console.error('  2. 네트워크 연결 문제');
            console.error('  3. HuggingFace 서버 문제');
            errorDetails.category = 'NETWORK_ERROR';
        } else if (error.message.includes('wasm')) {
            console.error('[BERT] 🔍 WASM 로딩 오류');
            const ortRef = window.ort || ort;
            if (ortRef) {
                console.error('[BERT] WASM 경로:', ortRef.env.wasm.wasmPaths);
            }
            errorDetails.category = 'WASM_ERROR';
        } else if (typeof window.ort === 'undefined' && typeof ort === 'undefined') {
            console.error('[BERT] 🔍 ONNX Runtime 미로드');
            console.error('[BERT] ort.min.js가 로드되지 않았습니다');
            errorDetails.category = 'ORT_NOT_LOADED';
        } else {
            console.error('[BERT] 🔍 알 수 없는 오류');
            errorDetails.category = 'UNKNOWN_ERROR';
        }
        
        bertLoadingError = error.message;
        bertReady = false;
        
        notifyBertStatus({
            status: 'error',
            message: 'BERT 모델 로드 실패',
            error: error.message,
            errorDetails: errorDetails,
            loadTime: parseFloat(loadTime)
        });
    }
}

/**
 * Background에 BERT 상태 알림
 */
function notifyBertStatus(message) {
    try {
        chrome.runtime.sendMessage({
            type: 'BERT_STATUS',
            ...message
        }).catch(e => {
            console.log('[BERT] Background 메시지 전송 실패 (정상):', e.message);
        });
    } catch (error) {
        console.log('[BERT] 메시지 전송 불가:', error.message);
    }
}

/**
 * 간단한 토크나이저 (공백 기반)
 * 실제 BERT WordPiece 토크나이저 대신 간단한 버전 사용
 */
function simpleTokenize(text) {
    // 소문자 변환 및 정규화
    text = text.toLowerCase().trim();
    
    // 특수문자 처리
    text = text.replace(/[^\w\s가-힣]/g, ' ');
    
    // 공백으로 분할
    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    
    // [CLS] 토큰 추가 (0), [SEP] 토큰 추가 (102) - 간단한 버전
    const tokenIds = [101]; // [CLS]
    
    // 각 토큰을 간단한 해시로 변환 (실제 vocab 없이)
    // 실제로는 vocab.txt가 필요하지만, 간단한 구현으로 시작
    for (const token of tokens.slice(0, BERT_CONFIG.maxLength - 2)) {
        // 간단한 해시 함수 (실제 vocab 대신)
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            hash = ((hash << 5) - hash) + token.charCodeAt(i);
            hash = hash & hash; // 32-bit integer로 변환
        }
        tokenIds.push(Math.abs(hash) % 30000 + 1000); // vocab 범위 내로 제한
    }
    
    tokenIds.push(102); // [SEP]
    
    // 패딩
    while (tokenIds.length < BERT_CONFIG.maxLength) {
        tokenIds.push(0); // [PAD]
    }
    
    // Attention mask 생성
    const attentionMask = tokenIds.map(id => id !== 0 ? 1 : 0);
    
    // Token type IDs 생성 (모두 0 - 단일 문장)
    const tokenTypeIds = new Array(BERT_CONFIG.maxLength).fill(0);
    
    return {
        inputIds: tokenIds.slice(0, BERT_CONFIG.maxLength),
        attentionMask: attentionMask.slice(0, BERT_CONFIG.maxLength),
        tokenTypeIds: tokenTypeIds
    };
}

/**
 * Mean Pooling 구현
 */
function meanPooling(lastHiddenState, attentionMask) {
    // lastHiddenState: [batch_size, seq_length, hidden_size]
    // attentionMask: [batch_size, seq_length]
    
    const batchSize = lastHiddenState.dims[0];
    const seqLength = lastHiddenState.dims[1];
    const hiddenSize = lastHiddenState.dims[2];
    
    const pooled = new Float32Array(hiddenSize);
    let totalTokens = 0;
    
    // 각 토큰의 hidden state를 attention mask에 따라 평균
    for (let i = 0; i < seqLength; i++) {
        if (attentionMask[i] === 1) {
            for (let j = 0; j < hiddenSize; j++) {
                const idx = i * hiddenSize + j;
                pooled[j] += lastHiddenState.data[idx];
            }
            totalTokens++;
        }
    }
    
    // 평균 계산
    if (totalTokens > 0) {
        for (let i = 0; i < hiddenSize; i++) {
            pooled[i] /= totalTokens;
        }
    }
    
    return pooled;
}

/**
 * L2 Normalization 구현
 */
function l2Normalize(vector) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
        norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
        for (let i = 0; i < vector.length; i++) {
            vector[i] /= norm;
        }
    }
    
    return vector;
}

/**
 * BERT 임베딩 생성
 */
async function generateBERTEmbedding(text) {
    if (!bertReady || !bertSession) {
        throw new Error('BERT model not ready');
    }
    
    try {
        console.log(`[BERT] 임베딩 생성: "${text.substring(0, 50)}..."`);
        const startTime = performance.now();
        
        // 토크나이징
        const { inputIds, attentionMask, tokenTypeIds } = simpleTokenize(text);
        
        // ONNX Runtime용 텐서 생성
        const ortRef = window.ort || ort;
        const inputIdsTensor = new ortRef.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, BERT_CONFIG.maxLength]);
        const attentionMaskTensor = new ortRef.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, BERT_CONFIG.maxLength]);
        const tokenTypeIdsTensor = new ortRef.Tensor('int64', BigInt64Array.from(tokenTypeIds.map(BigInt)), [1, BERT_CONFIG.maxLength]);
        
        // 추론 실행
        const feeds = {
            input_ids: inputIdsTensor,
            attention_mask: attentionMaskTensor,
            token_type_ids: tokenTypeIdsTensor
        };
        
        const results = await bertSession.run(feeds);
        
        // 출력 추출 (last_hidden_state 또는 logits)
        const outputName = bertSession.outputNames[0];
        const lastHiddenState = results[outputName];
        
        // Mean Pooling
        const pooled = meanPooling(lastHiddenState, attentionMask);
        
        // L2 Normalization
        const normalized = l2Normalize(pooled);
        
        const elapsedTime = (performance.now() - startTime).toFixed(2);
        console.log(`[BERT] ✅ 임베딩 완료 (${elapsedTime}ms, 차원: ${normalized.length})`);
        
        return Array.from(normalized);
        
    } catch (error) {
        console.error('[BERT] 임베딩 생성 실패:', error);
        throw error;
    }
}

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        console.warn(`[BERT] 벡터 길이 불일치: ${vecA.length} vs ${vecB.length}`);
        const minLen = Math.min(vecA.length, vecB.length);
        vecA = vecA.slice(0, minLen);
        vecB = vecB.slice(0, minLen);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
        return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * N-gram 추출 (KeyBERT용)
 */
function extractNGrams(text) {
    // 텍스트 전처리
    const cleaned = text.toLowerCase()
        .replace(/[^\w\s가-힣]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    const words = cleaned.split(' ').filter(w => w.length > 0);
    const ngrams = [];
    
    // 1-gram (단어 길이 3자 이상)
    for (const word of words) {
        if (word.length >= 3) {
            ngrams.push(word);
        }
    }
    
    // 2-gram
    for (let i = 0; i < words.length - 1; i++) {
        ngrams.push(`${words[i]} ${words[i + 1]}`);
    }
    
    // 3-gram
    for (let i = 0; i < words.length - 2; i++) {
        ngrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    
    // 중복 제거
    return [...new Set(ngrams)];
}

/**
 * KeyBERT 알고리즘: 키워드 추출
 */
async function extractKeywords(text, candidates) {
    if (!bertReady || !bertSession) {
        throw new Error('BERT model not ready');
    }
    
    try {
        console.log(`[KeyBERT] 키워드 추출 시작: ${candidates.length}개 후보`);
        
        // 1. 문서 임베딩 생성
        const docEmbedding = await generateBERTEmbedding(text);
        
        // 2. 모든 후보 임베딩 생성 및 유사도 계산
        const results = [];
        
        for (let i = 0; i < candidates.length; i++) {
            const candEmbedding = await generateBERTEmbedding(candidates[i]);
            const score = cosineSimilarity(docEmbedding, candEmbedding);
            
            results.push({
                keyword: candidates[i],
                score: score
            });
        }
        
        // 3. 점수 기준 정렬 및 상위 5개 반환
        const topKeywords = results
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        
        console.log(`[KeyBERT] ✅ 키워드 추출 완료:`, topKeywords);
        
        return topKeywords;
        
    } catch (error) {
        console.error('[KeyBERT] 키워드 추출 실패:', error);
        throw error;
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.bertEmbedder = {
        ready: () => bertReady,
        embed: generateBERTEmbedding,
        extractKeywords: extractKeywords,
        extractNGrams: extractNGrams
    };
}

// BERT 모델 초기화 시작
initializeBERT();

console.log('[BERT] 스크립트 로드 완료');
