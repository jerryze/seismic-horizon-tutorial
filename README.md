# 地震层位拾取教学网页

用于现场讲解的静态教学网页，包含地震勘探原理、地震数据结构、层位拾取流程和自动拾取方法，以及基于 F3 地震剖面的交互追踪演示。

在线访问：[地震层位拾取教学网页](https://jerryze.github.io/seismic-horizon-tutorial/)。

## 本地预览

在项目目录执行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

浏览器访问 `http://127.0.0.1:8765/`。

## GitHub Pages

发布文件为 `index.html`、`assets/` 和 `.nojekyll`，无需安装依赖或构建。

在仓库的 **Settings → Pages** 中选择 **Deploy from a branch**，发布分支选择 `main`，目录选择 `/(root)`。保存后等待 GitHub 完成部署。

更新 HTML、CSS 或资源后提交到发布分支，GitHub Pages 会自动更新。

## 图片说明

图 1-1 来自 Wikimedia Commons，作者 Page Quinton，采用 CC BY-SA 4.0 许可。地震剖面、数据体和层位图片使用配套 F3 数据资源；具体说明保留在网页图注中。
