from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel
import tempfile
import os
import logging
import sys

# Loglama
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Windows'ta CUDA kütüphanelerini bul ve ekle
if sys.platform == "win32":
    import site
    packages_paths = site.getsitepackages() + [site.getusersitepackages()]
    for base_path in packages_paths:
        nvidia_path = os.path.join(base_path, "nvidia")
        if os.path.exists(nvidia_path):
            for sub in ["cublas", "cudnn", "cuda_nvrtc"]:
                bin_path = os.path.join(nvidia_path, sub, "bin")
                if os.path.exists(bin_path):
                    logger.info(f"CUDA DLL yolu eklendi: {bin_path}")
                    os.add_dll_directory(bin_path)

# FFmpeg kontrolü ve workaround
import subprocess
ffmpeg_found = False
try:
    subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    logger.info("FFmpeg bulundu ✅")
    ffmpeg_found = True
except (subprocess.CalledProcessError, FileNotFoundError):
    # CapCut içindeki ffmpeg'i dene (kullanıcının sisteminde tespit edildi)
    capcut_ffmpeg = r"C:\Users\musak\AppData\Local\CapCut\Apps\8.5.0.3590"
    if os.path.exists(os.path.join(capcut_ffmpeg, "ffmpeg.exe")):
        os.environ["PATH"] += os.pathsep + capcut_ffmpeg
        logger.info(f"FFmpeg için CapCut yolu eklendi: {capcut_ffmpeg} ✅")
        ffmpeg_found = True
    else:
        logger.error("❌ FFmpeg BULUNAMADI! Lütfen FFmpeg yükleyin ve PATH'e ekleyin.")

# Whisper modelini başlat (Windows'ta CUDA DLL sorunları nedeniyle CPU tercih ediliyor)
try:
    # Önce CPU ile güvenli başlat (en garantisi)
    logger.info("Whisper modeli yükleniyor (CPU modunda)...")
    whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
    logger.info("Whisper medium modeli CPU üzerinde hazır ✅")
    current_device = "cpu"
except Exception as e:
    logger.error(f"❌ Model yüklenemedi: {e}")
    raise e


app = FastAPI(title="TİD Altyazı API", version="1.0.0")

# CORS — React Native uygulaması her IP'den bağlanabilsin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
async def root():
    return {"status": "çalışıyor", "mesaj": "TİD Altyazı API aktif"}


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model": "whisper-medium",
        "device": current_device,
        "dil": "tr"
    }


class TranscribeRequest(BaseModel):
    audio_base64: str
    previous_text: str = ""


def run_whisper(tmp_path: str, previous_text: str = "") -> str:
    """Whisper ile transkripsiyon çalıştır — kısa chunk'lar için optimize edilmiş."""
    segments, _ = whisper_model.transcribe(
        tmp_path,
        language="tr",
        beam_size=10,        # Daha derin arama (doğruluğu artırır)
        patience=2.0,        # Aramada daha titiz davranır
        temperature=0.0,
        condition_on_previous_text=False, # Halüsinasyonları (tekrarları) önler
        initial_prompt=previous_text if previous_text else None,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=400, # Sessizlik tespiti iyileştirildi
            speech_pad_ms=200,
            threshold=0.5,
        ),
        no_speech_threshold=0.6,
    )
    transcript = " ".join([seg.text.strip() for seg in segments])
    return transcript.strip()


@app.post("/transcribe-base64")
async def transcribe_base64(req: TranscribeRequest):
    """
    Base64 kodlu ses alır ve Türkçe metne çevirir.
    React Native'den JSON olarak gönderilir.
    """
    import base64
    logger.info(f"Base64 ses alındı | Önceki bağlam: '{req.previous_text[:30]}...' " if req.previous_text else "Base64 ses alındı")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tmp_file:
        tmp_file.write(base64.b64decode(req.audio_base64))
        tmp_path = tmp_file.name

    try:
        transcript = run_whisper(tmp_path, req.previous_text)
        logger.info(f"Transkript: '{transcript}'")
        return {"success": True, "text": transcript}
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        logger.error(f"Transkripsiyon hatası:\n{error_msg}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    previous_text: Optional[str] = Form(None)
):
    """Multipart form ile ses yükler (fallback endpoint)."""
    if not audio.filename:
        raise HTTPException(status_code=400, detail="Ses dosyası gerekli")

    suffix = os.path.splitext(audio.filename)[1] or ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        content = await audio.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name

    try:
        transcript = run_whisper(tmp_path, previous_text or "")
        logger.info(f"Transkript: '{transcript}'")
        return {"success": True, "text": transcript}
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        logger.error(f"Transkripsiyon hatası:\n{error_msg}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
