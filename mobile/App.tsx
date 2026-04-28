import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
} from 'react-native';
import { useAppStore } from './store/appStore';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';

type Tab = 'home' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = React.useState<Tab>('home');
  const { isRecording, toggleRecordingFn } = useAppStore();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Mikrofon butonu animasyonu
  React.useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.stopAnimation();
      Animated.timing(scaleAnim, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />

      {/* İçerik */}
      <View style={styles.content}>
        {activeTab === 'home' ? <HomeScreen /> : <SettingsScreen />}
      </View>

      {/* Alt Tab Bar — mikrofon ortada */}
      <View style={styles.tabBar}>

        {/* Sol: Altyazı */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>📝</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>
            Altyazı
          </Text>
        </TouchableOpacity>

        {/* Orta: Mikrofon butonu */}
        <View style={styles.micWrapper}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive]}
              onPress={() => toggleRecordingFn?.()}
              activeOpacity={0.85}
            >
              <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎙'}</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={[styles.tabLabel, isRecording && styles.micLabelActive]}>
            {isRecording ? 'Duraksatmak için' : 'Başlatmak için'}
          </Text>
        </View>

        {/* Sağ: Ayarlar */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
            Ayarlar
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a14' },
  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111122',
    borderTopWidth: 1,
    borderTopColor: '#1e1e3a',
    alignItems: 'flex-end',
    paddingBottom: 8,
    paddingHorizontal: 8,
    height: 80,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },

  tabIcon: { fontSize: 20 },
  tabLabel: {
    fontSize: 10,
    color: '#4b5563',
    fontWeight: '500',
    marginTop: 3,
  },
  tabLabelActive: { color: '#a78bfa' },

  // Merkezdeki mikrofon
  micWrapper: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    // Gölge
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
    // Yükseltme efekti için negatif margin
    marginTop: -20,
  },
  micButtonActive: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
  },
  micIcon: { fontSize: 28 },
  micLabelActive: { color: '#f87171' },
});
