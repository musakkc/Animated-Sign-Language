import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface WebSocketRecorderOptions {
  backendUrl: string;
  onSegment: (text: string) => void;
  onSilence: () => void;
  chunkDurationMs?: number;
}

const SILENCE_THRESHOLD_DB = -40;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

// ─── Module-level native kayıt yöneticisi ────────────────────────────────────
let _nativeRec: Audio.Recording | null = null;

async function nativePrepareRecording(): Promise<Audio.Recording> {
  if (_nativeRec) {
    const old = _nativeRec;
    _nativeRec = null;
    try { await old.stopAndUnloadAsync(); } catch {}
  }
  // Native ses sürücüsüne nefes payı
  await new Promise(r => setTimeout(r, 250));
  const rec = new Audio.Recording();
  _nativeRec = rec;
  await rec.prepareToRecordAsync(RECORDING_OPTIONS);
  return rec;
}

async function nativeStopRecording(): Promise<string | null> {
  const rec = _nativeRec;
  _nativeRec = null;
  if (!rec) return null;
  try {
    await rec.stopAndUnloadAsync();
    return rec.getURI() ?? null;
  } catch {
    return null;
  }
}

/** http(s):// → ws(s):// + endpoint */
function toWsUrl(backendUrl: string): string {
  return backendUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://') + '/ws/transcribe';
}

