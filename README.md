# 智能扫描 - 文档扫描助手

一个基于Web的文档扫描应用，支持摄像头调用、图像增强、PDF生成和分享功能。

## 功能特性

- 📷 **摄像头扫描** - 调用手机摄像头扫描文档
- 📁 **相册选择** - 支持从相册选择图片
- ✨ **图像增强** - 自动优化文档对比度和清晰度
- ↻ **旋转调整** - 支持90°旋转调整
- 📄 **PDF生成** - 将扫描图片合并为PDF文件
- 📤 **分享功能** - 支持分享到QQ、微信等平台
- 🔒 **隐私安全** - 纯本地处理，不存储用户数据

## 技术栈

- HTML5
- CSS3
- JavaScript (ES6+)
- jsPDF - PDF生成库

## 部署到GitHub Pages

### 方法一：直接部署

1. 登录你的GitHub账户
2. 创建一个新的仓库，命名为 `your-username.github.io`
3. 将本项目的所有文件上传到仓库的 `main` 分支
4. 等待几分钟后访问 `https://your-username.github.io`

### 方法二：使用GitHub Actions（推荐）

1. 创建 `.github/workflows/deploy.yml` 文件：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./
```

2. 推送代码到GitHub
3. 在仓库设置中启用GitHub Pages，选择 `gh-pages` 分支

## 使用说明

### 在手机上使用

1. 在手机浏览器中访问你的GitHub Pages网址
2. 点击"扫描文稿"按钮
3. 授权摄像头权限
4. 将文档对准扫描框，点击拍照按钮
5. 预览并确认图片
6. 可以继续扫描多页文档
7. 点击"保存PDF"生成并下载PDF文件

### 分享文档

1. 扫描完成后点击"分享"按钮
2. 选择要分享的平台
3. 图片会复制到剪贴板
4. 打开对应应用粘贴分享

## 浏览器兼容性

- ✅ Chrome (Android/iOS)
- ✅ Safari (iOS)
- ✅ Firefox (Android)
- ✅ Edge (Android/iOS)

## 注意事项

1. 需要HTTPS环境才能访问摄像头
2. GitHub Pages默认使用HTTPS，无需额外配置
3. 所有数据仅在浏览器本地处理，不会上传到服务器
4. 建议在光线充足的环境下扫描文档以获得最佳效果

## 开发

```bash
# 克隆项目
git clone https://github.com/your-username/your-repo.git

# 进入目录
cd your-repo

# 使用本地服务器运行（推荐）
python -m http.server 8000
# 或使用Node.js
npx serve

# 在浏览器中访问
http://localhost:8000
```

## 项目结构

```
.
├── index.html      # 主页面
├── styles.css      # 样式文件
├── app.js          # 主要逻辑
└── README.md       # 说明文档
```

## 许可证

MIT License