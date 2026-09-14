import { useState, useRef, useEffect } from "react";

interface AudioRecorderProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export function AudioRecorder({ files, onChange, onError }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
        if (file.size > MAX_AUDIO_BYTES) {
          onError("Audio file is too large. Try a shorter recording.");
          return;
        }
        onChange([...files, file]);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } catch {
      onError("Could not access your microphone. Check browser permissions and try again.");
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      onError("Please select an audio file.");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      onError("Audio file is too large (max 50 MB).");
      return;
    }
    onError("");
    onChange([...files, file]);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setPreviewUrl(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()}>
          Choose Audio File
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? `Stop (${formatTime(elapsed)})` : "Record Sound"}
        </button>
        {recording && <span className="upload-note" style={{ alignSelf: "center" }}>Recording...</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={handleFileUpload}
      />

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="file-pill" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{file.name}</span>
              <button type="button" onClick={() => removeFile(index)} style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", padding: "0 4px" }}>x</button>
            </div>
          ))}
        </div>
      )}

      {previewUrl && (
        <div style={{ marginTop: "12px" }}>
          <audio controls src={previewUrl} style={{ width: "100%", maxHeight: "40px" }} />
        </div>
      )}

      {!recording && files.length === 0 && (
        <div className="upload-note">Tap Record Sound to capture the noise your vehicle is making. Or choose a file you already recorded.</div>
      )}
    </div>
  );
}
