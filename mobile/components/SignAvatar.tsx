import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import axios from 'axios';
import { useAppStore } from '../store/appStore';

// ─────────────── Types ───────────────
interface Point { type: string; x: number; y: number; z: number; }
interface AnimationData {
  success: boolean;
  total_frames: number;
  frames: { [key: string]: Point[] };
}
type Status = 'idle' | 'loading' | 'playing' | 'not_found';

// ─────────────── Skeleton2D ───────────────
// Tek bir kelimenin animasyonunu oynatır.
// Bittikten 300ms sonra onComplete() çağırır.
const Skeleton2D = ({
  animationData,
  animationSpeed,
  onComplete,
}: {
  animationData: AnimationData;
  animationSpeed: number;
  onComplete: () => void;
}) => {
  const [currentFrame, setCurrentFrame] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const frameKeys = Object.keys(animationData.frames)
    .map(Number)
    .sort((a, b) => a - b);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (frameKeys.length === 0) { setCurrentFrame(null); return; }

    setCurrentFrame(frameKeys[0]);

    intervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev === null) return frameKeys[0];
        const nextIdx = frameKeys.indexOf(prev) + 1;
        if (nextIdx >= frameKeys.length) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          // Sonraki kelimeye geçmeden önce küçük duraklama (300ms)
          setTimeout(() => onCompleteRef.current(), 300);
          return prev;
        }
        return frameKeys[nextIdx];
      });
    }, 50 / animationSpeed); // Hız ayarı (varsayılan: 50ms)

    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [animationData, animationSpeed]);

  if (currentFrame === null) return null;

  const currentPoints =
    animationData.frames[currentFrame.toString()] ||
    animationData.frames[currentFrame] ||
    [];

  return (
    <View style={styles.skeletonContainer}>
      {currentPoints.map((point, index) => {
        const left = point.x * 300;
        const top  = point.y * 300;
        let color = '#4F8A6B'; let size = 6;
        if (point.type === 'left_hand')  { color = '#ff6b6b'; size = 4; }
        if (point.type === 'right_hand') { color = '#4ea8de'; size = 4; }
        return (
          <View
            key={index}
            style={[styles.dot, { left: left - size / 2, top: top - size / 2, width: size, height: size, backgroundColor: color }]}
          />
        );
      })}
    </View>
  );
};

