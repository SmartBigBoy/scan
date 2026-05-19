// 全局变量
let video = null;
let canvas = null;
let currentImage = null;          // 当前显示的图片
let originalImageData = null;     // 原始拍摄/选择的图片
let scanResultData = null;        // OpenCV透视校正后的彩色图 (未检测到时为null)
let capturedImages = [];
let flashEnabled = false;
let rotation = 0;
let currentFilter = 'original';
let selectedPageIndex = -1;

// 裁剪相关变量
let cropArea = null;
let cropImage = null;
let isDragging = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let resizeHandle = null;
let cropStartRect = { x: 0, y: 0, width: 0, height: 0 };
let cropScale = 1;

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
    share: document.getElementById('shareBtn'),
    continue: document.getElementById('continueBtn'),
    shareClose: document.getElementById('shareClose'),
    shareQQ: document.getElementById('shareQQ'),
    shareWechat: document.getElementById('shareWechat'),
    shareWeibo: document.getElementById('shareWeibo'),
    shareOther: document.getElementById('shareOther'),
    cropperBack: document.getElementById('cropperBackBtn'),
    cropperConfirm: document.getElementById('cropperConfirmBtn'),
    cropReset: document.getElementById('cropResetBtn'),
    cropRotate: document.getElementById('cropRotateBtn'),
    cropFlipH: document.getElementById('cropFlipHBtn'),
    addToHome: document.getElementById('addToHomeBtn'),
    addToHomeClose: document.getElementById('addToHomeClose'),
    moreBtn: document.getElementById('moreBtn'),
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
    cropperImage: document.getElementById('cropperImage'),
    cropperContainer: document.getElementById('cropperContainer'),
    cropArea: document.getElementById('cropArea'),
    cropOverlay: document.getElementById('cropOverlay'),
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

// 初始化摄像头
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
        video.srcObject = stream;
        
        // 设置canvas尺寸
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };
    } catch (err) {
        console.error('无法访问摄像头:', err);
        alert('无法访问摄像头，请检查权限设置');
        showPage('home');
    }
}

// 拍照
async function capturePhoto() {
    if (!video || !canvas) return;
    showLoading(true);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    originalImageData = canvas.toDataURL('image/jpeg', 0.9);
    scanResultData = null;

    try {
        if (openCvReady) {
            const warped = await warpDocument(originalImageData);
            if (warped) scanResultData = warped;
        }
    } catch (e) {
        console.warn('透视校正失败:', e);
    }

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
        capturedImages.push(dataUrl);
        resetAdjustments();
        updateDocumentList();
        showPage('result');
    };
    img.src = currentImage;
}

function updateDocumentList() {
    elements.documentList.innerHTML = '';
    
    capturedImages.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'document-item' + (index === selectedPageIndex ? ' selected' : '');
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

function deleteCurrentImage() {
    showPage('scanner');
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

// 继续扫描
function continueScanning() {
    showPage('scanner');
}

// 返回首页并清空数据
function goHome() {
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
    
    buttons.previewBack.addEventListener('click', () => showPage('scanner'));
    buttons.confirm.addEventListener('click', confirmImage);
    buttons.rotate.addEventListener('click', rotateImage);
    buttons.crop.addEventListener('click', openCropper);
    buttons.deleteBtn.addEventListener('click', deleteCurrentImage);
    
    buttons.cropperBack.addEventListener('click', closeCropper);
    buttons.cropperConfirm.addEventListener('click', applyCrop);
    buttons.cropReset.addEventListener('click', resetCrop);
    buttons.cropRotate.addEventListener('click', rotateCropperImage);
    buttons.cropFlipH.addEventListener('click', flipCropperImageH);
    
    buttons.addToHome.addEventListener('click', showAddToHomeModal);
    buttons.addToHomeClose.addEventListener('click', hideAddToHomeModal);
    
    buttons.resultBack.addEventListener('click', goHome);
    buttons.share.addEventListener('click', shareDocument);
    buttons.continue.addEventListener('click', continueScanning);
    
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

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applySizePreset(btn.dataset.preset);
        });
    });

    setupCropperEvents();
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

// ========== 裁剪功能实现 ==========

