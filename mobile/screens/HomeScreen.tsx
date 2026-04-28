import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen() {
  const {
    isRecording, isProcessing,
    currentSubtitle, subtitleHistory,
    backendUrl,
    setRecording, setProcessing,
    setCurrentSubtitle, addToHistory,
    setAnimationQueue,
    setToggleRecordingFn,
  } = useAppStore();

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const backendOnlineRef = useRef<boolean | null>(null);
  const previousTextRef = useRef<string>('');

  // Sessizlik ile cümle tespiti
  const silenceCountRef = useRef(0);
  const currentSentencePartsRef = useRef<string[]>([]);

  // Animasyonlar
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subtitleFade = useRef(new Animated.Value(1)).current;

  // Backend sağlık kontrolü
  useEffect(() => {
    const checkHealth = async () => {
      const ok = await checkBackendHealth(backendUrl);
      setBackendOnline(ok);
      backendOnlineRef.current = ok;
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  // Pulse animasyonu
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  // Chunk işleme — sessizlik tespiti ile cümle birleştirme
  const handleChunkReady = useCallback(
    async (uri: string) => {
      if (!backendOnlineRef.current) return;
      setProcessing(true);
      try {
        const text = await transcribeAudio(uri, backendUrl, previousTextRef.current);

        if (text && text.length > 0) {
          // Konuşma var → sessizlik sayacını sıfırla, cümleye ekle
          silenceCountRef.current = 0;
          currentSentencePartsRef.current.push(text);
          previousTextRef.current = text;

          // Cümlenin tamamını birleştir ve anlık göster
          const liveSentence = currentSentencePartsRef.current.join(' ');
          setCurrentSubtitle(liveSentence);

          // Fade animasyonu
          subtitleFade.setValue(0.4);
          Animated.timing(subtitleFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();

          // İşaret dili kuyruğu
          const queue = textToSignQueue(text);
          setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));

        } else {
          // Sessizlik → cümle sonu tespiti
          silenceCountRef.current++;
          if (silenceCountRef.current >= 1 && currentSentencePartsRef.current.length > 0) {
            // Cümle tamamlandı → geçmişe ekle
            const completeSentence = currentSentencePartsRef.current.join(' ');
            addToHistory(completeSentence);
            currentSentencePartsRef.current = [];
            previousTextRef.current = '';
            // Altyazıyı soluklaştır (yeni cümle bekliyor)
            Animated.timing(subtitleFade, { toValue: 0.4, duration: 500, useNativeDriver: true }).start();
          }
        }
      } catch (error: any) {
        console.error('Chunk hatası:', error.message);
      } finally {
        setProcessing(false);
      }
    },
    [backendUrl]
  );

  const { startRecording, stopRecording } = useAudioRecorder({
    onChunkReady: handleChunkReady,
    chunkDurationMs: 4000, // 4 saniye — daha doğru anlama için artırıldı
  });

  // Mikrofon toggle fonksiyonunu store'a kaydet (App.tsx kullanacak)
  const toggleRecording = useCallback(async () => {
    if (!backendOnline && !isRecording) {
      Alert.alert(
        'Bağlantı Hatası',
        `Sunucuya bağlanılamıyor.\n${backendUrl}\n\nAyarlar'dan bağlantıyı kontrol edin.`,
        [{ text: 'Tamam' }]
      );
      return;
    }
    if (isRecording) {
      setRecording(false);
      previousTextRef.current = '';
      currentSentencePartsRef.current = [];
      silenceCountRef.current = 0;
      await stopRecording();
    } else {
      setRecording(true);
      currentSentencePartsRef.current = [];
      previousTextRef.current = '';
      silenceCountRef.current = 0;
      await startRecording();
    }
  }, [backendOnline, isRecording, backendUrl, startRecording, stopRecording]);

  useEffect(() => {
    setToggleRecordingFn(toggleRecording);
  }, [toggleRecording]);

  const statusColor = backendOnline === null ? '#888' : backendOnline ? '#4ade80' : '#f87171';
  const statusText = backendOnline === null
    ? 'Kontrol ediliyor...'
    : backendOnline ? '● Sunucu bağlı' : '● Bağlantı yok';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />

      {/* ══ Üst: Animasyon Alanı ══ */}
      <View style={styles.animationArea}>
        {/* Köşe: Bağlantı durumu */}
        <View style={styles.statusChip}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>

        {/* Animasyon placeholder */}
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarLabel}>Animasyon Alanı</Text>
          <Text style={styles.avatarSub}>3D Avatar gösterilecek</Text>
        </View>

        {/* İşleniyor göstergesi */}
        {isProcessing && (
          <View style={styles.processingPill}>
            <Text style={styles.processingText}>⚙ Çözümleniyor...</Text>
          </View>
        )}
      </View>

      {/* ══ Orta: Anlık Altyazı ══ */}
      <View style={styles.subtitleSection}>
        <Animated.Text
          style={[styles.subtitleText, { opacity: subtitleFade }]}
          numberOfLines={3}
        >
          {currentSubtitle || (isRecording ? '🎙 Dinleniyor...' : 'Konuşmayı başlatmak için mikrofona dokunun')}
        </Animated.Text>
      </View>

      {/* ══ Alt: Geçmiş ══ */}
      <View style={styles.historySection}>
        <Text style={styles.historyLabel}>GEÇMİŞ</Text>
        <ScrollView
          style={styles.historyScroll}
          contentContainerStyle={styles.historyContent}
          showsVerticalScrollIndicator={false}
        >
          {subtitleHistory.length === 0 ? (
            <Text style={styles.historyEmpty}>Henüz kayıt yok</Text>
          ) : (
            subtitleHistory.map((entry) => (
              <View key={entry.id} style={styles.historyItem}>
                <Text style={styles.historyItemText}>{entry.text}</Text>
                <Text style={styles.historyItemTime}>
                  {entry.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },

  // Animasyon alanı — üst yarı
  animationArea: {
    height: SCREEN_HEIGHT * 0.42,
    backgroundColor: '#0f0f1e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  statusChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  avatarPlaceholder: { alignItems: 'center' },
  avatarIcon: { fontSize: 64, marginBottom: 12 },
  avatarLabel: { color: '#4b5563', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
  avatarSub: { color: '#374151', fontSize: 11, marginTop: 4 },
  processingPill: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: '#7c3aed22',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7c3aed44',
  },
  processingText: { color: '#a78bfa', fontSize: 12 },

  // Altyazı bölümü
  subtitleSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 80,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  subtitleText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#f0f0ff',
    lineHeight: 32,
    textAlign: 'center',
  },

  // Geçmiş bölümü
  historySection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  historyScroll: { flex: 1 },
  historyContent: { paddingBottom: 16 },
  historyEmpty: { color: '#374151', fontSize: 13, textAlign: 'center', marginTop: 20 },
  historyItem: {
    backgroundColor: '#141428',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderLeftWidth: 2,
    borderLeftColor: '#7c3aed',
  },
  historyItemText: { flex: 1, color: '#d1d5db', fontSize: 14, lineHeight: 20 },
  historyItemTime: { color: '#374151', fontSize: 10, marginLeft: 8, marginTop: 2 },
});
