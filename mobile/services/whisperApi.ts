import * as FileSystem from 'expo-file-system/legacy';

/**
 * Yerel Whisper backend'ine ses dosyası gönderir ve Türkçe transkript alır.
 * expo-file-system readAsStringAsync + fetch JSON kullanır.
 */
export async function transcribeAudio(
  audioUri: string,
  backendUrl: string,
  previousText?: string
): Promise<string> {
  // Dosyayı base64 olarak oku ('base64' string — enum çalışmıyor)
  const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
    encoding: 'base64' as any,
  });

  const response = await fetch(`${backendUrl}/transcribe-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      audio_base64: base64Audio,
      previous_text: previousText || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Sunucu hatası: ${response.status}`);
  }

  const data = await response.json();
  return data.success && data.text ? data.text : '';
}


/**
 * Backend sağlık kontrolü
 */
export async function checkBackendHealth(backendUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${backendUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    clearTimeout(timer);
    return false;
  }
}

