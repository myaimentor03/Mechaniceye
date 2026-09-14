import { useState, useRef, useEffect } from "react";

interface VideoRecorderProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function VideoRecorder({ files, onChange, onError }: VideoRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      liveStream?.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl, liveStream]);

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setLiveStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `video-${Date.now()}.${ext}`, { type: blob.type });
        if (file.size > MAX_VIDEO_BYTES) {
          onError("Video file is too large. Try a shorter recording.");
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
      onError("Could not access your camera. Check browser permissions and try again.");
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    liveStream?.getTracks().forEach((t) => t.stop());
    setLiveStream(null);
    setRecording(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      onError("Please select a video file.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      onError("Video file is too large (max 50 MB).");
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
          Choose Video File
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? `Stop (${formatTime(elapsed)})` : "Record Video"}
        </button>
        {recording && <span className="upload-note" style={{ alignSelf: "center" }}>Recording...</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={handleFileUpload}
      />

      {recording && (
        <div style={{ marginBottom: "12px", borderRadius: "12px", overflow: "hidden", background: "#000" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", maxHeight: "200px", objectFit: "contain" }}
          />
        </div>
      )}

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

      {previewUrl && !recording && (
        <div style={{ marginTop: "12px", borderRadius: "12px", overflow: "hidden" }}>
          <video controls src={previewUrl} style={{ width: "100%", maxHeight: "200px" }} />
        </div>
      )}

      {!recording && files.length === 0 && (
        <div className="upload-note">Tap Record Video to film the vehicle issue. Do not record while driving.</div>
      )}
    </div>
  );
}
