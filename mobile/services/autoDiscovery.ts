import * as Network from 'expo-network';

const BACKEND_PORT = 8000;
const SCAN_TIMEOUT_MS = 1500; // Her IP için max bekleme süresi
const MAX_PARALLEL = 30;      // Aynı anda denenecek IP sayısı

/**
 * Tek bir IP'yi hızlıca test eder
 */
async function probeHost(ip: string): Promise<string | null> {
  const url = `http://${ip}:${BACKEND_PORT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'ok') return url;
    }
  } catch {
    clearTimeout(timer);
  }
  return null;
}

/**
 * IP listesini paralel olarak batch'ler halinde tarar.
 * İlk başarılı URL'yi döndürür.
 */
async function scanBatch(ips: string[]): Promise<string | null> {
  for (let i = 0; i < ips.length; i += MAX_PARALLEL) {
    const batch = ips.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(batch.map(probeHost));
    const found = results.find((r) => r !== null);
    if (found) return found;
  }
  return null;
}

/**
 * Yerel ağda TİD backend'ini otomatik bulur.
 * Telefon ile aynı /24 subnet'i tarar.
 */
export async function autoDiscoverBackend(
  onProgress?: (message: string) => void
): Promise<string | null> {
  onProgress?.('Ağ bilgisi alınıyor...');

  let subnet = '192.168.1'; // Fallback subnet

  try {
    const deviceIp = await Network.getIpAddressAsync();
    if (deviceIp && deviceIp !== '0.0.0.0') {
      const parts = deviceIp.split('.');
      subnet = parts.slice(0, 3).join('.');
      onProgress?.(`Taranıyor: ${subnet}.x — telefon IP: ${deviceIp}`);
    }
  } catch {
    onProgress?.(`Varsayılan subnet kullanılıyor: ${subnet}.x`);
  }

  // Önce en yaygın host IP'lerini dene (1-10, 100-110, 150-160, 200-210)
  const priorityHosts = [
    ...Array.from({ length: 10 }, (_, i) => i + 1),
    ...Array.from({ length: 11 }, (_, i) => i + 100),
    ...Array.from({ length: 11 }, (_, i) => i + 150),
    ...Array.from({ length: 11 }, (_, i) => i + 200),
  ].map((h) => `${subnet}.${h}`);

  onProgress?.(`${priorityHosts.length} IP taranıyor...`);
  const quickResult = await scanBatch(priorityHosts);
  if (quickResult) return quickResult;

  // Bulunamazsa tüm subnet'i tara
  onProgress?.('Tam tarama yapılıyor (1-254)...');
  const allHosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  return scanBatch(allHosts);
}
