/**
 * SmartMark Search Methods
 * 멀티 모델 검색 시스템: USE, TF-IDF, BERT, Hybrid, Ensemble
 * 평가 시스템을 위한 모듈화된 검색 메서드
 */

// 평가 모드 설정
const EVALUATION_MODE = {
    SINGLE: 'single',       // 단일 모델 (USE + TF-IDF Hybrid)
    COMPARISON: 'compare',  // 모든 모델 비교
    AB_TEST: 'ab_test'      // A/B 테스트
};

let currentEvaluationMode = EVALUATION_MODE.SINGLE;

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) {
        console.warn('[SIMILARITY] 벡터가 null 또는 undefined:', { vecA: !!vecA, vecB: !!vecB });
        return 0;
    }
    
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
        console.warn('[SIMILARITY] 벡터가 배열이 아님:', { 
            vecAType: typeof vecA, 
            vecBType: typeof vecB,
            vecAIsArray: Array.isArray(vecA),
            vecBIsArray: Array.isArray(vecB)
        });
        return 0;
    }
    
    if (vecA.length !== vecB.length) {
        console.warn('[SIMILARITY] 벡터 차원 불일치:', { vecA: vecA.length, vecB: vecB.length });
        return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
        return 0;
    }
    
    return dotProduct / (normA * normB);
}

/**
 * USE 전용 검색 (512차원 임베딩만 사용)
 */
async function searchWithUSEOnly(queryEmbedding, threshold = 0.3) {
    const startTime = performance.now();
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const results = [];
    
    console.log(`[SEARCH-USE] USE 전용 검색 시작 (임계값: ${threshold})`);
    console.log(`[SEARCH-USE] 쿼리 임베딩:`, Array.isArray(queryEmbedding) ? `${queryEmbedding.length}차원` : typeof queryEmbedding);
    
    let bookmarkCount = 0;
    let embeddingCount = 0;
    
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
        bookmarkCount++;
        if (summaryData && summaryData.embedding) {
            embeddingCount++;
            if (embeddingCount === 1) {
                // 첫 번째 임베딩만 로깅
                console.log(`[SEARCH-USE] 첫 번째 저장된 임베딩:`, Array.isArray(summaryData.embedding) ? `${summaryData.embedding.length}차원` : typeof summaryData.embedding);
            }
            const similarity = cosineSimilarity(queryEmbedding, summaryData.embedding);
            
            if (similarity >= threshold) {
                results.push({
                    id: bookmarkId,
                    title: summaryData.title || 'Untitled',
                    similarity: similarity,
                    url: summaryData.url || '',
                    folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
                    summary: summaryData.uiSummary || 'No summary information',
                    thumbnail: summaryData.thumbnail || '',
                    tags: summaryData.tags || [],
                    score: Math.round(similarity * 100),
                    method: 'USE'
                });
            }
        }
    }
    
    const responseTime = performance.now() - startTime;
    const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    
    console.log(`[SEARCH-USE] ✅ 완료: ${sorted.length}개 (${responseTime.toFixed(2)}ms)`);
    console.log(`[SEARCH-USE] 총 북마크: ${bookmarkCount}개, 임베딩 있음: ${embeddingCount}개`);
    
    return {
        results: sorted,
        method: 'USE',
        responseTime: responseTime,
        resultCount: sorted.length
    };
}

/**
 * TF-IDF 전용 검색 (키워드 기반만)
 */
