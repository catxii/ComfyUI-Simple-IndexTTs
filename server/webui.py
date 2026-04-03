from __future__ import annotations

import asyncio
import importlib
import logging
import os
import re
import threading
import time
import uuid
from pathlib import Path

import folder_paths
import librosa
import numpy as np
import soundfile as sf
import torch
import torchaudio
from aiohttp import web

from .infer_v2 import IndexTTS2

PromptServer = importlib.import_module("server").PromptServer

LOGGER = logging.getLogger("ComfyUI-Simple-IndexTTS.webui")
BASE_DIR = Path(__file__).resolve().parent.parent
WEBUI_DIR = BASE_DIR / "webui"
ROLE_AUDIO_DIR = Path(folder_paths.get_input_directory()) / "indextts_ui" / "roles"
GENERATED_AUDIO_DIR = Path(folder_paths.get_output_directory()) / "indextts_ui" / "generated"
MERGED_AUDIO_DIR = Path(folder_paths.get_output_directory()) / "indextts_ui" / "merged"
VOICE_PREVIEW_DIR = Path(folder_paths.get_output_directory()) / "indextts_ui" / "voice_previews"
DEFAULT_CFG_PATH = Path(folder_paths.models_dir) / "indextts" / "config.yaml"
DEFAULT_MODEL_DIR = Path(folder_paths.models_dir) / "indextts"

MODEL_LOCK = asyncio.Lock()
GENERATE_LOCK = asyncio.Lock()
MODEL_CACHE: dict[str, object] = {"instance": None, "local_files_only": None}
MODEL_STATUS = {"loaded": False, "loading": False, "error": None}
GENERATION_TASKS_LOCK = threading.Lock()
GENERATION_TASKS: dict[str, dict[str, object]] = {}
MERGE_TASKS_LOCK = threading.Lock()
MERGE_TASKS: dict[str, dict[str, object]] = {}


class GenerationCancelledError(Exception):
    pass


def normalize_user_error(exc: Exception | str) -> str:
    message = str(exc or "").strip()
    if not message:
        return "发生未知错误。"

    cache_match = re.search(r"([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+) is not available in the local cache", message)
    if cache_match:
        model_name = cache_match.group(1)
        return (
            f"本地缓存里没有模型“{model_name}”。请先关闭“仅使用本地缓存模型”，"
            "再点击“预热模型”或运行一次 AutoLoadModel 下载模型。"
        )

    if "LocalEntryNotFoundError" in message and "outgoing traffic has been disabled" in message:
        return "本地缓存里缺少模型文件。请先关闭“仅使用本地缓存模型”，再下载缺失模型。"

    if "Cannot find the requested files in the disk cache" in message:
        return "本地缓存里缺少模型文件。请先关闭“仅使用本地缓存模型”，再下载缺失模型。"

    return message

EMOTION_PRESETS = {
    "平静": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    "温柔": [0.16, 0.0, 0.08, 0.0, 0.0, 0.28, 0.0, 0.56],
    "开心": [0.92, 0.0, 0.0, 0.0, 0.0, 0.0, 0.12, 0.08],
    "激动": [0.52, 0.14, 0.0, 0.0, 0.0, 0.0, 0.46, 0.0],
    "生气": [0.0, 0.96, 0.0, 0.08, 0.18, 0.0, 0.0, 0.0],
    "悲伤": [0.0, 0.0, 0.82, 0.08, 0.0, 0.34, 0.0, 0.0],
    "惊讶": [0.12, 0.0, 0.0, 0.0, 0.0, 0.0, 0.96, 0.0],
    "癫狂": [0.34, 0.46, 0.0, 0.12, 0.14, 0.0, 0.3, 0.0],
}


def ensure_webui_dirs() -> None:
    ROLE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    MERGED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    VOICE_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str, fallback: str = "audio") -> str:
    value = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", (value or "").strip(), flags=re.UNICODE)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or fallback


