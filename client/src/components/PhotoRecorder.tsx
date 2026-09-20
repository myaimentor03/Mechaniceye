import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Camera, Image, Upload } from "lucide-react";
import { MAX_PHOTO_COUNT, validatePhotoFiles, type PhotoValidationResult } from "@/lib/photoValidation";
import { useFilePreviewUrls } from "@/lib/filePreviewUrls";

interface PhotoRecorderProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

export function PhotoRecorder({ files, onChange, onError }: PhotoRecorderProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      onError("Could not access your camera. Try choosing a photo from your files instead.");
    }
  }, [onError]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const { validFiles, errors } = validatePhotoFiles([file], files.length);
      if (errors.length > 0) {
        onError(errors.join("\n"));
        return;
      }
      if (validFiles.length === 0) return;
      onChange([...files, ...(validFiles as File[])]);
      onError("");
    }, "image/jpeg");
    stopCamera();
  }, [files.length, onChange, onError, stopCamera]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const candidates = Array.from(e.target.files || []);
    if (candidates.length === 0) return;
    const { validFiles, errors } = validatePhotoFiles(candidates, files.length);
    if (errors.length > 0) {
      onError(errors.join("\n"));
    } else {
      onError("");
    }
    if (validFiles.length > 0) {
      onChange([...files, ...(validFiles as File[])]);
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  }

  // Stable per-file thumbnail URLs: retained photos keep their URL across
  // array-reference changes (no flicker), removed photos are revoked once.
  const photoUrls = useFilePreviewUrls(files);

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
        <Image className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Add Photos</h3>
        <p className="text-gray-600 mb-4">
          Take a photo of the vehicle issue right now, or choose photos you already have. Dash lights, tires, leaks, damage, engine bay.
          <br />
          <span className="text-xs text-gray-500">Max 8 photos, 12 MB each. JPEG, PNG, WebP, HEIC.</span>
        </p>

        {cameraActive && (
          <div className="mb-4 space-y-3">
            <video ref={videoRef} className="w-full max-h-48 object-contain rounded-lg bg-black" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-2 justify-center">
              <Button onClick={capturePhoto} className="bg-automotive-orange hover:bg-orange-600 text-white">
                <Camera className="w-4 h-4 mr-2" /> Capture Photo
              </Button>
              <Button variant="outline" onClick={stopCamera} className="flex-1 sm:flex-none">
                <X className="w-4 h-4 mr-2" /> Cancel Camera
              </Button>
            </div>
          </div>
        )}

        {!cameraActive && (
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={startCamera} className="bg-automotive-orange hover:bg-orange-600 text-white">
              <Camera className="w-4 h-4 mr-2" /> Take Photo
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300">
              <Upload className="w-4 h-4 mr-2" /> Choose Photos
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          hidden
          onChange={handleFileUpload}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Selected Photos ({files.length}/{MAX_PHOTO_COUNT})</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative aspect-square border rounded-lg overflow-hidden bg-gray-100">
                <img src={photoUrls[index]} alt={file.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!cameraActive && files.length === 0 && (
        <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900 mb-1">Show me the issue.</p>
          <p>Tap <strong>Take Photo</strong> to capture the vehicle issue with your camera. Or choose photos you already have.</p>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Photos are stored with your case only. They are not analyzed automatically.
      </p>
    </div>
  );
}