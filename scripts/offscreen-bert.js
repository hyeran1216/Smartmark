// Offscreen Document Script for SmartMark
// BERT-only embeddings via @xenova/transformers OR native onnxruntime-web
// Bundled via Webpack/Rollup

// Bundler checks (Webpack/Rollup will resolve these)
import { pipeline as xenovaPipeline, env, AutoTokenizer } from '@xenova/transformers';

// =========================================================================
// Configuration & Runtime State
// =========================================================================

// Runtime Mode: 'xenova' (Dev/Easy) or 'ort' (Prod/Manual Control)
const RUNTIME_MODE = 'ort'; // 'ort' uses onnxruntime-web directly for inference
const MODEL_PATH = '../assets/models/model_quantized.onnx'; // Local INT8 model
const TOKENIZER_PATH = '../assets/models/tokenizer.json';
const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'; // Fallback for Xenova mode

// State
let pipeline = null;      // Xenova Pipeline
let ortSession = null;    // ONNX Runtime Session
let tokenizer = null;     // Tokenizer instance
let isModelLoading = false;
let modelReady = false;

// Configure Xenova Env
env.allowLocalModels = false;
env.useBrowserCache = true;

console.log(`[OFFSCREEN-BERT] Runtime Mode: ${RUNTIME_MODE}`);

// =========================================================================
// Initialization (Lazy Loading)
// =========================================================================

/**
 * Ensures the model is loaded. Called before any embedding operation.
 */
async function ensureModelLoaded() {
    if (modelReady) return true;
    if (isModelLoading) {
        console.log('[OFFSCREEN-BERT] Waiting for model to load...');
        while (isModelLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return modelReady;
    }

    isModelLoading = true;
    const startTime = performance.now();
    notifyBackground({ status: 'loading', message: `BERT Model Loading (${RUNTIME_MODE})...` });

    try {
        if (RUNTIME_MODE === 'ort') {
            await loadOnnxRuntime();
        } else {
            await loadXenovaPipeline();
        }

        modelReady = true;
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`[OFFSCREEN-BERT] ✅ Model Loaded (${elapsed}s)`);
        notifyBackground({ status: 'ready', model: 'BERT', mode: RUNTIME_MODE });
    } catch (error) {
        console.error('[OFFSCREEN-BERT] Model Load Failed:', error);
        notifyBackground({ status: 'error', error: error.message });
        modelReady = false;
    } finally {
        isModelLoading = false;
    }
}

/**
 * Load using Native ONNX Runtime (ort) + Xenova Tokenizer
 */
async function loadOnnxRuntime() {
    console.log('[OFFSCREEN-BERT] Loading Tokenizer (Local)...');
    try {
        // Use AutoTokenizer from Xenova
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME, {
            quantized: false,
            local_files_only: false
        });
        console.log('[OFFSCREEN-BERT] Tokenizer loaded');
    } catch (e) {
        console.error("Tokenizer load failed, trying fallback or network:", e);
        throw e;
    }

    console.log(`[OFFSCREEN-BERT] Loading ONNX Model (Local: ${MODEL_PATH})...`);

    // Check if 'ort' is available
    // Note: 'ort' might be loaded globally via script tag OR imported if we bundle it.
    // Since we are bundling, we *could* import it, but let's assume global script for now 
    // OR allow the bundler to handle it if installed.
    // The user kept 'ort.min.js' in libs. Let's rely on global 'ort' if defined, else throw.
    if (typeof ort === 'undefined') {
        // If bundling, we might want: import * as ort from 'onnxruntime-web';
        // But let's stick to the previous plan: ort is global from <script>
        // WAIT: The user said "bundle proper ES module". 
        // If we bundle, we should probably import onnxruntime-web too?
        // But for now, let's assume ort is global as per offscreen.html
        if (typeof window.ort !== 'undefined') {
            // global ort
        } else {
            // import dynamic? No, just fail if missing.
            // We will ensure offscreen.html loads ort.min.js (which is UMD/global).
            throw new Error('onnxruntime-web not found (ort is undefined). Global script missing?');
        }
    }

    const modelUrl = chrome.runtime.getURL(MODEL_PATH.replace('../', ''));

    const sessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
    };

    // Create Session
    // Disable workers to prevent CSP 'blob:' errors in Chrome Extension
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;

    ortSession = await ort.InferenceSession.create(modelUrl, sessionOptions);
    console.log('[OFFSCREEN-BERT] ORT Session Created');
}

