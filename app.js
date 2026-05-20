// 全局变量
let video = null;
let canvas = null;
let currentImage = null;
let originalImageData = null;
let scanResultData = null;
let capturedImages = [];
let flashEnabled = false;
let rotation = 0;
let currentFilter = 'original';
let selectedPageIndex = -1;

// 实时检测变量
let detectLoopId = null;
let lockedCorners = null;
let detectHistory = [];
let detectStableCount = 0;
let isDetecting = false;
let autoCaptureTimer = null;

// 裁剪相关变量
let crop4Corners = [];
let crop4Img = null;
let crop4DragIdx = -1;
let crop4ImageRotation = 0;

// DOM元素
const pages = {
    home: document.getElementById('home'),
    scanner: document.getElementById('scanner'),
    preview: document.getElementById('preview'),
    result: document.getElementById('result'),
    cropper: document.getElementById('cropper')
};

const buttons = {
    scan: document.getElementById('scanBtn'),
    gallery: document.getElementById('galleryBtn'),
    back: document.getElementById('backBtn'),
    flash: document.getElementById('flashBtn'),
    capture: document.getElementById('captureBtn'),
    previewBack: document.getElementById('previewBackBtn'),
    confirm: document.getElementById('confirmBtn'),
    rotate: document.getElementById('rotateBtn'),
    crop: document.getElementById('cropBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    resultBack: document.getElementById('resultBackBtn'),
    rescanBtn: document.getElementById('rescanBtn'),
    share: document.getElementById('shareBtn'),
    continue: document.getElementById('continueBtn'),
    shareClose: document.getElementById('shareClose'),
    shareQQ: document.getElementById('shareQQ'),
    shareWechat: document.getElementById('shareWechat'),
    shareWeibo: document.getElementById('shareWeibo'),
    shareOther: document.getElementById('shareOther'),
    cropperBack: document.getElementById('cropperBackBtn'),
    cropperConfirm: document.getElementById('cropperConfirmBtn'),
    crop4Fit: document.getElementById('crop4FitBtn'),
    crop4Reset: document.getElementById('crop4ResetBtn'),
    crop4Rotate: document.getElementById('crop4RotateBtn'),
    addToHome: document.getElementById('addToHomeBtn'),
    addToHomeClose: document.getElementById('addToHomeClose'),
    moreBtn: document.getElementById('moreBtn'),
    manualDetect: document.getElementById('manualDetectBtn'),
    downloadPdf: document.getElementById('downloadPdfBtn'),
    downloadPng: document.getElementById('downloadPngBtn'),
    downloadJpg: document.getElementById('downloadJpgBtn')
};

const elements = {
    previewImage: document.getElementById('previewImage'),
    documentList: document.getElementById('documentList'),
    shareModal: document.getElementById('shareModal'),
    loading: document.getElementById('loading'),
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas'),
    addToHomeModal: document.getElementById('addToHomeModal'),
    filterBar: document.getElementById('filterBar'),
    adjustBar: document.getElementById('adjustBar'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    contrastSlider: document.getElementById('contrastSlider'),
    brightnessValue: document.getElementById('brightnessValue'),
    contrastValue: document.getElementById('contrastValue'),
    pageSettings: document.getElementById('pageSettings'),
    pageOrientation: document.getElementById('pageOrientation'),
    pageNumberToggle: document.getElementById('pageNumberToggle'),
    pageMargin: document.getElementById('pageMargin')
};

// 页面切换
function showPage(pageName) {
    Object.values(pages).forEach(page => page.classList.remove('active'));
    pages[pageName].classList.add('active');
}

// 显示加载提示
function showLoading(show) {
    elements.loading.classList.toggle('show', show);
}

// 显示分享弹窗
function showShareModal(show) {
    elements.shareModal.classList.toggle('show', show);
}

// ========== 实时文档检测引擎 ==========

function startDetection() {
    stopDetection();
    lockedCorners = null;
    detectHistory = [];
    detectStableCount = 0;
    if (!openCvReady) {
        setDetectStatus('OpenCV 加载中...', false);
        let retries = 0;
        const waitCv = () => {
            if (openCvReady) {
                setDetectStatus('对准文档', false);
                doStart();
            } else if (retries++ < 100) {
                setTimeout(waitCv, 200);
            } else {
                setDetectStatus('OpenCV 加载失败', false);
            }
        };
        waitCv();
        return;
    }
    doStart();
}

function doStart() {
    const timer = setTimeout(() => {
        if (video && video.readyState >= 2) {
            const overlay = document.getElementById('detectOverlay');
            const container = document.getElementById('videoContainer');
            overlay.width = container.clientWidth;
            overlay.height = container.clientHeight;
            detectLoopId = requestAnimationFrame(runDetection);
        } else {
            doStart();
        }
    }, 300);
    detectLoopId = timer;
}

function stopDetection() {
    if (autoCaptureTimer) { clearTimeout(autoCaptureTimer); autoCaptureTimer = null; }
    if (detectLoopId) {
        clearTimeout(detectLoopId);
        cancelAnimationFrame(detectLoopId);
        detectLoopId = null;
    }
    isDetecting = false;
    clearOverlay();
}

function clearOverlay() {
    const overlay = document.getElementById('detectOverlay');
    if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
}

function showFlashEffect() {
    const overlay = document.getElementById('detectOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    setTimeout(() => {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
    }, 150);
}

function manualDetect() {
    if (!video || !video.videoWidth || !openCvReady) return;
    stopDetection();
    lockedCorners = null;
    detectHistory = [];
    detectStableCount = 0;
    const overlay = document.getElementById('detectOverlay');
    const container = document.getElementById('videoContainer');
    overlay.width = container.clientWidth;
    overlay.height = container.clientHeight;
    detectStableCount = 10;
    detectLoopId = requestAnimationFrame(runDetection);
}

function setDetectStatus(text, isLocked) {
    const el = document.getElementById('detectStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'detect-status' + (isLocked ? ' locked' : '');
}

function getVideoDisplayRect() {
    const container = document.getElementById('videoContainer');
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!video || !video.videoWidth) return { x: 0, y: 0, width: cw, height: ch, scaleX: 1, scaleY: 1 };
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const ca = cw / ch;
    const va = vw / vh;
    let dw, dh, dx, dy;
    if (ca > va) {
        dh = ch; dw = ch * va;
        dx = (cw - dw) / 2; dy = 0;
    } else {
        dw = cw; dh = cw / va;
        dx = 0; dy = (ch - dh) / 2;
    }
    return { x: dx, y: dy, width: dw, height: dh, scaleX: dw / vw, scaleY: dh / vh };
}

async function runDetection() {
    if (!video || !video.videoWidth || !openCvReady) {
        detectLoopId = requestAnimationFrame(runDetection);
        return;
    }
    if (isDetecting) {
        detectLoopId = requestAnimationFrame(runDetection);
        return;
    }
    isDetecting = true;

    const vw = video.videoWidth, vh = video.videoHeight;
    const overlay = document.getElementById('detectOverlay');
    const container = document.getElementById('videoContainer');
    const cw = container.clientWidth, ch = container.clientHeight;

    if (cw === 0 || ch === 0) {
        isDetecting = false;
        detectLoopId = requestAnimationFrame(runDetection);
        return;
    }

    if (overlay.width !== cw || overlay.height !== ch) {
        overlay.width = cw; overlay.height = ch;
    }

    const rect = getVideoDisplayRect();
    const snapCanvas = document.createElement('canvas');
    const shrink = 4;
    snapCanvas.width = vw / shrink;
    snapCanvas.height = vh / shrink;
    const snapCtx = snapCanvas.getContext('2d');
    snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
    const imageData = snapCtx.getImageData(0, 0, snapCanvas.width, snapCanvas.height);
    snapCanvas.remove();

    try {
        const src = cv.matFromImageData(imageData);
        const rawCorners = detectCorners(src);
        src.delete();

        if (rawCorners) {
            const native = rawCorners.map(c => ({ x: Math.round(c.x * shrink), y: Math.round(c.y * shrink) }));
            const displayCorners = native.map(c => ({
                x: rect.x + Math.round(c.x * rect.scaleX),
                y: rect.y + Math.round(c.y * rect.scaleY)
            }));

            detectHistory.push(native);
            if (detectHistory.length > 5) detectHistory.shift();

            if (detectHistory.length >= 3) {
                const last = detectHistory[detectHistory.length - 1];
                const prev = detectHistory[detectHistory.length - 2];
                let drift = 0;
                for (let i = 0; i < 4; i++) drift += distance(last[i], prev[i]);
                if (drift < 20) detectStableCount++;
                else detectStableCount = 0;
            }

            if (detectStableCount >= 3 && !lockedCorners) {
                lockedCorners = native;
                setDetectStatus('已锁定 ✓', true);
                if (!autoCaptureTimer) {
                    autoCaptureTimer = setTimeout(() => {
                        autoCaptureTimer = null;
                        if (lockedCorners) {
                            showFlashEffect();
                            setTimeout(capturePhoto, 180);
                        }
                    }, 600);
                }
            } else if (!lockedCorners) {
                setDetectStatus('检测到文档', false);
            }

            drawDetectOverlay(displayCorners, !!lockedCorners);
        } else {
            detectHistory = [];
            detectStableCount = 0;
            if (!lockedCorners) {
                clearOverlay();
                setDetectStatus('对准文档', false);
            }
        }
    } catch (e) {
        console.warn('检测帧失败:', e);
    }

    isDetecting = false;
    const interval = lockedCorners ? 500 : 200;
    detectLoopId = setTimeout(() => {
        detectLoopId = requestAnimationFrame(runDetection);
    }, interval);
}

function drawDetectOverlay(corners, locked) {
    const overlay = document.getElementById('detectOverlay');
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const color = locked ? '#4CAF50' : '#FFC107';
    const lw = locked ? 3 : 2;

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash(locked ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = locked ? 'rgba(76,175,80,0.08)' : 'rgba(255,193,7,0.05)';
    ctx.fill();

    for (const c of corners) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, locked ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// ========== 初始化摄像头 ==========
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        video = elements.video;
        canvas = elements.canvas;
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            startDetection();
        };
        video.srcObject = stream;
    } catch (err) {
        console.error('无法访问摄像头:', err);
        alert('无法访问摄像头，请检查权限设置');
        showPage('home');
    }
}

