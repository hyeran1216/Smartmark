/**
 * SmartMark Evaluation Dashboard
 * 검색 성능 평가 및 시각화
 */

// 현재 가중치 설정
let hybridWeights = { alpha: 0.7, beta: 0.3 };
let ensembleWeights = { use: 0.3, tfidf: 0.3, bert: 0.4 };

// 평가 결과 저장
let currentEvaluationResults = null;

// 차트 인스턴스
let accuracyChart = null;
let performanceChart = null;

/**
 * 페이지 로드 시 초기화
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[EVAL DASHBOARD] 초기화 시작');
    
    // 이벤트 리스너 등록
    setupEventListeners();
    
    // 테스트 케이스 로드
    await loadAndDisplayTestCases();
    
    // 이전 평가 결과 로드 (있으면)
    await loadPreviousResults();
    
    console.log('[EVAL DASHBOARD] 초기화 완료');
});

/**
 * 모든 이벤트 리스너 설정
 */
function setupEventListeners() {
    // 평가 실행 버튼
    document.getElementById('runSingleBtn').addEventListener('click', runSingleEvaluation);
    document.getElementById('runFullBtn').addEventListener('click', runFullEvaluation);
    document.getElementById('clearResultsBtn').addEventListener('click', clearResults);
    
    // Hybrid 가중치 슬라이더
    document.getElementById('alphaSlider').addEventListener('input', updateHybridWeights);
    document.getElementById('betaSlider').addEventListener('input', updateHybridWeights);
    document.getElementById('applyHybridBtn').addEventListener('click', applyHybridWeights);
    
    // Ensemble 가중치 슬라이더
    document.getElementById('useSlider').addEventListener('input', updateEnsembleWeights);
    document.getElementById('tfidfSlider').addEventListener('input', updateEnsembleWeights);
    document.getElementById('bertSlider').addEventListener('input', updateEnsembleWeights);
    document.getElementById('applyEnsembleBtn').addEventListener('click', applyEnsembleWeights);
    
    // 테스트 케이스 관리 버튼
    document.getElementById('addTestCaseBtn').addEventListener('click', addNewTestCase);
    document.getElementById('exportTestCasesBtn').addEventListener('click', exportTestCasesHandler);
    document.getElementById('importTestCasesBtn').addEventListener('click', importTestCasesHandler);
    document.getElementById('fileInput').addEventListener('change', handleFileImport);
    
    console.log('[EVAL] 모든 이벤트 리스너 등록 완료');
}

/**
 * Hybrid 가중치 업데이트
 */
function updateHybridWeights() {
    const alpha = parseFloat(document.getElementById('alphaSlider').value);
    const beta = 1 - alpha; // 합이 1이 되도록
    
    document.getElementById('alphaValue').textContent = alpha.toFixed(1);
    document.getElementById('betaValue').textContent = beta.toFixed(1);
    document.getElementById('betaSlider').value = beta;
    
    hybridWeights = { alpha, beta };
}

/**
 * Ensemble 가중치 업데이트
 */
function updateEnsembleWeights() {
    let use = parseFloat(document.getElementById('useSlider').value);
    let tfidf = parseFloat(document.getElementById('tfidfSlider').value);
    let bert = parseFloat(document.getElementById('bertSlider').value);
    
    // 합이 1이 되도록 정규화
    const sum = use + tfidf + bert;
    if (sum > 0) {
        use /= sum;
        tfidf /= sum;
        bert /= sum;
    }
    
    document.getElementById('useWeight').textContent = use.toFixed(2);
    document.getElementById('tfidfWeight').textContent = tfidf.toFixed(2);
    document.getElementById('bertWeight').textContent = bert.toFixed(2);
    
    document.getElementById('useSlider').value = use;
    document.getElementById('tfidfSlider').value = tfidf;
    document.getElementById('bertSlider').value = bert;
    
    ensembleWeights = { use, tfidf, bert };
}

/**
 * Hybrid 가중치 적용
 */
function applyHybridWeights() {
    showStatus(`Hybrid 가중치 적용: α=${hybridWeights.alpha.toFixed(2)}, β=${hybridWeights.beta.toFixed(2)}`, 'success');
    console.log('[EVAL] Hybrid weights updated:', hybridWeights);
}

