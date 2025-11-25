/**
 * SmartMark Evaluation Test Cases
 * 검색 성능 평가를 위한 Ground Truth 데이터
 */

// 테스트 케이스 저장 키
const TEST_CASES_KEY = 'SmartMarkTestCases';

// 기본 테스트 케이스 (사용자가 수정 가능)
const DEFAULT_TEST_CASES = [
    {
        id: 'test_001',
        query: 'postman 사용법',
        relevantBookmarkIds: [250],  // 사용자가 관련 북마크 ID 입력
        description: 'API 테스트 도구 검색',
        expectedTags: ['API', 'testing', 'postman']
    },
    {
        id: 'test_002',
        query: 'intellij 단축키',
        relevantBookmarkIds: [249],
        description: 'IDE 단축키 검색',
        expectedTags: ['IDE', 'shortcuts', 'intellij','mac OS']
    },
    {
        id: 'test_003',
        query: 'GSAP library',
        relevantBookmarkIds: [251],
        description: 'JavaScript 애니메이션 라이브러리',
        expectedTags: ['GSAP', 'animation', 'frontend']
    },
    {
        id: 'test_004',
        query: 'Traditional market safety threats',
        relevantBookmarkIds: [254],
        description: 'Traditional markets face safety threats',
        expectedTags: ['news', 'private', 'threats']
    },
    {
        id: 'test_005',
        query: '키워드 추출 알고리즘 비교 분석',
        relevantBookmarkIds: [248],
        description: '키워드 추출 알고리즘 비교 분석',
        expectedTags: ['keyword extraction', 'algorithm', 'comparison']
    }
];

/**
 * 테스트 케이스 로드
 */
async function loadTestCases() {
    const stored = await chrome.storage.local.get(TEST_CASES_KEY);
    if (stored[TEST_CASES_KEY] && stored[TEST_CASES_KEY].length > 0) {
        return stored[TEST_CASES_KEY];
    }
    return DEFAULT_TEST_CASES;
}

/**
 * 테스트 케이스 저장
 */
async function saveTestCases(testCases) {
    await chrome.storage.local.set({ [TEST_CASES_KEY]: testCases });
    console.log(`[TEST CASES] ${testCases.length}개 저장 완료`);
}

/**
 * 새 테스트 케이스 추가
 */
async function addTestCase(testCase) {
    const testCases = await loadTestCases();
    testCase.id = `test_${Date.now()}`;
    testCases.push(testCase);
    await saveTestCases(testCases);
    return testCase;
}

/**
 * 테스트 케이스 삭제
 */
async function deleteTestCase(testId) {
    const testCases = await loadTestCases();
    const filtered = testCases.filter(tc => tc.id !== testId);
    await saveTestCases(filtered);
}

/**
 * 테스트 케이스 내보내기 (JSON)
 */
function exportTestCases(testCases) {
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
 * 테스트 케이스 가져오기 (JSON)
 */
function importTestCases(file) {
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

