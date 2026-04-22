import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Dimensions,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useAppStore } from '../store/appStore';
import { useAudioRecorder } from '../services/audioRecorder';
import { transcribeAudio, checkBackendHealth } from '../services/whisperApi';
import { textToSignQueue } from '../services/signLanguageMapper';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const {
    isRecording, isProcessing,
    currentSubtitle, subtitleHistory,
    backendUrl,
    setRecording, setProcessing,
    setCurrentSubtitle, addToHistory,
    setAnimationQueue,
  } = useAppStore();

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const backendOnlineRef = useRef<boolean | null>(null);
  const previousTextRef = useRef<string>(''); // Bağlam için önceki transkript

  // Animasyon referansları
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subtitleFade = useRef(new Animated.Value(1)).current; // 1'den başla, her zaman görünür

  // Backend sağlık kontrolü
  useEffect(() => {
    const checkHealth = async () => {
      const ok = await checkBackendHealth(backendUrl);
      setBackendOnline(ok);
      backendOnlineRef.current = ok; // ref'i de güncelle
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  // Pulse animasyonu (kayıt sırasında)
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  // Chunk işleme
  const handleChunkReady = useCallback(
    async (uri: string) => {
      if (!backendOnlineRef.current) {
        console.log('Backend offline, chunk atlandı');
        return;
      }
      setProcessing(true);
      setChunkCount((c) => c + 1);
      try {
        const text = await transcribeAudio(uri, backendUrl, previousTextRef.current);
        if (text && text.length > 0) {
          setCurrentSubtitle(text);
          addToHistory(text);
          previousTextRef.current = text; // Sonraki chunk için bağlamı sakla

          // Altyazı fade animasyonu (0.3'ten 1'e — hiç kaybolmaz)
          subtitleFade.setValue(0.3);
          Animated.timing(subtitleFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();

          // Animasyon kuyruğunu oluştur
          const queue = textToSignQueue(text);
          setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));
        }
      } catch (error: any) {
        console.error('Chunk hatası:', error.message);
      } finally {
        setProcessing(false);
      }
    },
    [backendUrl, backendOnline]
  );

  const { startRecording, stopRecording } = useAudioRecorder({
    onChunkReady: handleChunkReady,
    chunkDurationMs: 6000, // 6 saniye — daha az sınır kesimi
  });

  const toggleRecording = async () => {
    if (!backendOnline) {
      Alert.alert(
        'Bağlantı Hatası',
        `Backend sunucusuna bağlanılamıyor.\n\nSunucu çalışıyor mu?\nAdres: ${backendUrl}\n\nAyarlar'dan IP adresini kontrol edin.`,
        [{ text: 'Tamam' }]
      );
      return;
    }

    if (isRecording) {
      setRecording(false);
      previousTextRef.current = ''; // Bağlamı sıfırla
      await stopRecording();
    } else {
      setChunkCount(0);
      previousTextRef.current = ''; // Yeni kayıt için bağlamı sıfırla
      setRecording(true);
      await startRecording();
    }
  };

  const statusColor = backendOnline === null ? '#888' : backendOnline ? '#4ade80' : '#f87171';
  const statusText =
    backendOnline === null ? 'Kontrol ediliyor...' : backendOnline ? 'Sunucu bağlı' : 'Sunucu bağlı değil';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>TİD Altyazı</Text>
          <Text style={styles.headerSub}>Türk İşaret Dili</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>

      {/* Ana Altyazı Alanı */}
      <View style={styles.subtitleCard}>
        {currentSubtitle ? (
          <Animated.Text style={[styles.subtitleText, { opacity: subtitleFade }]}>
            {currentSubtitle}
          </Animated.Text>
        ) : (
          <Text style={styles.subtitlePlaceholder}>
            {isRecording ? 'Dinleniyor...' : 'Kayıt başlatmak için mikrofona dokunun'}
          </Text>
        )}

        {isProcessing && (
          <View style={styles.processingBadge}>
            <Text style={styles.processingText}>⚙ İşleniyor...</Text>
          </View>
        )}
      </View>

      {/* Kayıt Butonu */}
      <View style={styles.micContainer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micButtonActive]}
            onPress={toggleRecording}
            activeOpacity={0.85}
          >
            <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎙'}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.micLabel, { marginTop: 12 }]}>
          {isRecording
            ? `Kaydediliyor · ${chunkCount} parça işlendi`
            : 'Başlatmak için dokun'}
        </Text>
      </View>

      {/* Geçmiş */}
      {subtitleHistory.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Geçmiş</Text>
          <ScrollView style={styles.historyScroll} showsVerticalScrollIndicator={false}>
            {subtitleHistory.map((entry) => (
              <View key={entry.id} style={styles.historyItem}>
                <Text style={styles.historyText}>{entry.text}</Text>
                <Text style={styles.historyTime}>
                  {entry.timestamp.toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  subtitleCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    minHeight: 160,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2d2d4e',
    position: 'relative',
  },
  subtitleText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#f0f0ff',
    lineHeight: 40,
    textAlign: 'center',
  },
  subtitlePlaceholder: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 24,
  },
  processingBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#7c3aed22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  processingText: {
    color: '#a78bfa',
    fontSize: 12,
  },
  micContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  micButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  micButtonActive: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
  },
  micIcon: {
    fontSize: 36,
  },
  micLabel: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  historyContainer: {
    flex: 1,
    marginTop: 24,
    marginHorizontal: 20,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  historyScroll: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderLeftWidth: 3,
    borderLeftColor: '#7c3aed',
  },
  historyText: {
    flex: 1,
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
  },
  historyTime: {
    color: '#4b5563',
    fontSize: 11,
    marginLeft: 8,
    marginTop: 2,
  },
});
