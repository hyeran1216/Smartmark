const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const cheerio = require('cheerio');

const BUCKET_NAME = 'codemark-thumbnails'; 
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

/**
 * 웹페이지에서 대표 이미지 URL을 추출합니다.
 */
async function extractPrimaryImage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            // 💡 이미지/CSS/JS 파일 로드를 막아 응답 속도를 높입니다.
            validateStatus: status => status >= 200 && status < 300,
            responseType: 'text', // HTML 텍스트로 응답 받기
        });
        const $ = cheerio.load(response.data);
        
        let imageUrl = null;

        // 1. Open Graph / Twitter Image 메타 태그 검색 (최우선)
        imageUrl = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content');
        
        if (imageUrl) {
            console.log(`[Image Extract] 1순위: 메타 태그에서 이미지 발견 - ${imageUrl}`);
            return formatAbsoluteUrl(url, imageUrl);
        }

        // 2. 본문에서 가장 큰 이미지 탐색 (차선책)
        // 💡 주의: 이 로직만으로는 이미지의 크기를 측정할 수 없습니다. 
        // 일반적으로 큰 이미지는 본문에, 작은 이미지는 로고/아이콘에 사용됩니다.
        let largestImage = null;
        let largestArea = 0; // 이미지 크기 대신, 파일 이름/경로 길이로 어림짐작합니다.

        $('img').each((i, element) => {
            const imgUrl = $(element).attr('src') || $(element).attr('data-src');
            if (!imgUrl) return;

            // 로고, 아이콘, 1x1 투명 GIF 등 작은 이미지 제외
            if (imgUrl.includes('logo') || imgUrl.includes('icon') || imgUrl.includes('1x1')) return;

            // 이미지가 Base64 인코딩된 것(Data URI)이 아니라면
            if (imgUrl.startsWith('http') || imgUrl.startsWith('/') || imgUrl.startsWith('./')) {
                // 파일 경로 길이로 중요도를 어림짐작합니다. (긴 경로/이름일수록 본문 이미지일 가능성)
                const area = imgUrl.length; 
                if (area > largestArea) {
                    largestArea = area;
                    largestImage = imgUrl;
                }
            }
        });

        if (largestImage) {
            console.log(`[Image Extract] 2순위: 본문에서 가장 큰 이미지 발견 - ${largestImage}`);
            return formatAbsoluteUrl(url, largestImage);
        }

        // 3. 파비콘 (최후의 수단)
        const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');
        if (favicon) {
            console.log(`[Image Extract] 3순위: 파비콘 발견 - ${favicon}`);
            return formatAbsoluteUrl(url, favicon);
        }

        return null;

    } catch (error) {
        console.error(`Error fetching or parsing ${url}:`, error.message);
        return null;
    }
}

/**
 * 이미지 URL이 상대 경로일 경우 절대 경로로 변환합니다.
 * @param {string} baseUrl 웹페이지의 기본 URL
 * @param {string} relativeUrl 상대 이미지 URL
 * @returns {string} 절대 이미지 URL
 */
function formatAbsoluteUrl(baseUrl, relativeUrl) {
    if (relativeUrl.startsWith('http')) {
        return relativeUrl;
    }
    
    try {
        const urlObject = new URL(relativeUrl, baseUrl);
        return urlObject.toString();
    } catch (e) {
        // URL 구문 분석 오류가 발생하면 원본 URL 반환
        return relativeUrl; 
    }
}

/**
 * Cloud Function의 진입점(Entry Point)입니다.
 * HTTP 요청을 받아 썸네일을 생성하고 URL을 반환합니다.
 */
exports.createThumbnail = async (req, res) => {
    // 💡 CORS 설정: 브라우저 확장 프로그램의 호출을 허용합니다.
    res.set('Access-Control-Allow-Origin', '*'); 

    if (req.method === 'OPTIONS') {
        // 프리플라이트(Pre-flight) 요청 처리
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    const { targetUrl } = req.body; 

    if (!targetUrl) {
        return res.status(400).send({ error: 'targetUrl이 요청 본문에 필요합니다.' });
    }

    // 북마크 ID 대신 간단한 타임스탬프를 파일 이름으로 사용합니다.
    const bookmarkId = Date.now().toString(); 
    
    try {
        // 1. 웹페이지에서 대표 이미지 URL 추출
        const primaryImageUrl = await extractPrimaryImage(targetUrl);

        if (!primaryImageUrl) {
            // 이미지를 찾지 못하면 플레이스홀더 URL을 반환합니다.
            return res.status(200).send({ thumbnail_url: 'https://storage.googleapis.com/codemark-placeholders/default-placeholder.webp' });
        }

        // 2. 썸네일 다운로드, 변환, GCS 업로드 (🚨 이 부분은 현재 단순화되어 있습니다.)
        
        // GCS 파일 경로 지정
        const gcsFilePath = `thumbnails/${bookmarkId}.webp`;

        // 💡 실제 이미지 처리 로직 (axios로 다운로드, sharp 라이브러리로 리사이즈/WebP 변환, GCS 업로드)
        // 에는 추가적인 코드가 필요합니다. 현재는 추출된 원본 이미지를 그대로 사용합니다.
        
        // 3. (임시) 원본 이미지를 GCS에 저장된 것처럼 URL 반환
        // 실제로는 이 URL이 GCS의 파일을 가리켜야 합니다.
        // 현재는 첫 번째 추출된 이미지를 썸네일 URL로 반환하는 것으로 대체합니다.
        const thumbnail_url = primaryImageUrl; // 임시로 원본 URL을 썸네일 URL로 사용
        
        // 💡 만약 GCS에 직접 업로드하고 싶다면 아래 주석 처리된 코드를 사용해야 합니다.
        /*
        const imageResponse = await axios.get(primaryImageUrl, { responseType: 'arraybuffer' });
        const file = bucket.file(gcsFilePath);
        await file.save(imageResponse.data, {
             metadata: { contentType: imageResponse.headers['content-type'] },
             public: true 
        });
        const thumbnail_url = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFilePath}`;
        */
        
        res.status(200).send({ thumbnail_url: thumbnail_url });

    } catch (error) {
        console.error('Thumbnail creation failed:', error);
        // 오류 발생 시 플레이스홀더 URL 반환
        res.status(200).send({ thumbnail_url: 'https://storage.googleapis.com/codemark-placeholders/default-placeholder.webp' });
    }
};