def build_public_url(bucket: str, filename: str) -> str:
    return f"/indextts-ui/api/file/{bucket}/{filename}"


def build_generated_wav_url(filename: str) -> str:
    return f"/indextts-ui/api/generated-wav/{filename}"


def resolve_bucket_dir(bucket: str) -> Path:
    mapping = {
        "roles": ROLE_AUDIO_DIR,
        "generated": GENERATED_AUDIO_DIR,
        "merged": MERGED_AUDIO_DIR,
        "voice-previews": VOICE_PREVIEW_DIR,
    }
    if bucket not in mapping:
        raise web.HTTPNotFound(text="Unknown file bucket")
    return mapping[bucket]


def safe_file_path(bucket: str, filename: str) -> Path:
    base = resolve_bucket_dir(bucket).resolve()
    target = (base / filename).resolve()
    if base not in target.parents and target != base:
        raise web.HTTPForbidden(text="Invalid file path")
    return target


def ensure_generated_wav_file(filename: str) -> tuple[Path, str]:
    source_path = safe_file_path("generated", filename)
    if not source_path.exists():
        raise web.HTTPNotFound(text="File not found")

    if source_path.suffix.lower() == ".wav":
        return source_path, source_path.name

    wav_name = f"{source_path.stem}.wav"
    wav_path = safe_file_path("generated", wav_name)
    if (not wav_path.exists()) or wav_path.stat().st_mtime < source_path.stat().st_mtime:
        data, sample_rate = sf.read(str(source_path), dtype="int16", always_2d=True)
        sf.write(str(wav_path), data, sample_rate, format="WAV", subtype="PCM_16")
    return wav_path, wav_name


def load_role_waveform(audio_path: str) -> torch.Tensor:
    waveform, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    waveform = torch.from_numpy(waveform.T.copy())
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sample_rate != 22050:
        waveform = torchaudio.functional.resample(waveform, sample_rate, 22050)
    return waveform


