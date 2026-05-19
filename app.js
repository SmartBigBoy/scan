// 全局变量
let video = null;
let canvas = null;
let currentImage = null;
let capturedImages = [];
let flashEnabled = false;
let rotation = 0;

// DOM元素
const pages = {
    home: document.getElementById('home'),
    scanner: document.getElementById('scanner'),
    preview: document.getElementById('preview'),
    result: document.getElementById('result')
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
    shareOther: document.getElementById('shareOther')
};

const elements = {
    previewImage: document.getElementById('previewImage'),
    documentList: document.getElementById('documentList'),
    shareModal: document.getElementById('shareModal'),
    loading: document.getElementById('loading'),
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas')
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
    buttons.crop.addEventListener('click', () => alert('裁剪功能开发中'));
    buttons.deleteBtn.addEventListener('click', deleteCurrentImage);
    
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
    if (['scanner', 'preview'].includes(Object.keys(pages).find(key => pages[key].classList.contains('active')))) {
        e.preventDefault();
    }
}, { passive: false });