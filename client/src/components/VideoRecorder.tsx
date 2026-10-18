import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Video, FileVideo } from "lucide-react";
import {
  VIDEO_ACCEPT,
  baseMimeType,
  extensionForVideoMime,
  MAX_VIDEO_COUNT,
  validateVideoFiles,
} from "@/lib/mediaValidation";
import { useFilePreviewUrls } from "@/lib/filePreviewUrls";

interface VideoRecorderProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

export function VideoRecorder({ files, onChange, onError }: VideoRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoUrls = useFilePreviewUrls(files);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      liveStream?.getTracks().forEach((t) => t.stop());
    };
  }, [liveStream]);

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
        // MediaRecorder MIME types carry codec params (e.g.
        // "video/webm;codecs=vp9") which the server's strict allowlist
        // rejects with 415. Store under the base MIME so the recording can
        // actually persist end-to-end.
        const baseType = baseMimeType(recorder.mimeType || "video/webm") || "video/webm";
        const blob = new Blob(chunksRef.current, { type: baseType });
        const file = new File([blob], `video-${Date.now()}${extensionForVideoMime(baseType)}`, { type: baseType });
        const { validFiles, errors } = validateVideoFiles([file], files.length);
        if (errors.length > 0) {
          onError(errors.join("\n"));
          return;
        }
        if (validFiles.length === 0) return;
        onChange([...files, ...validFiles]);
        onError("");
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
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const { validFiles, errors } = validateVideoFiles(picked, files.length);
    if (errors.length > 0) {
      onError(errors.join("\n"));
    } else {
      onError("");
    }
    if (validFiles.length > 0) {
      onChange([...files, ...validFiles]);
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 sm:flex-none"
        >
          <FileVideo className="w-4 h-4 mr-2" />
          Choose Video File
        </Button>
        <Button
          variant={recording ? "destructive" : "default"}
          onClick={recording ? stopRecording : startRecording}
          className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
        >
          <Video className="w-4 h-4 mr-2" />
          {recording ? `Stop (${formatTime(elapsed)})` : "Record Video"}
        </Button>
      </div>

      <Input
        ref={fileInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

      {recording && (
        <div className="rounded-xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-h-[200px] object-contain"
          />
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-3 text-sm text-automotive-orange">
          <span className="animate-pulse">● Recording...</span>
          <span>{formatTime(elapsed)}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Videos ({files.length}/{MAX_VIDEO_COUNT})</h4>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileVideo className="w-5 h-5 text-gray-500" />
                    <span className="text-sm text-gray-900 truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    aria-label="Remove video"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                {videoUrls[index] && (
                  <video controls src={videoUrls[index]} className="w-full max-h-[200px]" preload="metadata" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!recording && files.length === 0 && (
        <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900 mb-1">Show me the issue.</p>
          <p>Tap <strong>Record Video</strong> to film the vehicle issue from a safe distance. Do not record while driving. Or choose a file you already recorded.</p>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Video is stored with your case only. It is not analyzed automatically.
      </p>
    </div>
  );
}