import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Waves, Smartphone, Eye, EyeOff } from "lucide-react";

interface VibrationCaptureProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

interface SensorReading {
  x: number;
  y: number;
  z: number;
  t: number;
}

type MotionSource = "generic-sensor" | "device-motion" | "none";

const CAPTURE_MS = 5000;
const MAX_READINGS = 5000;
const PREVIEW_MAX_POINTS = 300;

function downsampleReadings(readings: SensorReading[], maxPoints: number): SensorReading[] {
  if (readings.length <= maxPoints) return readings;
  const step = readings.length / maxPoints;
  const result: SensorReading[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor(i * step);
    result.push(readings[idx]);
  }
  return result;
}

function VibrationPreview({ readings, onClose }: { readings: SensorReading[]; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = 200 * dpr;
        setDimensions({ width: canvas.width, height: canvas.height });
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0 || readings.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = dimensions.width / dpr;
    const height = dimensions.height / dpr;
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.scale(dpr, dpr);

    const xs = readings.map((r) => r.x);
    const ys = readings.map((r) => r.y);
    const zs = readings.map((r) => r.z);
    const allValues = [...xs, ...ys, ...zs];
    const maxVal = Math.max(...allValues.map(Math.abs), 0.01);
    const padding = 10;
    const plotHeight = (height - 2 * padding) / 3;
    const colors = ["#ef4444", "#22c55e", "#3b82f6"];
    const labels = ["X (L/R)", "Y (F/B)", "Z (U/D)"];
    const dataArrays = [xs, ys, zs];

    dataArrays.forEach((data, axisIndex) => {
      const yBase = padding + axisIndex * plotHeight;
      ctx.strokeStyle = colors[axisIndex];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * (width - 2 * padding) + padding;
        const y = yBase + plotHeight / 2 - (val / maxVal) * (plotHeight / 2 * 0.9);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = colors[axisIndex];
      ctx.font = "11px monospace";
      ctx.fillText(`${labels[axisIndex]}: ${data[data.length - 1].toFixed(3)}`, padding, yBase + 14);
      ctx.beginPath();
      ctx.moveTo(padding, yBase + plotHeight / 2);
      ctx.lineTo(width - padding, yBase + plotHeight / 2);
      ctx.strokeStyle = "rgba(128,128,128,0.3)";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }, [readings, dimensions]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-300">Vibration Preview</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="relative" style={{ width: "100%", height: 200 }}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
      <p className="text-xs text-gray-500 mt-2 text-center">{readings.length} samples • {((readings[readings.length - 1]?.t ?? 0) - (readings[0]?.t ?? 0)) / 1000}s duration</p>
    </div>
  );
}

function detectMotionSource(): MotionSource {
  if (typeof window === "undefined") return "none";
  const w = window as unknown as Record<string, unknown>;
  if (w.Accelerometer || w.LinearAccelerationSensor || w.Gyroscope) {
    return "generic-sensor";
  }
  if (typeof DeviceMotionEvent !== "undefined") {
    return "device-motion";
  }
  return "none";
}

function needsMotionPermission(): boolean {
  const dme = DeviceMotionEvent as unknown as { requestPermission?: unknown };
  return typeof dme?.requestPermission === "function";
}

export function VibrationCapture({ files, onChange, onError }: VibrationCaptureProps) {
  const [recording, setRecording] = useState(false);
  const [currentReading, setCurrentReading] = useState<{ x: number; y: number; z: number } | null>(null);
  const [readingCount, setReadingCount] = useState(0);
  const [motionSource, setMotionSource] = useState<MotionSource | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(!needsMotionPermission());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewReadings, setPreviewReadings] = useState<SensorReading[] | null>(null);
  const bufferRef = useRef<SensorReading[]>([]);
  const sensorRef = useRef<{ stop: () => void } | null>(null);
  const motionHandlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = useCallback(async (index: number) => {
    const file = files[index];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const readings = Array.isArray(parsed) ? parsed : parsed.readings ?? [];
      if (Array.isArray(readings) && readings.length > 0) {
        const downsampled = downsampleReadings(readings as SensorReading[], PREVIEW_MAX_POINTS);
        setPreviewReadings(downsampled);
        setPreviewIndex(index);
      }
    } catch {
      onError("Could not read vibration file for preview.");
    }
  }, [files, onError]);

  const closePreview = useCallback(() => {
    setPreviewIndex(null);
    setPreviewReadings(null);
  }, []);

  useEffect(() => {
    setMotionSource(detectMotionSource());
    return () => {
      stopCaptureSources();
    };
  }, []);

  function pushReading(x: number, y: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (bufferRef.current.length >= MAX_READINGS) return;
    const reading = { x, y, z };
    setCurrentReading(reading);
    bufferRef.current.push({ ...reading, t: Date.now() });
    setReadingCount(bufferRef.current.length);
  }

  function startGenericSensor(): boolean {
    const w = window as unknown as Record<string, new (options: { frequency: number }) => {
      x: number; y: number; z: number;
      addEventListener: (type: string, listener: () => void) => void;
      start: () => void; stop: () => void;
    }>;
    const SensorClass = w.Accelerometer || w.LinearAccelerationSensor || w.Gyroscope;
    if (!SensorClass) return false;
    try {
      const sensor = new SensorClass({ frequency: 60 });
      sensor.addEventListener("reading", () => {
        pushReading(sensor.x, sensor.y, sensor.z);
      });
      sensor.start();
      sensorRef.current = sensor;
      return true;
    } catch {
      return false;
    }
  }

  function startDeviceMotion(): boolean {
    if (typeof DeviceMotionEvent === "undefined") return false;
    const handler = (event: DeviceMotionEvent) => {
      const a = event.acceleration?.x != null ? event.acceleration : event.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      pushReading(a.x, a.y, a.z);
    };
    motionHandlerRef.current = handler;
    window.addEventListener("devicemotion", handler);
    return true;
  }

  function stopCaptureSources() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (sensorRef.current) {
      try { sensorRef.current.stop(); } catch { /* ignore */ }
      sensorRef.current = null;
    }
    if (motionHandlerRef.current) {
      window.removeEventListener("devicemotion", motionHandlerRef.current);
      motionHandlerRef.current = null;
    }
  }

  async function requestMotionPermission(): Promise<boolean> {
    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof dme?.requestPermission !== "function") return true;
    try {
      const result = await dme.requestPermission();
      if (result === "granted") {
        setPermissionGranted(true);
        return true;
      }
      onError("Motion access was not granted. Describe where you feel the vibration, at what speed, and whether it changes with braking, turning, or acceleration.");
      return false;
    } catch {
      onError("Could not request motion access. Describe the vibration in words instead.");
      return false;
    }
  }

  async function startRecording() {
    onError("");
    if (motionSource === "none") {
      onError("This device has no motion sensor. Describe where you feel the vibration instead.");
      return;
    }
    if (!permissionGranted) {
      const granted = await requestMotionPermission();
      if (!granted) return;
    }
    bufferRef.current = [];
    setReadingCount(0);
    setCurrentReading(null);
    setRecording(true);
    const started = motionSource === "generic-sensor"
      ? startGenericSensor() || startDeviceMotion()
      : startDeviceMotion() || startGenericSensor();
    if (!started) {
      setRecording(false);
      onError("Could not start motion capture on this device. Describe where you feel the vibration instead.");
      return;
    }
    timerRef.current = setTimeout(() => {
      stopRecording();
    }, CAPTURE_MS);
  }

  function stopRecording() {
    stopCaptureSources();
    setRecording(false);

    if (bufferRef.current.length === 0) {
      onError("No vibration data was captured. Place the phone flat on the center console and try again, or describe the vibration in words.");
      return;
    }

    const json = JSON.stringify(bufferRef.current);
    const blob = new Blob([json], { type: "application/json" });
    const file = new File([blob], `vibration-${Date.now()}.json`, { type: "application/json" });
    onChange([...files, file]);
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  }

  if (motionSource === null) {
    return <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">Checking for motion sensors on this device...</div>;
  }

  if (motionSource === "none") {
    return (
      <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
        This device does not have a motion sensor. Describe where you feel the vibration, at what speed or RPM, and whether it changes with braking, turning, or acceleration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        {!permissionGranted ? (
          <Button
            variant="outline"
            onClick={() => void requestMotionPermission()}
            className="flex-1 sm:flex-none"
          >
            <Smartphone className="w-4 h-4 mr-2" />
            Enable Motion Access
          </Button>
        ) : (
          <Button
            variant={recording ? "destructive" : "default"}
            onClick={recording ? stopRecording : () => void startRecording()}
            className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
          >
            <Waves className="w-4 h-4 mr-2" />
            {recording ? "Stop Measurement" : "Measure Vibration"}
          </Button>
        )}
      </div>

      {recording && (
        <div className="flex items-center gap-3 text-sm text-automotive-orange">
          <span className="animate-pulse">● Measuring...</span>
          <span>{readingCount} readings</span>
        </div>
      )}

      {recording && currentReading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg text-center">
            <div className="text-xs text-gray-400 mb-1">X (L/R)</div>
            <div className="font-mono text-lg text-white">{currentReading.x.toFixed(3)}</div>
          </div>
          <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg text-center">
            <div className="text-xs text-gray-400 mb-1">Y (F/B)</div>
            <div className="font-mono text-lg text-white">{currentReading.y.toFixed(3)}</div>
          </div>
          <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg text-center">
            <div className="text-xs text-gray-400 mb-1">Z (U/D)</div>
            <div className="font-mono text-lg text-white">{currentReading.z.toFixed(3)}</div>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Vibration Sessions ({files.length}/4)</h4>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Waves className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-900 truncate max-w-[200px]">{file.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => loadPreview(index)}
                    aria-label="Preview vibration session"
                    className="text-gray-600 hover:text-automotive-orange"
                  >
                    {previewIndex === index ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    aria-label="Remove vibration session"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewIndex !== null && previewReadings && (
        <VibrationPreview readings={previewReadings} onClose={closePreview} />
      )}

      {!recording && files.length === 0 && permissionGranted && (
        <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900 mb-1">Place the phone flat on the center console.</p>
          <p>Tap <strong>Measure Vibration</strong> to capture motion data for 5 seconds. It is stored with your case and has not been analyzed yet.</p>
        </div>
      )}

      {!recording && files.length === 0 && !permissionGranted && (
        <div className="text-sm text-gray-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
          <p className="font-medium text-amber-900 mb-1">Permission required.</p>
          <p>Your iPhone needs permission before the motion sensor can be used. Tap <strong>Enable Motion Access</strong>, then place the phone flat on the center console and tap Measure Vibration.</p>
        </div>
      )}
    </div>
  );
}