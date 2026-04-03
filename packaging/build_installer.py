from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from build_portable import APP_DIR, DIST_DIR, PRODUCT_NAME, ROOT, VERSION, build_portable


STUB_SCRIPT = ROOT / "packaging" / "installer_stub.py"
BUILD_ROOT = DIST_DIR / "build-installer"
STUB_BUILD_DIR = BUILD_ROOT / "pyinstaller"
STUB_DIST_DIR = BUILD_ROOT / "stub-dist"
PAYLOAD_ZIP = DIST_DIR / "ComfyUI-Simple-IndexTTs-payload.zip"
FINAL_EXE = DIST_DIR / f"ComfyUI-Simple-IndexTTs-{VERSION}-setup.exe"
INSTALLER_BUNDLE_DIR = DIST_DIR / f"ComfyUI-Simple-IndexTTs-{VERSION}-installer"
INSTALLER_README = INSTALLER_BUNDLE_DIR / "请把整个文件夹发给别人.txt"


def find_python_executable() -> Path:
    candidates = [
        Path(sys.executable),
        ROOT / "_runtime" / "Python312" / "python.exe",
        ROOT / ".venv" / "Scripts" / "python.exe",
    ]
    for candidate in candidates:
        if not candidate.exists():
            continue
        probe = subprocess.run(
            [str(candidate), "--version"],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0:
            return candidate
    raise RuntimeError("Unable to find a usable Python executable for packaging.")


def ensure_pyinstaller() -> None:
    python_exe = find_python_executable()
    probe = subprocess.run(
        [str(python_exe), "-m", "PyInstaller", "--version"],
        cwd=str(ROOT),
        check=False,
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return
    subprocess.run(
        [str(python_exe), "-m", "pip", "install", "pyinstaller"],
        check=True,
        cwd=str(ROOT),
    )


def reset_build_dirs() -> None:
    for path in (STUB_BUILD_DIR, STUB_DIST_DIR):
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)


def build_stub() -> Path:
    ensure_pyinstaller()
    python_exe = find_python_executable()
    reset_build_dirs()
    subprocess.run(
        [
            str(python_exe),
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            "ComfyUI-Simple-IndexTTs-Installer",
            "--distpath",
            str(STUB_DIST_DIR),
            "--workpath",
            str(STUB_BUILD_DIR / "work"),
            "--specpath",
            str(STUB_BUILD_DIR / "spec"),
            str(STUB_SCRIPT),
        ],
        check=True,
        cwd=str(ROOT),
    )
    return STUB_DIST_DIR / "ComfyUI-Simple-IndexTTs-Installer.exe"


def build_payload_zip() -> Path:
    if PAYLOAD_ZIP.exists():
        PAYLOAD_ZIP.unlink()

    files = [path for path in APP_DIR.rglob("*") if path.is_file()]
    total = len(files)
    with zipfile.ZipFile(PAYLOAD_ZIP, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for index, path in enumerate(files, start=1):
            archive.write(path, arcname=path.relative_to(APP_DIR).as_posix())
            if index % 500 == 0 or index == total:
                print(f"Payload zip: {index}/{total}")
    return PAYLOAD_ZIP


def build_installer(skip_portable: bool = False) -> Path:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if not skip_portable:
        build_portable()
    elif not APP_DIR.exists():
        raise RuntimeError("Portable app directory does not exist. Run without --skip-portable first.")

    print("Building installer stub...")
    stub_exe = build_stub()

    print("Building payload zip...")
    payload_zip = build_payload_zip()

    if INSTALLER_BUNDLE_DIR.exists():
        shutil.rmtree(INSTALLER_BUNDLE_DIR)
    INSTALLER_BUNDLE_DIR.mkdir(parents=True, exist_ok=True)

    if FINAL_EXE.exists():
        FINAL_EXE.unlink()

    print("Preparing installer bundle...")
    shutil.copy2(stub_exe, FINAL_EXE)
    shutil.copy2(FINAL_EXE, INSTALLER_BUNDLE_DIR / FINAL_EXE.name)
    shutil.copy2(payload_zip, INSTALLER_BUNDLE_DIR / PAYLOAD_ZIP.name)
    INSTALLER_README.write_text(
        "\n".join(
            [
                "请把这个文件夹整个发给对方，不要只发 setup.exe。",
                "",
                "对方安装步骤：",
                "1. 保持 setup.exe 和 payload.zip 在同一个文件夹里。",
                f"2. 双击 {FINAL_EXE.name}。",
                "3. 按提示选择安装目录并完成安装。",
            ]
        ),
        encoding="utf-8",
    )

    print()
    print(f"{PRODUCT_NAME} installer created:")
    print(FINAL_EXE)
    print(INSTALLER_BUNDLE_DIR)
    return FINAL_EXE


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Windows installer bundle for ComfyUI Simple IndexTTS.")
    parser.add_argument("--skip-portable", action="store_true", help="Reuse the existing dist/portable directory.")
    args = parser.parse_args()
    build_installer(skip_portable=args.skip_portable)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
