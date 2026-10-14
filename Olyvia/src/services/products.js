import api from './api';

/**
 * Look up a product by barcode (GET).
 * Backend checks local DB first, then fetches from OFF if needed.
 */
export async function lookupBarcode(barcode) {
  const { data } = await api.get(`/products/${barcode}/`);
  return data;
}

/**
 * Scan barcode (POST) — used by Scan component.
 * Same backend logic as lookupBarcode, returns product or throws.
 */
export async function scanBarcode(barcode) {
  const { data } = await api.post('/scan-barcode', { barcode });
  return data;
}
