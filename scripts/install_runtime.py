from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import textwrap
import urllib.request
import zipfile
from pathlib import Path


COMFYUI_COMMIT = "7d437687c260df7772c603658111148e0e863e59"
COMFYUI_ARCHIVE_URL = f"https://github.com/comfyanonymous/ComfyUI/archive/{COMFYUI_COMMIT}.zip"
PYTHON_RUNTIME_DIRNAME = "Python312"
PRODUCT_NAME = "ComfyUI Simple IndexTTS"

TOP_LEVEL_EXCLUDES = {
    ".git",
    ".venv",
    "_runtime",
    "dist",
    "__pycache__",
}


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"> {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_repo(source: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        if item.name in TOP_LEVEL_EXCLUDES:
            continue
        destination = target / item.name
        if item.is_dir():
            shutil.copytree(item, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(item, destination)


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output, length=4 * 1024 * 1024)


def install_comfyui(runtime_dir: Path) -> None:
    comfy_dir = runtime_dir / "ComfyUI"
    if comfy_dir.exists() and (comfy_dir / "main.py").exists():
        return

    archive_path = runtime_dir / "downloads" / f"ComfyUI-{COMFYUI_COMMIT}.zip"
    print(f"Downloading ComfyUI {COMFYUI_COMMIT} ...")
    download_file(COMFYUI_ARCHIVE_URL, archive_path)

    with tempfile.TemporaryDirectory(prefix="comfyui-extract-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(temp_dir)
        extracted_root = next(temp_dir.iterdir())
        shutil.copytree(extracted_root, comfy_dir, dirs_exist_ok=True)


def create_venv(base_python: str, venv_dir: Path) -> Path:
    if not (venv_dir / "Scripts" / "python.exe").exists():
        run([base_python, "-m", "venv", str(venv_dir)])
    return venv_dir / "Scripts" / "python.exe"


def build_filtered_requirements(source: Path, destination: Path, blocked_prefixes: tuple[str, ...]) -> Path:
    lines: list[str] = []
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        normalized = stripped.replace(" ", "").lower()
        if any(normalized.startswith(prefix) for prefix in blocked_prefixes):
            continue
        lines.append(stripped)
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return destination


def install_python_dependencies(source_dir: Path, install_dir: Path, venv_python: Path, torch_backend: str) -> None:
    runtime_dir = install_dir / "_runtime"
    comfy_dir = runtime_dir / "ComfyUI"

    run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"])

    comfy_requirements = runtime_dir / "comfyui.requirements.filtered.txt"
    build_filtered_requirements(
        comfy_dir / "requirements.txt",
        comfy_requirements,
        ("torch", "torchaudio", "torchvision", "transformers"),
    )
    run([str(venv_python), "-m", "pip", "install", "-r", str(comfy_requirements)])

    if torch_backend == "cu128":
        run(
            [
                str(venv_python),
                "-m",
                "pip",
                "install",
                "torch==2.9.0",
                "torchvision==0.24.0",
                "torchaudio==2.9.0",
                "--index-url",
                "https://download.pytorch.org/whl/cu128",
            ]
        )
    else:
        run(
            [
                str(venv_python),
                "-m",
                "pip",
                "install",
                "torch==2.9.0",
                "torchvision==0.24.0",
                "torchaudio==2.9.0",
            ]
        )

    plugin_requirements = runtime_dir / "plugin.requirements.filtered.txt"
    build_filtered_requirements(
        source_dir / "requirements.txt",
        plugin_requirements,
        ("torch", "torchaudio", "torchvision", "transformers"),
    )
    run([str(venv_python), "-m", "pip", "install", "-r", str(plugin_requirements)])
    run([str(venv_python), "-m", "pip", "install", "transformers<=4.57.1"])


def install_plugin(source_dir: Path, install_dir: Path) -> None:
    plugin_target = install_dir / "_runtime" / "ComfyUI" / "custom_nodes" / "ComfyUI-Simple-IndexTTs"
    if plugin_target.exists():
        shutil.rmtree(plugin_target)
    shutil.copytree(source_dir, plugin_target, dirs_exist_ok=True)


def predownload_models(venv_python: Path, install_dir: Path) -> None:
    model_dir = install_dir / "_runtime" / "ComfyUI" / "models" / "indextts"
    helper = textwrap.dedent(
        f"""
        from huggingface_hub import hf_hub_download, snapshot_download
        from pathlib import Path

        model_dir = Path(r"{model_dir}")
        model_dir.mkdir(parents=True, exist_ok=True)

        snapshot_download(
            repo_id="IndexTeam/IndexTTS-2",
            local_dir=str(model_dir),
            local_dir_use_symlinks=False,
            resume_download=True,
        )
        snapshot_download(
            repo_id="facebook/w2v-bert-2.0",
            cache_dir=str(model_dir),
            resume_download=True,
        )
        hf_hub_download(
            repo_id="amphion/MaskGCT",
            filename="semantic_codec/model.safetensors",
            cache_dir=str(model_dir),
            resume_download=True,
        )
        hf_hub_download(
            repo_id="funasr/campplus",
            filename="campplus_cn_common.bin",
            cache_dir=str(model_dir),
            resume_download=True,
        )
        snapshot_download(
            repo_id="nvidia/bigvgan_v2_22khz_80band_256x",
            cache_dir=str(model_dir),
            resume_download=True,
        )
        print("model download completed")
        """
    )
    run([str(venv_python), "-c", helper])


def write_launchers(install_dir: Path) -> None:
    start_ps1 = r"""$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root "_runtime\Python312\Scripts\python.exe"
$Main = Join-Path $Root "_runtime\ComfyUI\main.py"
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
        -WorkingDirectory (Join-Path $Root "_runtime\ComfyUI") | Out-Null
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

Write-Host "服务启动超时，请手动检查日志。"
Start-Process $UiUrl | Out-Null
exit 0
"""
    stop_ps1 = r"""$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
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
"""
    start_cmd = '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start Simple IndexTTS.ps1"\r\n'
    stop_cmd = '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop Simple IndexTTS.ps1"\r\n'
    readme_txt = """ComfyUI Simple IndexTTS

Start:
  Double-click "Start Simple IndexTTS.cmd"

Stop:
  Double-click "Stop Simple IndexTTS.cmd"
"""

    (install_dir / "Start Simple IndexTTS.ps1").write_text(start_ps1, encoding="utf-8")
    (install_dir / "Stop Simple IndexTTS.ps1").write_text(stop_ps1, encoding="utf-8")
    (install_dir / "Start Simple IndexTTS.cmd").write_text(start_cmd, encoding="utf-8")
    (install_dir / "Stop Simple IndexTTS.cmd").write_text(stop_cmd, encoding="utf-8")
    (install_dir / "README-INSTALL.txt").write_text(readme_txt, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Install ComfyUI Simple IndexTTS from a source checkout.")
    parser.add_argument("--source", required=True, help="Path to extracted source repository.")
    parser.add_argument("--install-dir", required=True, help="Final installation directory.")
    parser.add_argument("--python-exe", required=True, help="Base Python 3.12 executable.")
    parser.add_argument("--torch-backend", choices=("cu128", "cpu"), default="cu128")
    parser.add_argument("--skip-model-download", action="store_true")
    args = parser.parse_args()

    source_dir = Path(args.source).resolve()
    install_dir = Path(args.install_dir).resolve()
    runtime_dir = install_dir / "_runtime"

    print(f"Installing {PRODUCT_NAME} into {install_dir}")
    install_dir.mkdir(parents=True, exist_ok=True)
    copy_repo(source_dir, install_dir)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    install_comfyui(runtime_dir)
    venv_python = create_venv(args.python_exe, runtime_dir / PYTHON_RUNTIME_DIRNAME)
    install_python_dependencies(source_dir, install_dir, venv_python, args.torch_backend)
    install_plugin(source_dir, install_dir)
    write_launchers(install_dir)

    if not args.skip_model_download:
        predownload_models(venv_python, install_dir)

    print()
    print("Installation completed.")
    print(f"Launch with: {install_dir / 'Start Simple IndexTTS.cmd'}")


if __name__ == "__main__":
    main()