/**
 * Ensemble 가중치 적용
 */
function applyEnsembleWeights() {
    showStatus(`Ensemble 가중치 적용: USE=${ensembleWeights.use.toFixed(2)}, TF-IDF=${ensembleWeights.tfidf.toFixed(2)}, BERT=${ensembleWeights.bert.toFixed(2)}`, 'success');
    console.log('[EVAL] Ensemble weights updated:', ensembleWeights);
}

/**
 * 단일 테스트 실행
 */
async function runSingleEvaluation() {
    const query = document.getElementById('testQuery').value.trim();
    if (!query) {
        showStatus('검색어를 입력해주세요.', 'error');
        return;
    }
    
    showStatus('평가 실행 중...', 'info');
    showProgress(0);
    
    try {
        // USE 임베딩 생성
        showProgress(10);
        const useResponse = await chrome.runtime.sendMessage({
            type: 'GENERATE_EMBEDDING',
            text: query
        });
        const useEmbedding = useResponse?.embedding || useResponse;
        console.log('[EVAL] USE 임베딩:', Array.isArray(useEmbedding) ? `${useEmbedding.length}차원` : typeof useEmbedding);
        
        // BERT 임베딩 생성 (선택적)
        showProgress(30);
        let bertEmbedding = null;
        try {
            const bertResponse = await chrome.runtime.sendMessage({
                type: 'GENERATE_BERT_EMBEDDING',
                text: query
            });
            bertEmbedding = bertResponse?.embedding || bertResponse;
            console.log('[EVAL] BERT 임베딩:', Array.isArray(bertEmbedding) ? `${bertEmbedding.length}차원` : typeof bertEmbedding);
        } catch (e) {
            console.log('[EVAL] BERT 비활성화, USE + TF-IDF만 평가');
        }
        
        // 각 메서드 평가
        showProgress(50);
        const results = await evaluateAllMethods(query, useEmbedding, bertEmbedding, []);
        
        showProgress(90);
        
        // 결과 표시
        displayResults(results);
        showProgress(100);
        
        showStatus(`평가 완료! ${results.length}개 메서드 평가됨`, 'success');
        
        setTimeout(() => {
            hideProgress();
        }, 1000);
        
    } catch (error) {
        console.error('[EVAL ERROR]', error);
        showStatus(`평가 실패: ${error.message}`, 'error');
        hideProgress();
    }
}

/**
 * 전체 테스트 케이스 평가
 */
async function runFullEvaluation() {
    const testCases = await loadTestCases();
    
    if (testCases.length === 0) {
        showStatus('테스트 케이스가 없습니다. 먼저 테스트 케이스를 추가해주세요.', 'error');
        return;
    }
    
    showStatus(`${testCases.length}개 테스트 케이스 평가 시작...`, 'info');
    showProgress(0);
    
    const allResults = [];
    
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const progress = ((i + 1) / testCases.length) * 100;
        showProgress(progress);
        
        try {
            // 임베딩 생성
            const useResponse = await chrome.runtime.sendMessage({
                type: 'GENERATE_EMBEDDING',
                text: testCase.query
            });
            const useEmbedding = useResponse?.embedding || useResponse;
            
            let bertEmbedding = null;
            try {
                const bertResponse = await chrome.runtime.sendMessage({
                    type: 'GENERATE_BERT_EMBEDDING',
                    text: testCase.query
                });
                bertEmbedding = bertResponse?.embedding || bertResponse;
            } catch (e) {
                console.log(`[EVAL] BERT 비활성화 for query: ${testCase.query}`);
            }
            
            // 평가 실행
            const results = await evaluateAllMethods(
                testCase.query,
                useEmbedding,
                bertEmbedding,
                testCase.relevantBookmarkIds
            );
            
            allResults.push({
                testCase: testCase,
                results: results
            });
            
        } catch (error) {
            console.error(`[EVAL] 테스트 케이스 "${testCase.query}" 실패:`, error);
        }
    }
    
    // 개별 결과 및 평균 표시
    displayDetailedResults(allResults);
    
    showStatus(`전체 평가 완료! ${testCases.length}개 테스트 케이스 평가됨`, 'success');
    
    setTimeout(() => {
        hideProgress();
    }, 1000);
}

