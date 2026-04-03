from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"
PORTABLE_DIR = DIST_DIR / "portable"
APP_DIR = PORTABLE_DIR / "ComfyUI-Simple-IndexTTs"
RUNTIME_DIR = ROOT / "_runtime"
COMFY_DIR = RUNTIME_DIR / "ComfyUI"
PYTHON_DIR = RUNTIME_DIR / "Python312"
PLUGIN_TARGET_DIR = APP_DIR / "ComfyUI" / "custom_nodes" / "ComfyUI-Simple-IndexTTs"
PRODUCT_NAME = "ComfyUI Simple IndexTTS"
VERSION = "1.0.5"

EXCLUDED_DIR_NAMES = {
    ".git",
    ".venv",
    "__pycache__",
    "dist",
    "packaging",
    ".ipynb_checkpoints",
}
EXCLUDED_FILE_NAMES = {
    ".codex_runtime_stdout.log",
    ".codex_runtime_stderr.log",
    ".codex_start_stdout.log",
    ".codex_start_stderr.log",
    "comfy-live.log",
    "comfy-live.err.log",
    "comfy-start.log",
    "comfy-start.err.log",
}


def human_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.2f} {unit}"
        value /= 1024
    return f"{size} B"


def win_long_path(path: Path) -> str:
    raw = str(path.resolve() if path.exists() else path)
    if os.name != "nt":
        return raw
    if raw.startswith("\\\\?\\"):
        return raw
    if raw.startswith("\\\\"):
        return "\\\\?\\UNC\\" + raw[2:]
    return "\\\\?\\" + raw


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if os.name == "nt":
        if path.is_dir() and not path.is_symlink():
            subprocess.run(["cmd", "/c", "rmdir", "/s", "/q", win_long_path(path)], check=False)
        else:
            subprocess.run(["cmd", "/c", "del", "/f", "/q", win_long_path(path)], check=False)
        if not path.exists():
            return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def should_skip(path: Path, source: Path, blocked_prefixes: tuple[str, ...] = ()) -> bool:
    relative_parts = path.relative_to(source).parts if path != source else ()
    if relative_parts and relative_parts[0] in EXCLUDED_DIR_NAMES:
        return True
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if relative_parts and relative_parts[0] in blocked_prefixes:
        return True
    if path.name.endswith(".lock"):
        return True
    normalized = path.as_posix()
    if "/custom_nodes/ComfyUI-Simple-IndexTTs" in normalized:
        return True
    return False


def iter_files(source: Path, blocked_prefixes: tuple[str, ...] = ()):
    for path in source.rglob("*"):
        if should_skip(path, source, blocked_prefixes):
            continue
        yield path


def copy_tree(source: Path, destination: Path, blocked_prefixes: tuple[str, ...] = ()) -> tuple[int, int]:
    copied_files = 0
    copied_bytes = 0
    for path in iter_files(source, blocked_prefixes):
        relative = path.relative_to(source)
        target = destination / relative
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        source_file = path
        if path.is_symlink():
            if path.is_dir():
                continue
            source_file = path.resolve(strict=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(win_long_path(source_file), "rb") as src_handle, open(win_long_path(target), "wb") as dst_handle:
                shutil.copyfileobj(src_handle, dst_handle, length=4 * 1024 * 1024)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to copy source '{source_file}' to '{target}': {exc}"
            ) from exc
        copied_files += 1
        copied_bytes += source_file.stat().st_size
    return copied_files, copied_bytes


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def create_launcher_files() -> None:
    start_ps1 = r"""$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root "Python312\python.exe"
$Main = Join-Path $Root "ComfyUI\main.py"
$UiUrl = "http://127.0.0.1:8191/indextts-ui"
$ApiUrl = "http://127.0.0.1:8191/indextts-ui/api/config"

$current = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "python.exe" -and
    $_.CommandLine -like "*ComfyUI\\main.py*" -and
    $_.CommandLine -like "*--port 8191*"
}

if (-not $current) {
    Start-Process -FilePath $Python `
        -ArgumentList $Main, "--disable-auto-launch", "--listen", "127.0.0.1", "--port", "8191" `
        -WorkingDirectory (Join-Path $Root "ComfyUI") | Out-Null
}

for ($i = 0; $i -lt 90; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing $ApiUrl | Out-Null
        Start-Process $UiUrl | Out-Null
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}

Start-Process $UiUrl | Out-Null
exit 0
"""
    stop_ps1 = r"""$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Main = Join-Path $Root "ComfyUI\main.py"
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
"""
    start_cmd = r"""@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start Simple IndexTTS.ps1"
"""
    stop_cmd = r"""@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop Simple IndexTTS.ps1"
"""
    readme_txt = """ComfyUI Simple IndexTTS Portable

How to run:
1. Double-click "Start Simple IndexTTS.cmd".
2. Wait for the browser to open http://127.0.0.1:8191/indextts-ui

How to stop:
1. Double-click "Stop Simple IndexTTS.cmd".

This package includes:
- Embedded Python runtime
- ComfyUI runtime
- ComfyUI-Simple-IndexTTs custom node
- Local models under ComfyUI/models
"""
    write_text(APP_DIR / "Start Simple IndexTTS.ps1", start_ps1)
    write_text(APP_DIR / "Stop Simple IndexTTS.ps1", stop_ps1)
    write_text(APP_DIR / "Start Simple IndexTTS.cmd", start_cmd)
    write_text(APP_DIR / "Stop Simple IndexTTS.cmd", stop_cmd)
    write_text(APP_DIR / "README.txt", readme_txt)


def create_manifest() -> None:
    manifest = {
        "productName": PRODUCT_NAME,
        "version": VERSION,
        "defaultInstallDir": r"%LOCALAPPDATA%\Programs\ComfyUI-Simple-IndexTTs",
        "launcherRelativePath": "Start Simple IndexTTS.cmd",
        "stopRelativePath": "Stop Simple IndexTTS.cmd",
        "webUiUrl": "http://127.0.0.1:8191/indextts-ui",
    }
    write_text(APP_DIR / "_installer" / "install_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))


def build_portable() -> Path:
    remove_path(PORTABLE_DIR)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    print("Copying embedded Python runtime...")
    python_files, python_bytes = copy_tree(PYTHON_DIR, APP_DIR / "Python312")
    print(f"  Python runtime: {python_files} files, {human_size(python_bytes)}")

    print("Copying ComfyUI runtime...")
    comfy_files, comfy_bytes = copy_tree(COMFY_DIR, APP_DIR / "ComfyUI")
    print(f"  ComfyUI runtime: {comfy_files} files, {human_size(comfy_bytes)}")

    remove_path(APP_DIR / "ComfyUI" / "custom_nodes" / "ComfyUI-Simple-IndexTTs")

    print("Copying plugin source into custom_nodes...")
    plugin_files, plugin_bytes = copy_tree(ROOT, PLUGIN_TARGET_DIR, blocked_prefixes=("_runtime",))
    print(f"  Plugin source: {plugin_files} files, {human_size(plugin_bytes)}")

    create_launcher_files()
    create_manifest()

    print()
    print(f"Portable app prepared at: {APP_DIR}")
    return APP_DIR


if __name__ == "__main__":
    build_portable()