async function searchWithTFIDFOnly(searchQuery, threshold = 0.3) {
    const startTime = performance.now();
    const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    
    if (!savedModel[TFIDF_MODEL_KEY] || typeof TFIDF === 'undefined') {
        console.warn('[SEARCH-TFIDF] TF-IDF 모델 없음');
        return { results: [], method: 'TF-IDF', error: 'Model not found', responseTime: 0 };
    }
    
    console.log(`[SEARCH-TFIDF] TF-IDF 전용 검색 시작 (임계값: ${threshold})`);
    
    const tfidfModelInstance = new TFIDF();
    tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
    const queryTfIdfVector = tfidfModelInstance.computeTFIDFVector(searchQuery);
    
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const results = [];
    
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
        if (summaryData && summaryData.tfidfVector) {
            let similarity = 0;
            
            if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
                const minLength = Math.min(queryTfIdfVector.length, summaryData.tfidfVector.length);
                const queryVec = queryTfIdfVector.slice(0, minLength);
                const bookmarkVec = summaryData.tfidfVector.slice(0, minLength);
                similarity = tfidfModelInstance.cosineSimilarity(queryVec, bookmarkVec);
            } else {
                similarity = tfidfModelInstance.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
            }
            
            if (similarity >= threshold) {
                results.push({
                    id: bookmarkId,
                    title: summaryData.title || 'Untitled',
                    similarity: similarity,
                    url: summaryData.url || '',
                    folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
                    summary: summaryData.uiSummary || 'No summary information',
                    thumbnail: summaryData.thumbnail || '',
                    tags: summaryData.tags || [],
                    score: Math.round(similarity * 100),
                    method: 'TF-IDF'
                });
            }
        }
    }
    
    const responseTime = performance.now() - startTime;
    const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    
    console.log(`[SEARCH-TFIDF] ✅ 완료: ${sorted.length}개 (${responseTime.toFixed(2)}ms)`);
    
    return {
        results: sorted,
        method: 'TF-IDF',
        responseTime: responseTime,
        resultCount: sorted.length
    };
}

/**
 * BERT 전용 검색 (384차원 임베딩만 사용)
 */
async function searchWithBERTOnly(queryEmbedding, threshold = 0.3) {
    const startTime = performance.now();
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const results = [];
    
    console.log(`[SEARCH-BERT] BERT 전용 검색 시작 (임계값: ${threshold})`);
    console.log(`[SEARCH-BERT] 쿼리 임베딩:`, Array.isArray(queryEmbedding) ? `${queryEmbedding.length}차원` : typeof queryEmbedding);
    
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
        if (summaryData && summaryData.bertEmbedding) {
            const similarity = cosineSimilarity(queryEmbedding, summaryData.bertEmbedding);
            
            if (similarity >= threshold) {
                results.push({
                    id: bookmarkId,
                    title: summaryData.title || 'Untitled',
                    similarity: similarity,
                    url: summaryData.url || '',
                    folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
                    summary: summaryData.uiSummary || 'No summary information',
                    thumbnail: summaryData.thumbnail || '',
                    tags: summaryData.tags || [],
                    score: Math.round(similarity * 100),
                    method: 'BERT'
                });
            }
        }
    }
    
    const responseTime = performance.now() - startTime;
    const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    
    console.log(`[SEARCH-BERT] ✅ 완료: ${sorted.length}개 (${responseTime.toFixed(2)}ms)`);
    
    return {
        results: sorted,
        method: 'BERT',
        responseTime: responseTime,
        resultCount: sorted.length
    };
}

/**
 * Hybrid 검색 (USE + TF-IDF)
 */
async function searchWithHybrid(queryEmbedding, searchQuery, alpha = 0.4, beta = 0.6, threshold = 0.3) {
    const startTime = performance.now();
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const results = [];
    
    console.log(`[SEARCH-HYBRID] Hybrid 검색 시작 (α=${alpha}, β=${beta}, 임계값=${threshold})`);
    console.log(`[SEARCH-HYBRID] 쿼리 임베딩:`, Array.isArray(queryEmbedding) ? `${queryEmbedding.length}차원` : typeof queryEmbedding);
    
    // TF-IDF 모델 로드
    const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    let queryTfIdfVector = null;
    let tfidfModelInstance = null;
    
    if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
        tfidfModelInstance = new TFIDF();
        tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
        queryTfIdfVector = tfidfModelInstance.computeTFIDFVector(searchQuery);
    }
    
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
        if (summaryData && summaryData.embedding) {
            const semanticScore = cosineSimilarity(queryEmbedding, summaryData.embedding);
            
            let keywordScore = 0;
            if (summaryData.tfidfVector && queryTfIdfVector && tfidfModelInstance) {
                if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
                    const minLength = Math.min(queryTfIdfVector.length, summaryData.tfidfVector.length);
                    const queryVec = queryTfIdfVector.slice(0, minLength);
                    const bookmarkVec = summaryData.tfidfVector.slice(0, minLength);
                    keywordScore = tfidfModelInstance.cosineSimilarity(queryVec, bookmarkVec);
                } else {
                    keywordScore = tfidfModelInstance.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
                }
            }
            
            const finalScore = (alpha * semanticScore) + (beta * keywordScore);
            
            if (finalScore >= threshold) {
                results.push({
                    id: bookmarkId,
                    title: summaryData.title || 'Untitled',
                    similarity: finalScore,
                    url: summaryData.url || '',
                    folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
                    summary: summaryData.uiSummary || 'No summary information',
                    thumbnail: summaryData.thumbnail || '',
                    tags: summaryData.tags || [],
                    score: Math.round(finalScore * 100),
                    method: 'Hybrid',
                    semanticScore: semanticScore,
                    keywordScore: keywordScore
                });
            }
        }
    }
    
    const responseTime = performance.now() - startTime;
    const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    
    console.log(`[SEARCH-HYBRID] ✅ 완료: ${sorted.length}개 (${responseTime.toFixed(2)}ms)`);
    
    return {
        results: sorted,
        method: 'Hybrid',
        weights: { alpha, beta },
        responseTime: responseTime,
        resultCount: sorted.length
    };
}

