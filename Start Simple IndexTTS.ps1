$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root "_runtime\Python312\python.exe"
$Main = Join-Path $Root "_runtime\ComfyUI\main.py"
$LogsDir = Join-Path $Root "_runtime\logs"
$StdOutLog = Join-Path $LogsDir "comfyui-stdout.log"
$StdErrLog = Join-Path $LogsDir "comfyui-stderr.log"
$UiUrl = "http://127.0.0.1:8191/indextts-ui"
$ApiUrl = "http://127.0.0.1:8191/indextts-ui/api/config"
$LogWindowTitle = "IndexTTS backend log"

if (-not (Test-Path $Python)) {
    throw "Python runtime not found: $Python"
}

if (-not (Test-Path $Main)) {
    throw "ComfyUI main.py not found: $Main"
}

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
if (-not (Test-Path $StdOutLog)) {
    New-Item -ItemType File -Path $StdOutLog | Out-Null
}
if (-not (Test-Path $StdErrLog)) {
    New-Item -ItemType File -Path $StdErrLog | Out-Null
}

$running = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "python.exe" -and
    $_.CommandLine -like "*_runtime\\ComfyUI\\main.py*" -and
    $_.CommandLine -like "*--port 8191*"
}

if (-not $running) {
    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    Start-Process -FilePath $Python `
        -ArgumentList "-u", $Main, "--disable-auto-launch", "--listen", "127.0.0.1", "--port", "8191" `
        -WorkingDirectory (Join-Path $Root "_runtime\ComfyUI") `
        -RedirectStandardOutput $StdOutLog `
        -RedirectStandardError $StdErrLog | Out-Null
}

$logWindowRunning = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "powershell.exe" -and
    $_.CommandLine -like "*$LogWindowTitle*"
}

if (-not $logWindowRunning) {
    $monitorScript = @"
`$Host.UI.RawUI.WindowTitle = "$LogWindowTitle"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
`$OutputEncoding = [Text.Encoding]::UTF8
Write-Host "IndexTTS backend log window"
Write-Host "stdout: $StdOutLog"
Write-Host "stderr: $StdErrLog"
Write-Host "Closing this window will not stop the service."
Write-Host ""
`$logs = @("$StdOutLog", "$StdErrLog")
foreach (`$log in `$logs) {
    if (-not (Test-Path `$log)) {
        New-Item -ItemType File -Path `$log | Out-Null
    }
}
Get-Content -Path `$logs -Encoding UTF8 -Tail 80 -Wait
"@
    $encodedMonitorScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($monitorScript))
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedMonitorScript | Out-Null
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

Write-Host "Service startup timed out. Check logs:"
Write-Host $StdOutLog
Write-Host $StdErrLog
Start-Process $UiUrl | Out-Null
exit 1