/**
 * 모든 검색 메서드 평가
 */
async function evaluateAllMethods(query, useEmbedding, bertEmbedding, relevantIds) {
    const results = [];
    
    console.log(`[EVAL] 평가 시작: "${query}"`);
    console.log(`[EVAL] USE 임베딩:`, Array.isArray(useEmbedding) ? `${useEmbedding.length}차원` : typeof useEmbedding);
    console.log(`[EVAL] BERT 임베딩:`, bertEmbedding ? (Array.isArray(bertEmbedding) ? `${bertEmbedding.length}차원` : typeof bertEmbedding) : 'null');
    console.log(`[EVAL] Ground Truth: ${relevantIds.length}개 관련 북마크`);
    
    // 임베딩 유효성 검사
    if (!Array.isArray(useEmbedding) || useEmbedding.length === 0) {
        console.error('[EVAL] ❌ USE 임베딩이 유효하지 않습니다!', useEmbedding);
        return results;
    }
    
    // 저장된 북마크 확인
    const storageKey = 'SmartMarkSummaries';
    const allSummaries = await chrome.storage.local.get(storageKey);
    const summariesMap = allSummaries[storageKey] || {};
    const bookmarkCount = Object.keys(summariesMap).length;
    const embeddingsCount = Object.values(summariesMap).filter(s => s && s.embedding).length;
    console.log(`[EVAL] 저장된 북마크: ${bookmarkCount}개, 임베딩 있음: ${embeddingsCount}개`);
    
    if (embeddingsCount === 0) {
        console.error('[EVAL] ❌ 저장된 임베딩이 없습니다! 먼저 북마크를 저장하세요.');
        return results;
    }
    
    // 1. USE Only
    try {
        const useResult = await searchWithUSEOnly(useEmbedding, 0.3);
        const metrics = calculateMetrics(useResult.results, relevantIds);
        results.push({
            method: 'USE',
            ...metrics,
            responseTime: useResult.responseTime,
            resultCount: useResult.resultCount
        });
    } catch (e) {
        console.error('[EVAL] USE 평가 실패:', e);
    }
    
    // 2. TF-IDF Only
    try {
        const tfidfResult = await searchWithTFIDFOnly(query, 0.3);
        const metrics = calculateMetrics(tfidfResult.results, relevantIds);
        results.push({
            method: 'TF-IDF',
            ...metrics,
            responseTime: tfidfResult.responseTime,
            resultCount: tfidfResult.resultCount
        });
    } catch (e) {
        console.error('[EVAL] TF-IDF 평가 실패:', e);
    }
    
    // 3. BERT Only (있으면)
    if (bertEmbedding) {
        try {
            const bertResult = await searchWithBERTOnly(bertEmbedding, 0.3);
            const metrics = calculateMetrics(bertResult.results, relevantIds);
            results.push({
                method: 'BERT',
                ...metrics,
                responseTime: bertResult.responseTime,
                resultCount: bertResult.resultCount
            });
        } catch (e) {
            console.error('[EVAL] BERT 평가 실패:', e);
        }
    }
    
    // 4. Hybrid (USE + TF-IDF)
    try {
        const hybridResult = await searchWithHybrid(
            useEmbedding,
            query,
            hybridWeights.alpha,
            hybridWeights.beta,
            0.3
        );
        const metrics = calculateMetrics(hybridResult.results, relevantIds);
        results.push({
            method: 'Hybrid',
            ...metrics,
            responseTime: hybridResult.responseTime,
            resultCount: hybridResult.resultCount,
            weights: hybridResult.weights
        });
    } catch (e) {
        console.error('[EVAL] Hybrid 평가 실패:', e);
    }
    
    // 5. Ensemble (있으면)
    if (bertEmbedding) {
        try {
            const ensembleResult = await searchWithEnsemble(
                useEmbedding,
                bertEmbedding,
                query,
                ensembleWeights,
                0.3
            );
            const metrics = calculateMetrics(ensembleResult.results, relevantIds);
            results.push({
                method: 'Ensemble',
                ...metrics,
                responseTime: ensembleResult.responseTime,
                resultCount: ensembleResult.resultCount,
                weights: ensembleResult.weights
            });
        } catch (e) {
            console.error('[EVAL] Ensemble 평가 실패:', e);
        }
    }
    
    console.log(`[EVAL] 평가 완료: ${results.length}개 메서드`);
    
    return results;
}

