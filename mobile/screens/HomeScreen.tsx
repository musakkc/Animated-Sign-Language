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
    chatFontSize,
    setRecording, setProcessing,
    setCurrentSubtitle, addToHistory, addUserMessage,
    setAnimationQueue,
    setToggleRecordingFn,
  } = useAppStore();

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const backendOnlineRef = useRef<boolean | null>(null);
  const previousTextRef = useRef<string>('');
  const scrollRef = useRef<ScrollView>(null);

  // Mesaj yazma
  const [messageText, setMessageText] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

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
          silenceCountRef.current = 0;
          currentSentencePartsRef.current.push(text);
          previousTextRef.current = text;

          const liveSentence = currentSentencePartsRef.current.join(' ');
          setCurrentSubtitle(liveSentence);

          subtitleFade.setValue(0.4);
          Animated.timing(subtitleFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();

          const queue = textToSignQueue(text);
          setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));

        } else {
          silenceCountRef.current++;
          if (silenceCountRef.current >= 1 && currentSentencePartsRef.current.length > 0) {
            const completeSentence = currentSentencePartsRef.current.join(' ');
            addToHistory(completeSentence);
            currentSentencePartsRef.current = [];
            previousTextRef.current = '';
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
          setCurrentSubtitle(text);
          subtitleFade.setValue(0.4);
          Animated.timing(subtitleFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
          const queue = textToSignQueue(text);
          setAnimationQueue(queue.map((q) => `${q.type}:${q.value}`));
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
      if (currentSentencePartsRef.current.length > 0) {
        const pendingSentence = currentSentencePartsRef.current.join(' ');
        addToHistory(pendingSentence);
      }
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
  }, [backendOnline, isRecording, backendUrl, startRecording, stopRecording, addToHistory]);

  useEffect(() => {
    setToggleRecordingFn(toggleRecording);
  }, [toggleRecording]);

  // ── Mesaj Gönder ──
  const handleSendMessage = useCallback(() => {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    addUserMessage(trimmed);
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

  const statusColor = backendOnline === null ? '#6B7A86' : backendOnline ? '#4F8A6B' : '#C96A5A';
  const statusText = backendOnline === null
    ? 'Kontrol ediliyor...'
    : backendOnline ? '● Sunucu bağlı' : '● Bağlantı yok';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          {/* Animasyon placeholder */}
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLabel}>Animasyon Alanı</Text>
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

        {/* ══ Sohbet Geçmişi ══ */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyLabel}>SOHBET GEÇMİŞİ</Text>
            {isProcessing && (
              <Text style={styles.processingInline}>Çözümleniyor...</Text>
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
});
