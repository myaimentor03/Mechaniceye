import { useState, useRef, useEffect } from "react";

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

function detectMotionSource(): MotionSource {
  if (typeof window === "undefined") return "none";
  const w = window as unknown as Record<string, unknown>;
  // Generic Sensor API exposes globals (Accelerometer, LinearAccelerationSensor,
  // Gyroscope) — not navigator.accelerometer. Chrome/Android path.
  if (w.Accelerometer || w.LinearAccelerationSensor || w.Gyroscope) {
    return "generic-sensor";
  }
  // iOS Safari and most Android browsers expose motion via DeviceMotionEvent.
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
  const bufferRef = useRef<SensorReading[]>([]);
  const sensorRef = useRef<{ stop: () => void } | null>(null);
  const motionHandlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMotionSource(detectMotionSource());
    return () => {
      stopCaptureSources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // acceleration excludes gravity when available — better for vibration.
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
    return <div className="upload-note">Checking for motion sensors on this device...</div>;
  }

  if (motionSource === "none") {
    return (
      <div>
        <div className="upload-note">
          This device does not have a motion sensor. Describe where you feel the vibration, at what speed or RPM, and whether it changes with braking, turning, or acceleration.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        {!permissionGranted ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void requestMotionPermission()}
          >
            Enable Motion Access
          </button>
        ) : (
          <button
            type="button"
            className="secondary-btn"
            onClick={recording ? stopRecording : () => void startRecording()}
          >
            {recording ? "Stop Measurement" : "Measure Vibration"}
          </button>
        )}
        {recording && <span className="upload-note" style={{ alignSelf: "center" }}>Recording motion data ({readingCount} readings)...</span>}
      </div>

      {recording && currentReading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "12px" }}>
          <div style={{ padding: "8px", border: "1px solid #294a6b", borderRadius: "8px", background: "rgba(19,42,67,0.75)", textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "#9cb0c8", marginBottom: "2px" }}>X (L/R)</div>
            <div style={{ fontFamily: "monospace", fontSize: "1rem" }}>{currentReading.x.toFixed(3)}</div>
          </div>
          <div style={{ padding: "8px", border: "1px solid #294a6b", borderRadius: "8px", background: "rgba(19,42,67,0.75)", textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "#9cb0c8", marginBottom: "2px" }}>Y (F/B)</div>
            <div style={{ fontFamily: "monospace", fontSize: "1rem" }}>{currentReading.y.toFixed(3)}</div>
          </div>
          <div style={{ padding: "8px", border: "1px solid #294a6b", borderRadius: "8px", background: "rgba(19,42,67,0.75)", textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "#9cb0c8", marginBottom: "2px" }}>Z (U/D)</div>
            <div style={{ fontFamily: "monospace", fontSize: "1rem" }}>{currentReading.z.toFixed(3)}</div>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="file-pill" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{file.name} ({readingCount || "..."} readings)</span>
              <button type="button" onClick={() => removeFile(index)} style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", padding: "0 4px" }}>x</button>
            </div>
          ))}
        </div>
      )}

      {!recording && files.length === 0 && permissionGranted && (
        <div className="upload-note">
          Place the phone flat on the center console or dashboard, then tap Measure Vibration. Motion data is captured for 5 seconds and stored with your case. It has not been analyzed yet.
        </div>
      )}
      {!recording && files.length === 0 && !permissionGranted && (
        <div className="upload-note">
          Your iPhone needs permission before the motion sensor can be used. Tap Enable Motion Access, then place the phone flat on the center console and tap Measure Vibration.
        </div>
      )}
    </div>
  );
}