// 打开裁剪页面
function openCropper() {
    if (!currentImage) return;
    
    showPage('cropper');
    elements.cropperImage.src = currentImage;
    
    // 等待图片加载后初始化裁剪区域
    elements.cropperImage.onload = () => {
        initCropArea();
    };
}

// 初始化裁剪区域
function initCropArea() {
    const container = elements.cropperContainer;
    const image = elements.cropperImage;
    
    // 计算图片缩放比例以适应容器
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    
    const scaleX = containerWidth / imageWidth;
    const scaleY = containerHeight / imageHeight;
    cropScale = Math.min(scaleX, scaleY);
    
    // 设置图片样式
    image.style.width = `${imageWidth * cropScale}px`;
    image.style.height = `${imageHeight * cropScale}px`;
    image.style.left = `${(containerWidth - imageWidth * cropScale) / 2}px`;
    image.style.top = `${(containerHeight - imageHeight * cropScale) / 2}px`;
    
    // 设置初始裁剪区域（图片的80%大小，居中）
    const cropWidth = imageWidth * cropScale * 0.8;
    const cropHeight = imageHeight * cropScale * 0.8;
    const cropX = (containerWidth - cropWidth) / 2;
    const cropY = (containerHeight - cropHeight) / 2;
    
    updateCropArea(cropX, cropY, cropWidth, cropHeight);
}

// 更新裁剪区域
function updateCropArea(x, y, width, height) {
    const area = elements.cropArea;
    area.style.left = `${x}px`;
    area.style.top = `${y}px`;
    area.style.width = `${width}px`;
    area.style.height = `${height}px`;
    
    // 更新遮罩
    updateOverlay(x, y, width, height);
}

// 更新遮罩
function updateOverlay(x, y, width, height) {
    const overlay = elements.cropOverlay;
    overlay.style.clipPath = `polygon(0 0, ${x}px 0, ${x}px ${y}px, 0 ${y}px, 0 0, 
        0 ${y + height}px, ${x}px ${y + height}px, ${x}px ${containerHeight}px, 0 ${containerHeight}px, 0 ${y + height}px,
        ${x + width}px ${y + height}px, ${x + width}px ${containerHeight}px, ${containerWidth}px ${containerHeight}px, ${containerWidth}px ${y + height}px, ${x + width}px ${y + height}px,
        ${x + width}px ${y}px, ${containerWidth}px ${y}px, ${containerWidth}px 0, ${x + width}px 0, ${x + width}px ${y}px,
        ${x}px ${y}px)`;
}

// 设置裁剪区域事件
function setupCropperEvents() {
    const area = elements.cropArea;
    const container = elements.cropperContainer;
    
    // 裁剪区域拖动
    area.addEventListener('touchstart', (e) => {
        isDragging = true;
        dragStart = {
            x: e.touches[0].clientX - parseFloat(area.style.left),
            y: e.touches[0].clientY - parseFloat(area.style.top)
        };
        e.preventDefault();
    });
    
    // 调整手柄拖动
    const handles = area.querySelectorAll('.crop-handle');
    handles.forEach(handle => {
        handle.addEventListener('touchstart', (e) => {
            isResizing = true;
            resizeHandle = handle.classList;
            cropStartRect = {
                x: parseFloat(area.style.left),
                y: parseFloat(area.style.top),
                width: parseFloat(area.style.width),
                height: parseFloat(area.style.height)
            };
            dragStart = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
            e.preventDefault();
        });
    });
    
    // 触摸移动
    container.addEventListener('touchmove', (e) => {
        if (!isDragging && !isResizing) return;
        
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        if (isDragging) {
            let newX = clientX - dragStart.x;
            let newY = clientY - dragStart.y;
            
            // 边界限制
            newX = Math.max(0, Math.min(newX, containerWidth - parseFloat(area.style.width)));
            newY = Math.max(0, Math.min(newY, containerHeight - parseFloat(area.style.height)));
            
            updateCropArea(newX, newY, parseFloat(area.style.width), parseFloat(area.style.height));
        }
        
        if (isResizing) {
            let newX = cropStartRect.x;
            let newY = cropStartRect.y;
            let newWidth = cropStartRect.width;
            let newHeight = cropStartRect.height;
            
            const deltaX = clientX - dragStart.x;
            const deltaY = clientY - dragStart.y;
            const minSize = 50;
            
            if (resizeHandle.contains('l')) {
                newX = Math.min(cropStartRect.x + deltaX, cropStartRect.x + cropStartRect.width - minSize);
                newWidth = Math.max(minSize, cropStartRect.width - deltaX);
                newX = Math.max(0, newX);
            }
            if (resizeHandle.contains('r')) {
                newWidth = Math.max(minSize, cropStartRect.width + deltaX);
                newWidth = Math.min(newWidth, containerWidth - cropStartRect.x);
            }
            if (resizeHandle.contains('t')) {
                newY = Math.min(cropStartRect.y + deltaY, cropStartRect.y + cropStartRect.height - minSize);
                newHeight = Math.max(minSize, cropStartRect.height - deltaY);
                newY = Math.max(0, newY);
            }
            if (resizeHandle.contains('b')) {
                newHeight = Math.max(minSize, cropStartRect.height + deltaY);
                newHeight = Math.min(newHeight, containerHeight - cropStartRect.y);
            }
            
            updateCropArea(newX, newY, newWidth, newHeight);
        }
        
        e.preventDefault();
    });
    
    // 触摸结束
    container.addEventListener('touchend', () => {
        isDragging = false;
        isResizing = false;
        resizeHandle = null;
    });
}

