let openCvReady = false;

function onOpenCvReady() {
    openCvReady = true;
    if (window._openCvCallbacks) {
        window._openCvCallbacks.forEach(fn => fn());
        window._openCvCallbacks = [];
    }
}

function waitForOpenCv() {
    return new Promise((resolve) => {
        if (openCvReady) resolve();
        else {
            if (!window._openCvCallbacks) window._openCvCallbacks = [];
            window._openCvCallbacks.push(resolve);
        }
    });
}

function orderPoints(pts) {
    const rect = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    const s = pts.map(p => p.x + p.y);
    rect[0] = pts[s.indexOf(Math.min(...s))];
    rect[2] = pts[s.indexOf(Math.max(...s))];
    const diff = pts.map(p => p.y - p.x);
    rect[1] = pts[diff.indexOf(Math.min(...diff))];
    rect[3] = pts[diff.indexOf(Math.max(...diff))];
    return rect;
}

function distance(a, b) {
    return Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

function detectCorners(srcMat) {
    const rows = srcMat.rows, cols = srcMat.cols;
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    let blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    let edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let morphed = new cv.Mat();
    cv.morphologyEx(edges, morphed, cv.MORPH_CLOSE, kernel);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let docPoints = null;
    const minArea = cols * rows * 0.03;
    for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minArea) continue;
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
            const testPts = approx.data32S;
            const testCorners = [
                { x: testPts[0], y: testPts[1] },
                { x: testPts[2], y: testPts[3] },
                { x: testPts[4], y: testPts[5] },
                { x: testPts[6], y: testPts[7] }
            ];
            const ordered = orderPoints(testCorners);
            const w = Math.max(distance(ordered[0], ordered[1]), distance(ordered[2], ordered[3]));
            const h = Math.max(distance(ordered[0], ordered[3]), distance(ordered[1], ordered[2]));
            const aspect = w / h;
            if (aspect > 0.2 && aspect < 5 && area > maxArea) {
                maxArea = area;
                if (docPoints) docPoints.delete();
                docPoints = approx.clone();
            }
        }
        approx.delete();
    }

    let result = null;
    const minValidArea = cols * rows * 0.08;
    if (docPoints && maxArea > minValidArea) {
        const pts = docPoints.data32S;
        result = orderPoints([
            { x: pts[0], y: pts[1] }, { x: pts[2], y: pts[3] },
            { x: pts[4], y: pts[5] }, { x: pts[6], y: pts[7] }
        ]);
        docPoints.delete();
    }

    gray.delete(); blurred.delete(); edges.delete();
    kernel.delete(); morphed.delete(); contours.delete(); hierarchy.delete();
    return result;
}

function getCanvasPixelData(cvs) {
    return cv.matFromImageData(cvs.getContext('2d').getImageData(0, 0, cvs.width, cvs.height));
}

async function warpDocument(imageDataUrl) {
    await waitForOpenCv();
    const img = new Image();
    return await new Promise((resolve) => {
        img.onload = () => {
            const src = cv.imread(img);
            const corners = detectCorners(src);
            let resultUrl = null;
            if (corners) {
                resultUrl = warpWithCorners(src, corners);
            }
            src.delete();
            resolve(resultUrl);
        };
        img.src = imageDataUrl;
    });
}

function warpWithCorners(src, orderedCorners) {
    const w = Math.max(distance(orderedCorners[0], orderedCorners[1]), distance(orderedCorners[2], orderedCorners[3]));
    const h = Math.max(distance(orderedCorners[0], orderedCorners[3]), distance(orderedCorners[1], orderedCorners[2]));
    if (w < 10 || h < 10) return null;

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        orderedCorners[0].x, orderedCorners[0].y, orderedCorners[1].x, orderedCorners[1].y,
        orderedCorners[2].x, orderedCorners[2].y, orderedCorners[3].x, orderedCorners[3].y
    ]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1
    ]);
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    let warped = new cv.Mat();
    cv.warpPerspective(src, warped, M, new cv.Size(w, h), cv.INTER_CUBIC);

    const sharpened = sharpenMat(warped);
    warped.delete();

    const outCanvas = document.createElement('canvas');
    outCanvas.width = sharpened.cols; outCanvas.height = sharpened.rows;
    cv.imshow(outCanvas, sharpened);
    const url = outCanvas.toDataURL('image/jpeg', 0.95);
    sharpened.delete(); outCanvas.remove(); srcPts.delete(); dstPts.delete(); M.delete();
    return url;
}

