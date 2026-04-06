$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root "_runtime\Python312\python.exe"
$Main = Join-Path $Root "_runtime\ComfyUI\main.py"
$LogsDir = Join-Path $Root "_runtime\logs"
$StdOutLog = Join-Path $LogsDir "comfyui-stdout.log"
$StdErrLog = Join-Path $LogsDir "comfyui-stderr.log"
$UiUrl = "http://127.0.0.1:8191/indextts-ui"
$ApiUrl = "http://127.0.0.1:8191/indextts-ui/api/config"

if (-not (Test-Path $Python)) {
    throw "Python runtime not found: $Python"
}

if (-not (Test-Path $Main)) {
    throw "ComfyUI main.py not found: $Main"
}

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$running = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "python.exe" -and
    $_.CommandLine -like "*_runtime\\ComfyUI\\main.py*" -and
    $_.CommandLine -like "*--port 8191*"
}

if (-not $running) {
    Start-Process -FilePath $Python `
        -ArgumentList $Main, "--disable-auto-launch", "--listen", "127.0.0.1", "--port", "8191" `
        -WorkingDirectory (Join-Path $Root "_runtime\ComfyUI") `
        -RedirectStandardOutput $StdOutLog `
        -RedirectStandardError $StdErrLog | Out-Null
}

for ($i = 0; $i -lt 120; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing $ApiUrl | Out-Null
        Start-Process $UiUrl | Out-Null
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host "服务启动超时，请检查日志："
Write-Host $StdOutLog
Write-Host $StdErrLog
Start-Process $UiUrl | Out-Null
exit 1
