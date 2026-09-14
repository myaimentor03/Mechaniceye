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

export function VibrationCapture({ files, onChange, onError }: VibrationCaptureProps) {
  const [recording, setRecording] = useState(false);
  const [currentReading, setCurrentReading] = useState<{ x: number; y: number; z: number } | null>(null);
  const [readingCount, setReadingCount] = useState(0);
  const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);
  const bufferRef = useRef<SensorReading[]>([]);
  const sensorRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hasGyro = typeof (navigator as any).gyroscope !== "undefined";
    const hasAccel = typeof (navigator as any).accelerometer !== "undefined";
    setSensorAvailable(hasGyro || hasAccel);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopSensor();
    };
  }, []);

  function startSensor() {
    const SensorClass = (navigator as any).accelerometer || (navigator as any).gyroscope;
    if (!SensorClass) return;
    try {
      const sensor = new SensorClass({ frequency: 60 });
      sensor.addEventListener("reading", () => {
        const reading = { x: sensor.x, y: sensor.y, z: sensor.z };
        setCurrentReading(reading);
        bufferRef.current.push({ ...reading, t: Date.now() });
        setReadingCount(bufferRef.current.length);
      });
      sensor.addEventListener("error", () => {});
      sensor.start();
      sensorRef.current = sensor;
    } catch {
      // Sensor construction failed
    }
  }

  function stopSensor() {
    if (sensorRef.current) {
      try { sensorRef.current.stop(); } catch { /* ignore */ }
      sensorRef.current = null;
    }
  }

  function startRecording() {
    onError("");
    bufferRef.current = [];
    setReadingCount(0);
    setCurrentReading(null);
    setRecording(true);
    startSensor();
    timerRef.current = setTimeout(() => {
      stopRecording();
    }, 5000);
  }

  function stopRecording() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    stopSensor();
    setRecording(false);

    if (bufferRef.current.length === 0) {
      onError("No vibration data was captured. Place the phone flat on the center console and try again.");
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

  if (sensorAvailable === false) {
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
        <button
          type="button"
          className="secondary-btn"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? "Stop Measurement" : "Measure Vibration"}
        </button>
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

      {!recording && files.length === 0 && (
        <div className="upload-note">
          Place the phone flat on the center console or dashboard, then tap Measure Vibration. Motion data is captured for 5 seconds and stored with your case.
        </div>
      )}
    </div>
  );
}