/**
 * 평가 지표 계산
 */
function calculateMetrics(searchResults, relevantIds) {
    const retrievedIds = searchResults.map(r => r.id);
    
    console.log('[METRICS] 검색 결과 ID:', retrievedIds.slice(0, 3), '(타입:', typeof retrievedIds[0], ')');
    console.log('[METRICS] Ground Truth ID:', relevantIds, '(타입:', typeof relevantIds[0], ')');
    
    // Ground Truth가 없으면 유사도만 계산
    if (!relevantIds || relevantIds.length === 0) {
        const avgSimilarity = searchResults.length > 0
            ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
            : 0;
        
        return {
            precision: null,
            recall: null,
            f1Score: null,
            avgSimilarity: avgSimilarity
        };
    }
    
    // ID 타입 통일 (모두 문자열로 변환)
    const retrievedIdsStr = retrievedIds.map(id => String(id));
    const relevantIdsStr = relevantIds.map(id => String(id));
    
    console.log('[METRICS] 변환된 검색 결과 ID:', retrievedIdsStr.slice(0, 3));
    console.log('[METRICS] 변환된 Ground Truth ID:', relevantIdsStr);
    
    // True Positives: 검색됨 & 관련있음
    const truePositives = retrievedIdsStr.filter(id => relevantIdsStr.includes(id)).length;
    console.log('[METRICS] True Positives:', truePositives);
    
    // Precision: 검색된 것 중 관련있는 비율
    const precision = retrievedIdsStr.length > 0 ? truePositives / retrievedIdsStr.length : 0;
    
    // Recall: 관련있는 것 중 검색된 비율
    const recall = relevantIdsStr.length > 0 ? truePositives / relevantIdsStr.length : 0;
    
    // F1 Score: Precision과 Recall의 조화 평균
    const f1Score = (precision + recall) > 0
        ? 2 * (precision * recall) / (precision + recall)
        : 0;
    
    // 평균 유사도
    const avgSimilarity = searchResults.length > 0
        ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
        : 0;
    
    console.log(`[METRICS] P=${(precision*100).toFixed(1)}%, R=${(recall*100).toFixed(1)}%, F1=${(f1Score*100).toFixed(1)}%, Sim=${(avgSimilarity*100).toFixed(1)}%`);
    console.log(`[METRICS] 검색 결과: ${retrievedIdsStr.length}개, Ground Truth: ${relevantIdsStr.length}개, TP: ${truePositives}개`);
    
    return {
        precision: precision,
        recall: recall,
        f1Score: f1Score,
        avgSimilarity: avgSimilarity,
        truePositives: truePositives,
        retrievedCount: retrievedIdsStr.length,
        relevantCount: relevantIdsStr.length
    };
}

/**
 * 여러 테스트 케이스 결과 집계
 */
function aggregateResults(allResults) {
    const methodsMap = {};
    
    // 메서드별로 결과 수집
    allResults.forEach(testResult => {
        testResult.results.forEach(methodResult => {
            if (!methodsMap[methodResult.method]) {
                methodsMap[methodResult.method] = [];
            }
            methodsMap[methodResult.method].push(methodResult);
        });
    });
    
    // 평균 계산
    const aggregated = [];
    Object.keys(methodsMap).forEach(method => {
        const results = methodsMap[method];
        const count = results.length;
        
        aggregated.push({
            method: method,
            precision: avg(results.map(r => r.precision)),
            recall: avg(results.map(r => r.recall)),
            f1Score: avg(results.map(r => r.f1Score)),
            avgSimilarity: avg(results.map(r => r.avgSimilarity)),
            responseTime: avg(results.map(r => r.responseTime)),
            resultCount: Math.round(avg(results.map(r => r.resultCount))),
            testCaseCount: count
        });
    });
    
    return aggregated;
}

/**
 * 평균 계산 (null 제외)
 */
function avg(arr) {
    const validValues = arr.filter(v => v !== null && !isNaN(v));
    if (validValues.length === 0) return null;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
}

/**
 * 결과 표시
 */
