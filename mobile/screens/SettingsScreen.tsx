import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { checkBackendHealth } from '../services/whisperApi';
import { autoDiscoverBackend } from '../services/autoDiscovery';

const DEFAULT_FONT_SIZE = 20;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 28;

const DEFAULT_CHAT_FONT_SIZE = 14;
const MIN_CHAT_FONT_SIZE = 11;
const MAX_CHAT_FONT_SIZE = 24;

export default function SettingsScreen() {
  const {
    backendUrl,
    animationSpeed,
    setBackendUrl,
    setAnimationSpeed,
    clearHistory,
    subtitleFontSize,
    setSubtitleFontSize,
    resetSubtitleFontSize,
    chatFontSize,
    setChatFontSize,
    resetChatFontSize,
  } = useAppStore();

  const resetAnimationSpeed = () => setAnimationSpeed(1.0);

  const [urlInput, setUrlInput] = useState(backendUrl);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMsg('Mevcut adres deneniyor...');
    try {
      const ok = await checkBackendHealth(urlInput);
      if (ok) {
        setBackendUrl(urlInput);
        setStatusMsg(null);
        Alert.alert('Bağlantı Başarılı', `Sunucuya bağlandı!\n${urlInput}`);
        return;
      }

      setStatusMsg('Önce mevcut adres denendi, bulunamadı. Ağ taranıyor...');
      const discoveredUrl = await autoDiscoverBackend((msg) => setStatusMsg(msg));

      if (discoveredUrl) {
        setUrlInput(discoveredUrl);
        setBackendUrl(discoveredUrl);
        setStatusMsg(null);
        Alert.alert(
          'Sunucu Bulundu!',
          `Otomatik keşfedildi:\n${discoveredUrl}`,
          [{ text: 'Harika!' }]
        );
      } else {
        setStatusMsg(null);
        Alert.alert(
          'Bulunamadı',
          'Ağınızdaki backend sunucu bulunamadı.\n\n• Backend çalışıyor mu?\n• Telefon ve bilgisayar aynı Wi-Fi\'de mi?'
        );
      }
    } finally {
      setTesting(false);
    }
  };

  const previewText = 'Merhaba! Bu yazı boyutu önizlemesidir.';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFCF0" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Sayfa başlığı */}
        <Text style={styles.pageTitle}>Ayarlar</Text>

        {/* ── Sunucu Bağlantısı ── */}
        <Text style={styles.sectionHeader}>SUNUCU BAĞLANTISI</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor="#B0BAC0"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {statusMsg && (
            <View style={styles.statusBox}>
              <Feather name="search" size={12} color="#5D8AA8" style={{ marginRight: 6 }} />
              <Text style={styles.statusBoxText}>{statusMsg}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.button, testing && styles.buttonDisabled]}
            onPress={handleTestConnection}
            disabled={testing}
            activeOpacity={0.8}
          >
            <Feather
              name={testing ? 'loader' : 'wifi'}
              size={16}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.buttonText}>
              {testing ? 'Aranıyor...' : 'Bağlantıyı Test Et & Otomatik Bul'}
            </Text>
          </TouchableOpacity>
        </View>
        {/* ── Görünüm Ayarları ── */}
        <Text style={styles.sectionHeader}>GÖRÜNÜM AYARLARI</Text>

        {/* Animasyon Hızı Kartı */}
        <View style={styles.card}>
          <View style={styles.sliderHeader}>
            <View>
              <Text style={styles.sliderLabel}>Animasyon Hızı</Text>

            </View>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={resetAnimationSpeed}
              activeOpacity={0.7}
            >
              <Feather name="rotate-ccw" size={13} color="#A0887A" />
              <Text style={styles.resetBtnText}>Sıfırla</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={3.0}
              step={0.1}
              value={animationSpeed}
              onValueChange={setAnimationSpeed}
              minimumTrackTintColor="#4F8A6B"
              maximumTrackTintColor="#E6E0D8"
              thumbTintColor="#4F8A6B"
            />
            <Text style={[styles.sliderValue, { color: '#4F8A6B' }]}>
              {animationSpeed.toFixed(1)}x
            </Text>
          </View>
        </View>

        {/* Yazı Boyutu Kartı */}
        <View style={styles.card}>
          {/* Başlık + Sıfırla */}
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Canlı Altyazı Boyutu</Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={resetSubtitleFontSize}
              activeOpacity={0.7}
            >
              <Feather name="rotate-ccw" size={13} color="#A0887A" />
              <Text style={styles.resetBtnText}>Sıfırla</Text>
            </TouchableOpacity>
          </View>

          {/* Slider + Değer */}
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={MIN_FONT_SIZE}
              maximumValue={MAX_FONT_SIZE}
              step={1}
              value={subtitleFontSize}
              onValueChange={setSubtitleFontSize}
              minimumTrackTintColor="#B87333"
              maximumTrackTintColor="#E6E0D8"
              thumbTintColor="#B87333"
            />
            <Text style={styles.sliderValue}>{subtitleFontSize}</Text>
          </View>

          {/* Önizleme */}
          <View style={styles.previewBox}>
            <Text style={[styles.previewText, { fontSize: subtitleFontSize }]}>
              {previewText}
            </Text>
          </View>
        </View>

        {/* Sohbet Geçmişi Yazı Boyutu Kartı */}
        <View style={styles.card}>
          <View style={styles.sliderHeader}>
            <View>
              <Text style={styles.sliderLabel}>Sohbet Geçmişi Yazı Boyutu</Text>
            </View>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={resetChatFontSize}
              activeOpacity={0.7}
            >
              <Feather name="rotate-ccw" size={13} color="#A0887A" />
              <Text style={styles.resetBtnText}>Sıfırla</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={MIN_CHAT_FONT_SIZE}
              maximumValue={MAX_CHAT_FONT_SIZE}
              step={1}
              value={chatFontSize}
              onValueChange={setChatFontSize}
              minimumTrackTintColor="#5D8AA8"
              maximumTrackTintColor="#E6E0D8"
              thumbTintColor="#5D8AA8"
            />
            <Text style={[styles.sliderValue, { color: '#5D8AA8' }]}>{chatFontSize}</Text>
          </View>

          {/* Önizleme */}
          <View style={styles.previewBox}>
            <View style={styles.chatPreviewRow}>
              <View style={styles.chatBubbleMic}>
                <Text style={[styles.chatBubbleText, { fontSize: chatFontSize }]}>
                  Merhaba! Bu bir altyazı mesajı.
                </Text>
              </View>
            </View>
            <View style={[styles.chatPreviewRow, { justifyContent: 'flex-end' }]}>
              <View style={styles.chatBubbleUser}>
                <Text style={[styles.chatBubbleTextUser, { fontSize: chatFontSize }]}>
                  Bu sizin mesajınız.
                </Text>
              </View>
            </View>
          </View>
        </View>
        {/* <Text style={styles.sectionHeader}>VERİ</Text> */}

        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={() =>
              Alert.alert('Geçmişi Temizle', 'Tüm altyazı geçmişi silinecek. Emin misiniz?', [
                { text: 'İptal', style: 'cancel' },
                { text: 'Temizle', style: 'destructive', onPress: clearHistory },
              ])
            }
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Geçmişi Temizle</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hakkında ── */}
        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>TİD (Türkçe İşaret Dili)</Text>
          <Text style={styles.aboutText}>
            İşitme engelliler için geliştirilmiştir.
          </Text>
          <Text style={styles.aboutVersion}>v1.0.0 · Whisper (medium)</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3EE',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scroll: { padding: 20, paddingBottom: 56 },

  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2F3E46',
    marginBottom: 24,
    letterSpacing: -0.5,
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9BA8AF',
    letterSpacing: 1.4,
    marginBottom: 10,
    marginTop: 4,
    marginLeft: 4,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ECEAE4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  /* Slider bölümü */
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2F3E46',
  },
  sliderSubLabel: {
    fontSize: 11,
    color: '#9BA8AF',
    fontWeight: '500',
    marginTop: 2,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0D5CC',
    backgroundColor: '#FAF8F5',
    gap: 4,
  },
  resetBtnText: {
    fontSize: 12,
    color: '#A0887A',
    fontWeight: '600',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sliderValue: {
    width: 36,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    color: '#B87333',
    marginLeft: 4,
  },
  previewBox: {
    backgroundColor: '#F5F3EE',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  previewText: {
    color: '#2F3E46',
    fontWeight: '500',
    lineHeight: 38,
  },

  /* Input */
  input: {
    backgroundColor: '#F9F8F5',
    borderRadius: 12,
    padding: 14,
    color: '#2F3E46',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ECEAE4',
    marginBottom: 12,
  },

  /* Butonlar */
  button: {
    backgroundColor: '#607D8B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonDanger: { backgroundColor: '#C96A5A' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  /* Durum kutusu */
  statusBox: {
    backgroundColor: 'rgba(127, 169, 196, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#7FA9C4',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusBoxText: { color: '#5D8AA8', fontSize: 12, lineHeight: 18, fontWeight: '600', flex: 1 },

  /* Hakkında */
  aboutBox: {
    marginTop: 8,
    alignItems: 'center',
    padding: 24,
  },
  aboutTitle: { fontSize: 18, color: '#2F3E46', fontWeight: '800', marginBottom: 8 },
  aboutText: { color: '#6B7A86', textAlign: 'center', lineHeight: 22, marginBottom: 8, fontSize: 14 },
  aboutVersion: { color: '#C4B89A', fontSize: 12, fontWeight: '700' },

  /* Sohbet önizleme */
  chatPreviewRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chatBubbleMic: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5E4EF',
    borderRadius: 14,
    borderBottomLeftRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '80%',
  },
  chatBubbleUser: {
    backgroundColor: '#4F8A6B',
    borderRadius: 14,
    borderBottomRightRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '80%',
  },
  chatBubbleText: {
    color: '#2F3E46',
    fontWeight: '500',
    lineHeight: 20,
  },
  chatBubbleTextUser: {
    color: '#FFFFFF',
    fontWeight: '500',
    lineHeight: 20,
  },
});