// 应用裁剪
function applyCrop() {
    const area = elements.cropArea;
    const image = elements.cropperImage;
    
    const cropX = parseFloat(area.style.left) - parseFloat(image.style.left);
    const cropY = parseFloat(area.style.top) - parseFloat(image.style.top);
    const cropWidth = parseFloat(area.style.width);
    const cropHeight = parseFloat(area.style.height);
    
    // 创建canvas进行裁剪
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // 转换为原始图片坐标
    const originalX = cropX / cropScale;
    const originalY = cropY / cropScale;
    const originalWidth = cropWidth / cropScale;
    const originalHeight = cropHeight / cropScale;
    
    tempCanvas.width = originalWidth;
    tempCanvas.height = originalHeight;
    
    const img = new Image();
    img.onload = () => {
        tempCtx.drawImage(img, originalX, originalY, originalWidth, originalHeight, 0, 0, originalWidth, originalHeight);
        currentImage = tempCanvas.toDataURL('image/jpeg', 0.9);
        elements.previewImage.src = currentImage;
        showPage('preview');
    };
    img.src = currentImage;
}

// 关闭裁剪页面
function closeCropper() {
    showPage('preview');
}

// 重置裁剪区域
function resetCrop() {
    initCropArea();
}

// 旋转裁剪图片
function rotateCropperImage() {
    const image = elements.cropperImage;
    const currentRotation = parseInt(image.dataset.rotation || '0');
    const newRotation = (currentRotation + 90) % 360;
    image.dataset.rotation = newRotation;
    image.style.transform = `rotate(${newRotation}deg)`;
}

function flipCropperImageH() {
    const image = elements.cropperImage;
    const currentScaleX = parseFloat(image.dataset.scaleX || '1');
    image.dataset.scaleX = -currentScaleX;
    image.style.transform = `scaleX(${image.dataset.scaleX})`;
}

function applySizePreset(preset) {
    const container = elements.cropperContainer;
    const image = elements.cropperImage;
    const imgW = parseFloat(image.style.width);
    const imgH = parseFloat(image.style.height);
    const imgLeft = parseFloat(image.style.left);
    const imgTop = parseFloat(image.style.top);
    const maxW = imgLeft + imgW;
    const maxH = imgTop + imgH;

    let ratio;
    if (preset === 'a4') ratio = 210 / 297;
    else if (preset === 'idcard') ratio = 85.6 / 54;
    else if (preset === 'receipt') ratio = 80 / 200;

    const areaHeight = imgH * 0.7;
    const areaWidth = areaHeight * ratio;
    const areaX = imgLeft + (imgW - areaWidth) / 2;
    const areaY = imgTop + (imgH - areaHeight) / 2;

    updateCropArea(
        Math.max(imgLeft, Math.min(areaX, maxW - areaWidth)),
        Math.max(imgTop, Math.min(areaY, maxH - areaHeight)),
        Math.min(areaWidth, maxW - imgLeft),
        Math.min(areaHeight, maxH - imgTop)
    );
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