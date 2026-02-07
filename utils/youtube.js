/** YouTube URL에서 video ID 추출 */
export function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

/** YouTube URL 여부 확인 */
export function isYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
}

/** executeScript로 주입되어 자막 패널 DOM에서 자막 텍스트 추출 */
export async function extractCaptionFromYouTubePage() {
    try {
        const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (transcriptSegments.length > 0) {
            const captionTexts = Array.from(transcriptSegments)
                .map(segment => {
                    const segmentText = segment.querySelector('.segment-text');
                    if (segmentText) return segmentText.textContent || segmentText.innerText || '';
                    return segment.textContent || segment.innerText || '';
                })
                .filter(text => text.trim().length > 0)
                .join(' ');
            if (captionTexts.trim()) return captionTexts.trim();
        }
        return "";
    } catch (error) {
        return "";
    }
}

/** YouTube 페이지에서 자막 추출 (content script 호출) */
export async function extractYouTubeCaptionFromPage(videoId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return "";
    const tabId = tabs[0].id;
    if (!tabs[0].url.includes('youtube.com')) return "";
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractCaptionFromYouTubePage
        });
        if (results?.[0]?.result) return results[0].result;
        return "";
    } catch (error) {
        return "";
    }
}

/** YouTube 자막 텍스트 조회 (패널 열림 필요) */
export async function getYouTubeCaptionText(videoId) {
    const captionText = await extractYouTubeCaptionFromPage(videoId);
    if (captionText && captionText.trim()) return captionText;
    throw new Error("YouTube 자막을 찾을 수 없습니다. 자막 패널이 열려있는지 확인해주세요.");
}
