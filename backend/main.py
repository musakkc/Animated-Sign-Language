from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel
import tempfile
import os
import logging

# Loglama
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TİD Altyazı API", version="1.0.0")

# CORS — React Native uygulaması her IP'den bağlanabilsin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Whisper modelini başlat (ilk çalıştırmada model indirilir)
# "small" modeli Türkçe için iyi bir hız/doğruluk dengesi sağlar
# Alternatifler: "tiny" (çok hızlı), "medium" (daha doğru ama yavaş)
logger.info("Whisper modeli yükleniyor...")
whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
logger.info("Whisper modeli hazır ✅")


@app.get("/")
async def root():
    return {"status": "çalışıyor", "mesaj": "TİD Altyazı API aktif"}


@app.get("/health")
async def health_check():
    return {"status": "ok", "model": "whisper-small", "dil": "tr"}


class TranscribeRequest(BaseModel):
    audio_base64: str
    previous_text: str = ""


def run_whisper(tmp_path: str, previous_text: str) -> str:
    """Whisper ile transkripsiyon çalıştır."""
    segments, info = whisper_model.transcribe(
        tmp_path,
        language="tr",
        beam_size=5,
        temperature=0.0,
        condition_on_previous_text=True,
        initial_prompt=previous_text if previous_text else "Türkçe konuşma.",
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
            threshold=0.5,
        )
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
        logger.error(f"Transkripsiyon hatası: {e}")
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
        logger.error(f"Transkripsiyon hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
