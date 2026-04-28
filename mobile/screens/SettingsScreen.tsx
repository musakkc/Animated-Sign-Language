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
} from 'react-native';
import { useAppStore } from '../store/appStore';
import { checkBackendHealth } from '../services/whisperApi';
import { autoDiscoverBackend } from '../services/autoDiscovery';

export default function SettingsScreen() {
  const { backendUrl, animationSpeed, setBackendUrl, setAnimationSpeed, clearHistory } =
    useAppStore();
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMsg('Mevcut adres deneniyor...');
    try {
      // 1. Önce mevcut URL'yi dene
      const ok = await checkBackendHealth(urlInput);
      if (ok) {
        setBackendUrl(urlInput);
        setStatusMsg(null);
        Alert.alert('✅ Bağlantı Başarılı', `Sunucuya bağlandı!\n${urlInput}`);
        return;
      }

      // 2. Başarısız ise ağı otomatik tara
      setStatusMsg('Önce mevcut adres denendi, bulunamadı. Ağ taranıyor...');
      const discoveredUrl = await autoDiscoverBackend((msg) => setStatusMsg(msg));

      if (discoveredUrl) {
        setUrlInput(discoveredUrl);
        setBackendUrl(discoveredUrl);
        setStatusMsg(null);
        Alert.alert(
          '✅ Sunucu Bulundu!',
          `Otomatik keşfedildi:\n${discoveredUrl}`,
          [{ text: 'Harika!' }]
        );
      } else {
        setStatusMsg(null);
        Alert.alert(
          '❌ Bulunamadı',
          'Ağınızdaki backend sunucu bulunamadı.\n\n• Backend çalışıyor mu?\n• Telefon ve bilgisayar aynı Wi-Fi\'de mi?'
        );
      }
    } finally {
      setTesting(false);
    }
  };

  const speeds = [
    { label: 'Yavaş', value: 0.5 },
    { label: 'Normal', value: 1.0 },
    { label: 'Hızlı', value: 1.5 },
    { label: 'Çok Hızlı', value: 2.0 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Ayarlar</Text>

        {/* Backend URL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sunucu Bağlantısı</Text>
          <Text style={styles.sectionDesc}>
            Bilgisayarınızdaki backend sunucusunun IP adresi. Telefon ve bilgisayar aynı Wi-Fi'ye
            bağlı olmalıdır.
          </Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {statusMsg && (
            <View style={styles.statusBox}>
              <Text style={styles.statusBoxText}>🔍 {statusMsg}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.button, testing && styles.buttonDisabled]}
            onPress={handleTestConnection}
            disabled={testing}
          >
            <Text style={styles.buttonText}>
              {testing ? '🔍 Aranıyor...' : '🔗 Bağlantıyı Test Et & Otomatik Bul'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Animasyon Hızı */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Animasyon Hızı</Text>
          <View style={styles.speedRow}>
            {speeds.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.speedButton, animationSpeed === s.value && styles.speedButtonActive]}
                onPress={() => setAnimationSpeed(s.value)}
              >
                <Text
                  style={[
                    styles.speedText,
                    animationSpeed === s.value && styles.speedTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Geçmişi Temizle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Veri</Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={() =>
              Alert.alert('Geçmişi Temizle', 'Tüm altyazı geçmişi silinecek. Emin misiniz?', [
                { text: 'İptal', style: 'cancel' },
                { text: 'Temizle', style: 'destructive', onPress: clearHistory },
              ])
            }
          >
            <Text style={styles.buttonText}>Geçmişi Temizle</Text>
          </TouchableOpacity>
        </View>

        {/* Hakkında */}
        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>TİD Altyazı</Text>
          <Text style={styles.aboutText}>
            Türk İşaret Dili (TİD) altyazı ve animasyon uygulaması.{'\n'}
            İşitme engelliler için geliştirilmiştir.
          </Text>
          <Text style={styles.aboutVersion}>v1.0.0 · Yapay Zeka: Whisper (medium)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  scroll: { padding: 24, paddingBottom: 48 },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 28,
  },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d2d4e',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 14,
    color: '#f0f0ff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2d2d4e',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonDanger: { backgroundColor: '#dc2626' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  speedRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  speedButton: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d2d4e',
    margin: 4,
  },
  speedButtonActive: { backgroundColor: '#7c3aed22', borderColor: '#7c3aed' },
  speedText: { color: '#6b7280', fontSize: 13, fontWeight: '500' },
  speedTextActive: { color: '#a78bfa', fontWeight: '700' },
  aboutBox: {
    marginTop: 12,
    alignItems: 'center',
    padding: 24,
  },
  aboutTitle: { fontSize: 22, color: '#fff', fontWeight: '700', marginBottom: 8 },
  aboutText: { color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  aboutVersion: { color: '#374151', fontSize: 12 },
  statusBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#7c3aed',
  },
  statusBoxText: { color: '#a78bfa', fontSize: 12, lineHeight: 18 },
});
