import { useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';

export interface AudioRecorderOptions {
  onChunkReady: (uri: string) => void;
  chunkDurationMs?: number;
}

const RECORDING_OPTIONS = {
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

export function useAudioRecorder({ onChunkReady, chunkDurationMs = 3000 }: AudioRecorderOptions) {
  // Aktif kayıt oturumu için ID — stopRecording() ID'yi artırarak eski döngüleri geçersiz kılar
  const sessionIdRef = useRef(0);
  // Anlık Recording objesi — stopRecording() bunu doğrudan durdurur
  const currentRecordingRef = useRef<Audio.Recording | null>(null);

  const onChunkReadyRef = useRef(onChunkReady);
  useEffect(() => {
    onChunkReadyRef.current = onChunkReady;
  }, [onChunkReady]);

  /**
   * Tek bir chunk kaydeder. Döngü, her chunk bittikten sonra kendini çağırır.
   * sessionId sayesinde eski oturumların döngüleri otomatik durur.
   */
  const recordLoop = useCallback(async (sessionId: number) => {
    // Oturum geçersizleştiyse dur
    if (sessionIdRef.current !== sessionId) return;

    let recording: Audio.Recording | null = null;

    try {
      // Kayıt oluştur ve başlat
      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);

      // Hâlâ aynı oturumda mıyız?
      if (sessionIdRef.current !== sessionId) {
        try { await recording.stopAndUnloadAsync(); } catch { /* yoksay */ }
        return;
      }

      currentRecordingRef.current = recording;
      await recording.startAsync();

      // Chunk süresini bekle
      await new Promise<void>((resolve) => setTimeout(resolve, chunkDurationMs));

      // Oturum hâlâ geçerli mi?
      if (sessionIdRef.current !== sessionId) {
        // stopRecording() zaten durdurdu — burada tekrar durdurma
        currentRecordingRef.current = null;
        return;
      }

      // Kaydı durdur, URI al
      currentRecordingRef.current = null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recording = null;

      if (uri) {
        onChunkReadyRef.current(uri); 
      }

      // Race condition önlemek için kısa bekleme
      await new Promise(r => setTimeout(r, 150));
      recordLoop(sessionId);

    } catch (error: any) {
      currentRecordingRef.current = null;
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch { }
      }
      console.error('Chunk kayıt hatası:', error?.message ?? error);
      
      // Hata sonrası toparlanma
      if (error?.message?.includes('Only one Recording')) {
        await new Promise(r => setTimeout(r, 500));
        recordLoop(sessionId);
      }
    }
  }, [chunkDurationMs]);

  const startRecording = useCallback(async () => {
    // Aynı session devam ediyorsa tekrar başlatma
    const newSessionId = sessionIdRef.current + 1;

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) throw new Error('Mikrofon izni verilmedi');

      // Ses modunu kayıt için ayarla
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      sessionIdRef.current = newSessionId; // Oturumu aktif et
      recordLoop(newSessionId);            // Döngüyü başlat (await değil)
    } catch (error) {
      console.error('Kayıt başlatma hatası:', error);
      throw error;
    }
  }, [recordLoop]);

  const stopRecording = useCallback(async () => {
    // Session ID'yi artır → aktif tüm döngüler bir sonraki kontrolde durur
    sessionIdRef.current += 1;

    // Aktif Recording objesini DOĞRUDAN durdur (döngüyü bekleme)
    const rec = currentRecordingRef.current;
    currentRecordingRef.current = null;
    if (rec) {
      try { await rec.stopAndUnloadAsync(); } catch { /* zaten durmuş olabilir */ }
    }

    // iOS ses modunu sıfırla
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch { /* yoksay */ }
  }, []);

  return { startRecording, stopRecording };
}