function displayResults(results) {
    currentEvaluationResults = results;
    
    // 평균 메트릭 카드 업데이트
    updateMetricCards(results);
    
    // 테이블 업데이트
    updateComparisonTable(results);
    
    // 차트 업데이트
    updateCharts(results);
}

/**
 * 상세 결과 표시 (테스트케이스별)
 */
function displayDetailedResults(allResults) {
    // 평균 계산
    const aggregatedResults = aggregateResults(allResults);
    
    // 평균 메트릭 카드 업데이트
    updateMetricCards(aggregatedResults);
    
    // 테이블 업데이트 (테스트케이스별 상세)
    updateDetailedComparisonTable(allResults);
    
    // 차트는 평균으로 표시
    updateCharts(aggregatedResults);
    
    currentEvaluationResults = allResults;
}

/**
 * 메트릭 카드 업데이트
 */
function updateMetricCards(results) {
    const avgPrecision = avg(results.map(r => r.precision));
    const avgRecall = avg(results.map(r => r.recall));
    const avgF1 = avg(results.map(r => r.f1Score));
    const avgSim = avg(results.map(r => r.avgSimilarity));
    const avgTime = avg(results.map(r => r.responseTime));
    
    document.getElementById('avgPrecision').innerHTML = 
        avgPrecision !== null ? `${(avgPrecision * 100).toFixed(1)}<span class="metric-unit">%</span>` : '-';
    document.getElementById('avgRecall').innerHTML = 
        avgRecall !== null ? `${(avgRecall * 100).toFixed(1)}<span class="metric-unit">%</span>` : '-';
    document.getElementById('avgF1').innerHTML = 
        avgF1 !== null ? `${(avgF1 * 100).toFixed(1)}<span class="metric-unit">%</span>` : '-';
    document.getElementById('avgSimilarity').innerHTML = 
        avgSim !== null ? `${(avgSim * 100).toFixed(1)}<span class="metric-unit">%</span>` : '-';
    document.getElementById('avgTime').innerHTML = 
        avgTime !== null ? `${avgTime.toFixed(0)}<span class="metric-unit">ms</span>` : '-';
}

/**
 * 비교 테이블 업데이트
 */
