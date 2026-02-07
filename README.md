# SmartMark - AI-Powered Bookmarking Extension

SmartMark is a Chrome Extension that automatically summarizes the page content when you save a bookmark, using on-device AI (Gemini Nano) with a Cloud fallback.

## 🚀 Key Features
- **AI Summarization**: Automatically generates concise summaries of web pages.
- **YouTube Support**: Extracts transcripts (requires manual panel open) and generates video summaries.
- **Smart Search**: Semantic search using BERT embeddings and Keyword search using TF-IDF.
- **Privacy First**: Attempts to use on-device Gemini Nano first; only uses Cloud API if local AI fails or for complex tasks (like full YouTube videos).

## 🛠️ Configuration & Setup

### 1. File Configuration (`config.js`)
You must create/update `config.js` in the root directory with your API key:
```javascript
window.CONFIG = {
    GEMINI_API_KEY: "YOUR_GOOGLE_GEMINI_API_KEY",
    STORAGE_KEY: "SmartMarkSummaries",
    TARGET_LANGUAGE: "ko" // 'ko' for Korean, 'en' for English
};
```

### 2. Gemini Nano Setup (Experimental)
This extension uses Chrome's built-in AI (Gemini Nano).
1.  Go to `chrome://flags`
2.  Enable **"Prompt API for Gemini Nano"**
3.  Enable **"Optimization Guide On Device Model"**
4.  Restart Chrome.
5.  Go to `chrome://components` and check for updates on **"Optimization Guide On Device Model"** to ensure the model is downloaded.

### 3. YouTube Summarization
*   **Important**: For YouTube videos, you must **OPEN the Transcript Panel ("스크립트 표시")** manually before clicking the "Save" button in the extension.
*   If the panel is closed, the extension will alert you.

## 📦 Usage
1.  Navigate to any webpage.
2.  Click the SmartMark extension icon.
3.  Select a folder (optional) and click **"Save"**.
4.  The extension will:
    *   Summarize the content (Nano -> Cloud fallback).
    *   Save the bookmark.
    *   Generate searchable embeddings in the background.

## 🔍 Search
*   Click the **"Search"** tab in the popup.
*   Type a query (e.g., "coding interview").
*   It finds bookmarks based on *meaning* (Semantic Search), not just keywords.