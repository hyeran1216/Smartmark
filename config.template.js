// 설정 파일 템플릿
// 이 파일을 config.js로 복사하고 실제 API 키를 입력하세요

const CONFIG = {
    // Gemini API 설정
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
    GEMINI_MODEL: 'gemini-2.5-flash',
    
    // 썸네일 API 설정
    THUMBNAIL_API_URL: 'YOUR_THUMBNAIL_API_URL_HERE',
    
    // 스토리지 키
    STORAGE_KEY: 'SmartMarkSummaries'
};

// 브라우저 환경에서 전역 변수로 설정
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Node.js 환경에서 모듈로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
