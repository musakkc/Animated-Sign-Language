import { useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';

export interface AudioRecorderOptions {
  onChunkReady: (uri: string) => void; // Her chunk hazır olduğunda çağrılır
  chunkDurationMs?: number;            // Chunk süresi (ms), varsayılan 4000
}

export function useAudioRecorder({ onChunkReady, chunkDurationMs = 4000 }: AudioRecorderOptions) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  // Stale closure sorununu önlemek için onChunkReady'yi ref'e al
  const onChunkReadyRef = useRef(onChunkReady);
  useEffect(() => {
    onChunkReadyRef.current = onChunkReady;
  }, [onChunkReady]);

  const startRecording = useCallback(async () => {
    try {
      // İzin iste
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        throw new Error('Mikrofon izni verilmedi');
      }

      // Ses modunu ayarla
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      isRecordingRef.current = true;

      // İlk chunk'ı başlat
      await startNewChunk();

      // Her `chunkDurationMs`'de bir yeni chunk başlat
      chunkIntervalRef.current = setInterval(async () => {
        if (isRecordingRef.current) {
          await rotateChunk();
        }
      }, chunkDurationMs);
    } catch (error) {
      console.error('Kayıt başlatma hatası:', error);
      throw error;
    }
  }, [chunkDurationMs]);

  const startNewChunk = async () => {
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000, // Daha iyi ses kalitesi
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
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 64000,
      },
    });
    await recording.startAsync();
    recordingRef.current = recording;
  };

  const rotateChunk = async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording) return;

    try {
      // Mevcut chunk'ı durdur ve URI'yi al
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      recordingRef.current = null;

      // Yeni chunk'ı başlat (önceki tamamen kapandıktan sonra)
      if (isRecordingRef.current) {
        await startNewChunk();
      }

      // Önceki chunk'ı işle (ref üzerinden — stale closure yok)
      if (uri) {
        onChunkReadyRef.current(uri);
      }
    } catch (error) {
      console.error('Chunk rotasyon hatası:', error);
      // Hata olsa bile kayda devam etmeye çalış
      if (isRecordingRef.current) {
        try {
          await startNewChunk();
        } catch (e) {
          console.error('Yeni chunk başlatılamadı:', e);
        }
      }
    }
  };

  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;

    // Interval'i temizle
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Son chunk'ı durdur ve işle
    const currentRecording = recordingRef.current;
    if (currentRecording) {
      try {
        await currentRecording.stopAndUnloadAsync();
        const uri = currentRecording.getURI();
        recordingRef.current = null;

        if (uri) {
          onChunkReadyRef.current(uri);
        }
      } catch (error) {
        console.error('Kayıt durdurma hatası:', error);
      }
    }

    // Ses modunu sıfırla
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  }, []);

  return { startRecording, stopRecording };
}