function updateComparisonTable(results) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    // 최고 점수 찾기
    const bestPrecision = Math.max(...results.map(r => r.precision || 0));
    const bestRecall = Math.max(...results.map(r => r.recall || 0));
    const bestF1 = Math.max(...results.map(r => r.f1Score || 0));
    const bestSim = Math.max(...results.map(r => r.avgSimilarity || 0));
    const bestTime = Math.min(...results.map(r => r.responseTime));
    
    results.forEach(result => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td><span class="method-badge method-${result.method}">${result.method}</span></td>
            <td class="${result.precision === bestPrecision ? 'best-score' : ''}">
                ${result.precision !== null ? (result.precision * 100).toFixed(1) : 'N/A'}
            </td>
            <td class="${result.recall === bestRecall ? 'best-score' : ''}">
                ${result.recall !== null ? (result.recall * 100).toFixed(1) : 'N/A'}
            </td>
            <td class="${result.f1Score === bestF1 ? 'best-score' : ''}">
                ${result.f1Score !== null ? (result.f1Score * 100).toFixed(1) : 'N/A'}
            </td>
            <td class="${result.avgSimilarity === bestSim ? 'best-score' : ''}">
                ${(result.avgSimilarity * 100).toFixed(1)}
            </td>
            <td class="${result.responseTime === bestTime ? 'best-score' : ''}">
                ${result.responseTime.toFixed(0)}
            </td>
            <td>${result.resultCount}</td>
        `;
        
        tbody.appendChild(row);
    });
}

/**
 * 상세 비교 테이블 업데이트 (테스트케이스별)
 */
function updateDetailedComparisonTable(allResults) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    allResults.forEach((testResult, testIndex) => {
        const testCase = testResult.testCase;
        const results = testResult.results;
        
        // 테스트케이스별 최고 점수 찾기
        const bestPrecision = Math.max(...results.map(r => r.precision || 0));
        const bestRecall = Math.max(...results.map(r => r.recall || 0));
        const bestF1 = Math.max(...results.map(r => r.f1Score || 0));
        const bestSim = Math.max(...results.map(r => r.avgSimilarity || 0));
        const bestTime = Math.min(...results.map(r => r.responseTime));
        
        // 테스트케이스 헤더 행
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = '#f0f0f0';
        headerRow.style.fontWeight = 'bold';
        headerRow.innerHTML = `
            <td colspan="7" style="padding: 15px; border-top: 2px solid #667eea;">
                📋 Test Case ${testIndex + 1}: "${testCase.query}"
                <span style="color: #666; font-size: 0.9em; font-weight: normal; margin-left: 10px;">
                    (Ground Truth: ${testCase.relevantBookmarkIds.length}개 북마크)
                </span>
            </td>
        `;
        tbody.appendChild(headerRow);
        
        // 각 메서드 결과 행
        results.forEach(result => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td style="padding-left: 20px;">
                    <span class="method-badge method-${result.method}">${result.method}</span>
                </td>
                <td class="${result.precision === bestPrecision && result.precision > 0 ? 'best-score' : ''}">
                    ${result.precision !== null ? (result.precision * 100).toFixed(1) : 'N/A'}
                </td>
                <td class="${result.recall === bestRecall && result.recall > 0 ? 'best-score' : ''}">
                    ${result.recall !== null ? (result.recall * 100).toFixed(1) : 'N/A'}
                </td>
                <td class="${result.f1Score === bestF1 && result.f1Score > 0 ? 'best-score' : ''}">
                    ${result.f1Score !== null ? (result.f1Score * 100).toFixed(1) : 'N/A'}
                </td>
                <td class="${result.avgSimilarity === bestSim ? 'best-score' : ''}">
                    ${(result.avgSimilarity * 100).toFixed(1)}
                </td>
                <td class="${result.responseTime === bestTime ? 'best-score' : ''}">
                    ${result.responseTime.toFixed(0)}
                </td>
                <td>${result.resultCount}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // 구분선 추가 (마지막 테스트케이스 제외)
        if (testIndex < allResults.length - 1) {
            const spacerRow = document.createElement('tr');
            spacerRow.innerHTML = '<td colspan="7" style="height: 10px;"></td>';
            tbody.appendChild(spacerRow);
        }
    });
}

/**
 * 차트 업데이트
 */
function updateCharts(results) {
    updateAccuracyChart(results);
    updatePerformanceChart(results);
}

/**
 * 정확도 차트 업데이트
 */
function updateAccuracyChart(results) {
    const ctx = document.getElementById('accuracyChart');
    
    if (accuracyChart) {
        accuracyChart.destroy();
    }
    
    const labels = results.map(r => r.method);
    const precisionData = results.map(r => r.precision !== null ? (r.precision * 100).toFixed(1) : 0);
    const recallData = results.map(r => r.recall !== null ? (r.recall * 100).toFixed(1) : 0);
    const f1Data = results.map(r => r.f1Score !== null ? (r.f1Score * 100).toFixed(1) : 0);
    const simData = results.map(r => (r.avgSimilarity * 100).toFixed(1));
    
    accuracyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Precision (%)',
                    data: precisionData,
                    backgroundColor: 'rgba(102, 126, 234, 0.7)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Recall (%)',
                    data: recallData,
                    backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    borderColor: 'rgba(118, 75, 162, 1)',
                    borderWidth: 2
                },
                {
                    label: 'F1 Score (%)',
                    data: f1Data,
                    backgroundColor: 'rgba(56, 142, 60, 0.7)',
                    borderColor: 'rgba(56, 142, 60, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Avg Similarity (%)',
                    data: simData,
                    backgroundColor: 'rgba(245, 124, 0, 0.7)',
                    borderColor: 'rgba(245, 124, 0, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Score (%)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
}

/**
 * 성능 차트 업데이트
 */
function updatePerformanceChart(results) {
    const ctx = document.getElementById('performanceChart');
    
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    const labels = results.map(r => r.method);
    const timeData = results.map(r => r.responseTime.toFixed(0));
    const countData = results.map(r => r.resultCount);
    
    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Response Time (ms)',
                    data: timeData,
                    backgroundColor: 'rgba(244, 67, 54, 0.7)',
                    borderColor: 'rgba(244, 67, 54, 1)',
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Results Count',
                    data: countData,
                    backgroundColor: 'rgba(33, 150, 243, 0.7)',
                    borderColor: 'rgba(33, 150, 243, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Response Time (ms)'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Results Count'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
}

/**
 * 테스트 케이스 로드 및 표시
 */
async function loadAndDisplayTestCases() {
    const testCases = await loadTestCases();
    const container = document.getElementById('testCasesList');
    
    if (testCases.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">테스트 케이스가 없습니다. "Add New Test Case" 버튼을 눌러 추가하세요.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    testCases.forEach((testCase, index) => {
        const div = document.createElement('div');
        div.className = 'test-case-item';
        
        div.innerHTML = `
            <div class="test-case-info">
                <div class="test-case-query">${index + 1}. ${testCase.query}</div>
                <div class="test-case-desc">
                    ${testCase.description || 'No description'} 
                    | Ground Truth: ${testCase.relevantBookmarkIds.length}개 북마크
                </div>
            </div>
            <div class="test-case-actions">
                <button class="secondary" data-action="edit" data-id="${testCase.id}">✏️ Edit</button>
                <button class="danger" data-action="delete" data-id="${testCase.id}">🗑️ Delete</button>
            </div>
        `;
        
        // 이벤트 리스너 추가
        const editBtn = div.querySelector('[data-action="edit"]');
        const deleteBtn = div.querySelector('[data-action="delete"]');
        
        editBtn.addEventListener('click', () => editTestCase(testCase.id));
        deleteBtn.addEventListener('click', () => removeTestCase(testCase.id));
        
        container.appendChild(div);
    });
}

/**
 * 새 테스트 케이스 추가
 */
async function addNewTestCase() {
    const query = prompt('검색어를 입력하세요:');
    if (!query) return;
    
    const description = prompt('설명을 입력하세요 (선택):');
    const bookmarkIds = prompt('관련 북마크 ID를 쉼표로 구분하여 입력하세요 (예: 231,245,312):');
    
    const relevantIds = bookmarkIds ? bookmarkIds.split(',').map(id => id.trim()) : [];
    
    const testCase = await addTestCase({
        query: query,
        description: description || '',
        relevantBookmarkIds: relevantIds
    });
    
    showStatus(`테스트 케이스 "${query}" 추가됨`, 'success');
    await loadAndDisplayTestCases();
}

/**
 * 테스트 케이스 편집
 */
async function editTestCase(testId) {
    const testCases = await loadTestCases();
    const testCase = testCases.find(tc => tc.id === testId);
    
    if (!testCase) {
        showStatus('테스트 케이스를 찾을 수 없습니다.', 'error');
        return;
    }
    
    const query = prompt('검색어:', testCase.query);
    if (query === null) return; // 취소
    
    const description = prompt('설명:', testCase.description || '');
    const bookmarkIds = prompt('관련 북마크 ID (쉼표로 구분):', testCase.relevantBookmarkIds.join(','));
    
    testCase.query = query;
    testCase.description = description || '';
    testCase.relevantBookmarkIds = bookmarkIds ? bookmarkIds.split(',').map(id => id.trim()) : [];
    
    await saveTestCases(testCases);
    showStatus('테스트 케이스 수정됨', 'success');
    await loadAndDisplayTestCases();
}

/**
 * 테스트 케이스 삭제
 */
async function removeTestCase(testId) {
    if (!confirm('이 테스트 케이스를 삭제하시겠습니까?')) return;
    
    await deleteTestCase(testId);
    showStatus('테스트 케이스 삭제됨', 'success');
    await loadAndDisplayTestCases();
}

/**
 * 테스트 케이스 내보내기
 */
async function exportTestCasesHandler() {
    const testCases = await loadTestCases();
    exportTestCasesFile(testCases);
    showStatus('테스트 케이스 내보내기 완료', 'success');
}

/**
 * 테스트 케이스 가져오기
 */
function importTestCasesHandler() {
    document.getElementById('fileInput').click();
}

/**
 * 테스트 케이스 파일로 내보내기
 */
function exportTestCasesFile(testCases) {
    const dataStr = JSON.stringify(testCases, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartmark-test-cases-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 파일 가져오기 처리
 */
async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const testCases = await importTestCasesFromFile(file);
        showStatus(`${testCases.length}개 테스트 케이스 가져오기 완료`, 'success');
        await loadAndDisplayTestCases();
    } catch (error) {
        showStatus(`가져오기 실패: ${error.message}`, 'error');
    }
}

/**
 * 파일에서 테스트 케이스 가져오기
 */
function importTestCasesFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const testCases = JSON.parse(e.target.result);
                await saveTestCases(testCases);
                resolve(testCases);
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsText(file);
    });
}

/**
 * 결과 초기화
 */
function clearResults() {
    if (!confirm('모든 평가 결과를 초기화하시겠습니까?')) return;
    
    currentEvaluationResults = null;
    
    document.getElementById('avgPrecision').innerHTML = '-';
    document.getElementById('avgRecall').innerHTML = '-';
    document.getElementById('avgF1').innerHTML = '-';
    document.getElementById('avgSimilarity').innerHTML = '-';
    document.getElementById('avgTime').innerHTML = '-';
    
    document.getElementById('tableBody').innerHTML = 
        '<tr><td colspan="7" style="text-align: center; color: #999;">평가를 실행하면 결과가 여기에 표시됩니다.</td></tr>';
    
    if (accuracyChart) accuracyChart.destroy();
    if (performanceChart) performanceChart.destroy();
    
    showStatus('결과가 초기화되었습니다.', 'success');
}

/**
 * 이전 평가 결과 로드
 */
async function loadPreviousResults() {
    // 구현 예정: 마지막 평가 결과를 로컬 스토리지에서 로드
}

/**
 * 상태 메시지 표시
 */
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message status-${type}`;
    statusDiv.style.display = 'block';
}

