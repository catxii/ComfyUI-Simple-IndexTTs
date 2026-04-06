$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Main = Join-Path $Root "_runtime\ComfyUI\main.py"

$targets = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "python.exe" -and
    $_.CommandLine -like "*$Main*" -and
    $_.CommandLine -like "*--port 8191*"
}

foreach ($proc in $targets) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {
    }
}

Write-Host "IndexTTS service stopped."