// ========== 拍照 ==========

async function capturePhoto() {
    if (!video || !canvas) return;
    showLoading(true);
    rotation = 0;
    stopDetection();

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    originalImageData = canvas.toDataURL('image/jpeg', 0.9);
    scanResultData = null;

    try {
        if (openCvReady) {
            if (lockedCorners) {
                scanResultData = await warpWithDetectedCorners(originalImageData, lockedCorners);
            } else {
                const warped = await warpDocument(originalImageData);
                if (warped) scanResultData = warped;
            }
        }
    } catch (e) {
        console.warn('透视校正失败:', e);
    }

    lockedCorners = null;
    applyFilter('original');
    showLoading(false);
    showPage('preview');
}

function getBaseImage() {
    return scanResultData || originalImageData;
}

function applyFilter(type) {
    if (!getBaseImage()) return;
    currentFilter = type;

    elements.filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = elements.filterBar.querySelector(`.filter-btn[data-filter="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const img = new Image();
    img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');

        if (type === 'original') {
            ctx.drawImage(img, 0, 0);
        } else if (type === 'auto' || type === 'document') {
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            const blockSize = type === 'document' ? 9 : 13;
            const cVal = type === 'document' ? 3 : 5;

            const w = tempCanvas.width, h = tempCanvas.height;
            const gray = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
                const idx = i * 4;
                gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            }

            const bin = new Uint8Array(w * h);
            const half = Math.floor(blockSize / 2);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let sum = 0, count = 0;
                    for (let dy = -half; dy <= half; dy++) {
                        for (let dx = -half; dx <= half; dx++) {
                            const px = x + dx, py = y + dy;
                            if (px >= 0 && px < w && py >= 0 && py < h) {
                                sum += gray[py * w + px];
                                count++;
                            }
                        }
                    }
                    const mean = sum / count;
                    const idx = y * w + x;
                    bin[idx] = (gray[idx] <= mean - cVal) ? 0 : 255;
                }
            }

            for (let i = 0; i < w * h; i++) {
                const idx = i * 4;
                data[idx] = data[idx + 1] = data[idx + 2] = bin[i];
            }
            ctx.putImageData(imageData, 0, 0);
        } else if (type === 'idcard') {
            ctx.filter = 'brightness(1.1) contrast(1.15) saturate(1.2)';
            ctx.drawImage(img, 0, 0);
            ctx.filter = 'none';
        }

        currentImage = tempCanvas.toDataURL('image/jpeg', 0.92);
        elements.previewImage.src = currentImage;
        elements.previewImage.style.transform = `rotate(${rotation}deg)`;
        applyAdjustments();
    };
    img.src = getBaseImage();
}

function applyAdjustments() {
    if (!currentImage) return;
    const brightness = parseInt(elements.brightnessSlider.value);
    const contrast = parseInt(elements.contrastSlider.value);
    if (brightness === 0 && contrast === 0) {
        elements.previewImage.style.filter = 'none';
        return;
    }
    const b = 1 + brightness / 100;
    const c = 1 + contrast / 100;
    elements.previewImage.style.filter = `brightness(${b}) contrast(${c})`;
}

function resetAdjustments() {
    elements.brightnessSlider.value = 0;
    elements.contrastSlider.value = 0;
    elements.brightnessValue.textContent = '0';
    elements.contrastValue.textContent = '0';
    elements.previewImage.style.filter = 'none';
}

// 旋转图像
function rotateImage() {
    rotation += 90;
    if (rotation >= 360) rotation = 0;
    elements.previewImage.style.transform = `rotate(${rotation}deg)`;
}

function confirmImage() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
        const bw = rotation === 90 || rotation === 270 ? img.height : img.width;
        const bh = rotation === 90 || rotation === 270 ? img.width : img.height;
        tempCanvas.width = bw;
        tempCanvas.height = bh;
        
        tempCtx.save();
        tempCtx.translate(bw / 2, bh / 2);
        tempCtx.rotate((rotation * Math.PI) / 180);

        const b = parseInt(elements.brightnessSlider.value);
        const c = parseInt(elements.contrastSlider.value);
        if (b !== 0 || c !== 0) {
            tempCtx.filter = `brightness(${1 + b / 100}) contrast(${1 + c / 100})`;
        }

        tempCtx.drawImage(img, -img.width / 2, -img.height / 2);
        tempCtx.restore();
        
        const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
        
        if (rescanMode && selectedPageIndex >= 0 && selectedPageIndex < capturedImages.length) {
            capturedImages[selectedPageIndex] = dataUrl;
            rescanMode = false;
        } else {
            capturedImages.push(dataUrl);
        }
        
        resetAdjustments();
        updateDocumentList();
        showPage('result');
    };
    img.src = currentImage;
}

function deleteCurrentImage() {
    stopDetection();
    showPage('scanner');
    if (video) startDetection();
}

async function generatePDF() {
    if (capturedImages.length === 0) {
        alert('请先扫描文档');
        return;
    }
    
    showLoading(true);
    
    try {
        const { jsPDF } = window.jspdf;
        const margin = parseInt(elements.pageMargin.value);
        const orientation = elements.pageOrientation.value;
        const showNumbers = elements.pageNumberToggle.checked;
        const pw = orientation === 'portrait' ? 595 : 842;
        const ph = orientation === 'portrait' ? 842 : 595;
        
        const pdf = new jsPDF({ orientation: orientation, unit: 'pt', format: 'a4' });
        
        for (let i = 0; i < capturedImages.length; i++) {
            if (i > 0) pdf.addPage();
            
            const imgW = pw - margin * 2;
            const imgH = ph - margin * 2 - (showNumbers ? 20 : 0);
            pdf.addImage(capturedImages[i], 'JPEG', margin, margin, imgW, imgH);
            
            if (showNumbers) {
                pdf.setFontSize(9);
                pdf.setTextColor(120, 120, 120);
                pdf.text(`${i + 1} / ${capturedImages.length}`, pw / 2, ph - 8, { align: 'center' });
            }
        }
        
        const fileName = `扫描文档_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
        pdf.save(fileName);
    } catch (err) {
        console.error('生成PDF失败:', err);
        alert('生成PDF失败，请重试');
    } finally {
        showLoading(false);
    }
}

