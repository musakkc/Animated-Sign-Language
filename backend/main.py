from fastapi import FastAPI, UploadFile, File, HTTPException, Form, WebSocket, WebSocketDisconnect
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel
import tempfile
import os
import logging
import sys
import asyncio
import json
import pandas as pd
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=3)

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
    logger.info("Whisper modeli yükleniyor (medium, CPU)...")
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


# Halüsinasyon / sahte çıktı olarak bilinen yaygın Whisper örnekleri
HALLUCINATION_PATTERNS = [
    "altyaz", "subtitle", "transcript", "www.", "http",
    "teşekkür ederim", "teşekkürler", "hoşça kal",
    "م", "ك", "المدينة",  # Arapça karakter kaçışları
]


def is_hallucination(text: str) -> bool:
    """Bilinen sahte/halüsinasyon çıktılarını filtreler."""
    if not text:
        return True
    t = text.lower().strip()
    # Çok kısa çıktılar (1-2 karakter) — anlamsız
    if len(t) <= 2:
        return True
    for pattern in HALLUCINATION_PATTERNS:
        if pattern in t:
            return True
    return False


def run_whisper(tmp_path: str, previous_text: str = "") -> str:
    """Whisper ile transkripsiyon — hız öncelikli (small model + greedy search)."""
    segments, info = whisper_model.transcribe(
        tmp_path,
        language="tr",
        beam_size=1,                # Greedy search — en hızlı (doğruluk kaybı minimal)
        temperature=0.0,
        condition_on_previous_text=False,
        initial_prompt=None,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=300,
            speech_pad_ms=200,
            threshold=0.2,  # Daha hassas (normal konuşmaları kesmemesi için düşürüldü)
        ),
        no_speech_threshold=0.8,
        suppress_blank=True,
        word_timestamps=False,
    )

    parts = []
    for seg in segments:
        # Segment başına no_speech olasılığı kontrolü
        if hasattr(seg, 'no_speech_prob') and seg.no_speech_prob > 0.85:
            logger.info(f"Segment atlandı (no_speech_prob={seg.no_speech_prob:.2f}): '{seg.text}'")
            continue
        cleaned = seg.text.strip()
        if cleaned:
            parts.append(cleaned)

    transcript = " ".join(parts).strip()

    # Halüsinasyon kontrolü
    if is_hallucination(transcript):
        logger.warning(f"Halüsinasyon tespit edildi, filtrelendi: '{transcript}'")
        return ""

    return transcript


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



