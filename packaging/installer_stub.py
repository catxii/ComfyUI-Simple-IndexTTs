from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


PRODUCT_NAME = "ComfyUI Simple IndexTTS"
MANIFEST_PATH = "_installer/install_manifest.json"
DEFAULT_PAYLOAD_NAME = "ComfyUI-Simple-IndexTTs-payload.zip"


def expand_env_path(raw_path: str) -> Path:
    return Path(os.path.expandvars(raw_path)).expanduser()


def create_shortcut(link_path: Path, target_path: Path, working_dir: Path) -> None:
    ps_script = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{str(link_path).replace("'", "''")}')
$Shortcut.TargetPath = '{str(target_path).replace("'", "''")}'
$Shortcut.WorkingDirectory = '{str(working_dir).replace("'", "''")}'
$Shortcut.IconLocation = '{str(target_path).replace("'", "''")},0'
$Shortcut.Save()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def prompt(text: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{text}{suffix}: ").strip()
    return value or default


def prompt_yes_no(text: str, default: bool = True) -> bool:
    default_label = "Y/n" if default else "y/N"
    value = input(f"{text} ({default_label}): ").strip().lower()
    if not value:
        return default
    return value in {"y", "yes", "1"}


def resolve_payload_archive(executable_path: Path) -> Path:
    if zipfile.is_zipfile(executable_path):
        return executable_path

    candidates = [
        executable_path.with_name(DEFAULT_PAYLOAD_NAME),
        executable_path.with_name(f"{executable_path.stem}-payload.zip"),
        executable_path.parent / DEFAULT_PAYLOAD_NAME,
    ]
    for candidate in candidates:
        if candidate.exists() and zipfile.is_zipfile(candidate):
            return candidate
    raise RuntimeError(
        "Installer payload was not found. Please keep the setup EXE and payload ZIP in the same folder."
    )


def read_manifest(archive_path: Path) -> tuple[dict, list[zipfile.ZipInfo], int]:
    with zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read(MANIFEST_PATH).decode("utf-8"))
        entries = [
            info for info in archive.infolist()
            if not info.is_dir() and not info.filename.startswith("_installer/")
        ]
        total_bytes = sum(info.file_size for info in entries)
    return manifest, entries, total_bytes


def extract_payload(archive_path: Path, install_dir: Path, entries: list[zipfile.ZipInfo], total_bytes: int) -> None:
    extracted_bytes = 0
    with zipfile.ZipFile(archive_path) as archive:
        for index, info in enumerate(entries, start=1):
            target_path = install_dir / info.filename
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src_handle, target_path.open("wb") as dst_handle:
                shutil.copyfileobj(src_handle, dst_handle, length=4 * 1024 * 1024)
            extracted_bytes += info.file_size
            progress = (extracted_bytes / total_bytes * 100) if total_bytes else 100.0
            print(f"\r[{progress:6.2f}%] {index}/{len(entries)} {info.filename[:100]:100}", end="", flush=True)
    print()


def create_shortcuts(manifest: dict, install_dir: Path, desktop: bool, start_menu: bool) -> None:
    launcher = install_dir / manifest["launcherRelativePath"]
    if desktop:
        create_shortcut(Path.home() / "Desktop" / f"{manifest['productName']}.lnk", launcher, install_dir)
    if start_menu:
        start_menu_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / manifest["productName"]
        start_menu_dir.mkdir(parents=True, exist_ok=True)
        create_shortcut(start_menu_dir / f"{manifest['productName']}.lnk", launcher, install_dir)


def main() -> None:
    executable_path = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
    payload_archive = resolve_payload_archive(executable_path)
    manifest, entries, total_bytes = read_manifest(payload_archive)

    default_dir = expand_env_path(manifest["defaultInstallDir"])
    print("=" * 72)
    print(f"{manifest['productName']} 安装程序")
    print(f"版本: {manifest['version']}")
    print(f"安装包大小(解压后): {total_bytes / (1024 ** 3):.2f} GB")
    print("=" * 72)
    print()

    install_dir = expand_env_path(prompt("安装目录", str(default_dir)))
    desktop_shortcut = prompt_yes_no("创建桌面快捷方式", True)
    start_menu_shortcut = prompt_yes_no("创建开始菜单快捷方式", True)
    launch_after_install = prompt_yes_no("安装完成后立即启动", True)
    print()

    if install_dir.exists() and any(install_dir.iterdir()):
        overwrite = prompt_yes_no(
            f"目标目录已存在内容，是否继续并覆盖文件？\n{install_dir}",
            False,
        )
        if not overwrite:
            print("已取消安装。")
            return

    install_dir.mkdir(parents=True, exist_ok=True)
    print("开始解压，请稍候...")
    extract_payload(payload_archive, install_dir, entries, total_bytes)

    print("创建快捷方式...")
    create_shortcuts(manifest, install_dir, desktop_shortcut, start_menu_shortcut)

    print()
    print(f"安装完成: {install_dir}")
    if launch_after_install:
        launcher = install_dir / manifest["launcherRelativePath"]
        subprocess.Popen([str(launcher)], cwd=str(install_dir), shell=True)
        print("已启动应用。")
    else:
        print("你可以稍后双击 'Start Simple IndexTTS.cmd' 启动。")

    input("按 Enter 键退出安装程序...")


if __name__ == "__main__":
    main()
