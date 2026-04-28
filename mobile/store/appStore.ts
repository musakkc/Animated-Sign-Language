import { create } from 'zustand';

export interface SubtitleEntry {
  id: string;
  text: string;
  timestamp: Date;
}

interface AppState {
  // Kayıt durumu
  isRecording: boolean;
  isProcessing: boolean;

  // Altyazılar
  currentSubtitle: string;
  subtitleHistory: SubtitleEntry[];

  // Animasyon
  animationQueue: string[]; // Oynatılacak kelimeler kuyruğu
  currentAnimationWord: string | null;
  isAnimating: boolean;

  // Ayarlar
  backendUrl: string;
  animationSpeed: number; // 0.5 - 2.0

  // Actions
  setRecording: (val: boolean) => void;
  setProcessing: (val: boolean) => void;
  setCurrentSubtitle: (text: string) => void;
  addToHistory: (text: string) => void;
  clearHistory: () => void;
  setAnimationQueue: (words: string[]) => void;
  setCurrentAnimationWord: (word: string | null) => void;
  setAnimating: (val: boolean) => void;
  setBackendUrl: (url: string) => void;
  setAnimationSpeed: (speed: number) => void;
  // App.tsx'teki mikrofon butonu için
  toggleRecordingFn: (() => Promise<void>) | null;
  setToggleRecordingFn: (fn: () => Promise<void>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isRecording: false,
  isProcessing: false,
  currentSubtitle: '',
  subtitleHistory: [],
  animationQueue: [],
  currentAnimationWord: null,
  isAnimating: false,
  backendUrl: 'http://10.14.168.202:8000', // Varsayılan — ayarlardan değiştirilebilir
  animationSpeed: 1.0,

  setRecording: (val) => set({ isRecording: val }),
  setProcessing: (val) => set({ isProcessing: val }),

  setCurrentSubtitle: (text) => set({ currentSubtitle: text }),

  addToHistory: (text) =>
    set((state) => ({
      subtitleHistory: [
        {
          id: Date.now().toString(),
          text,
          timestamp: new Date(),
        },
        ...state.subtitleHistory,
      ].slice(0, 50), // En fazla 50 geçmiş kayıt
    })),

  clearHistory: () => set({ subtitleHistory: [], currentSubtitle: '' }),

  setAnimationQueue: (words) => set({ animationQueue: words }),
  setCurrentAnimationWord: (word) => set({ currentAnimationWord: word }),
  setAnimating: (val) => set({ isAnimating: val }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  toggleRecordingFn: null,
  setToggleRecordingFn: (fn) => set({ toggleRecordingFn: fn }),
}));
