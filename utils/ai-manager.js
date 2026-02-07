export class AIManager {
    constructor() {
        this.capabilities = null;
        this.summarizer = null;
    }

    /**
     * Check if on-device summarization is available
     */
    async checkAvailability() {
        try {
            if (typeof Summarizer === 'undefined') {
                console.log('[AI Manager] Global Summarizer object not found');
                return false;
            }
            return true;
        } catch (e) {
            console.warn('[AI Manager] Availability check failed:', e);
            return false;
        }
    }

    /**
     * Generate a summary for the given text
     * @param {string} text - Content to summarize
     * @param {object} options - Options (type, format, length)
     */
    async summarize(text, options = {}) {
        if (options.forceCloud) {
            console.log('[AI Manager] forceCloud requested. Skipping local model.');
            return await this.summarizeWithCloud(text, options);
        }

        try {
            const isAvailable = await this.checkAvailability();
            if (isAvailable) {
                return await this.summarizeLocal(text, options);
            } else {
                console.log('[AI Manager] On-device AI not available. Falling back to Cloud API.');
            }
        } catch (localError) {
            console.warn('[AI Manager] Local summarization failed. Falling back to Cloud API:', localError);
        }

        try {
            return await this.summarizeWithCloud(text, options);
        } catch (cloudError) {
            console.error('[AI Manager] Cloud summarization also failed:', cloudError);
            throw new Error('All summarization attempts failed.');
        }
    }

    /**
     * Execute local summarization (Nano)
     */
    async summarizeLocal(text, options) {
        let summarizer = null;
        try {
            const sessionOptions = {
                type: options.type || 'tldr',
                format: options.format || 'plain-text',
                length: options.length || 'short',
                outputLanguage: 'en',
            };

            console.log('[AI Manager] Creating Local Summarizer Session...', sessionOptions);
            summarizer = await Summarizer.create(sessionOptions);
            await summarizer.ready;

            console.log('[AI Manager] Generating Local Summary...');
            const truncatedText = text.length > 4000 ? text.substring(0, 4000) : text;
            const result = await summarizer.summarize(truncatedText);
            return result;
        } finally {
            if (summarizer) summarizer.destroy();
        }
    }

    /**
     * Execute cloud summarization (Gemini API)
     */
    async summarizeWithCloud(text, options) {
        if (!window.CONFIG || !window.CONFIG.GEMINI_API_KEY) {
            throw new Error('Gemini API Key is missing in config.js');
        }

        console.log('[AI Manager] Requesting Cloud Summary...');
        const apiKey = window.CONFIG.GEMINI_API_KEY;
        const targetLang = window.CONFIG.TARGET_LANGUAGE === 'ko' ? 'Korean' : 'English';

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const prompt = `Summarize the following text in ${targetLang}. 
        Format: ${options.format || 'plain text'}. 
        Style: ${options.type || 'TL;DR'}. 
        Length: ${options.length || 'short'}.
        
        Text:
        ${text}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Cloud API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!summary) throw new Error('Cloud API returned empty summary');

        console.log('[AI Manager] Cloud Summary generated successfully');
        return summary.trim();
    }
    /**
     * Translate text using Chrome's Translator API or Cloud Fallback
     * @param {string} text - Text to translate
     * @param {string} targetLang - Target language code (default: from config)
     */
    async translate(text, targetLang) {
        if (!targetLang && window.CONFIG) {
            targetLang = window.CONFIG.TARGET_LANGUAGE || 'en';
        }
        targetLang = targetLang || 'en';

        try {
            if (typeof Translator !== 'undefined') {
                const translator = await Translator.create({
                    sourceLanguage: 'en',
                    targetLanguage: targetLang,
                });
                console.log('[AI Manager] Translating with on-device model...');
                const result = await translator.translate(text);
                return result;
            } else {
                console.log('[AI Manager] Translator API not available. Using Cloud fallback.');
            }
        } catch (localError) {
            console.warn('[AI Manager] On-device translation failed:', localError);
        }

        return await this.translateWithCloud(text, targetLang);
    }

    async translateWithCloud(text, targetLang) {
        if (!window.CONFIG || !window.CONFIG.GEMINI_API_KEY) {
            return text; // Return original if no key
        }

        console.log('[AI Manager] Translating with Cloud API...');
        const apiKey = window.CONFIG.GEMINI_API_KEY;
        const langName = targetLang === 'ko' ? 'Korean' : 'English';

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const prompt = `Translate the following text to ${langName}.\n\nText:\n${text}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await response.json();
            const translated = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return translated ? translated.trim() : text;
        } catch (e) {
            console.error('[AI Manager] Cloud translation failed:', e);
            return text;
        }
    }
}

export const aiManager = new AIManager();
