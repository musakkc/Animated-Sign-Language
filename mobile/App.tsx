import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from './store/appStore';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';

type Tab = 'home' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = React.useState<Tab>('home');
  const { isRecording, toggleRecordingFn } = useAppStore();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Mikrofon (Kulak) butonu animasyonu
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
      <StatusBar barStyle="dark-content" backgroundColor="#FDFCF0" />

      {/* İçerik — Her iki screen her zaman mount'lu: tab geçişinde recorder yeniden başlamaz */}
      <View style={styles.content}>
        <View style={{ flex: 1, display: activeTab === 'home' ? 'flex' : 'none' }}>
          <HomeScreen />
        </View>
        <View style={{ flex: 1, display: activeTab === 'settings' ? 'flex' : 'none' }}>
          <SettingsScreen />
        </View>
      </View>

      {/* Alt Tab Bar */}
      <View style={styles.tabBar}>

        {/* Altyazı */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Feather
            name="message-square"
            size={22}
            color={activeTab === 'home' ? '#5D8AA8' : '#A9B8C0'}
          />
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>
            Altyazı
          </Text>
        </TouchableOpacity>

        {/* Kulak butonu — bar içinde, yukarı yaslanmış daire */}
        <View style={styles.micWrapper}>
          <View style={styles.micCircle}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={styles.micButton}
                onPress={() => toggleRecordingFn?.()}
                activeOpacity={0.8}
              >
                <Image
                  source={require('./assets/ear-skin.png')}
                  style={styles.earImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
          <Text style={[styles.tabLabel, isRecording && styles.micLabelActive]}>
            {isRecording ? 'Dinleniyor...' : 'Dinlemek için'}
          </Text>
        </View>

        {/* Ayarlar */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Feather
            name="settings"
            size={22}
            color={activeTab === 'settings' ? '#5D8AA8' : '#A9B8C0'}
          />
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
            Ayarlar
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFCF0' },
  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6E8E6',
    alignItems: 'center',
    paddingBottom: 10,
    paddingTop: 6,
    paddingHorizontal: 8,
    height: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 4,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },

  tabIcon: { fontSize: 22, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: {
    fontSize: 11,
    color: '#6B7A86',
    fontWeight: '600',
    marginTop: 4,
  },
  tabLabelActive: { color: '#5D8AA8' },

  // Kulak butonu — bar içinde yukarıya yaslanmış daire
  micWrapper: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E8EE',
    shadowColor: '#5D8AA8',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 2,
  },
  micButton: {
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  earImage: {
    width: 48,
    height: 48,
  },
  micLabelActive: { color: '#4F8A6B', fontWeight: '700' },
});



