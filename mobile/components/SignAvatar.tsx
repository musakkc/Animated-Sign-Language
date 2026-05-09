import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import axios from 'axios';
import { useAppStore } from '../store/appStore';

interface Point {
  type: string;
  x: number;
  y: number;
  z: number;
}

interface AnimationData {
  success: boolean;
  total_frames: number;
  frames: {
    [key: string]: Point[];
  };
}

const Skeleton2D = ({ animationData }: { animationData: AnimationData | null }) => {
  const [currentFrame, setCurrentFrame] = useState<number | null>(null);
  const frameKeys = animationData ? Object.keys(animationData.frames).map(Number).sort((a, b) => a - b) : [];

  useEffect(() => {
    if (frameKeys.length > 0) {
      setCurrentFrame(frameKeys[0]);
    }
  }, [animationData]);

  // Saniyede ~20 kare oynatmak için React hook
  useEffect(() => {
    if (!animationData || frameKeys.length === 0 || currentFrame === null) return;
    
    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev === null) return frameKeys[0];
        const nextIdx = frameKeys.indexOf(prev) + 1;
        if (nextIdx >= frameKeys.length) return frameKeys[0];
        return frameKeys[nextIdx];
      });
    }, 50); // 50ms = 20 fps

    return () => clearInterval(interval);
  }, [animationData, currentFrame, frameKeys]);

  if (!animationData || frameKeys.length === 0 || currentFrame === null) return null;

  const currentPoints = animationData.frames[currentFrame?.toString() || ''] || animationData.frames[currentFrame || 0] || [];

  return (
    <View style={styles.skeletonContainer}>
      {currentPoints.map((point, index) => {
        // MediaPipe verileri genelde 0.0 ile 1.0 arasındadır.
        // Genişliği 300px, yüksekliği 300px olan kutuya göre ayarlıyoruz.
        // Y ekseni yukarıdan aşağıya doğru artar (telefon ekranı da öyledir).
        const left = point.x * 300;
        const top = point.y * 300;
        
        let color = '#4F8A6B'; // Pose (Gövde) - Yeşilimsi
        let size = 6;
        
        if (point.type === 'left_hand') { 
            color = '#ff6b6b'; // Kırmızımsı
            size = 4; 
        }
        if (point.type === 'right_hand') { 
            color = '#4ea8de'; // Mavimsi
            size = 4; 
        }

        return (
          <View 
            key={index} 
            style={[
              styles.dot, 
              { 
                left: left - (size/2), 
                top: top - (size/2), 
                width: size, 
                height: size, 
                backgroundColor: color 
              }
            ]} 
          />
        );
      })}
    </View>
  );
};

export default function SignAvatar({ word }: { word: string }) {
  const [data, setData] = useState<AnimationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backendUrl = useAppStore(state => state.backendUrl);

  useEffect(() => {
    if (!word) return;

    const fetchAnimation = async () => {
      try {
        setError(null);
        const httpUrl = backendUrl.replace('ws://', 'http://').replace('/ws/transcribe', '');
        const response = await axios.get(`${httpUrl}/get-sign-animation/${word}`);
        setData(response.data);
      } catch (err: any) {
        console.error("Animasyon çekilirken hata:", err.message);
        setError(`'${word}' için animasyon bulunamadı`);
      }
    };

    fetchAnimation();
  }, [word]);

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !data ? (
        <Text style={styles.loadingText}>Animasyon bekleniyor...</Text>
      ) : (
        <Skeleton2D animationData={data} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    backgroundColor: '#1E1E1E', 
    borderRadius: 15,
    overflow: 'hidden',
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  skeletonContainer: {
    width: 300,
    height: 300,
    position: 'relative',
    backgroundColor: '#1E1E1E',
  },
  dot: {
    position: 'absolute',
    borderRadius: 10,
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    fontSize: 16,
  },
  loadingText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 16,
  }
});
