/** 확장 페이지/팝업에서 사용할 스토리지 키 (CONFIG 또는 기본값) */
export function getStorageKey() {
    if (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.STORAGE_KEY) {
        return window.CONFIG.STORAGE_KEY;
    }
    if (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEY) {
        return CONFIG.STORAGE_KEY;
    }
    return 'SmartMarkSummaries';
}