// ─────────────────────────────────────────────────────────────────────────────
export function useWebSocketRecorder({
  backendUrl,
  onSegment,
  onSilence,
  chunkDurationMs = 5000,
}: WebSocketRecorderOptions) {
  const [wsStatus, setWsStatus] = useState<WsStatus>('closed');

  const wsRef           = useRef<WebSocket | null>(null);
  const sessionIdRef    = useRef(0);
  const hasPendingRef   = useRef(false);
  const contextRef      = useRef('');
  const loopActiveRef   = useRef(false);
  const isRecordingRef  = useRef(false); // aktif kayıt var mı?
  // WS'in hangi URL için açıldığını takip et (URL değişince yeniden bağlan)
  const connectedUrlRef = useRef('');

  const onSegmentRef = useRef(onSegment);
  const onSilenceRef = useRef(onSilence);
  useEffect(() => { onSegmentRef.current = onSegment; }, [onSegment]);
  useEffect(() => { onSilenceRef.current = onSilence; }, [onSilence]);

  const wrappedOnSegment = useCallback((text: string) => {
    contextRef.current = contextRef.current
      ? `${contextRef.current} ${text}`
      : text;
    if (contextRef.current.length > 200) {
      contextRef.current = contextRef.current.slice(-200);
    }
    onSegmentRef.current(text);
  }, []);

  const wrappedOnSilence = useCallback(() => {
    contextRef.current = '';
    onSilenceRef.current();
  }, []);

  // Unmount temizliği
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      loopActiveRef.current = false;
      isRecordingRef.current = false;
      nativeStopRecording().catch(() => {});
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // ─── WebSocket bağlantısı ─────────────────────────────────────────────────
  const openWs = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Zaten açıksa hemen dön
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        connectedUrlRef.current === url
      ) {
        resolve();
        return;
      }

      // Eski bağlantıyı kapat
      wsRef.current?.close();
      wsRef.current = null;

      setWsStatus('connecting');
      connectedUrlRef.current = url;

      const ws = new WebSocket(toWsUrl(url));
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket bağlantı zaman aşımı'));
      }, 8000);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            setWsStatus('open');
            resolve();
          } else if (msg.type === 'segment') {
            wrappedOnSegment(msg.text);
          } else if (msg.type === 'error') {
            console.warn('WS backend hatası:', msg.message);
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setWsStatus('closed');
        connectedUrlRef.current = '';
        reject(new Error('WebSocket bağlantı hatası'));
      };

      ws.onclose = () => {
        if (connectedUrlRef.current === url) {
          setWsStatus('closed');
          connectedUrlRef.current = '';
        }
      };
    });
  }, [wrappedOnSegment]);

  // ─── Chunk gönder ─────────────────────────────────────────────────────────
  const sendChunk = useCallback(async (uri: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64' as any,
      });
      ws.send(JSON.stringify({
        type: 'audio',
        data: base64,
        context: contextRef.current,
      }));
    } catch (e) {
      console.error('Chunk gönderme hatası:', e);
    }
  }, []);

  // ─── Kayıt döngüsü ────────────────────────────────────────────────────────
  const recordLoop = useCallback(async (sessionId: number) => {
    if (loopActiveRef.current) return;
    if (sessionIdRef.current !== sessionId) return;

    loopActiveRef.current = true;

    try {
      const recording = await nativePrepareRecording();

      if (sessionIdRef.current !== sessionId) {
        await nativeStopRecording();
        loopActiveRef.current = false;
        return;
      }

      await recording.startAsync();

      let speechDetected = false;
      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;
        const db = status.metering ?? -100;
        if (db > SILENCE_THRESHOLD_DB) speechDetected = true;
      });
      await recording.setProgressUpdateInterval(100);

      await new Promise<void>(r => setTimeout(r, chunkDurationMs));

      if (sessionIdRef.current !== sessionId) {
        await nativeStopRecording();
        loopActiveRef.current = false;
        return;
      }

      const uri = await nativeStopRecording();

      if (uri && speechDetected) {
        hasPendingRef.current = true;
        await sendChunk(uri);
      } else if (!speechDetected && hasPendingRef.current) {
        hasPendingRef.current = false;
        wrappedOnSilence();
      }
    } catch (error: any) {
      console.error('WS kayıt döngüsü hatası:', error?.message ?? error);
      await nativeStopRecording();
    }

    loopActiveRef.current = false;

    if (sessionIdRef.current === sessionId) {
      await new Promise(r => setTimeout(r, 100));
      recordLoop(sessionId);
    }
  }, [chunkDurationMs, sendChunk, wrappedOnSilence]);

  // ─── preConnect: WS'i önceden kur (kayıt başlamadan) ─────────────────────
  /**
   * Ayarlar ekranında URL kaydedildikten sonra çağrılır.
   * WebSocket bağlantısını arka planda kurar; kulak butonuna basıldığında
   * bağlantı zaten hazır olur, bekleme olmaz.
   */
  const preConnect = useCallback(async () => {
    if (!backendUrl) return;
    try {
      await openWs(backendUrl);
    } catch (e) {
      // Ön-bağlantı hatası sessizce yutulur; startRecording tekrar dener
      console.log('Ön WebSocket bağlantısı kurulamadı, kulak butonunda yeniden denenir.');
    }
  }, [backendUrl, openWs]);

  // ─── startRecording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const newSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = newSessionId;
    loopActiveRef.current = false;
    isRecordingRef.current = true;

    await nativeStopRecording();

    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      sessionIdRef.current -= 1;
      isRecordingRef.current = false;
      throw new Error('Mikrofon izni verilmedi');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // WS zaten açıksa yeniden bağlanma — anında başla
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      await openWs(backendUrl);
    }

    hasPendingRef.current = false;
    contextRef.current = '';
    recordLoop(newSessionId);
  }, [backendUrl, openWs, recordLoop]);

  // ─── stopRecording ────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    sessionIdRef.current += 1;
    loopActiveRef.current = false;
    isRecordingRef.current = false;

    const uri = await nativeStopRecording();
    if (uri) await sendChunk(uri);

    if (hasPendingRef.current) {
      hasPendingRef.current = false;
      wrappedOnSilence();
    }

    // WS'i hemen kapatma — ön-bağlantı moduna geç
    // (kayıt bittikten sonra bağlantı açık kalır, tekrar basınca anında başlar)
    setTimeout(() => {
      // Eğer hâlâ kayıt yoksa WS açık kalsın (sadece son chunk işlensin)
    }, 600);

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {}
  }, [sendChunk, wrappedOnSilence]);

  return { startRecording, stopRecording, preConnect, wsStatus };
}