/**
 * Load using Xenova Pipeline (Dev Mode)
 */
async function loadXenovaPipeline() {
    console.log('[OFFSCREEN-BERT] Initializing Xenova Pipeline...');
    pipeline = await xenovaPipeline('feature-extraction', MODEL_NAME, {
        quantized: true
    });
}

// =========================================================================
// Inference Logic
// =========================================================================

async function generateBERTEmbedding(text) {
    await ensureModelLoaded();

    if (RUNTIME_MODE === 'ort') {
        return await inferOrt(text);
    } else {
        return await inferXenova(text);
    }
}

async function inferOrt(text) {
    if (!tokenizer || !ortSession) throw new Error('Model not initialized');

    const model_inputs = await tokenizer(text, {
        padding: true,
        truncation: true,
        max_length: 512
    });

    const input_ids = new ort.Tensor('int64', model_inputs.input_ids.data, model_inputs.input_ids.dims);
    const attention_mask = new ort.Tensor('int64', model_inputs.attention_mask.data, model_inputs.attention_mask.dims);

    const feeds = {
        input_ids: input_ids,
        attention_mask: attention_mask
    };
    if (model_inputs.token_type_ids) {
        feeds.token_type_ids = new ort.Tensor('int64', model_inputs.token_type_ids.data, model_inputs.token_type_ids.dims);
    }

    const results = await ortSession.run(feeds);
    const output = results.last_hidden_state || results[Object.keys(results)[0]];

    const [batchSize, seqLen, hiddenSize] = output.dims;
    const data = output.data;

    const pooled = new Float32Array(hiddenSize);
    let validTokens = 0;

    for (let i = 0; i < seqLen; i++) {
        if (Number(model_inputs.attention_mask.data[i]) === 1) {
            validTokens++;
            for (let j = 0; j < hiddenSize; j++) {
                pooled[j] += data[i * hiddenSize + j];
            }
        }
    }

    for (let j = 0; j < hiddenSize; j++) {
        pooled[j] /= validTokens;
    }

    let norm = 0;
    for (let j = 0; j < hiddenSize; j++) {
        norm += pooled[j] * pooled[j];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let j = 0; j < hiddenSize; j++) {
            pooled[j] /= norm;
        }
    }

    return Array.from(pooled);
}

async function inferXenova(text) {
    const output = await pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// =========================================================================
// Global Interface & Keyword Extraction
// =========================================================================

async function extractKeywords(text, candidates) {
    await ensureModelLoaded();
    const docEmbedding = await generateBERTEmbedding(text);

    const results = [];
    for (const candidate of candidates) {
        const candEmbedding = await generateBERTEmbedding(candidate);
        const score = cosineSimilarity(docEmbedding, candEmbedding);
        results.push({ keyword: candidate, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}

function extractNGrams(text, n = [1, 2, 3]) {
    const tokens = text.toLowerCase().split(/\s+/);
    const ngrams = new Set();

    n.forEach(size => {
        for (let i = 0; i <= tokens.length - size; i++) {
            const gram = tokens.slice(i, i + size).join(' ');
            if (gram.length > 2) ngrams.add(gram);
        }
    });
    return Array.from(ngrams);
}

// Window Interface
if (typeof window !== 'undefined') {
    window.bertEmbedder = {
        ready: () => modelReady,
        init: ensureModelLoaded, // Exposed for explicit initialization
        embed: generateBERTEmbedding,
        extractKeywords: extractKeywords,
        extractNGrams: extractNGrams
    };
}

function notifyBackground(msg) {
    chrome.runtime.sendMessage({
        type: 'OFFSCREEN_STATUS',
        ...msg
    }).catch(() => { });
}

console.log('[OFFSCREEN-BERT] Script loaded. Waiting for first call to init.');
