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
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useAppStore } from '../store/appStore';
import { useWebSocketRecorder } from '../services/useWebSocketRecorder';
import { checkBackendHealth } from '../services/whisperApi';
import { textToSignQueue } from '../services/signLanguageMapper';
import SignAvatar from '../components/SignAvatar';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen() {
  const {
    isRecording,
    currentSubtitle, subtitleHistory,
    backendUrl,
    subtitleFontSize,
    chatFontSize,
    setRecording,
    setCurrentSubtitle, addToHistory, addUserMessage,
    setAnimationQueue,
    setToggleRecordingFn,
  } = useAppStore();

  const scrollRef = useRef<ScrollView>(null);
  const currentSentencePartsRef = useRef<string[]>([]);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showVolumeHint, setShowVolumeHint] = useState(false);

  // Geçmişe aktarma süresi — bu kadar sessizlik sonra cümle geçmişe geçer
  const COMMIT_SILENCE_MS = 2500;

  // Mesaj yazma
  const [messageText, setMessageText] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  
  // Avatar'ın oynatacağı kelime
  const [avatarWord, setAvatarWord] = useState('');

  // Animasyonlar
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subtitleFade = useRef(new Animated.Value(1)).current;

  // Biriken cümleyi geçmişe aktar ve canlı metni sıfırla
  const commitToHistory = useCallback(() => {
    commitTimerRef.current = null;
    const sentence = currentSentencePartsRef.current.join(' ').trim();
    if (!sentence) return;
    addToHistory(sentence);
    // Son kelimeyi animasyona gönder (POC amaçlı sadece kelime bazlı çalışıyoruz şimdilik)
    const words = sentence.split(' ');
    setAvatarWord(words[words.length - 1].toLowerCase());
    
    currentSentencePartsRef.current = [];
    setCurrentSubtitle('');
    Animated.timing(subtitleFade, {
      toValue: 0.4, duration: 600, useNativeDriver: true,
    }).start(() => subtitleFade.setValue(1));
  }, [addToHistory, setCurrentSubtitle]);

  // WebSocket segment callback'i — her Whisper segment'i alındığında
  const handleSegment = useCallback((text: string) => {
    currentSentencePartsRef.current.push(text);
    const live = currentSentencePartsRef.current.join(' ');
    setCurrentSubtitle(live);

    // Fade-in animasyonu
    subtitleFade.setValue(0.5);
    Animated.timing(subtitleFade, {
      toValue: 1, duration: 200, useNativeDriver: true,
    }).start();

    // Her yeni kelimede timer'ı sıfırla ve yeniden başlat
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitToHistory, COMMIT_SILENCE_MS);

    // İşaret dili animasyon kuyruğu
    const queue = textToSignQueue(text);
    setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));
  }, [setCurrentSubtitle, setAnimationQueue, commitToHistory, COMMIT_SILENCE_MS]);

  // Sessizlik sinyali — timer'ı hızlandır (1s kala)
  const handleSilence = useCallback(() => {
    if (currentSentencePartsRef.current.length === 0) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitToHistory, 1000);
  }, [commitToHistory]);

  // Unmount'ta timer'ı temizle
  useEffect(() => () => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);

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

  const { startRecording, stopRecording, preConnect, wsStatus } = useWebSocketRecorder({
    backendUrl,
    onSegment: handleSegment,
    onSilence: handleSilence,
  });

  // backendUrl ayarlandığında (veya değiştiğinde) WebSocket'i önceden kur.
  // Kulak butonuna basıldığında bağlantı zaten hazır olur → anında başlar.
  useEffect(() => {
    if (!backendUrl) return;
    preConnect();
  }, [backendUrl]);

  // Mikrofon toggle
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      setRecording(false);
      setShowVolumeHint(false);
      if (volumeHintTimerRef.current) clearTimeout(volumeHintTimerRef.current);
      // Timer'ı iptal et, bekleyen cümleyi hemen kaydet
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      const pending = currentSentencePartsRef.current.join(' ').trim();
      if (pending) {
        addToHistory(pending);
        setCurrentSubtitle('');
      }
      currentSentencePartsRef.current = [];
      await stopRecording();
    } else {
      doStartRecording();
    }
  }, [isRecording, stopRecording, setCurrentSubtitle, addToHistory]);

  // Kayıt başlatma yardımcı fonksiyonu
  const doStartRecording = useCallback(async () => {
    setRecording(true);
    currentSentencePartsRef.current = [];
    setCurrentSubtitle('');
    try {
      await startRecording();
    } catch (err: any) {
      setRecording(false);
      Alert.alert(
        'Bağlantı Hatası',
        `WebSocket bağlantısı kurulamadı.\n${backendUrl}\n\nSunucunun çalıştığını kontrol edin.`,
        [{ text: 'Tamam' }]
      );
    }
  }, [backendUrl, startRecording, setCurrentSubtitle]);

  useEffect(() => {
    setToggleRecordingFn(toggleRecording);
  }, [toggleRecording]);

  // ── Mesaj Gönder ──
  const handleSendMessage = useCallback(() => {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    addUserMessage(trimmed);
    
    // Girilen cümleyi (veya kelimeyi) animasyona gönder
    const words = trimmed.split(' ');
    setAvatarWord(words[words.length - 1].toLowerCase());

    // Sesli oku
    Speech.speak(trimmed, { language: 'tr-TR', rate: 0.95, pitch: 1.0 });
    setMessageText('');
  }, [messageText, addUserMessage]);

  // ── Mesajı Sesli Oku ──
  const handleSpeakMessage = useCallback(async (id: string, text: string) => {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      Speech.stop();
      setSpeakingId(null);
      return;
    }
    // Ses uyarı banner'ını göster (TTS için ses gerekli)
    setShowVolumeHint(true);
    if (volumeHintTimerRef.current) clearTimeout(volumeHintTimerRef.current);
    volumeHintTimerRef.current = setTimeout(() => setShowVolumeHint(false), 3500);

    setSpeakingId(id);
    Speech.speak(text, {
      language: 'tr-TR',
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }, []);

  const statusColor =
    wsStatus === 'open' ? '#4F8A6B' :
      wsStatus === 'connecting' ? '#C8963A' : '#6B7A86';
  const statusText =
    wsStatus === 'open' ? '● Canlı bağlı' :
      wsStatus === 'connecting' ? '◌ Bağlanıyor...' : '○ Hazır';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FDFCF0" />

        {/* ══ Üst: Animasyon Alanı ══ */}
        <View style={styles.animationArea}>
          {/* Köşe: Bağlantı durumu */}
          <View style={styles.statusChip}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>

          {/* Animasyon Alanı */}
          <View style={styles.avatarPlaceholder}>
             <SignAvatar word={avatarWord} />
          </View>
        </View>

        {/* ══ Anlık Altyazı ══ */}
        <View style={styles.subtitleSection}>
          <Animated.Text
            style={[styles.subtitleText, { opacity: subtitleFade, fontSize: subtitleFontSize }]}
          >
            {currentSubtitle || (isRecording ? 'Dinleniyor...' : 'Dinlemeye başlayarak sohbeti başlatın ')}
          </Animated.Text>
        </View>

        {/* Ses uyarı banner’ı artık burada değil, sohbet geçmişi başlığında gösterilecek */}
        {/* ══ Sohbet Geçmişi ══ */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyLabel}>SOHBET GEÇMİŞİ</Text>
            {wsStatus === 'connecting' && (
              <Text style={styles.processingInline}>Bağlanıyor...</Text>
            )}
            {showVolumeHint && (
              <View style={styles.volumeHint}>
                <Feather name="volume-2" size={11} color="#7A5C00" style={{ marginRight: 4 }} />
                <Text style={styles.volumeHintText}>Sesin açık olduğundan emin olunuz!</Text>
              </View>
            )}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.historyScroll}
            contentContainerStyle={styles.historyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {subtitleHistory.length === 0 ? (
              <Text style={styles.historyEmpty}>Henüz mesaj yok</Text>
            ) : (
              [...subtitleHistory].reverse().map((entry) => {
                const isUser = entry.sender === 'user';
                const isSpeaking = speakingId === entry.id;
                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.bubbleRow,
                      isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
                    ]}
                  >
                    {/* Ses butonu — sol tarafta mic mesajlarında */}
                    {!isUser && (
                      <TouchableOpacity
                        style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]}
                        onPress={() => handleSpeakMessage(entry.id, entry.text)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={isSpeaking ? 'volume-x' : 'volume-2'}
                          size={15}
                          color={isSpeaking ? '#C96A5A' : '#5D8AA8'}
                        />
                      </TouchableOpacity>
                    )}

                    {/* Balon */}
                    <View
                      style={[
                        styles.bubble,
                        isUser ? styles.bubbleUser : styles.bubbleMic,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          isUser ? styles.bubbleTextUser : styles.bubbleTextMic,
                          { fontSize: chatFontSize },
                        ]}
                      >
                        {entry.text}
                      </Text>
                      <Text
                        style={[
                          styles.bubbleTime,
                          isUser ? styles.bubbleTimeUser : styles.bubbleTimeMic,
                        ]}
                      >
                        {entry.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {/* Ses butonu — sağ tarafta user mesajlarında */}
                    {isUser && (
                      <TouchableOpacity
                        style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]}
                        onPress={() => handleSpeakMessage(entry.id, entry.text)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={isSpeaking ? 'volume-x' : 'volume-2'}
                          size={15}
                          color={isSpeaking ? '#C96A5A' : '#4F8A6B'}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* ══ Mesaj Yazma Alanı ══ */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Mesaj yaz..."
            placeholderTextColor="#A9B8C0"
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            activeOpacity={0.8}
            disabled={!messageText.trim()}
          >
            <Feather name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFCF0',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  // ── Animasyon alanı ──
  animationArea: {
    height: SCREEN_HEIGHT * 0.38,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8E6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  statusChip: {
    position: 'absolute',
    top: 14,
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
  // Çözümleniyor — SOHBET GEÇMİŞİ yanında ince yazı
  processingInline: {
    fontSize: 11,
    color: '#A9B8C0',
    fontStyle: 'italic',
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  // ── Altyazı ──
  subtitleSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 70,
    maxHeight: 130,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: -20,
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
    lineHeight: 26,
    textAlign: 'center',
  },

  // ── Sohbet Geçmişi ──
  historySection: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7A86',
    letterSpacing: 2,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#6B7A86', marginLeft: 4, fontWeight: '600' },

  historyScroll: { flex: 1 },
  historyContent: { paddingBottom: 8, paddingTop: 4 },
  historyEmpty: { color: '#A9B8C0', fontSize: 13, textAlign: 'center', marginTop: 30 },

  // ── Balonlar ──
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },

  bubble: {
    maxWidth: '72%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMic: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5E4EF',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: '#4F8A6B',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  bubbleTextMic: { color: '#2F3E46' },
  bubbleTextUser: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, marginTop: 4, fontWeight: '600' },
  bubbleTimeMic: { color: '#A9B8C0', textAlign: 'left' },
  bubbleTimeUser: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },

  // Ses butonu
  speakBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E6E8E6',
  },
  speakBtnActive: {
    backgroundColor: '#FFF0EE',
    borderColor: '#C96A5A',
  },

  // ── Mesaj Yazma Alanı ──
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6E8E6',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F7F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: '#2F3E46',
    borderWidth: 1,
    borderColor: '#E0E8EE',
    maxHeight: 100,
    fontWeight: '500',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#4F8A6B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F8A6B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: '#B8C8C0',
    shadowOpacity: 0,
    elevation: 0,
  },

  // ── Ses uyarı chip'i (geçmiş başlığında) ──
  volumeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  volumeHintText: {
    fontSize: 10,
    color: '#7A5C00',
    fontWeight: '700',
  },
});
