param(
    [string]$RepoOwner = "catxii",
    [string]$RepoName = "ComfyUI-Simple-IndexTTs",
    [string]$Branch = "main",
    [string]$InstallDir = "D:\ComfyUI-Simple-IndexTTs",
    [ValidateSet("cu128", "cpu")]
    [string]$TorchBackend = "cu128",
    [switch]$SkipModelDownload
)

$ErrorActionPreference = "Stop"

function Resolve-Python312 {
    $candidates = @(
        "$env:LocalAppData\Programs\Python\Python312\python.exe",
        "C:\Python312\python.exe",
        "$PSScriptRoot\..\_runtime\Python312\python.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $resolved = cmd.exe /c "py -3.12 -c ""import sys; print(sys.executable)""" 2>$null
            if ($LASTEXITCODE -eq 0 -and $resolved) {
                return $resolved.Trim()
            }
        } catch {
        }
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Python 3.12 was not found and winget is unavailable. Install Python 3.12 first."
    }

    Write-Host "Installing Python 3.12..."
    & winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --disable-interactivity

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        $resolved = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $resolved) {
            return $resolved.Trim()
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Python 3.12 installation finished but python.exe was still not found."
}

$pythonExe = Resolve-Python312
$tempRoot = Join-Path $env:TEMP ("indextts-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
    $repoZip = Join-Path $tempRoot "repo.zip"
    $extractDir = Join-Path $tempRoot "repo"
    $archiveUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"

    Write-Host "Downloading repository archive..."
    Invoke-WebRequest -Uri $archiveUrl -OutFile $repoZip -UseBasicParsing

    Write-Host "Extracting repository archive..."
    Expand-Archive -Path $repoZip -DestinationPath $extractDir -Force

    $sourceDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (-not $sourceDir) {
        throw "Repository archive extraction failed."
    }

    $installScript = Join-Path $sourceDir.FullName "scripts\install_runtime.py"
    if (-not (Test-Path $installScript)) {
        throw "scripts\install_runtime.py was not found in the repository archive."
    }

    $scriptArgs = @(
        $installScript,
        "--source", $sourceDir.FullName,
        "--install-dir", $InstallDir,
        "--python-exe", $pythonExe,
        "--torch-backend", $TorchBackend
    )
    if ($SkipModelDownload) {
        $scriptArgs += "--skip-model-download"
    }

    Write-Host "Installing ComfyUI Simple IndexTTS..."
    & $pythonExe @scriptArgs

    Write-Host ""
    Write-Host "Installation completed."
    Write-Host "Launch with: $InstallDir\Start Simple IndexTTS.cmd"
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
