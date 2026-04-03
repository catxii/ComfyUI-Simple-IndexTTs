# GitHub 一条命令安装

这个项目不适合把 `_runtime` 和模型直接塞进 GitHub 仓库。

更稳的方式是：

1. 把代码仓库上传到你自己的 GitHub 仓库。
2. 让别人运行一条 PowerShell 命令。
3. 脚本自动完成：
   - 下载仓库源码
   - 安装 Python 3.12（如果本机没有）
   - 下载固定版本的 ComfyUI
   - 创建运行时环境
   - 安装依赖
   - 下载模型
   - 生成启动脚本

## 推荐命令

把下面的 `<OWNER>` 和 `<REPO>` 替换成你自己的 GitHub 仓库：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/install.ps1 | iex"
```

## 可选参数

默认是 NVIDIA CUDA 12.8 环境并下载模型。

如果你要 CPU 安装：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $(irm https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/install.ps1) } -TorchBackend cpu"
```

如果你想先跳过模型下载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $(irm https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/install.ps1) } -SkipModelDownload"
```

## 安装后启动

安装完成后，默认目录里会生成：

- `Start Simple IndexTTS.cmd`
- `Stop Simple IndexTTS.cmd`

默认安装目录：

```text
%LOCALAPPDATA%\Programs\ComfyUI-Simple-IndexTTs
```
