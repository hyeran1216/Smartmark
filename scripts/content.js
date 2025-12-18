// 배경 스크립트에서 메시지를 받으면 실행됩니다.
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action === "getPageContent") {
            try {
                // <script>나 <style> 태그를 제외한 body의 모든 텍스트를 가져옵니다.
                // 더 정확한 추출을 위해 DOM 파싱을 수행합니다.
                const body = document.body;
                
                // 가시적인 텍스트만 추출하는 함수
                function getVisibleText(element) {
                    let text = '';
                    
                    // 무시할 태그 목록 (헤더, 푸터, 내비게이션, 광고 등)
                    const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM'];
                    if (element.nodeType === 3) { // 텍스트 노드
                        text += element.nodeValue;
                    } else if (element.nodeType === 1 && !IGNORE_TAGS.includes(element.tagName)) {
                        for (const child of element.childNodes) {
                            text += getVisibleText(child) + ' ';
                        }
                    }
                    return text.replace(/\s\s+/g, ' ').trim(); // 연속된 공백 제거
                }
                
                const pageContent = getVisibleText(body);

                sendResponse({ success: true, content: pageContent });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
            return true; // 비동기 응답을 위해 true 반환
        }
    }
);