async function warpWithDetectedCorners(imageDataUrl, corners) {
    await waitForOpenCv();
    const img = new Image();
    return await new Promise((resolve) => {
        img.onload = () => {
            const src = cv.imread(img);
            const result = warpWithCorners(src, corners);
            src.delete();
            resolve(result);
        };
        img.src = imageDataUrl;
    });
}

function sharpenMat(src) {
    const blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(0, 0), 3);
    const dst = new cv.Mat();
    cv.addWeighted(src, 1.6, blurred, -0.6, 0, dst);
    blurred.delete();
    return dst;
}

async function enhanceWithOpenCV(imageDataUrl, mode) {
    await waitForOpenCv();
    const img = new Image();
    return await new Promise((resolve) => {
        img.onload = () => {
            const src = cv.imread(img);
            const result = applyOcvFilter(src, mode);
            src.delete();
            resolve(result);
        };
        img.src = imageDataUrl;
    });
}

function applyOcvFilter(src, mode) {
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let result;

    if (mode === 'original') {
        const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
        const equalized = new cv.Mat();
        clahe.apply(gray, equalized);
        const color = new cv.Mat();
        cv.cvtColor(equalized, color, cv.COLOR_GRAY2RGBA);
        const sharp = sharpenMat(color);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = sharp.cols; outCanvas.height = sharp.rows;
        cv.imshow(outCanvas, sharp);
        result = outCanvas.toDataURL('image/jpeg', 0.95);
        outCanvas.remove();
        equalized.delete(); color.delete(); sharp.delete(); clahe.delete();
    } else if (mode === 'auto') {
        const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
        const enhanced = new cv.Mat();
        clahe.apply(gray, enhanced);
        const denoised = new cv.Mat();
        cv.medianBlur(enhanced, denoised, 3);
        const binary = new cv.Mat();
        cv.adaptiveThreshold(denoised, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 41, 8);
        const color = new cv.Mat();
        cv.cvtColor(binary, color, cv.COLOR_GRAY2RGBA);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = color.cols; outCanvas.height = color.rows;
        cv.imshow(outCanvas, color);
        result = outCanvas.toDataURL('image/jpeg', 0.95);
        outCanvas.remove();
        enhanced.delete(); denoised.delete(); binary.delete(); color.delete(); clahe.delete();
    } else if (mode === 'document') {
        const clahe = new cv.CLAHE(4.0, new cv.Size(6, 6));
        const enhanced = new cv.Mat();
        clahe.apply(gray, enhanced);
        const denoised = new cv.Mat();
        cv.GaussianBlur(enhanced, denoised, new cv.Size(3, 3), 0);
        const binary = new cv.Mat();
        cv.adaptiveThreshold(denoised, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 5);
        const color = new cv.Mat();
        cv.cvtColor(binary, color, cv.COLOR_GRAY2RGBA);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = color.cols; outCanvas.height = color.rows;
        cv.imshow(outCanvas, color);
        result = outCanvas.toDataURL('image/jpeg', 0.95);
        outCanvas.remove();
        enhanced.delete(); denoised.delete(); binary.delete(); color.delete(); clahe.delete();
    } else if (mode === 'idcard') {
        const color = new cv.Mat();
        cv.cvtColor(gray, color, cv.COLOR_GRAY2RGBA);
        const sharp = sharpenMat(color);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = sharp.cols; outCanvas.height = sharp.rows;
        cv.imshow(outCanvas, sharp);
        result = outCanvas.toDataURL('image/jpeg', 0.95);
        outCanvas.remove();
        color.delete(); sharp.delete();
    } else {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = src.cols; outCanvas.height = src.rows;
        cv.imshow(outCanvas, src);
        result = outCanvas.toDataURL('image/jpeg', 0.95);
        outCanvas.remove();
    }

    gray.delete();
    return result;
}