// ─────────────── SignAvatar ───────────────
// • words[] kuyruğunu sırayla oynatır
// • Kelime N oynarken kelime N+1 arka planda fetch edilir (prefetch)
// • Animasyon bitince N+1 cache'de hazırdır → kesintisiz geçiş
// • Yalnızca ilk kelime için "yükleniyor" görünebilir
// ─────────────────────────────────────────
export default function SignAvatar({ queueData }: { queueData: { id: string, words: string[] } | null }) {
  const [wordIndex, setWordIndex]   = useState(0);
  const [status, setStatus]         = useState<Status>('idle');
  const [currentData, setCurrentData] = useState<AnimationData | null>(null);
  const [activeWord, setActiveWord] = useState('');

  // word → AnimationData | 'not_found'  (kalıcı cache)
  const cacheRef    = useRef<Map<string, AnimationData | 'not_found'>>(new Map());
  const abortRef    = useRef<AbortController | null>(null);
  const backendUrl  = useAppStore((state) => state.backendUrl);
  const animationSpeed = useAppStore((state) => state.animationSpeed);

  const words = queueData?.words || [];
  const currentId = queueData?.id || '';

  const getHttpUrl = useCallback(() =>
    backendUrl.replace('ws://', 'http://').replace('/ws/transcribe', ''),
    [backendUrl]
  );

  // Kelimeyi sessizce cache'e al (ekranı etkilemez)
  const prefetch = useCallback((word: string) => {
    if (!word || cacheRef.current.has(word)) return;
    // Placeholder koy — mükerrer isteği önler
    cacheRef.current.set(word, 'not_found');
    axios
      .get(`${getHttpUrl()}/get-sign-animation/${word}`)
      .then((res) => { cacheRef.current.set(word, res.data); })
      .catch(() => { /* zaten 'not_found' var */ });
  }, [getHttpUrl]);

  // Yeni ID geldiğinde sıfırla
  useEffect(() => {
    abortRef.current?.abort();
    cacheRef.current.clear();
    setCurrentData(null);
    setWordIndex(0);
    setStatus(words.length > 0 ? 'loading' : 'idle');
    setActiveWord(words[0] ?? '');
  }, [currentId]);

  // wordIndex veya words değiştiğinde: cache kontrolü + fetch + prefetch
  useEffect(() => {
    if (words.length === 0) return;

    // Eğer idle durumundaysa ve hala oynatılacak kelime varsa devam et
    if (status === 'idle' && wordIndex < words.length) {
      setStatus('loading');
    }

    // index'i geçerse dur (idle ol)
    if (wordIndex >= words.length) {
      setCurrentData(null);
      if (status !== 'idle') {
        setStatus('idle');
      }
      setActiveWord('');
      return;
    }

    if (status === 'idle') return; // Sadece idle değilken fetch et (yukarıda loading yapıyoruz)

    const word = words[wordIndex];
    setActiveWord(word);

    // ① Hemen sonraki kelimeyi arka planda prefetch et
    if (wordIndex + 1 < words.length) {
      prefetch(words[wordIndex + 1]);
    }

    // ② Cache'de var mı?
    const cached = cacheRef.current.get(word);
    if (cached) {
      if (cached === 'not_found') {
        setCurrentData(null);
        setStatus('not_found');
        const t = setTimeout(() => setWordIndex((i) => i + 1), 1500);
        return () => clearTimeout(t);
      } else {
        setCurrentData(cached as AnimationData);
        setStatus('playing');
        return;
      }
    }

    // ③ Cache'de yok → fetch (yalnızca ilk kelimede olur)
    setStatus('loading');
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    axios
      .get(`${getHttpUrl()}/get-sign-animation/${word}`, { signal: abortRef.current.signal })
      .then((res) => {
        cacheRef.current.set(word, res.data);
        setCurrentData(res.data);
        setStatus('playing');
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        cacheRef.current.set(word, 'not_found');
        setCurrentData(null);
        setStatus('not_found');
        const t = setTimeout(() => setWordIndex((i) => i + 1), 1500);
        return () => clearTimeout(t);
      });

    return () => { abortRef.current?.abort(); };
  }, [wordIndex, words]);

  const handleComplete = useCallback(() => {
    setWordIndex((i) => i + 1);
  }, []);

  const total    = words?.length ?? 0;
  const progress = total > 1 ? ` (${Math.min(wordIndex + 1, total)}/${total})` : '';

  return (
    <View style={styles.container}>
      {/* İlerleme göstergesi — sadece çok kelimeli cümlelerde */}
      {total > 1 && status !== 'idle' && (
        <View style={styles.progressBar}>
          <Text style={styles.progressLabel}>{activeWord}{progress}</Text>
        </View>
      )}

      {/* Yükleniyor — sadece ilk kelimede kısa süre görünür */}
      {status === 'loading' && (
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      )}

      {/* Bulunamadı — 1.5s göster, sonra devam */}
      {status === 'not_found' && (
        <Text style={styles.errorText}>
          "{activeWord}" bulunamadı{total > 1 ? ', devam ediliyor...' : ''}
        </Text>
      )}

      {/* Animasyon */}
      {status === 'playing' && currentData && (
        <Skeleton2D animationData={currentData} animationSpeed={animationSpeed} onComplete={handleComplete} />
      )}

      {/* Bekleme */}
      {status === 'idle' && (
        <Text style={styles.idleText}>Animasyon bekleniyor...</Text>
      )}
    </View>
  );
}

// ─────────────── Styles ───────────────
const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  skeletonContainer: {
    width: 300,
    height: 300,
    position: 'relative',
    backgroundColor: '#1E1E1E',
  },
  dot: { position: 'absolute', borderRadius: 10 },
  progressBar: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  idleText:    { color: '#555', fontSize: 14, textAlign: 'center' },
  loadingText: { color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  errorText:   { color: '#ff8a80', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
});