/**
 * 진행률 표시
 */
function showProgress(percent) {
    const progressDiv = document.getElementById('evaluationProgress');
    const progressFill = document.getElementById('progressFill');
    
    progressDiv.style.display = 'block';
    progressFill.style.width = `${percent}%`;
    progressFill.textContent = `${Math.round(percent)}%`;
}

/**
 * 진행률 숨기기
 */
function hideProgress() {
    document.getElementById('evaluationProgress').style.display = 'none';
}

// Chart.js 간단 구현 (CDN 없이)
class Chart {
    constructor(ctx, config) {
        this.ctx = ctx.getContext('2d');
        this.config = config;
        this.draw();
    }
    
    draw() {
        const canvas = this.ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        
        this.ctx.clearRect(0, 0, width, height);
        
        if (this.config.type === 'bar') {
            this.drawBarChart(width, height);
        }
    }
    
    drawBarChart(width, height) {
        const data = this.config.data;
        const labels = data.labels;
        const datasets = data.datasets;
        
        const padding = 60;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        const barWidth = chartWidth / (labels.length * datasets.length + labels.length);
        const maxValue = this.config.options.scales?.y?.max || 100;
        
        // 배경
        this.ctx.fillStyle = '#f8f9fa';
        this.ctx.fillRect(0, 0, width, height);
        
        // 그리드
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(width - padding, y);
            this.ctx.stroke();
        }
        
        // 바 그리기
        labels.forEach((label, i) => {
            const x = padding + (barWidth * datasets.length + barWidth) * i;
            
            datasets.forEach((dataset, j) => {
                const value = parseFloat(dataset.data[i]);
                const barHeight = (value / maxValue) * chartHeight;
                const barX = x + barWidth * j;
                const barY = padding + chartHeight - barHeight;
                
                this.ctx.fillStyle = dataset.backgroundColor;
                this.ctx.fillRect(barX, barY, barWidth * 0.8, barHeight);
            });
            
            // 라벨
            this.ctx.fillStyle = '#333';
            this.ctx.font = '12px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(label, x + barWidth * datasets.length / 2, height - padding + 20);
        });
        
        // 범례
        let legendX = padding;
        const legendY = 20;
        datasets.forEach((dataset, i) => {
            this.ctx.fillStyle = dataset.backgroundColor;
            this.ctx.fillRect(legendX, legendY, 15, 15);
            
            this.ctx.fillStyle = '#333';
            this.ctx.font = '12px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(dataset.label, legendX + 20, legendY + 12);
            
            legendX += 150;
        });
    }
    
    destroy() {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