/**
 * Ensemble 검색 (USE + TF-IDF + BERT)
 */
async function searchWithEnsemble(useEmbedding, bertEmbedding, searchQuery, weights = { use: 0.3, tfidf: 0.3, bert: 0.4 }, threshold = 0.3) {
    const startTime = performance.now();
    const storageKey = CONFIG.STORAGE_KEY;
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const results = [];
    
    console.log(`[SEARCH-ENSEMBLE] Ensemble 검색 시작 (USE=${weights.use}, TF-IDF=${weights.tfidf}, BERT=${weights.bert})`);
    console.log(`[SEARCH-ENSEMBLE] USE 임베딩:`, Array.isArray(useEmbedding) ? `${useEmbedding.length}차원` : typeof useEmbedding);
    console.log(`[SEARCH-ENSEMBLE] BERT 임베딩:`, Array.isArray(bertEmbedding) ? `${bertEmbedding.length}차원` : typeof bertEmbedding);
    
    // TF-IDF 모델 로드
    const TFIDF_MODEL_KEY = 'SmartMarkTFIDFModel';
    const savedModel = await chrome.storage.local.get(TFIDF_MODEL_KEY);
    let queryTfIdfVector = null;
    let tfidfModelInstance = null;
    
    if (savedModel[TFIDF_MODEL_KEY] && typeof TFIDF !== 'undefined') {
        tfidfModelInstance = new TFIDF();
        tfidfModelInstance.deserialize(savedModel[TFIDF_MODEL_KEY]);
        queryTfIdfVector = tfidfModelInstance.computeTFIDFVector(searchQuery);
    }
    
    for (const [bookmarkId, summaryData] of Object.entries(summariesMap)) {
        let scores = [];
        
        // USE 점수
        if (summaryData.embedding && useEmbedding) {
            const useScore = cosineSimilarity(useEmbedding, summaryData.embedding);
            scores.push({ type: 'USE', score: useScore, weight: weights.use });
        }
        
        // TF-IDF 점수
        if (summaryData.tfidfVector && queryTfIdfVector && tfidfModelInstance) {
            let tfidfScore = 0;
            if (queryTfIdfVector.length !== summaryData.tfidfVector.length) {
                const minLength = Math.min(queryTfIdfVector.length, summaryData.tfidfVector.length);
                const queryVec = queryTfIdfVector.slice(0, minLength);
                const bookmarkVec = summaryData.tfidfVector.slice(0, minLength);
                tfidfScore = tfidfModelInstance.cosineSimilarity(queryVec, bookmarkVec);
            } else {
                tfidfScore = tfidfModelInstance.cosineSimilarity(queryTfIdfVector, summaryData.tfidfVector);
            }
            scores.push({ type: 'TF-IDF', score: tfidfScore, weight: weights.tfidf });
        }
        
        // BERT 점수
        if (summaryData.bertEmbedding && bertEmbedding) {
            const bertScore = cosineSimilarity(bertEmbedding, summaryData.bertEmbedding);
            scores.push({ type: 'BERT', score: bertScore, weight: weights.bert });
        }
        
        // 가중 평균 계산
        if (scores.length > 0) {
            const finalScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0);
            
            if (finalScore >= threshold) {
                results.push({
                    id: bookmarkId,
                    title: summaryData.title || 'Untitled',
                    similarity: finalScore,
                    url: summaryData.url || '',
                    folderName: summaryData.koreanFolderName || summaryData.folderName || '기타',
                    summary: summaryData.uiSummary || 'No summary information',
                    thumbnail: summaryData.thumbnail || '',
                    tags: summaryData.tags || [],
                    score: Math.round(finalScore * 100),
                    method: 'Ensemble',
                    componentScores: scores
                });
            }
        }
    }
    
    const responseTime = performance.now() - startTime;
    const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    
    console.log(`[SEARCH-ENSEMBLE] ✅ 완료: ${sorted.length}개 (${responseTime.toFixed(2)}ms)`);
    
    return {
        results: sorted,
        method: 'Ensemble',
        weights: weights,
        responseTime: responseTime,
        resultCount: sorted.length
    };
}

