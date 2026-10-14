import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import './Scan.css'
import { scanBarcode } from '../../services/products.js'
import { VoiceButton } from './voice/VoiceButton.jsx'

const SCANNER_DIV_ID = 'barcode-scanner'

export function Scan() {
  const navigate = useNavigate()
  const scannerRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [apiMessage, setApiMessage] = useState('')
  const [product, setProduct] = useState(null)
  const [errorDetail, setErrorDetail] = useState('')
  const [scanError, setScanError] = useState('')

  const stopScanner = useCallback(() => {
    if (!scannerRef.current) return
    const scanner = scannerRef.current
    scannerRef.current = null
    scanner
      .stop()
      .then(() => setIsScanning(false))
      .catch((err) => {
        console.error('Stop scanner error', err)
        setIsScanning(false)
      })
  }, [])

  const handleLookup = useCallback(async (barcode) => {
    if (!barcode) return
    setIsSending(true)
    setErrorDetail('')
    setApiMessage('')

    try {
      const data = await scanBarcode(barcode)
      setProduct(data)
      setApiMessage(
        data.source ? 'Fetched from Open Food Facts and cached.' : 'Loaded from cache.'
      )
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      setErrorDetail(detail || 'Product not found or barcode incorrect.')
    } finally {
      setIsSending(false)
    }
  }, [])

  const startScanner = useCallback(() => {
    setProduct(null)
    setErrorDetail('')
    setApiMessage('')
    setScanError('')

    if (scannerRef.current) {
      setIsScanning(true)
      return
    }

    const html5QrCode = new Html5Qrcode(SCANNER_DIV_ID)
    const config = {
      fps: 15,
      aspectRatio: 1.333334,
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
    }

    html5QrCode
      .start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (!decodedText) return
          const barcode = decodedText.trim()
          html5QrCode
            .stop()
            .then(() => {
              scannerRef.current = null
              setIsScanning(false)
              handleLookup(barcode)
            })
            .catch((err) => {
              console.error('Stop scanner error', err)
              scannerRef.current = null
              setIsScanning(false)
              handleLookup(barcode)
            })
        },
        () => {}
      )
      .then(() => {
        scannerRef.current = html5QrCode
        setIsScanning(true)
      })
      .catch((err) => {
        console.error('Scanner start error', err)
        setScanError('Could not start camera. Check permissions and try again.')
      })
  }, [handleLookup])

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  const handleScanAgain = () => {
    setProduct(null)
    setErrorDetail('')
    setApiMessage('')
    setScanError('')
    scannerRef.current = null
    setIsScanning(false)
    startScanner()
  }

  return (
    <div className="scan">
      <header className="scan-header">
        <button className="scan-back-button" onClick={() => navigate(-1)}>← Back</button>
        <div className="scan-header-content">
          <h1 className="scan-title">Scan barcode</h1>
          <p className="scan-subtitle">
            Point your camera at the barcode on a packaged food item.
          </p>
        </div>
        <div className="scan-voice-button">
          <VoiceButton />
        </div>
      </header>

      <main className="scan-main">
        <div className="scan-preview-placeholder">
          <div id={SCANNER_DIV_ID} className="scan-frame scan-scanner-root" />
          {!isScanning && !product && (
            <p className="scan-preview-text">
              Tap &quot;Start scanning&quot; to use your camera. We&apos;ll look up the product in
              our cache or Open Food Facts.
            </p>
          )}
          {scanError && <p className="scan-error-text">{scanError}</p>}
        </div>

        {!isScanning && !product && (
          <button
            className="scan-primary-cta"
            onClick={startScanner}
            disabled={isSending}
          >
            Start scanning
          </button>
        )}

        {isScanning && (
          <button
            type="button"
            className="scan-secondary-cta"
            onClick={stopScanner}
          >
            Stop scanning
          </button>
        )}

        {(product || errorDetail || apiMessage) && (
          <button
            type="button"
            className="scan-primary-cta"
            onClick={handleScanAgain}
            disabled={isSending}
          >
            Scan again
          </button>
        )}

        {errorDetail && <p className="scan-error-text">{errorDetail}</p>}
        {apiMessage && <p className="scan-status-text">{apiMessage}</p>}

        {product && (
          <div className="scan-result">
            <h3 className="scan-result-title">Product</h3>
            {product.image_url && (
              <img
                src={product.image_url}
                alt={product.name}
                className="scan-result-image"
              />
            )}
            <p className="scan-result-barcode">
              <strong>Barcode:</strong> {product.barcode}
            </p>
            <p className="scan-result-name">{product.name || '—'}</p>
            <p className="scan-result-brand">{product.brand || '—'}</p>
            {product.categories && (
              <p className="scan-result-categories">
                <strong>Categories:</strong> {product.categories}
              </p>
            )}
            {product.source && (
              <p className="scan-result-source">
                <strong>Source:</strong> {product.source}
              </p>
            )}
            {(product.nutriscore_grade || product.nova_group != null) && (
              <div className="scan-result-scores">
                {product.nutriscore_grade && (
                  <p className="scan-result-nutriscore">
                    Nutri-Score: {product.nutriscore_grade.toUpperCase()}
                  </p>
                )}
                {product.nova_group != null && (
                  <p className="scan-result-nova">NOVA group: {product.nova_group}</p>
                )}
              </div>
            )}
            <div className="scan-result-nutrition">
              <strong>Nutrition (per 100 g/ml)</strong>
              <ul className="scan-result-nutrition-list">
                {product.energy_kcal != null && (
                  <li>Energy: {product.energy_kcal} kcal</li>
                )}
                {product.fat != null && <li>Fat: {product.fat} g</li>}
                {product.saturated_fat != null && (
                  <li>Saturated fat: {product.saturated_fat} g</li>
                )}
                {product.sugars != null && <li>Sugars: {product.sugars} g</li>}
                {product.salt != null && <li>Salt: {product.salt} g</li>}
                {product.proteins != null && <li>Proteins: {product.proteins} g</li>}
                {product.fiber != null && <li>Fiber: {product.fiber} g</li>}
              </ul>
            </div>
            {product.ingredients_text && (
              <div className="scan-result-ingredients-block">
                <strong>Ingredients</strong>
                <p className="scan-result-ingredients">{product.ingredients_text}</p>
              </div>
            )}
            {(product.created_at || product.updated_at) && (
              <p className="scan-result-meta">
                {product.updated_at && `Updated: ${product.updated_at}`}
                {product.created_at && product.updated_at && ' · '}
                {product.created_at && `Added: ${product.created_at}`}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