function downloadAsPng() {
    if (capturedImages.length === 0) { alert('请先扫描文档'); return; }
    showLoading(true);
    if (capturedImages.length === 1) {
        const a = document.createElement('a');
        a.href = capturedImages[0];
        a.download = `扫描_${Date.now()}.png`;
        a.click();
    } else {
        alert('多页文档建议使用 PDF 格式导出。\n可长按单张缩略图保存。');
    }
    showLoading(false);
}

function downloadAsJpg() {
    if (capturedImages.length === 0) { alert('请先扫描文档'); return; }
    showLoading(true);
    if (capturedImages.length === 1) {
        const a = document.createElement('a');
        a.href = capturedImages[0];
        a.download = `扫描_${Date.now()}.jpg`;
        a.click();
    } else {
        alert('多页文档建议使用 PDF 格式导出。\n可长按单张缩略图保存。');
    }
    showLoading(false);
}

// 分享功能
function shareDocument() {
    if (capturedImages.length === 0) {
        alert('请先扫描文档');
        return;
    }
    
    showShareModal(true);
}

// 复制到剪贴板并提示分享
async function copyToClipboardAndShare(platform) {
    showLoading(true);
    
    try {
        // 对于单张图片，直接复制到剪贴板
        if (capturedImages.length === 1) {
            const response = await fetch(capturedImages[0]);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
        }
        
        showLoading(false);
        showShareModal(false);
        
        let message = '';
        switch (platform) {
            case 'qq':
                message = '图片已复制到剪贴板，请打开QQ粘贴分享';
                break;
            case 'wechat':
                message = '图片已复制到剪贴板，请打开微信粘贴分享';
                break;
            case 'weibo':
                message = '图片已复制到剪贴板，请打开微博粘贴分享';
                break;
            default:
                message = '图片已复制到剪贴板，可以粘贴到任意应用分享';
        }
        
        alert(message);
    } catch (err) {
        console.error('分享失败:', err);
        showLoading(false);
        alert('分享失败，请手动保存图片后分享');
    }
}

