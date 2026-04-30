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
  Platform,
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
    subtitleFontSize,
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
    [backendUrl, addToHistory]
  );

  // Durdurma anındaki yarım chunk — doğrudan geçmişe yaz
  const handleFinalChunk = useCallback(
    async (uri: string) => {
      if (!backendOnlineRef.current) return;
      setProcessing(true);
      try {
        const text = await transcribeAudio(uri, backendUrl, previousTextRef.current);
        if (text && text.length > 0) {
          // Altyazıyı güncelle
          setCurrentSubtitle(text);
          subtitleFade.setValue(0.4);
          Animated.timing(subtitleFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
          // İşaret dili
          const queue = textToSignQueue(text);
          setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));
          // Doğrudan geçmişe ekle (sessizlik bekleme)
          addToHistory(text);
        }
      } catch (error: any) {
        console.error('Final chunk hatası:', error.message);
      } finally {
        setProcessing(false);
      }
    },
    [backendUrl, addToHistory]
  );

  const { startRecording, stopRecording } = useAudioRecorder({
    onChunkReady: handleChunkReady,
    chunkDurationMs: 4000,
    onFinalChunkReady: handleFinalChunk,
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

      // Durdurma anında birikmiş cümleyi geçmişe kaydet (sessizlik tespiti beklenmeden)
      if (currentSentencePartsRef.current.length > 0) {
        const pendingSentence = currentSentencePartsRef.current.join(' ');
        addToHistory(pendingSentence);
      }

      // Refs'i sıfırla
      previousTextRef.current = '';
      currentSentencePartsRef.current = [];
      silenceCountRef.current = 0;

      // stopRecording: son yarım chunk → onFinalChunkReady → handleFinalChunk
      await stopRecording();
    } else {
      setRecording(true);
      currentSentencePartsRef.current = [];
      previousTextRef.current = '';
      silenceCountRef.current = 0;
      await startRecording();
    }
  }, [backendOnline, isRecording, backendUrl, startRecording, stopRecording, addToHistory]);


  useEffect(() => {
    setToggleRecordingFn(toggleRecording);
  }, [toggleRecording]);

  const statusColor = backendOnline === null ? '#6B7A86' : backendOnline ? '#4F8A6B' : '#C96A5A';
  const statusText = backendOnline === null
    ? 'Kontrol ediliyor...'
    : backendOnline ? '● Sunucu bağlı' : '● Bağlantı yok';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFCF0" />

      {/* ══ Üst: Animasyon Alanı ══ */}
      <View style={styles.animationArea}>
        {/* Köşe: Bağlantı durumu */}
        <View style={styles.statusChip}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>

        {/* Animasyon placeholder */}
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarLabel}>Animasyon Alanı</Text>
        </View>

        {/* İşleniyor göstergesi */}
        {isProcessing && (
          <View style={styles.processingPill}>
            <Text style={styles.processingText}>Çözümleniyor...</Text>
          </View>
        )}
      </View>

      {/* ══ Orta: Anlık Altyazı ══ */}
      <View style={styles.subtitleSection}>
        <Animated.Text
          style={[styles.subtitleText, { opacity: subtitleFade, fontSize: subtitleFontSize }]}
        >
          {currentSubtitle || (isRecording ? 'Dinleniyor...' : 'Dinlemeye başlayarak sohbeti başlatın ')}
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
                  {entry.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
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
  container: {
    flex: 1,
    backgroundColor: '#FDFCF0',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Android çentik koruması
  },

  // Animasyon alanı — üst yarı
  animationArea: {
    height: SCREEN_HEIGHT * 0.42,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8E6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  statusChip: {
    position: 'absolute',
    top: 20, // Daha aşağı alındı
    right: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6E8E6',
    zIndex: 10,
  },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  avatarPlaceholder: { alignItems: 'center' },
  avatarLabel: { color: '#D9CBB3', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  avatarSub: { color: '#6B7A86', fontSize: 11, marginTop: 6, fontWeight: '500' },
  processingPill: {
    position: 'absolute',
    bottom: 45, // Altyazı kartının üstünde durması için yükseltildi
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7FA9C4',
    zIndex: 5,
  },
  processingText: { color: '#5D8AA8', fontSize: 12, fontWeight: '700' },

  // Altyazı bölümü
  subtitleSection: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    minHeight: 110,
    maxHeight: 200,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: -30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E8E6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  subtitleText: {
    fontWeight: '500',
    color: '#2F3E46',
    lineHeight: 30,
    textAlign: 'center',
  },

  // Geçmiş bölümü
  historySection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  historyLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7A86',
    letterSpacing: 2,
    marginBottom: 12,
  },
  historyScroll: { flex: 1 },
  historyContent: { paddingBottom: 24 },
  historyEmpty: { color: '#6B7A86', fontSize: 13, textAlign: 'center', marginTop: 30 },
  historyItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#E6E8E6',
  },
  historyItemText: { flex: 1, color: '#2F3E46', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  historyItemTime: { color: '#6B7A86', fontSize: 10, marginLeft: 12, marginTop: 4, fontWeight: '600' },
});