/**
 * 모든 검색 방법 비교 실행
 */
async function compareAllSearchMethods(searchQuery, useEmbedding, bertEmbedding) {
    console.log('[EVALUATION] 🔬 모든 검색 방법 비교 시작...');
    
    const overallStart = performance.now();
    const comparison = {
        query: searchQuery,
        timestamp: Date.now(),
        methods: {}
    };
    
    // 1. USE only
    try {
        const useResult = await searchWithUSEOnly(useEmbedding);
        comparison.methods.USE = useResult;
    } catch (error) {
        comparison.methods.USE = { error: error.message };
    }
    
    // 2. TF-IDF only
    try {
        const tfidfResult = await searchWithTFIDFOnly(searchQuery);
        comparison.methods.TFIDF = tfidfResult;
    } catch (error) {
        comparison.methods.TFIDF = { error: error.message };
    }
    
    // 3. BERT only (if available)
    if (bertEmbedding) {
        try {
            const bertResult = await searchWithBERTOnly(bertEmbedding);
            comparison.methods.BERT = bertResult;
        } catch (error) {
            comparison.methods.BERT = { error: error.message };
        }
    }
    
    // 4. Hybrid (USE + TF-IDF)
    try {
        const hybridResult = await searchWithHybrid(useEmbedding, searchQuery, 0.4, 0.6);
        comparison.methods.HYBRID = hybridResult;
    } catch (error) {
        comparison.methods.HYBRID = { error: error.message };
    }
    
    // 5. Ensemble (USE + TF-IDF + BERT)
    if (bertEmbedding) {
        try {
            const ensembleResult = await searchWithEnsemble(
                useEmbedding, 
                bertEmbedding, 
                searchQuery,
                { use: 0.3, tfidf: 0.3, bert: 0.4 }
            );
            comparison.methods.ENSEMBLE = ensembleResult;
        } catch (error) {
            comparison.methods.ENSEMBLE = { error: error.message };
        }
    }
    
    comparison.totalTime = performance.now() - overallStart;
    
    // 평가 결과 저장
    await saveEvaluationResult(comparison);
    
    console.log('[EVALUATION] ✅ 비교 완료:', comparison);
    return comparison;
}

/**
 * 평가 결과 저장
 */
async function saveEvaluationResult(result) {
    const EVAL_KEY = 'SmartMarkEvaluationResults';
    const stored = await chrome.storage.local.get(EVAL_KEY);
    const history = stored[EVAL_KEY] || [];
    
    history.push(result);
    
    // 최근 100개만 유지
    if (history.length > 100) {
        history.shift();
    }
    
    await chrome.storage.local.set({ [EVAL_KEY]: history });
    console.log(`[EVALUATION] 결과 저장 완료 (총 ${history.length}개)`);
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EVALUATION_MODE,
        searchWithUSEOnly,
        searchWithTFIDFOnly,
        searchWithBERTOnly,
        searchWithHybrid,
        searchWithEnsemble,
        compareAllSearchMethods,
        saveEvaluationResult
    };
}

