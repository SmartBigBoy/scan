// 全局变量
let video = null;
let canvas = null;
let currentImage = null;
let capturedImages = [];
let flashEnabled = false;
let rotation = 0;

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
    enhance: document.getElementById('enhanceBtn'),
    crop: document.getElementById('cropBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    resultBack: document.getElementById('resultBackBtn'),
    savePdf: document.getElementById('savePdfBtn'),
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
    cropFlipV: document.getElementById('cropFlipVBtn'),
    addToHome: document.getElementById('addToHomeBtn'),
    addToHomeClose: document.getElementById('addToHomeClose')
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
    addToHomeModal: document.getElementById('addToHomeModal')
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
function capturePhoto() {
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 获取图像数据并进行文档增强
    enhanceImage();
}

// 图像增强处理
function enhanceImage() {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 简单的文档增强算法
    for (let i = 0; i < data.length; i += 4) {
        // 计算灰度值
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // 二值化处理（增强对比度）
        const threshold = 180;
        const newValue = gray > threshold ? 255 : gray * 0.8;
        
        data[i] = newValue;     // R
        data[i + 1] = newValue; // G
        data[i + 2] = newValue; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
    currentImage = canvas.toDataURL('image/jpeg', 0.9);
    
    // 显示预览
    elements.previewImage.src = currentImage;
    rotation = 0;
    showPage('preview');
}

// 旋转图像
function rotateImage() {
    rotation += 90;
    if (rotation >= 360) rotation = 0;
    elements.previewImage.style.transform = `rotate(${rotation}deg)`;
}

// 保存当前图像到列表
function confirmImage() {
    // 创建旋转后的图像
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // 根据旋转角度调整canvas尺寸
    if (rotation === 90 || rotation === 270) {
        tempCanvas.width = canvas.height;
        tempCanvas.height = canvas.width;
    } else {
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
    }
    
    // 绘制旋转后的图像
    tempCtx.save();
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    const img = new Image();
    img.onload = () => {
        tempCtx.drawImage(img, -img.width / 2, -img.height / 2);
        const rotatedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
        capturedImages.push(rotatedDataUrl);
        updateDocumentList();
        showPage('result');
    };
    img.src = currentImage;
}

// 更新文档列表
function updateDocumentList() {
    elements.documentList.innerHTML = '';
    
    capturedImages.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'document-item';
        item.innerHTML = `
            <img src="${image}" alt="文档 ${index + 1}">
            <span class="page-number">${index + 1}</span>
        `;
        elements.documentList.appendChild(item);
    });
}

// 删除当前图像
function deleteCurrentImage() {
    if (confirm('确定要删除这张图片吗？')) {
        showPage('scanner');
    }
}

// 生成PDF
async function generatePDF() {
    if (capturedImages.length === 0) {
        alert('请先扫描文档');
        return;
    }
    
    showLoading(true);
    
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: capturedImages.length > 1 ? 'portrait' : 'auto',
            unit: 'px',
            format: [640, 960]
        });
        
        // 添加水印
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        
        capturedImages.forEach((image, index) => {
            if (index > 0) {
                pdf.addPage();
            }
            
            // 添加图像
            pdf.addImage(image, 'JPEG', 0, 0, 640, 960);
            
            // 添加页码
            pdf.text(`第 ${index + 1} 页 / 共 ${capturedImages.length} 页`, 10, 950);
        });
        
        // 保存PDF
        const fileName = `扫描文档_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
        pdf.save(fileName);
    } catch (err) {
        console.error('生成PDF失败:', err);
        alert('生成PDF失败，请重试');
    } finally {
        showLoading(false);
    }
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
    input.capture = 'environment';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentImage = event.target.result;
                elements.previewImage.src = currentImage;
                rotation = 0;
                showPage('preview');
            };
            reader.readAsDataURL(file);
        }
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
    showPage('home');
    
    // 停止摄像头
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video = null;
    }
}

// 事件监听
function setupEventListeners() {
    // 首页按钮
    buttons.scan.addEventListener('click', () => {
        showPage('scanner');
        initCamera();
    });
    
    buttons.gallery.addEventListener('click', selectFromGallery);
    
    // 扫描页面按钮
    buttons.back.addEventListener('click', goHome);
    buttons.flash.addEventListener('click', toggleFlash);
    buttons.capture.addEventListener('click', capturePhoto);
    
    // 预览页面按钮
    buttons.previewBack.addEventListener('click', () => showPage('scanner'));
    buttons.confirm.addEventListener('click', confirmImage);
    buttons.rotate.addEventListener('click', rotateImage);
    buttons.enhance.addEventListener('click', enhanceImage);
    buttons.crop.addEventListener('click', openCropper);
    buttons.deleteBtn.addEventListener('click', deleteCurrentImage);
    
    // 裁剪页面按钮
    buttons.cropperBack.addEventListener('click', closeCropper);
    buttons.cropperConfirm.addEventListener('click', applyCrop);
    buttons.cropReset.addEventListener('click', resetCrop);
    buttons.cropRotate.addEventListener('click', rotateCropperImage);
    buttons.cropFlipH.addEventListener('click', flipCropperImageH);
    buttons.cropFlipV.addEventListener('click', flipCropperImageV);
    
    // 添加到桌面按钮
    buttons.addToHome.addEventListener('click', showAddToHomeModal);
    buttons.addToHomeClose.addEventListener('click', hideAddToHomeModal);
    
    // 结果页面按钮
    buttons.resultBack.addEventListener('click', goHome);
    buttons.savePdf.addEventListener('click', generatePDF);
    buttons.share.addEventListener('click', shareDocument);
    buttons.continue.addEventListener('click', continueScanning);
    
    // 分享弹窗按钮
    buttons.shareClose.addEventListener('click', () => showShareModal(false));
    buttons.shareQQ.addEventListener('click', () => copyToClipboardAndShare('qq'));
    buttons.shareWechat.addEventListener('click', () => copyToClipboardAndShare('wechat'));
    buttons.shareWeibo.addEventListener('click', () => copyToClipboardAndShare('weibo'));
    buttons.shareOther.addEventListener('click', () => copyToClipboardAndShare('other'));
    
    // 返回按钮事件委托
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('back-btn')) {
            const currentPage = Object.keys(pages).find(key => pages[key].classList.contains('active'));
            if (currentPage === 'preview') {
                showPage('scanner');
            } else if (currentPage === 'result') {
                goHome();
            }
        }
    });
    
    // 裁剪区域事件
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

// 水平翻转裁剪图片
function flipCropperImageH() {
    const image = elements.cropperImage;
    const currentScaleX = parseFloat(image.dataset.scaleX || '1');
    image.dataset.scaleX = -currentScaleX;
    image.style.transform = `scaleX(${image.dataset.scaleX})`;
}

// 垂直翻转裁剪图片
function flipCropperImageV() {
    const image = elements.cropperImage;
    const currentScaleY = parseFloat(image.dataset.scaleY || '1');
    image.dataset.scaleY = -currentScaleY;
    image.style.transform = `scaleY(${image.dataset.scaleY})`;
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