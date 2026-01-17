// 설정 파일 예시
// 사용법: 이 파일을 config.js로 복사하고 실제 API 키를 입력하세요
// cp config.example.js config.js

const CONFIG = {
    // Gemini API 설정
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
    GEMINI_MODEL: 'gemini-2.0-flash-exp',
    GEMINI_FALLBACK_MODELS: [
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash',
        'gemini-2.5-flash',          
    ],
    GEMINI_API_ENDPOINTS: [
        'https://generativelanguage.googleapis.com/v1beta',
        'https://generativelanguage.googleapis.com/v1',
    ],
    
    // DeepL 번역 API 설정
    DEEPL_API_KEY: 'YOUR_DEEPL_API_KEY_HERE',
    DEEPL_API_URL: 'https://api-free.deepl.com/v2/translate',
    
    // 썸네일 API 설정 (선택사항)
    THUMBNAIL_API_URL: 'YOUR_CLOUD_FUNCTION_URL_HERE',
    
    // 언어 설정
    TARGET_LANGUAGE: 'ko', // 'ko' (한국어) 또는 'en' (영어)
    
    // 스토리지 키
    STORAGE_KEY: 'SmartMarkSummaries'
};

// 브라우저 환경에서 전역 변수로 설정
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Service Worker 환경에서도 전역 변수로 설정
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.CONFIG = CONFIG;
    var CONFIG_GLOBAL = CONFIG;
}

// Node.js 환경에서 모듈로 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}