def clamp_number(value, min_value: float, max_value: float, default: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = default
    return max(min_value, min(max_value, numeric))


def normalize_audio_settings(settings: dict | None) -> dict[str, float]:
    raw = settings or {}
    return {
        "volume": clamp_number(raw.get("volume", 100), 0, 200, 100),
        "pitch": clamp_number(raw.get("pitch", 0), -12, 12, 0),
        "speed": clamp_number(raw.get("speed", 100), 50, 150, 100),
    }


ZH_DIGIT_MAP = {
    "0": "零",
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
    "8": "八",
    "9": "九",
}


def convert_digits_to_spoken_text(text: str) -> str:
    def replace_match(match: re.Match[str]) -> str:
        raw = match.group(0)
        return "".join(ZH_DIGIT_MAP.get(ch, ch) for ch in raw)

    return re.sub(r"\d+", replace_match, text)


def parse_pronunciation_overrides(raw_text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for raw_line in str(raw_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        separator_index = next((i for i, ch in enumerate(line) if ch in {"|", "｜"}), -1)
        if separator_index < 0:
            continue
        source = line[:separator_index].strip()
        target = line[separator_index + 1 :].strip()
        if not source or not target:
            continue
        pairs.append((source, target))
    return pairs


def apply_pronunciation_overrides(text: str, overrides: list[tuple[str, str]]) -> str:
    processed = text
    for source, target in sorted(overrides, key=lambda item: len(item[0]), reverse=True):
        processed = processed.replace(source, f" {target} ")
    processed = re.sub(r"[ \t]{2,}", " ", processed)
    processed = re.sub(r"\s+([，。！？；：,.!?;:])", r"\1", processed)
    return processed.strip()


def preprocess_line_text(text: str, line: dict) -> str:
    processed = (text or "").strip()
    if not processed:
        return processed

    if str(line.get("numberReadingMode") or "default") == "digits":
        processed = convert_digits_to_spoken_text(processed)

    overrides = parse_pronunciation_overrides(str(line.get("pronunciationOverridesText") or ""))
    if overrides:
        processed = apply_pronunciation_overrides(processed, overrides)

    return processed


def apply_audio_settings_to_path(audio_path: Path, settings: dict | None) -> None:
    normalized = normalize_audio_settings(settings)
    volume = normalized["volume"] / 100.0
    pitch = normalized["pitch"]
    speed = normalized["speed"] / 100.0

    if abs(volume - 1.0) < 1e-6 and abs(pitch) < 1e-6 and abs(speed - 1.0) < 1e-6:
        return

    data, sample_rate = sf.read(str(audio_path), dtype="float32", always_2d=True)
    processed_channels: list[np.ndarray] = []

    for channel_index in range(data.shape[1]):
        channel = data[:, channel_index].astype(np.float32, copy=True)
        if abs(speed - 1.0) >= 1e-6:
            channel = librosa.effects.time_stretch(y=channel, rate=speed)
        if abs(pitch) >= 1e-6:
            channel = librosa.effects.pitch_shift(y=channel, sr=sample_rate, n_steps=pitch)
        if abs(volume - 1.0) >= 1e-6:
            channel = channel * volume
        processed_channels.append(np.clip(channel, -0.999, 0.999))

    max_length = max((channel.shape[0] for channel in processed_channels), default=0)
    processed = np.zeros((max_length, len(processed_channels)), dtype=np.float32)
    for index, channel in enumerate(processed_channels):
        processed[: channel.shape[0], index] = channel

    format_name = "WAV" if audio_path.suffix.lower() == ".wav" else "FLAC"
    sf.write(str(audio_path), processed, sample_rate, format=format_name, subtype="PCM_16")


def merge_audio_files(paths: list[Path], silence_ms: int, output_path: Path, progress_callback=None) -> None:
    chunks: list[np.ndarray] = []
    target_sr = 22050
    silence = np.zeros(int(target_sr * (max(silence_ms, 0) / 1000.0)), dtype=np.int16)
    total_steps = max(len(paths) + 1, 1)

    for index, audio_path in enumerate(paths):
        if progress_callback:
            progress_callback(index / total_steps, f"读取音频 {index + 1}/{len(paths)}...")
        data, sample_rate = sf.read(str(audio_path), dtype="int16", always_2d=True)
        mono = data[:, 0]
        if sample_rate != target_sr:
            mono = librosa.resample(mono.astype(np.float32), orig_sr=sample_rate, target_sr=target_sr)
            mono = np.clip(mono, -32768, 32767).astype(np.int16)
        chunks.append(mono)
        if silence.size and index < len(paths) - 1:
            chunks.append(silence)

    if progress_callback:
        progress_callback((total_steps - 1) / total_steps, "写入合并音频...")
    merged = np.concatenate(chunks) if chunks else np.zeros(target_sr // 2, dtype=np.int16)
    sf.write(str(output_path), merged, target_sr, format="WAV", subtype="PCM_16")
    if progress_callback:
        progress_callback(1.0, "合并完成")


def create_output_filename(prefix: str, role_name: str, line_index: int) -> str:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    clean_prefix = slugify(prefix or "indextts")
    clean_role = slugify(role_name or "role")
    return f"{clean_prefix}_{clean_role}_{line_index:03}_{stamp}_{uuid.uuid4().hex[:8]}.flac"


def create_stream_preview_filename(task_key: str) -> str:
    return f"stream_{slugify(task_key, 'task')}.wav"


def create_voice_preview_filename(voice_name: str, emotion_name: str) -> str:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    clean_voice = slugify(voice_name or "voice")
    clean_emotion = slugify(emotion_name or "emotion")
    return f"preview_{clean_voice}_{clean_emotion}_{stamp}_{uuid.uuid4().hex[:8]}.flac"


def resolve_line_emotion(line: dict) -> dict:
    preset_name = line.get("emotionPreset") or "平静"
    payload: dict[str, object] = {}
    if line.get("emotionMode") == "text" and line.get("emotionText", "").strip():
        payload["use_emo_text"] = True
        payload["emo_text"] = line["emotionText"].strip()
        payload["emo_alpha"] = float(line.get("emotionStrength", 0.6))
        return payload

    vector = EMOTION_PRESETS.get(preset_name, EMOTION_PRESETS["平静"])
    if any(value > 0 for value in vector):
        payload["emo_vector"] = vector
        payload["use_random"] = False
    return payload


def finalize_emotion_kwargs(model: IndexTTS2, kwargs: dict, *, for_preview: bool = False) -> dict:
    normalized = dict(kwargs or {})
    emo_vector = normalized.get("emo_vector")
    if emo_vector is not None:
        normalized["emo_vector"] = model.normalize_emo_vec(
            list(emo_vector),
            apply_bias=not for_preview,
        )
    return normalized


def run_generation_sync(
    model: IndexTTS2,
    role: dict,
    line: dict,
    settings: dict,
    line_index: int,
    task_key: str,
    progress_callback=None,
    preview_callback=None,
    should_cancel=None,
) -> dict:
    ensure_webui_dirs()
    audio_name = role.get("audioFile")
    if not audio_name:
        raise ValueError(f"角色“{role.get('name') or '未命名角色'}”还没有上传参考音频。")

    role_path = safe_file_path("roles", audio_name)
    if not role_path.exists():
        raise FileNotFoundError(f"找不到角色音频：{audio_name}")

    text = preprocess_line_text((line.get("text") or "").strip(), line)
    if not text:
        raise ValueError("台词内容不能为空。")

    waveform = load_role_waveform(str(role_path))
    filename = create_output_filename(settings.get("outputPrefix", "indextts"), role.get("name", "role"), line_index)
    output_path = GENERATED_AUDIO_DIR / filename
    preview_filename = create_stream_preview_filename(task_key)
    preview_path = GENERATED_AUDIO_DIR / preview_filename
    kwargs = finalize_emotion_kwargs(model, resolve_line_emotion(line))

    previous_progress = getattr(model, "gr_progress", None)
    model.gr_progress = progress_callback

    try:
        stream_chunks: list[torch.Tensor] = []
        stream_generator = model.infer(
            spk_audio_prompt=waveform,
            text=text,
            output_path=str(output_path),
            verbose=True,
            stream_return=True,
            **kwargs,
        )
        sampling_rate = 22050
        preview_revision = 0
        for chunk in stream_generator:
            if should_cancel and should_cancel():
                raise GenerationCancelledError("已停止生成")
            if not isinstance(chunk, torch.Tensor):
                continue
            stream_chunks.append(chunk.cpu())
            preview_wave = torch.cat(stream_chunks, dim=1)
            sf.write(
                str(preview_path),
                preview_wave.type(torch.int16).squeeze(0).numpy(),
                sampling_rate,
                format="WAV",
                subtype="PCM_16",
            )
            preview_revision += 1
            if preview_callback:
                preview_callback(
                    {
                        "audioFile": preview_filename,
                        "audioUrl": f"{build_public_url('generated', preview_filename)}?v={preview_revision}",
                        "durationSeconds": round(preview_wave.shape[-1] / sampling_rate, 2),
                        "revision": preview_revision,
                    }
                )
    finally:
        model.gr_progress = previous_progress

    apply_audio_settings_to_path(output_path, line.get("audioSettings"))

    return {
        "audioFile": filename,
        "audioUrl": build_public_url("generated", filename),
        "durationSeconds": round(sf.info(str(output_path)).duration, 2),
        "previewAudioFile": preview_filename,
    }


def run_voice_preview_sync(
    model: IndexTTS2,
    voice: dict,
    emotion_preset: str,
    preview_text: str,
    settings: dict,
) -> dict:
    ensure_webui_dirs()
    audio_name = voice.get("audioFile")
    if not audio_name:
        raise ValueError("音色还没有参考音频。")

    role_path = safe_file_path("roles", audio_name)
    if not role_path.exists():
        raise FileNotFoundError(f"找不到音色参考音频：{audio_name}")

    text = (preview_text or "").strip() or f"这是一段{emotion_preset or '平静'}情绪试听。"
    waveform = load_role_waveform(str(role_path))
    output_name = create_voice_preview_filename(voice.get("name", "voice"), emotion_preset or "平静")
    output_path = VOICE_PREVIEW_DIR / output_name
    preview_line = {
        "emotionMode": "preset",
        "emotionPreset": emotion_preset or "平静",
        "text": text,
    }
    kwargs = finalize_emotion_kwargs(model, resolve_line_emotion(preview_line), for_preview=True)

    previous_progress = getattr(model, "gr_progress", None)
    model.gr_progress = None

    try:
        model.infer(
            spk_audio_prompt=waveform,
            text=text,
            output_path=str(output_path),
            verbose=True,
            **kwargs,
        )
    finally:
        model.gr_progress = previous_progress

    return {
        "audioFile": output_name,
        "audioUrl": build_public_url("voice-previews", output_name),
        "durationSeconds": round(sf.info(str(output_path)).duration, 2),
        "emotionPreset": emotion_preset,
    }


async def get_tts_model(local_files_only: bool) -> IndexTTS2:
    async with MODEL_LOCK:
        cached = MODEL_CACHE.get("instance")
        if cached is not None and MODEL_CACHE.get("local_files_only") == local_files_only:
            return cached

        MODEL_STATUS["loading"] = True
        MODEL_STATUS["error"] = None
        try:
            model = await asyncio.to_thread(
                IndexTTS2,
                cfg_path=str(DEFAULT_CFG_PATH),
                model_dir=str(DEFAULT_MODEL_DIR),
                use_cuda_kernel=False,
                local_files_only=local_files_only,
            )
            MODEL_CACHE["instance"] = model
            MODEL_CACHE["local_files_only"] = local_files_only
            MODEL_STATUS["loaded"] = True
            return model
        except Exception as exc:
            MODEL_STATUS["loaded"] = False
            MODEL_STATUS["error"] = normalize_user_error(exc)
            raise
        finally:
            MODEL_STATUS["loading"] = False


async def json_request(request: web.Request) -> dict:
    try:
        return await request.json()
    except Exception as exc:
        raise web.HTTPBadRequest(text=f"Invalid JSON payload: {exc}") from exc


def set_generation_task(
    task_key: str,
    status: str,
    result: dict | None = None,
    preview: dict | None = None,
    error: str | None = None,
    progress: float | None = None,
    description: str | None = None,
) -> None:
    with GENERATION_TASKS_LOCK:
        task = GENERATION_TASKS.get(
            task_key,
            {
                "taskKey": task_key,
                "status": "missing",
                "result": None,
                "preview": None,
                "error": None,
                "progress": 0.0,
                "description": "",
                "cancelRequested": False,
            },
        )
        task["status"] = status
        if result is not None:
            task["result"] = result
        if preview is not None:
            task["preview"] = preview
        if error is not None:
            task["error"] = error
        if progress is not None:
            task["progress"] = max(0.0, min(1.0, float(progress)))
        if description is not None:
            task["description"] = description
        task["updatedAt"] = time.time()
        GENERATION_TASKS[task_key] = task


def set_merge_task(
    task_key: str,
    status: str,
    result: dict | None = None,
    error: str | None = None,
    progress: float | None = None,
    description: str | None = None,
) -> None:
    with MERGE_TASKS_LOCK:
        task = MERGE_TASKS.get(
            task_key,
            {
                "taskKey": task_key,
                "status": status,
                "result": None,
                "error": None,
                "progress": 0.0,
                "description": "",
                "updatedAt": time.time(),
            },
        )
        task["status"] = status
        task["updatedAt"] = time.time()
        if result is not None:
            task["result"] = result
        if error is not None:
            task["error"] = error
        if progress is not None:
            task["progress"] = progress
        if description is not None:
            task["description"] = description
        MERGE_TASKS[task_key] = task


def request_generation_cancel(task_key: str) -> bool:
    with GENERATION_TASKS_LOCK:
        task = GENERATION_TASKS.get(task_key)
        if not task:
            return False
        task["cancelRequested"] = True
        task["status"] = "cancelling"
        task["description"] = "正在停止..."
        task["updatedAt"] = time.time()
        GENERATION_TASKS[task_key] = task
    return True


def is_generation_cancel_requested(task_key: str) -> bool:
    with GENERATION_TASKS_LOCK:
        task = GENERATION_TASKS.get(task_key)
        return bool(task and task.get("cancelRequested"))


@PromptServer.instance.routes.get("/indextts-ui")
async def indextts_ui_page(request: web.Request):
    ensure_webui_dirs()
    return web.FileResponse(WEBUI_DIR / "index.html")


@PromptServer.instance.routes.get("/indextts-ui/app.js")
async def indextts_ui_js(request: web.Request):
    return web.FileResponse(WEBUI_DIR / "app.js")


@PromptServer.instance.routes.get("/indextts-ui/styles.css")
async def indextts_ui_css(request: web.Request):
    return web.FileResponse(WEBUI_DIR / "styles.css")


@PromptServer.instance.routes.get("/indextts-ui/api/config")
async def indextts_ui_config(request: web.Request):
    ensure_webui_dirs()
    return web.json_response(
            {
                "emotionPresets": list(EMOTION_PRESETS.keys()),
                "defaultSettings": {
                    "localFilesOnly": True,
                    "outputPrefix": "indextts_ui",
                    "mergeSilenceMs": 300,
                },
                "modelStatus": MODEL_STATUS,
            }
        )


@PromptServer.instance.routes.post("/indextts-ui/api/upload-role-audio")
async def indextts_ui_upload_role_audio(request: web.Request):
    ensure_webui_dirs()
    reader = await request.multipart()
    file_part = await reader.next()
    if file_part is None or file_part.name != "file":
        raise web.HTTPBadRequest(text="Missing audio file field")

    filename = file_part.filename or "role.wav"
    ext = Path(filename).suffix or ".wav"
    saved_name = f"{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    saved_path = ROLE_AUDIO_DIR / saved_name

    with saved_path.open("wb") as handle:
        while True:
            chunk = await file_part.read_chunk()
            if not chunk:
                break
            handle.write(chunk)

    return web.json_response(
        {
            "audioFile": saved_name,
            "audioUrl": build_public_url("roles", saved_name),
        }
    )


@PromptServer.instance.routes.post("/indextts-ui/api/preview-voice")
async def indextts_ui_preview_voice(request: web.Request):
    payload = await json_request(request)
    voice = payload.get("voice") or {}
    emotion_preset = str(payload.get("emotionPreset") or "平静")
    preview_text = str(payload.get("previewText") or "").strip()
    settings = payload.get("settings") or {}

    if not voice.get("audioFile"):
        raise web.HTTPBadRequest(text="缺少音色参考音频。")

    try:
        model = await get_tts_model(bool(settings.get("localFilesOnly", True)))
        async with GENERATE_LOCK:
            result = await asyncio.to_thread(
                run_voice_preview_sync,
                model,
                voice,
                emotion_preset,
                preview_text,
                settings,
            )
    except Exception as exc:
        LOGGER.exception("Voice preview generation failed")
        raise web.HTTPBadRequest(text=normalize_user_error(exc)) from exc

    return web.json_response(result)


@PromptServer.instance.routes.post("/indextts-ui/api/generate-line")
async def indextts_ui_generate_line(request: web.Request):
    payload = await json_request(request)
    role = payload.get("role") or {}
    line = payload.get("line") or {}
    settings = payload.get("settings") or {}
    line_index = int(payload.get("lineIndex", 0))
    task_key = str(payload.get("taskKey") or uuid.uuid4().hex)

    set_generation_task(task_key, "running", progress=0.0, description="starting inference...")

    def progress_callback(value, desc=None):
        set_generation_task(
            task_key,
            "running",
            progress=value,
            description=desc or "",
        )

    def preview_callback(preview_payload):
        set_generation_task(
            task_key,
            "running",
            preview=preview_payload,
        )

    try:
        model = await get_tts_model(bool(settings.get("localFilesOnly", True)))
        async with GENERATE_LOCK:
            result = await asyncio.to_thread(
                run_generation_sync,
                model,
                role,
                line,
                settings,
                line_index,
                task_key,
                progress_callback,
                preview_callback,
                lambda: is_generation_cancel_requested(task_key),
            )
    except GenerationCancelledError:
        with GENERATION_TASKS_LOCK:
            task = GENERATION_TASKS.get(task_key) or {}
            preview = task.get("preview")
        cancel_result = {"cancelled": True}
        if preview:
            cancel_result["preview"] = preview
        set_generation_task(task_key, "cancelled", result=cancel_result, description="已停止生成")
        return web.json_response({"taskKey": task_key, "status": "cancelled", **cancel_result})
    except Exception as exc:
        set_generation_task(task_key, "error", error=normalize_user_error(exc))
        LOGGER.exception("Line generation failed")
        raise web.HTTPBadRequest(text=normalize_user_error(exc)) from exc

    set_generation_task(task_key, "completed", result=result, progress=1.0, description="completed")

    return web.json_response({"taskKey": task_key, **result})


@PromptServer.instance.routes.get("/indextts-ui/api/generation-status")
async def indextts_ui_generation_status(request: web.Request):
    task_key = (request.query.get("taskKey") or "").strip()
    if not task_key:
        raise web.HTTPBadRequest(text="Missing taskKey")

    with GENERATION_TASKS_LOCK:
        task = GENERATION_TASKS.get(task_key)

    if task is None:
        return web.json_response({"taskKey": task_key, "status": "missing"})

    return web.json_response(task)


@PromptServer.instance.routes.post("/indextts-ui/api/cancel-generation")
async def indextts_ui_cancel_generation(request: web.Request):
    payload = await json_request(request)
    task_key = str(payload.get("taskKey") or "").strip()
    if not task_key:
        raise web.HTTPBadRequest(text="Missing taskKey")
    if not request_generation_cancel(task_key):
        return web.json_response({"taskKey": task_key, "status": "missing"})
    return web.json_response({"taskKey": task_key, "status": "cancelling"})


@PromptServer.instance.routes.post("/indextts-ui/api/load-model")
async def indextts_ui_load_model(request: web.Request):
    payload = await json_request(request)
    settings = payload.get("settings") or {}
    try:
        await get_tts_model(bool(settings.get("localFilesOnly", True)))
    except Exception as exc:
        LOGGER.exception("Model warmup failed")
        raise web.HTTPBadRequest(text=normalize_user_error(exc)) from exc
    return web.json_response({"ok": True, "modelStatus": MODEL_STATUS})


@PromptServer.instance.routes.post("/indextts-ui/api/generate-batch")
async def indextts_ui_generate_batch(request: web.Request):
    payload = await json_request(request)
    roles = {role["id"]: role for role in payload.get("roles", []) if role.get("id")}
    lines = payload.get("lines", [])
    settings = payload.get("settings") or {}

    if not lines:
        raise web.HTTPBadRequest(text="没有可生成的台词。")

    try:
        model = await get_tts_model(bool(settings.get("localFilesOnly", True)))
        results: list[dict] = []
        async with GENERATE_LOCK:
            for index, line in enumerate(lines, start=1):
                role_id = line.get("roleId")
                role = roles.get(role_id)
                if role is None:
                    raise ValueError(f"第 {index} 条台词没有匹配的角色。")
                generated = await asyncio.to_thread(run_generation_sync, model, role, line, settings, index)
                results.append({"lineId": line.get("id"), **generated})
    except Exception as exc:
        LOGGER.exception("Batch generation failed")
        raise web.HTTPBadRequest(text=normalize_user_error(exc)) from exc

    return web.json_response({"items": results})


@PromptServer.instance.routes.post("/indextts-ui/api/merge-audios")
async def indextts_ui_merge_audios(request: web.Request):
    payload = await json_request(request)
    files = payload.get("files") or []
    silence_ms = int(payload.get("silenceMs", 300))
    prefix = payload.get("outputPrefix", "merged")
    task_key = str(payload.get("taskKey") or uuid.uuid4().hex)

    if not files:
        raise web.HTTPBadRequest(text="没有可合并的音频。")

    paths = []
    for filename in files:
        path = safe_file_path("generated", filename)
        if not path.exists():
            raise web.HTTPBadRequest(text=f"找不到音频文件：{filename}")
        paths.append(path)

    output_name = f"{slugify(prefix, 'merged')}_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.wav"
    output_path = MERGED_AUDIO_DIR / output_name
    set_merge_task(task_key, "running", progress=0.0, description="准备合并音频...")

    def progress_callback(value, desc=None):
        set_merge_task(
            task_key,
            "running",
            progress=value,
            description=desc or "",
        )

    async def run_merge_task():
        try:
            await asyncio.to_thread(merge_audio_files, paths, silence_ms, output_path, progress_callback)
            result = {
                "audioFile": output_name,
                "audioUrl": build_public_url("merged", output_name),
                "durationSeconds": round(sf.info(str(output_path)).duration, 2),
            }
            set_merge_task(task_key, "completed", result=result, progress=1.0, description="合并完成")
        except Exception as exc:
            LOGGER.exception("Merge audio task failed")
            set_merge_task(task_key, "error", error=str(exc), description="合并失败")

    asyncio.create_task(run_merge_task())

    return web.json_response({"taskKey": task_key, "status": "running"})


@PromptServer.instance.routes.get("/indextts-ui/api/merge-status")
async def indextts_ui_merge_status(request: web.Request):
    task_key = (request.query.get("taskKey") or "").strip()
    if not task_key:
        raise web.HTTPBadRequest(text="Missing taskKey")

    with MERGE_TASKS_LOCK:
        task = MERGE_TASKS.get(task_key)

    if task is None:
        return web.json_response({"taskKey": task_key, "status": "missing"})

    return web.json_response(task)


@PromptServer.instance.routes.get("/indextts-ui/api/list-merged-audios")
async def indextts_ui_list_merged_audios(request: web.Request):
    ensure_webui_dirs()
    items: list[dict[str, object]] = []
    for path in sorted(MERGED_AUDIO_DIR.glob("*.wav"), key=lambda item: item.stat().st_mtime, reverse=True):
        info = sf.info(str(path))
        items.append(
            {
                "audioFile": path.name,
                "audioUrl": build_public_url("merged", path.name),
                "durationSeconds": round(info.duration, 2),
                "updatedAt": path.stat().st_mtime,
            }
        )

    return web.json_response({"items": items})


@PromptServer.instance.routes.get("/indextts-ui/api/file/{bucket}/{filename}")
async def indextts_ui_file(request: web.Request):
    bucket = request.match_info["bucket"]
    filename = request.match_info["filename"]
    path = safe_file_path(bucket, filename)
    if not path.exists():
        raise web.HTTPNotFound(text="File not found")
    return web.FileResponse(path)


@PromptServer.instance.routes.get("/indextts-ui/api/generated-wav/{filename}")
async def indextts_ui_generated_wav(request: web.Request):
    filename = request.match_info["filename"]
    wav_path, wav_name = ensure_generated_wav_file(filename)
    return web.FileResponse(
        wav_path,
        headers={
            "Content-Disposition": f'attachment; filename="{wav_name}"',
        },
    )