@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    Gerçek zamanlı ses transkripsiyon WebSocket endpoint'i.
    Client ses chunk'larını base64 JSON olarak gönderir;
    backend Whisper segment'lerini akış halinde geri yollar.
    """
    await websocket.accept()
    await websocket.send_json({"type": "ready"})
    logger.info("WebSocket bağlantısı kuruldu")

    loop = asyncio.get_event_loop()

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "audio":
                import base64 as b64_mod
                audio_bytes = b64_mod.b64decode(msg["data"])
                previous_context = msg.get("context", "")  # Frontend'den gelen bağlam

                # asyncio Queue — thread'den async context'e güvenli iletişim
                result_q: asyncio.Queue = asyncio.Queue()

                def whisper_task(audio_bytes=audio_bytes, ctx=previous_context):
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as f:
                        f.write(audio_bytes)
                        tmp = f.name
                    try:
                        segments, _ = whisper_model.transcribe(
                            tmp,
                            language="tr",
                            beam_size=1,          # Hızlı ve stabil
                            temperature=0.0,
                            condition_on_previous_text=False,  # Kısa chunk'larda hallüsinasyona yol açıyor
                            vad_filter=True,
                            vad_parameters=dict(
                                min_silence_duration_ms=400,
                                speech_pad_ms=300,
                                threshold=0.2,  # Sesleri gürültü sanıp silmemesi için düşürüldü
                            ),
                            no_speech_threshold=0.8,
                            suppress_blank=True,
                        )
                        for seg in segments:
                            if hasattr(seg, 'no_speech_prob') and seg.no_speech_prob > 0.85:
                                logger.info(f"WS segment atlandı (no_speech={seg.no_speech_prob:.2f})")
                                continue
                            text = seg.text.strip()
                            if text and not is_hallucination(text):
                                logger.info(f"WS segment: '{text}'")
                                loop.call_soon_threadsafe(
                                    result_q.put_nowait,
                                    {"type": "segment", "text": text}
                                )
                    except Exception as e:
                        loop.call_soon_threadsafe(
                            result_q.put_nowait,
                            {"type": "error", "message": str(e)}
                        )
                    finally:
                        loop.call_soon_threadsafe(result_q.put_nowait, None)
                        try:
                            os.unlink(tmp)
                        except:
                            pass

                # Thread pool'da başlat (event loop'u bloklamaz)
                fut = loop.run_in_executor(executor, whisper_task)

                # Segment'leri anında gönder (streaming)
                while True:
                    item = await result_q.get()
                    if item is None:
                        break
                    await websocket.send_json(item)

                # Thread'in tamamen bitmesini bekle
                try:
                    await fut
                except Exception as e:
                    logger.error(f"Whisper thread hatası: {e}")

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket bağlantısı kesildi (normal)")
    except Exception as e:
        logger.error(f"WebSocket beklenmeyen hata: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

@app.get("/get-sign-animation/{word}")
async def get_sign_animation(word: str):
    """
    Verilen kelimeyi labels.csv'den bulup, ilgili parquet dosyasını okuyarak
    3D animasyon koordinatlarını JSON olarak döndürür.
    """
    word = word.lower().strip()
    
    # 1. Kelimenin sign_id'sini bul
    labels_path = "dataset/labels.csv"
    if not os.path.exists(labels_path):
        raise HTTPException(status_code=500, detail="labels.csv bulunamadı")
        
    df_labels = pd.read_csv(labels_path)
    
    # 1. Tam eşleşme ara
    match = df_labels[df_labels['word'] == word]
    
    # 2. Bulunamazsa basit ekleri (iyelik, çoğul, hal ekleri) atarak kök ara
    if match.empty:
        suffixes = [
            'm', 'n', 'i', 'ı', 'u', 'ü', 'si', 'sı', 'su', 'sü',
            'im', 'ım', 'um', 'üm', 'in', 'ın', 'un', 'ün',
            'ler', 'lar', 'leri', 'ları',
            'de', 'da', 'te', 'ta', 'den', 'dan', 'ten', 'tan',
            'ye', 'ya', 'e', 'a', 'yim', 'yım', 'yum', 'yüm', 'sin', 'sın'
        ]
        
        # En uzun ekleri önce kontrol etmek için uzunluğa göre sırala
        for suffix in sorted(suffixes, key=len, reverse=True):
            if word.endswith(suffix):
                root = word[:-len(suffix)]
                if len(root) >= 2:  # Kök en az 2 harfli olmalı (Örn: "onlar" -> "on")
                    match = df_labels[df_labels['word'] == root]
                    if not match.empty:
                        break

    if match.empty:
        raise HTTPException(status_code=404, detail=f"'{word}' kelimesi sözlükte bulunamadı")
        
    sign_id = match.iloc[0]['sign_id']
    
    # 2. train.csv'den dosya yolunu bul
    train_csv_path = "dataset/train.csv"
    if not os.path.exists(train_csv_path):
        raise HTTPException(status_code=500, detail="train.csv bulunamadı")
        
    df_train = pd.read_csv(train_csv_path)
    match_train = df_train[df_train['sign'] == sign_id]
    if match_train.empty:
        raise HTTPException(status_code=404, detail=f"ID {sign_id} için eğitim verisi bulunamadı")
        
    # İlk eşleşen dosyayı al (aynı kelimeden birden fazla video olabilir)
    parquet_rel_path = match_train.iloc[0]['path']
    parquet_abs_path = os.path.join("dataset", parquet_rel_path)
    
    if not os.path.exists(parquet_abs_path):
        raise HTTPException(status_code=404, detail=f"Parquet dosyası bulunamadı: {parquet_abs_path}")
        
    # 3. Parquet dosyasını oku ve parse et
    try:
        df_pq = pd.read_parquet(parquet_abs_path)
        # Sadece vücut ve elleri alalım (yüz çok veri yapıyor)
        df_pq = df_pq[df_pq['type'].isin(['pose', 'left_hand', 'right_hand'])]
        
        # NaN değerleri olan satırları (örn. eller ekrandan çıkınca) sil
        # JSON'da NaN geçersizdir, bu yüzden hata veriyordu.
        df_pq = df_pq.dropna(subset=['x', 'y', 'z'])
        
        # Frame'lere göre grupla
        frames = {}
        for frame, group in df_pq.groupby('frame'):
            # Gruptaki her bir satırı (landmark) dict olarak al
            points = group[['type', 'landmark_index', 'x', 'y', 'z']].to_dict('records')
            frames[int(frame)] = points
            
        return {
            "success": True,
            "word": word,
            "sign_id": int(sign_id),
            "file": parquet_rel_path,
            "total_frames": len(frames),
            "frames": frames
        }
    except Exception as e:
        logger.error(f"Parquet okuma hatası: {e}")
        raise HTTPException(status_code=500, detail="Animasyon verisi okunamadı")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
