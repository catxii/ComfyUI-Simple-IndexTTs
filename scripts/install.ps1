$ErrorActionPreference = "Stop"

param(
    [string]$RepoOwner = "catxii",
    [string]$RepoName = "ComfyUI-Simple-IndexTTs",
    [string]$Branch = "main",
    [string]$InstallDir = "$env:LOCALAPPDATA\\Programs\\ComfyUI-Simple-IndexTTs",
    [ValidateSet("cu128", "cpu")]
    [string]$TorchBackend = "cu128",
    [switch]$SkipModelDownload
)

function Resolve-Python312 {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $resolved = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $resolved) {
                return $resolved.Trim()
            }
        } catch {
        }
    }

    $candidates = @(
        "$env:LocalAppData\\Programs\\Python\\Python312\\python.exe",
        "C:\\Python312\\python.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "未找到 Python 3.12，也未找到 winget。请先安装 Python 3.12 后重试。"
    }

    Write-Host "正在安装 Python 3.12..."
    & winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --disable-interactivity

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        $resolved = & py -3.12 -c "import sys; print(sys.executable)"
        if ($LASTEXITCODE -eq 0 -and $resolved) {
            return $resolved.Trim()
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Python 3.12 安装后仍未找到 python.exe。"
}

$pythonExe = Resolve-Python312

$tempRoot = Join-Path $env:TEMP ("indextts-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
    $repoZip = Join-Path $tempRoot "repo.zip"
    $extractDir = Join-Path $tempRoot "repo"
    $archiveUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"

    Write-Host "正在下载仓库源码..."
    Invoke-WebRequest -Uri $archiveUrl -OutFile $repoZip -UseBasicParsing

    Write-Host "正在解压仓库源码..."
    Expand-Archive -Path $repoZip -DestinationPath $extractDir -Force

    $sourceDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (-not $sourceDir) {
        throw "仓库源码解压失败。"
    }

    $installScript = Join-Path $sourceDir.FullName "scripts\\install_runtime.py"
    if (-not (Test-Path $installScript)) {
        throw "仓库中缺少 scripts\\install_runtime.py。"
    }

    $args = @(
        $installScript,
        "--source", $sourceDir.FullName,
        "--install-dir", $InstallDir,
        "--python-exe", $pythonExe,
        "--torch-backend", $TorchBackend
    )
    if ($SkipModelDownload) {
        $args += "--skip-model-download"
    }

    Write-Host "开始安装 ComfyUI Simple IndexTTS..."
    & $pythonExe @args

    Write-Host ""
    Write-Host "安装完成。"
    Write-Host "启动命令: $InstallDir\\Start Simple IndexTTS.cmd"
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
