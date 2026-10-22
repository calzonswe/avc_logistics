// QR Scanner - real implementation with @zxing/browser.
//
// The library API (v0.2.x): `decodeFromConstraints(constraints, previewElement,
// callback)` streams the camera into the given <video> and decodes
// continuously; it returns IScannerControls whose `stop()` ends the scan.
// The previous placeholder called `decodeFromVideoDevice` inside a
// requestAnimationFrame loop, which started a *new* decoder on every frame
// (multiple concurrent decoders, none of them stopped).
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@avc/ui/components/Button';
import { Modal } from '@avc/ui/components/Modal';
import { X, Camera, CameraOff } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
  facingMode?: 'environment' | 'user';
  /** Text shown above the viewfinder, e.g. "Skanna containerns QR-kod". */
  hint?: string;
}

export function QRScanner({ isOpen, onClose, onScan, facingMode = 'environment', hint }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }, []);

  const startScanning = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();

      // decodeFromConstraints manages the camera stream and the decode loop and
      // hands back the controls used to stop it.
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode } },
        video,
        (result, err) => {
          if (result) {
            onScan(result.getText());
            stopScanning();
            onClose();
          }
          // NotFoundException is the normal "no code in frame" case.
          void err;
        }
      );
      controlsRef.current = controls;
      setHasPermission(true);
      setIsScanning(true);
    } catch (err: any) {
      console.error('Failed to start the QR scanner:', err);
      setHasPermission(false);
      setError(
        err?.name === 'NotAllowedError'
          ? 'Kameratillstånd nekades. Ge tillgång till kameran i webbläsarens inställningar.'
          : 'QR-skanner kunde inte starta. Kontrollera att kameran är tillgänglig.'
      );
    }
  }, [facingMode, onScan, onClose, stopScanning]);

  // Start when the modal opens, stop when it closes.
  useEffect(() => {
    if (!isOpen) {
      stopScanning();
      setHasPermission(false);
      return;
    }
    // The <video> element must be in the DOM before the reader can attach.
    const timer = window.setTimeout(() => {
      startScanning();
    }, 100);
    return () => {
      window.clearTimeout(timer);
      stopScanning();
    };
  }, [isOpen, startScanning, stopScanning]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Skanna QR-kod">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-full aspect-video object-cover rounded-lg bg-gray-900"
          playsInline
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-48 border-4 border-blue-500/50 rounded-lg relative">
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
        {hint && (
          <p className="mt-3 text-sm text-gray-600 text-center">{hint}</p>
        )}
        {error && (
          <div className="mt-3 flex flex-col items-center gap-3">
            <p className="text-sm text-red-600 text-center">{error}</p>
            <Button variant="outline" onClick={startScanning} icon={<Camera className="w-4 h-4" />}>
              Försök igen
            </Button>
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
