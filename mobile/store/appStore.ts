import { create } from 'zustand';

export type MessageSender = 'mic' | 'user';

export interface SubtitleEntry {
  id: string;
  text: string;
  timestamp: Date;
  sender: MessageSender; // 'mic' = dinleme, 'user' = yazılan mesaj
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
  subtitleFontSize: number; // 14 - 32
  chatFontSize: number; // 11 - 24

  // Actions
  setRecording: (val: boolean) => void;
  setProcessing: (val: boolean) => void;
  setCurrentSubtitle: (text: string) => void;
  addToHistory: (text: string) => void;
  addUserMessage: (text: string) => void;
  clearHistory: () => void;
  setAnimationQueue: (words: string[]) => void;
  setCurrentAnimationWord: (word: string | null) => void;
  setAnimating: (val: boolean) => void;
  setBackendUrl: (url: string) => void;
  setAnimationSpeed: (speed: number) => void;
  setSubtitleFontSize: (size: number) => void;
  resetSubtitleFontSize: () => void;
  setChatFontSize: (size: number) => void;
  resetChatFontSize: () => void;
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
  backendUrl: 'http://10.12.178.202:8000', // Varsayılan — ayarlardan değiştirilebilir
  animationSpeed: 1.0,
  subtitleFontSize: 20,
  chatFontSize: 14,

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
          sender: 'mic' as MessageSender,
        },
        ...state.subtitleHistory,
      ].slice(0, 50),
    })),

  addUserMessage: (text) =>
    set((state) => ({
      subtitleHistory: [
        {
          id: Date.now().toString() + '_u',
          text,
          timestamp: new Date(),
          sender: 'user' as MessageSender,
        },
        ...state.subtitleHistory,
      ].slice(0, 50),
    })),

  clearHistory: () => set({ subtitleHistory: [], currentSubtitle: '' }),

  setAnimationQueue: (words) => set({ animationQueue: words }),
  setCurrentAnimationWord: (word) => set({ currentAnimationWord: word }),
  setAnimating: (val) => set({ isAnimating: val }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  setSubtitleFontSize: (size) => set({ subtitleFontSize: size }),
  resetSubtitleFontSize: () => set({ subtitleFontSize: 20 }),
  setChatFontSize: (size) => set({ chatFontSize: size }),
  resetChatFontSize: () => set({ chatFontSize: 14 }),
  toggleRecordingFn: null,
  setToggleRecordingFn: (fn) => set({ toggleRecordingFn: fn }),
}));
