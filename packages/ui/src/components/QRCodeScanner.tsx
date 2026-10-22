// QR Code Scanner Component - Camera-based QR scanning for driver/worker apps
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './Button.js';
import { Modal } from './Modal.js';
import { X, Camera, CameraOff } from 'lucide-react';

interface QRCodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
  facingMode?: 'environment' | 'user';
}

export function QRCodeScanner({ isOpen, onClose, onScan, facingMode = 'environment' }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const codeReaderRef = useRef<any>(null);

  // Initialize ZXing code reader
  useEffect(() => {
    const initCodeReader = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        codeReaderRef.current = new BrowserMultiFormatReader();
      } catch (err) {
        console.error('Failed to initialize ZXing:', err);
        setError('QR-skanner kunde inte initieras');
      }
    };
    initCodeReader();
  }, []);

  // Request camera permission
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setHasPermission(true);
      setError(null);
    } catch (err) {
      console.error('Camera permission denied:', err);
      setError('Kameratillstånd nekades. Vänligen ge tillgång till kameran i inställningarna.');
      setHasPermission(false);
    }
  }, [facingMode]);

  // Start scanning loop
  const startScanning = useCallback(() => {
    if (!codeReaderRef.current || !videoRef.current || !hasPermission) return;
    
    setIsScanning(true);
    
    const decodeFrame = () => {
      if (!isScanning || !videoRef.current || !codeReaderRef.current) return;
      
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        codeReaderRef.current.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result: any, err: any) => {
            if (result) {
              onScan(result.getText());
              stopScanning();
              onClose();
              return;
            }
            if (err && !(err instanceof DOMException)) {
              // Ignore "NotFoundException" which is normal when no QR code is visible
            }
            animationFrameRef.current = requestAnimationFrame(decodeFrame);
          }
        );
      } else {
        animationFrameRef.current = requestAnimationFrame(decodeFrame);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(decodeFrame);
  }, [hasPermission, onScan, onClose]);

  // Stop scanning
  const stopScanning = useCallback(() => {
    setIsScanning(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Handle modal open/close
  useEffect(() => {
    if (isOpen) {
      requestPermission().then(() => {
        if (hasPermission) {
          startScanning();
        }
      });
    } else {
      stopScanning();
    }
    return () => stopScanning();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Skanna QR-kod">
      <div className="relative">
        {hasPermission && (
          <>
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover rounded-lg bg-gray-900"
              playsInline
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-4 border-blue-500/50 rounded-lg">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
              </div>
            </div>
            {isScanning && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Skannar...</span>
              </div>
            )}
          </>
        )}
        {!hasPermission && (
          <div className="aspect-video bg-gray-900 rounded-lg flex flex-col items-center justify-center p-8 text-center text-white">
            <CameraOff className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Kameratillstånd krävs</h3>
            <p className="text-gray-400 mb-6 max-w-xs">
              För att skanna QR-koder behöver appen tillgång till kameran.
            </p>
            <Button onClick={requestPermission} icon={<Camera className="w-4 h-4" />}>
              Ge tillgång till kamera
            </Button>
            {error && (
              <p className="mt-4 text-red-400 text-sm">{error}</p>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} icon={<X className="w-4 h-4" />}>
          Avbryt
        </Button>
      </div>
    </Modal>
  );
}