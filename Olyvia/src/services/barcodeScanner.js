/**
 * Lightweight barcode scanner using the native BarcodeDetector API.
 * Continuously reads frames from a <video> element and fires a
 * callback when a barcode is detected.
 *
 * Supported in Chrome / Edge / Android WebView.
 * https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
 */

export function isBarcodeDetectorSupported() {
  return 'BarcodeDetector' in window;
}

/**
 * Start scanning the video element for barcodes.
 * @param {HTMLVideoElement} videoElement
 * @param {(barcode: string) => void} onDetected — called once per unique scan
 * @param {number} cooldownMs — ignore duplicate reads for this long (default 3 s)
 * @returns {() => void} stop — call this to stop the scanning loop
 */
export function createBarcodeScanner(videoElement, onDetected, cooldownMs = 3000) {
  if (!isBarcodeDetectorSupported()) {
    console.warn('BarcodeDetector API is not supported in this browser.');
    return null;
  }

  const detector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
  });

  let running = true;
  let cooldown = false;

  async function tick() {
    if (!running) return;

    try {
      if (videoElement.readyState >= 2) {
        const results = await detector.detect(videoElement);
        if (results.length > 0 && !cooldown) {
          cooldown = true;
          onDetected(results[0].rawValue);
          setTimeout(() => { cooldown = false; }, cooldownMs);
        }
      }
    } catch {
      // video frame not ready yet — ignore
    }

    if (running) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  return () => { running = false; };
}