// 从相册选择图片
function selectFromGallery() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            showLoading(true);
            originalImageData = event.target.result;
            scanResultData = null;
            try {
                if (openCvReady) {
                    const warped = await warpDocument(originalImageData);
                    if (warped) scanResultData = warped;
                }
            } catch (err) {
                console.warn('透视校正失败:', err);
            }
            resetAdjustments();
            applyFilter('original');
            showLoading(false);
            showPage('preview');
        };
        reader.readAsDataURL(file);
    };
    
    input.click();
}

// 切换闪光灯
function toggleFlash() {
    if (!video) return;
    
    const track = video.srcObject.getVideoTracks()[0];
    if (!track) return;
    
    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
        alert('设备不支持闪光灯');
        return;
    }
    
    flashEnabled = !flashEnabled;
    track.applyConstraints({ torch: flashEnabled });
    buttons.flash.classList.toggle('active', flashEnabled);
}

// 返回首页并清空数据
function goHome() {
    stopDetection();
    capturedImages = [];
    scanResultData = null;
    originalImageData = null;
    showPage('home');
    
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video = null;
    }
}

// 事件监听
function setupEventListeners() {
    buttons.scan.addEventListener('click', () => {
        showPage('scanner');
        initCamera();
    });
    
    buttons.gallery.addEventListener('click', selectFromGallery);
    
    buttons.back.addEventListener('click', goHome);
    buttons.flash.addEventListener('click', toggleFlash);
    buttons.capture.addEventListener('click', capturePhoto);
    
    buttons.previewBack.addEventListener('click', () => { showPage('scanner'); if (video) startDetection(); });
    buttons.confirm.addEventListener('click', confirmImage);
    buttons.rotate.addEventListener('click', rotateImage);
    buttons.crop.addEventListener('click', openCropper);
    buttons.deleteBtn.addEventListener('click', deleteCurrentImage);
    
    buttons.cropperBack.addEventListener('click', closeCropper);
    buttons.cropperConfirm.addEventListener('click', applyCrop4);
    buttons.crop4Fit.addEventListener('click', fitCrop4);
    buttons.crop4Reset.addEventListener('click', resetCrop4);
    buttons.crop4Rotate.addEventListener('click', rotateCrop4);
    
    buttons.addToHome.addEventListener('click', showAddToHomeModal);
    buttons.addToHomeClose.addEventListener('click', hideAddToHomeModal);
    
    buttons.resultBack.addEventListener('click', goHome);
    buttons.rescanBtn.addEventListener('click', rescanCurrentPage);
    buttons.share.addEventListener('click', shareDocument);
    buttons.continue.addEventListener('click', continueScanning);
    buttons.manualDetect.addEventListener('click', manualDetect);
    
    buttons.shareClose.addEventListener('click', () => showShareModal(false));
    buttons.shareQQ.addEventListener('click', () => copyToClipboardAndShare('qq'));
    buttons.shareWechat.addEventListener('click', () => copyToClipboardAndShare('wechat'));
    buttons.shareWeibo.addEventListener('click', () => copyToClipboardAndShare('weibo'));
    buttons.shareOther.addEventListener('click', () => copyToClipboardAndShare('other'));
    
    buttons.downloadPdf.addEventListener('click', generatePDF);
    buttons.downloadPng.addEventListener('click', downloadAsPng);
    buttons.downloadJpg.addEventListener('click', downloadAsJpg);
    
    buttons.moreBtn.addEventListener('click', () => {
        const settings = elements.pageSettings;
        settings.style.display = settings.style.display === 'none' ? 'block' : 'none';
    });

    elements.brightnessSlider.addEventListener('input', () => {
        elements.brightnessValue.textContent = elements.brightnessSlider.value;
        applyAdjustments();
    });
    elements.contrastSlider.addEventListener('input', () => {
        elements.contrastValue.textContent = elements.contrastSlider.value;
        applyAdjustments();
    });

    elements.filterBar.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilter(btn.dataset.filter);
        });
    });

    setupCrop4Events();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // 检测设备类型
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        // 移动设备
        document.body.classList.add('mobile');
    } else {
        // 桌面设备提示
        const desktopHint = document.createElement('div');
        desktopHint.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ff9800;
            color: white;
            text-align: center;
            padding: 10px;
            font-size: 14px;
            z-index: 9999;
        `;
        desktopHint.textContent = '此应用在移动设备上体验最佳，建议使用手机访问';
        document.body.appendChild(desktopHint);
        setTimeout(() => desktopHint.style.display = 'none', 5000);
    }
});

// 防止页面滚动
document.addEventListener('touchmove', (e) => {
    if (['scanner', 'preview', 'cropper'].includes(Object.keys(pages).find(key => pages[key].classList.contains('active')))) {
        e.preventDefault();
    }
}, { passive: false });

// ========== 4角裁剪实现 ==========

function openCropper() {
    if (!currentImage) return;
    showPage('cropper');
    const img = new Image();
    crop4Img = img;
    crop4ImageRotation = 0;
    img.onload = () => {
        const container = document.getElementById('crop4Container');
        const canvas = document.getElementById('crop4Canvas');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const cw = canvas.width, ch = canvas.height;
        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        const ox = (cw - dw) / 2, oy = (ch - dh) / 2;

        crop4Corners = [
            { x: ox, y: oy }, { x: ox + dw, y: oy },
            { x: ox + dw, y: oy + dh }, { x: ox, y: oy + dh }
        ];
        drawCrop4();
    };
    img.src = currentImage;
}

function drawCrop4() {
    const canvas = document.getElementById('crop4Canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!crop4Img) return;
    const scale = Math.min(w / crop4Img.naturalWidth, h / crop4Img.naturalHeight);
    const dw = crop4Img.naturalWidth * scale, dh = crop4Img.naturalHeight * scale;
    const ox = (w - dw) / 2, oy = (h - dh) / 2;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(crop4ImageRotation * Math.PI / 180);
    ctx.drawImage(crop4Img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(crop4Corners[0].x, crop4Corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(crop4Corners[i].x, crop4Corners[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
        const c = crop4Corners[i];
        ctx.beginPath();
        ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF50';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}

function setupCrop4Events() {
    const canvas = document.getElementById('crop4Canvas');

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function findCorner(pos) {
        for (let i = 0; i < 4; i++) {
            const dx = pos.x - crop4Corners[i].x, dy = pos.y - crop4Corners[i].y;
            if (dx * dx + dy * dy < 400) return i;
        }
        return -1;
    }

    canvas.addEventListener('mousedown', (e) => {
        const pos = getPos(e);
        crop4DragIdx = findCorner(pos);
    });
    canvas.addEventListener('mousemove', (e) => {
        if (crop4DragIdx < 0) return;
        const pos = getPos(e);
        crop4Corners[crop4DragIdx] = { x: Math.max(0, Math.min(canvas.width, pos.x)), y: Math.max(0, Math.min(canvas.height, pos.y)) };
        drawCrop4();
    });
    canvas.addEventListener('mouseup', () => { crop4DragIdx = -1; });
    canvas.addEventListener('mouseleave', () => { crop4DragIdx = -1; });

    canvas.addEventListener('touchstart', (e) => {
        const pos = getPos(e);
        crop4DragIdx = findCorner(pos);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
        if (crop4DragIdx < 0) return;
        e.preventDefault();
        const pos = getPos(e);
        crop4Corners[crop4DragIdx] = { x: Math.max(0, Math.min(canvas.width, pos.x)), y: Math.max(0, Math.min(canvas.height, pos.y)) };
        drawCrop4();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { crop4DragIdx = -1; });
}

function applyCrop4() {
    if (crop4Corners.length !== 4 || !crop4Img) return;
    const img = crop4Img;
    const canvas = document.getElementById('crop4Canvas');
    const w = canvas.width, h = canvas.height;
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const ox = (w - dw) / 2, oy = (h - dh) / 2;

    const corners = crop4Corners.map(c => ({
        x: (c.x - ox) / scale, y: (c.y - oy) / scale
    }));

    const ordered = orderPoints(corners);
    const ow = Math.max(distance(ordered[0], ordered[1]), distance(ordered[2], ordered[3]));
    const oh = Math.max(distance(ordered[0], ordered[3]), distance(ordered[1], ordered[2]));

    if (ow < 10 || oh < 10) { closeCropper(); return; }

    if (openCvReady && typeof cv !== 'undefined') {
        applyCrop4OpenCV(ordered, ow, oh);
    } else {
        alert('OpenCV 未就绪，请稍后重试');
    }
}

function applyCrop4OpenCV(ordered, ow, oh) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = ow; outCanvas.height = oh;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(crop4Img, 0, 0);

    const src = cv.imread(outCanvas);
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        ordered[0].x, ordered[0].y, ordered[1].x, ordered[1].y,
        ordered[2].x, ordered[2].y, ordered[3].x, ordered[3].y
    ]);
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ow - 1, 0, ow - 1, oh - 1, 0, oh - 1]);
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    let warped = new cv.Mat();
    cv.warpPerspective(src, warped, M, new cv.Size(ow, oh));
    srcPts.delete(); dstPts.delete(); M.delete(); src.delete();

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = warped.cols; resultCanvas.height = warped.rows;
    cv.imshow(resultCanvas, warped);
    warped.delete();

    const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.92);
    resultCanvas.remove();

    getBaseImageAfterCrop(dataUrl);
}

function getBaseImageAfterCrop(croppedUrl) {
    if (scanResultData) scanResultData = croppedUrl;
    else originalImageData = croppedUrl;
    currentImage = croppedUrl;
    elements.previewImage.src = currentImage;
    showPage('preview');
}

function closeCropper() { showPage('preview'); }
function resetCrop4() { if (crop4Img) openCropper(); }

function fitCrop4() {
    if (!openCvReady || !crop4Img) return;
    const canvas = document.getElementById('crop4Canvas');
    const outCanvas = document.createElement('canvas');
    outCanvas.width = crop4Img.naturalWidth; outCanvas.height = crop4Img.naturalHeight;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(crop4Img, 0, 0);

    const src = cv.imread(outCanvas);
    let gray = new cv.Mat(), blurred = new cv.Mat(), edges = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let morphed = new cv.Mat();
    cv.morphologyEx(edges, morphed, cv.MORPH_CLOSE, kernel);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let maxArea = 0, docPoints = null;
    const rows = src.rows, cols = src.cols;
    for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < cols * rows * 0.05) continue;
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && area > maxArea) { maxArea = area; if (docPoints) docPoints.delete(); docPoints = approx.clone(); }
        approx.delete();
    }

    if (docPoints && maxArea > cols * rows * 0.1) {
        const pts = docPoints.data32S;
        const raw = [{ x: pts[0], y: pts[1] }, { x: pts[2], y: pts[3] }, { x: pts[4], y: pts[5] }, { x: pts[6], y: pts[7] }];
        const ordered = orderPoints(raw);
        const w2 = canvas.width, h2 = canvas.height;
        const scale = Math.min(w2 / cols, h2 / rows);
        const ox2 = (w2 - cols * scale) / 2, oy2 = (h2 - rows * scale) / 2;

        ordered.forEach((p, i) => {
            crop4Corners[i] = { x: ox2 + p.x * scale, y: oy2 + p.y * scale };
        });
        drawCrop4();
        docPoints.delete();
    }

    src.delete(); gray.delete(); blurred.delete(); edges.delete();
    kernel.delete(); morphed.delete(); contours.delete(); hierarchy.delete();
    outCanvas.remove();
}

function rotateCrop4() {
    crop4ImageRotation = (crop4ImageRotation + 90) % 360;
    drawCrop4();
}

// ========== 缩略图拖拽排序 ==========

function updateDocumentList() {
    elements.documentList.innerHTML = '';
    capturedImages.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'document-item' + (index === selectedPageIndex ? ' selected' : '');
        item.draggable = true;
        item.dataset.index = index;
        item.innerHTML = `
            <img src="${image}" alt="文档 ${index + 1}">
            <span class="page-number">${index + 1}</span>
            <button class="doc-delete-btn" data-index="${index}">×</button>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('doc-delete-btn')) return;
            selectedPageIndex = index;
            updateDocumentList();
        });
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => { item.classList.remove('dragging'); });
        item.addEventListener('dragover', (e) => { e.preventDefault(); });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const to = index;
            if (from !== to && from >= 0 && to >= 0) {
                const [moved] = capturedImages.splice(from, 1);
                capturedImages.splice(to, 0, moved);
                selectedPageIndex = to;
                updateDocumentList();
            }
        });
        elements.documentList.appendChild(item);
    });

    document.querySelectorAll('.doc-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            capturedImages.splice(idx, 1);
            if (selectedPageIndex >= capturedImages.length) selectedPageIndex = -1;
            updateDocumentList();
        });
    });
}

