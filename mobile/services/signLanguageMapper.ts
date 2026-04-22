/**
 * Türkçe İşaret Dili (TİD) Kelime Sözlüğü
 * Metin → animasyon anahtar eşleştirmesi
 * 
 * Faz 1: Temel kelimeler
 * Faz 2: Genişletilecek (100-200 kelime)
 */

export interface TIDWord {
  key: string;        // Animasyon dosya anahtarı
  variants: string[]; // Eşleşecek kelimeler (Türkçe varyantlar)
  category: 'greeting' | 'question' | 'number' | 'color' | 'common' | 'alphabet';
}

export const TID_DICTIONARY: TIDWord[] = [
  // Selamlaşma
  { key: 'merhaba', variants: ['merhaba', 'selam', 'hey'], category: 'greeting' },
  { key: 'hosgeldin', variants: ['hoş geldiniz', 'hoş geldin', 'hoşgeldin'], category: 'greeting' },
  { key: 'gunaydın', variants: ['günaydın', 'iyi sabahlar', 'sabahınız hayırlı olsun'], category: 'greeting' },
  { key: 'iyi_gunler', variants: ['iyi günler', 'iyi akşamlar'], category: 'greeting' },
  { key: 'gorusuruz', variants: ['görüşürüz', 'güle güle', 'hoşça kal', 'bay bay'], category: 'greeting' },
  { key: 'tesekkur', variants: ['teşekkür ederim', 'teşekkürler', 'sağ ol', 'sağolun'], category: 'greeting' },
  { key: 'rica_ederim', variants: ['rica ederim', 'bir şey değil', 'estağfurullah'], category: 'greeting' },
  { key: 'ozur_dilerim', variants: ['özür dilerim', 'pardon', 'affedersiniz', 'üzgünüm'], category: 'greeting' },

  // Soru kelimeleri
  { key: 'nasil', variants: ['nasılsın', 'nasılsınız', 'nasıl'], category: 'question' },
  { key: 'ne', variants: ['ne', 'nedir', 'neydi', 'nesi'], category: 'question' },
  { key: 'nerede', variants: ['nerede', 'nereye', 'nereden'], category: 'question' },
  { key: 'ne_zaman', variants: ['ne zaman', 'nezaman'], category: 'question' },
  { key: 'kim', variants: ['kim', 'kimin', 'kimsin'], category: 'question' },
  { key: 'niçin', variants: ['niçin', 'neden', 'niye'], category: 'question' },
  { key: 'kaç', variants: ['kaç', 'kaçtane', 'kaç tane'], category: 'question' },

  // Sayılar
  { key: 'bir', variants: ['bir', '1'], category: 'number' },
  { key: 'iki', variants: ['iki', '2'], category: 'number' },
  { key: 'üç', variants: ['üç', '3'], category: 'number' },
  { key: 'dört', variants: ['dört', '4'], category: 'number' },
  { key: 'beş', variants: ['beş', '5'], category: 'number' },
  { key: 'altı', variants: ['altı', '6'], category: 'number' },
  { key: 'yedi', variants: ['yedi', '7'], category: 'number' },
  { key: 'sekiz', variants: ['sekiz', '8'], category: 'number' },
  { key: 'dokuz', variants: ['dokuz', '9'], category: 'number' },
  { key: 'on', variants: ['on', '10'], category: 'number' },

  // Renkler
  { key: 'kirmizi', variants: ['kırmızı', 'al'], category: 'color' },
  { key: 'mavi', variants: ['mavi', 'lacivert'], category: 'color' },
  { key: 'yesil', variants: ['yeşil'], category: 'color' },
  { key: 'sari', variants: ['sarı'], category: 'color' },
  { key: 'beyaz', variants: ['beyaz', 'ak'], category: 'color' },
  { key: 'siyah', variants: ['siyah', 'kara'], category: 'color' },

  // Yaygın kelimeler
  { key: 'evet', variants: ['evet', 'tamam', 'olur', 'tabii', 'tabi'], category: 'common' },
  { key: 'hayır', variants: ['hayır', 'yok', 'olmaz', 'istemiyorum'], category: 'common' },
  { key: 'lütfen', variants: ['lütfen', 'rica ediyorum'], category: 'common' },
  { key: 'yardım', variants: ['yardım', 'yardım et', 'yardımcı ol'], category: 'common' },
  { key: 'anlıyorum', variants: ['anlıyorum', 'anladım', 'tamam anladım'], category: 'common' },
  { key: 'anlamadım', variants: ['anlamadım', 'anlayamadım', 'tekrar', 'tekrar eder misiniz'], category: 'common' },
  { key: 'su', variants: ['su', 'içmek istiyorum'], category: 'common' },
  { key: 'yemek', variants: ['yemek', 'aç', 'yemek istiyorum'], category: 'common' },
  { key: 'hasta', variants: ['hastayım', 'hasta', 'iyi değilim'], category: 'common' },
  { key: 'güzel', variants: ['güzel', 'harika', 'çok güzel', 'mükemmel'], category: 'common' },
];

/**
 * Metni kelimelere böler ve TİD animasyon anahtarlarına eşleştirir.
 * Bilinmeyen kelimeler parmak alfabesine (harf harf) ayrılır.
 */
export function textToSignQueue(text: string): Array<{ type: 'word' | 'letter'; value: string }> {
  const normalizedText = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]/g, ''); // Noktalama temizle

  const words = normalizedText.split(/\s+/).filter(Boolean);
  const queue: Array<{ type: 'word' | 'letter'; value: string }> = [];

  for (const word of words) {
    const matched = findTIDWord(word);
    if (matched) {
      queue.push({ type: 'word', value: matched.key });
    } else {
      // Bilinmeyen kelime → parmak alfabesi
      for (const letter of word) {
        if (/[a-züöşğıçÜÖŞĞİÇ]/.test(letter)) {
          queue.push({ type: 'letter', value: letter.toLowerCase() });
        }
      }
    }
  }

  return queue;
}

/**
 * Bir kelime için TİD eşleşmesi arar (varyantlar dahil)
 */
function findTIDWord(word: string): TIDWord | null {
  for (const entry of TID_DICTIONARY) {
    if (entry.variants.some((v) => v === word || word.includes(v) || v.includes(word))) {
      return entry;
    }
  }
  return null;
}
