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
        if (openCvReady) {
            resolve();
        } else {
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

async function scanDocument(imageDataUrl) {
    await waitForOpenCv();

    const img = new Image();
    const dataUrl = await new Promise((resolve) => {
        img.onload = () => {
            const src = cv.imread(img);
            const rows = src.rows, cols = src.cols;

            let gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            let blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

            let edges = new cv.Mat();
            cv.Canny(blurred, edges, 75, 200);

            let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            let dilated = new cv.Mat();
            cv.dilate(edges, dilated, kernel);

            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let maxArea = 0;
            let docPoints = null;

            for (let i = 0; i < contours.size(); i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area < cols * rows * 0.05) continue;

                const peri = cv.arcLength(cnt, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

                if (approx.rows === 4 && area > maxArea) {
                    maxArea = area;
                    if (docPoints) docPoints.delete();
                    docPoints = approx.clone();
                }
                approx.delete();
            }

            let warped = new cv.Mat();
            let found = false;

            if (docPoints && maxArea > cols * rows * 0.1) {
                const pts = docPoints.data32S;
                const corners = [
                    { x: pts[0], y: pts[1] },
                    { x: pts[2], y: pts[3] },
                    { x: pts[4], y: pts[5] },
                    { x: pts[6], y: pts[7] }
                ];
                const ordered = orderPoints(corners);

                const w = Math.max(distance(ordered[0], ordered[1]), distance(ordered[2], ordered[3]));
                const h = Math.max(distance(ordered[0], ordered[3]), distance(ordered[1], ordered[2]));

                const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    ordered[0].x, ordered[0].y,
                    ordered[1].x, ordered[1].y,
                    ordered[2].x, ordered[2].y,
                    ordered[3].x, ordered[3].y
                ]);
                const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1
                ]);

                const M = cv.getPerspectiveTransform(srcPts, dstPts);
                cv.warpPerspective(src, warped, M, new cv.Size(w, h));
                srcPts.delete();
                dstPts.delete();
                M.delete();
                found = true;
            }

            let result;
            if (found) {
                result = warped;
            } else {
                src.copyTo(result = warped);
            }

            let grayResult = new cv.Mat();
            cv.cvtColor(result, grayResult, cv.COLOR_RGBA2GRAY);

            let thresholded = new cv.Mat();
            cv.adaptiveThreshold(grayResult, thresholded, 255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

            let output = new cv.Mat();
            cv.cvtColor(thresholded, output, cv.COLOR_GRAY2RGBA);

            const outCanvas = document.createElement('canvas');
            outCanvas.width = output.cols;
            outCanvas.height = output.rows;
            cv.imshow(outCanvas, output);
            const resultUrl = outCanvas.toDataURL('image/jpeg', 0.92);

            src.delete();
            gray.delete();
            blurred.delete();
            edges.delete();
            dilated.delete();
            kernel.delete();
            contours.delete();
            hierarchy.delete();
            if (docPoints) docPoints.delete();
            result.delete();
            grayResult.delete();
            thresholded.delete();
            output.delete();
            outCanvas.remove();

            resolve(resultUrl);
        };
        img.src = imageDataUrl;
    });
    return dataUrl;
}
