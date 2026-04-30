import { useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';

export interface AudioRecorderOptions {
  onChunkReady: (uri: string) => void;
  chunkDurationMs?: number;       // maksimum chunk süresi (güvenlik sınırı)
  onFinalChunkReady?: (uri: string) => void;
}

// VAD (Sessizlik tespiti) parametreleri
const SILENCE_THRESHOLD_DB = -40;  // dBFS — altı = sessizlik (Android: ~-40, iOS: ~-50)
const MIN_CHUNK_MS = 800;           // en az bu kadar ses kaydedilmeden gönderme
const SILENCE_TRIGGER_MS = 550;     // bu kadar sessizlik → hemen gönder

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,          // ses seviyesi ölçümü — VAD için zorunlu
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

/**
 * Global mutex — aynı anda yalnızca bir prepareToRecordAsync çalışsın.
 * (Tab geçişlerinde HomeScreen unmount/remount olsa bile güvenli)
 */
let globalPrepareLock: Promise<void> = Promise.resolve();
let globalReleaseLock: (() => void) | null = null;

function acquirePrepareLock(): Promise<void> {
  // Zincir: önceki kilit bitmeden yenisi başlamaz
  const prev = globalPrepareLock;
  let release!: () => void;
  globalPrepareLock = new Promise<void>((resolve) => {
    globalReleaseLock = release = resolve;
  });
  return prev; // öncekinin bitmesini bekle
}

function releasePrepareLock() {
  if (globalReleaseLock) {
    globalReleaseLock();
    globalReleaseLock = null;
  }
}

export function useAudioRecorder({
  onChunkReady,
  chunkDurationMs = 4000,
  onFinalChunkReady,
}: AudioRecorderOptions) {
  const sessionIdRef = useRef(0);
  const currentRecordingRef = useRef<Audio.Recording | null>(null);

  // Callback ref'leri — stale closure önlenir
  const onChunkReadyRef = useRef(onChunkReady);
  const onFinalChunkReadyRef = useRef(onFinalChunkReady);
  useEffect(() => { onChunkReadyRef.current = onChunkReady; }, [onChunkReady]);
  useEffect(() => { onFinalChunkReadyRef.current = onFinalChunkReady; }, [onFinalChunkReady]);

  // Component unmount olduğunda temizle (tab geçişi güvenliği)
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      // Mutex'i zorla serbest bırak
      releasePrepareLock();
      const rec = currentRecordingRef.current;
      currentRecordingRef.current = null;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const recordLoop = useCallback(async (sessionId: number) => {
    if (sessionIdRef.current !== sessionId) return;

    let recording: Audio.Recording | null = null;

    try {
      // ── Mutex: bir önceki prepare/start tamamlanana kadar bekle ───────
      await acquirePrepareLock();

      // Kilit alındıktan sonra oturum hâlâ geçerli mi?
      if (sessionIdRef.current !== sessionId) {
        releasePrepareLock();
        return;
      }

      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);

      if (sessionIdRef.current !== sessionId) {
        releasePrepareLock();
        try { await recording.stopAndUnloadAsync(); } catch { }
        recording = null;
        return;
      }

      currentRecordingRef.current = recording;
      await recording.startAsync();

      // startAsync tamamlandı → kilit serbest bırakılabilir
      releasePrepareLock();

      // ── VAD: Sessizlik tabanlı erken gönderim ──────────────────────────
      let speechDetected = false;       // Bu chunk'ta konuşma var mı?
      let silenceStartMs: number | null = null;
      let vadResolve: (() => void) | null = null;

      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;

        const db = status.metering ?? -100;
        const elapsed = status.durationMillis ?? 0;

        if (db > SILENCE_THRESHOLD_DB) {
          // Konuşma var
          speechDetected = true;
          silenceStartMs = null;
        } else {
          // Sessizlik
          if (speechDetected && silenceStartMs === null) {
            silenceStartMs = Date.now(); // sessizlik başladı
          }
          if (
            silenceStartMs !== null &&
            Date.now() - silenceStartMs >= SILENCE_TRIGGER_MS &&
            elapsed >= MIN_CHUNK_MS
          ) {
            // Yeterli sessizlik → hemen gönder
            vadResolve?.();
            vadResolve = null;
          }
        }
      });

      // Metering güncellemesi 100ms'de bir gelsin (hızlı tepki)
      await recording.setProgressUpdateInterval(100);

      // Maksimum süre (güvenlik) VEYA VAD erken tetiklemesi bekle
      await new Promise<void>((resolve) => {
        vadResolve = resolve;
        setTimeout(resolve, chunkDurationMs);
      });

      // Oturum geçerliliği kontrol
      if (sessionIdRef.current !== sessionId) {
        currentRecordingRef.current = null;
        return;
      }

      // Kaydı durdur ve URI al
      currentRecordingRef.current = null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recording = null;

      // Sadece konuşma içeren chunk'ları gönder
      if (uri && speechDetected) {
        onChunkReadyRef.current(uri);
      }

      // Kısa bekleme sonrası döngü devam eder
      await new Promise(r => setTimeout(r, 100));
      if (sessionIdRef.current === sessionId) {
        recordLoop(sessionId);
      }

    } catch (error: any) {
      // Hata durumunda kilidi mutlaka serbest bırak
      releasePrepareLock();
      currentRecordingRef.current = null;
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch { }
        recording = null;
      }
      console.error('Chunk kayıt hatası:', error?.message ?? error);

      if (
        error?.message?.includes('Only one Recording') &&
        sessionIdRef.current === sessionId
      ) {
        await new Promise(r => setTimeout(r, 800));
        if (sessionIdRef.current === sessionId) recordLoop(sessionId);
      }
      // Diğer hatalar (cascading): sessizce bırak
    }
  }, [chunkDurationMs]);

  const startRecording = useCallback(async () => {
    const newSessionId = sessionIdRef.current + 1;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) throw new Error('Mikrofon izni verilmedi');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      sessionIdRef.current = newSessionId;
      recordLoop(newSessionId);
    } catch (error) {
      console.error('Kayıt başlatma hatası:', error);
      throw error;
    }
  }, [recordLoop]);

  const stopRecording = useCallback(async () => {
    sessionIdRef.current += 1;
    // Mutex'i zorla serbest bırak (stop sırasında kilit kalmış olabilir)
    releasePrepareLock();

    const rec = currentRecordingRef.current;
    currentRecordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) {
          const callback = onFinalChunkReadyRef.current ?? onChunkReadyRef.current;
          callback(uri);
        }
      } catch { }
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch { }
  }, []);

  return { startRecording, stopRecording };
}