// ========== 重新扫描 ==========

async function rescanCurrentPage() {
    if (selectedPageIndex < 0 || selectedPageIndex >= capturedImages.length) {
        alert('请先选择要替换的页面');
        return;
    }
    rescanMode = true;
    showPage('scanner');
    if (!video) initCamera();
    else startDetection();
}

// "继续扫描"添加时，如果是替换模式则替换选中页
let rescanMode = false;

function continueScanning() {
    stopDetection();
    rescanMode = false;
    showPage('scanner');
    if (!video) initCamera();
    else startDetection();
}

// ========== 添加到桌面功能 ==========

// 显示添加到桌面弹窗
function showAddToHomeModal() {
    elements.addToHomeModal.classList.add('show');
}

// 隐藏添加到桌面弹窗
function hideAddToHomeModal() {
    elements.addToHomeModal.classList.remove('show');
    // 隐藏浮动按钮
    buttons.addToHome.classList.add('hidden');
    // 保存到localStorage避免再次显示
    localStorage.setItem('addToHomeShown', 'true');
}

// PWA安装提示（如果支持）
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const deferredPrompt = e;
    
    // 显示添加到桌面按钮
    buttons.addToHome.classList.remove('hidden');
    
    buttons.addToHome.addEventListener('click', () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                buttons.addToHome.classList.add('hidden');
            }
            deferredPrompt = null;
        });
    }, { once: true });
});

// 页面加载时检查是否已显示过添加到桌面提示
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('addToHomeShown') === 'true') {
        buttons.addToHome.classList.add('hidden');
    }
    
    // 在首页显示添加到桌面按钮
    const addToHomeBtn = buttons.addToHome;
    const hideBtn = () => {
        if (pages.home.classList.contains('active')) {
            addToHomeBtn.classList.remove('hidden');
        } else {
            addToHomeBtn.classList.add('hidden');
        }
    };
    
    // 监听页面切换
    Object.values(pages).forEach(page => {
        page.addEventListener('transitionend', hideBtn);
    });
    
    hideBtn();
});