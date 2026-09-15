import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Mic, FileAudio } from "lucide-react";
import {
  AUDIO_ACCEPT,
  baseMimeType,
  extensionForAudioMime,
  validateAudioFiles,
} from "@/lib/mediaValidation";

interface AudioRecorderProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

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
        // MediaRecorder MIME types carry codec params (e.g.
        // "audio/webm;codecs=opus") which the server's strict allowlist
        // rejects with 415. Store under the base MIME so the recording can
        // actually persist end-to-end.
        const baseType = baseMimeType(recorder.mimeType || "audio/webm") || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: baseType });
        const file = new File([blob], `audio-${Date.now()}${extensionForAudioMime(baseType)}`, { type: baseType });
        const { validFiles, errors } = validateAudioFiles([file], files.length);
        if (errors.length > 0) {
          onError(errors.join("\n"));
          return;
        }
        if (validFiles.length === 0) return;
        onChange([...files, ...validFiles]);
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
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const { validFiles, errors } = validateAudioFiles(picked, files.length);
    if (errors.length > 0) {
      onError(errors.join("\n"));
    } else {
      onError("");
    }
    if (validFiles.length > 0) {
      onChange([...files, ...validFiles]);
      setPreviewUrl(URL.createObjectURL(validFiles[validFiles.length - 1]));
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setPreviewUrl(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 sm:flex-none"
        >
          <FileAudio className="w-4 h-4 mr-2" />
          Choose Audio File
        </Button>
        <Button
          variant={recording ? "destructive" : "default"}
          onClick={recording ? stopRecording : startRecording}
          className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
        >
          <Mic className="w-4 h-4 mr-2" />
          {recording ? `Stop (${formatTime(elapsed)})` : "Record Sound"}
        </Button>
      </div>

      <Input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {recording && (
        <div className="flex items-center gap-3 text-sm text-automotive-orange">
          <span className="animate-pulse">● Recording...</span>
          <span>{formatTime(elapsed)}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Recordings ({files.length}/4)</h4>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <FileAudio className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-900 truncate max-w-[200px]">{file.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                  aria-label="Remove recording"
                >
                  <X className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="mt-4">
          <audio controls src={previewUrl} className="w-full" />
        </div>
      )}

      {!recording && files.length === 0 && (
        <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900 mb-1">I need to hear the noise.</p>
          <p>Tap <strong>Record Sound</strong> to capture the noise your vehicle is making. Or choose a file you already recorded.</p>
        </div>
      )}
    </div>
  );
}
