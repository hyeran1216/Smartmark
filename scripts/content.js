// 배경 스크립트에서 메시지를 받으면 실행됩니다.
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.action === "getPageContent") {
            try {
                const body = document.body;
                function getVisibleText(element) {
                    let text = '';
                    const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM'];
                    if (element.nodeType === 3) { // 텍스트 노드
                        text += element.nodeValue;
                    } else if (element.nodeType === 1 && !IGNORE_TAGS.includes(element.tagName)) {
                        for (const child of element.childNodes) {
                            text += getVisibleText(child) + ' ';
                        }
                    }
                    return text.replace(/\s\s+/g, ' ').trim();
                }
                const pageContent = getVisibleText(body);
                sendResponse({ success: true, content: pageContent });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
            return true;
        }

        // --- NEW: Handle Async Summarization in Content Script ---
        if (request.action === "TRIGGER_SUMMARIZATION") {
            const { bookmarkId, title, url, folderName, thumbnailUrl } = request;
            console.log('[CONTENT] Triggered AI Summarization for:', bookmarkId);

            (async () => {
                try {
                    // 1. Check window.ai
                    const ai = window.ai;
                    if (!ai || !ai.summarizer) {
                        console.warn('[CONTENT] window.ai not found.');
                        throw new Error('AI_UNAVAILABLE');
                    }

                    const capabilities = await ai.summarizer.capabilities();
                    if (capabilities.available === 'no') {
                        console.warn('[CONTENT] window.ai available === no');
                        throw new Error('AI_UNAVAILABLE');
                    }

                    // 2. Extract Content
                    const body = document.body;
                    function getVisibleText(element) { // Duplicate for now to keep self-contained
                        let text = '';
                        const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM'];
                        if (element.nodeType === 3) text += element.nodeValue;
                        else if (element.nodeType === 1 && !IGNORE_TAGS.includes(element.tagName)) {
                            for (const child of element.childNodes) text += getVisibleText(child) + ' ';
                        }
                        return text.replace(/\s\s+/g, ' ').trim();
                    }
                    const text = getVisibleText(body).substring(0, 10000); // Limit context

                    // 3. Summarize
                    console.log('[CONTENT] Creating summarizer session...');
                    const session = await ai.summarizer.create({ type: 'key-points', length: 'medium', format: 'plain-text' });

                    if (capabilities.available === 'after-download') {
                        console.log('[CONTENT] Waiting for model download...');
                        await session.ready;
                    }

                    console.log('[CONTENT] Generating summary...');
                    const summary = await session.summarize(text);
                    session.destroy();

                    console.log('[CONTENT] Summary generated:', summary.substring(0, 50));

                    // 4. Report Success to Background
                    chrome.runtime.sendMessage({
                        type: 'UPDATE_BOOKMARK_SUMMARY',
                        bookmarkId: bookmarkId,
                        summary: summary,
                        keySnippet: "Generated on-device via Chrome AI",
                        title: title,
                        folderName: folderName,
                        thumbnailUrl: thumbnailUrl,
                        url: url
                    });

                } catch (error) {
                    console.warn('[CONTENT] Summarization failed:', error.message);
                    // 5. Report Failure (Fallback to Background Cloud)
                    chrome.runtime.sendMessage({
                        type: 'AI_UNAVAILABLE_FALLBACK',
                        error: error.message,
                        bookmarkId: bookmarkId,
                        title: title,
                        url: url,
                        folderName: folderName,
                        thumbnailUrl: thumbnailUrl
                    });
                }
            })();

            sendResponse({ received: true }); // Ack immediately
            return true;
        }
    }
);