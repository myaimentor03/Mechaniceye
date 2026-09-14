import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Check, Camera, Mic, Video, Waves, Edit, Image, Trash2, Play, X, Shield, AlertCircle } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { VideoRecorder } from "@/components/VideoRecorder";
import { VibrationCapture } from "@/components/VibrationCapture";
import { type MediaCapabilities, MEDIA_UNAVAILABLE, mediaUnavailableMessage } from "@/lib/mediaAvailability";

const MAX_PHOTO_COUNT = 8;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_AUDIO_FILES = 4;
const MAX_VIDEO_FILES = 4;
const MAX_VIBRATION_FILES = 4;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

type EvidenceModalityStatus = "persisted" | "not_provided" | "failed";

interface EvidenceCaptureProps {
  formData: {
    description: string;
    vehicleInfo: string;
    timing: string;
    audioFiles: File[];
    videoFiles: File[];
    photoFiles: File[];
    vibrationFiles: File[];
  };
  setFormData: (data: any) => void;
  capabilities?: MediaCapabilities;
  evidenceStatus?: {
    photo: EvidenceModalityStatus;
    audio: EvidenceModalityStatus;
    video: EvidenceModalityStatus;
    vibration: EvidenceModalityStatus;
  };
}

export function EvidenceCapture({ formData, setFormData, capabilities = MEDIA_UNAVAILABLE, evidenceStatus }: EvidenceCaptureProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("description");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "audio", label: "Audio", icon: Mic },
    { id: "video", label: "Video", icon: Video },
    { id: "vibration", label: "Vibration", icon: Waves },
    { id: "photo", label: "Photos", icon: Image },
    { id: "description", label: "Description", icon: Edit },
  ];

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Unsupported file type. Use JPEG, PNG, WebP, or HEIC.`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        errors.push(`${file.name}: File too large (max 12 MB).`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length > 0) {
      toast({ title: "Photo Upload Issues", description: errors.join("\n"), variant: "destructive" });
    }

    if (validFiles.length > 0) {
      if (formData.photoFiles.length + validFiles.length > MAX_PHOTO_COUNT) {
        const allowed = MAX_PHOTO_COUNT - formData.photoFiles.length;
        toast({ title: "Photo Limit Reached", description: `Maximum ${MAX_PHOTO_COUNT} photos allowed. Only ${allowed} more can be added.`, variant: "destructive" });
        return;
      }
      const nextFiles = [...formData.photoFiles, ...validFiles];
      setFormData((prev: any) => ({ ...prev, photoFiles: nextFiles }));
      toast({ title: "Photos Saved", description: `${validFiles.length} photo(s) stored with your case.` });
      if (validFiles[0]) {
        setPhotoPreview(URL.createObjectURL(validFiles[0]));
      }
    }

    e.target.value = "";
  }

  function removePhoto(index: number) {
    const next = formData.photoFiles.filter((_, i) => i !== index);
    setFormData((prev: any) => ({ ...prev, photoFiles: next }));
    if (next.length === 0) setPhotoPreview(null);
    else setPhotoPreview(URL.createObjectURL(next[0]));
  }

  function handleAudioChange(files: File[]) {
    if (files.length > MAX_AUDIO_FILES) {
      toast({ title: "Audio Limit Reached", description: `Maximum ${MAX_AUDIO_FILES} audio files allowed.`, variant: "destructive" });
      return;
    }
    setFormData((prev: any) => ({ ...prev, audioFiles: files }));
  }

  function handleVideoChange(files: File[]) {
    if (files.length > MAX_VIDEO_FILES) {
      toast({ title: "Video Limit Reached", description: `Maximum ${MAX_VIDEO_FILES} video files allowed.`, variant: "destructive" });
      return;
    }
    setFormData((prev: any) => ({ ...prev, videoFiles: files }));
  }

  function handleVibrationChange(files: File[]) {
    if (files.length > MAX_VIBRATION_FILES) {
      toast({ title: "Vibration Limit Reached", description: `Maximum ${MAX_VIBRATION_FILES} vibration files allowed.`, variant: "destructive" });
      return;
    }
    setFormData((prev: any) => ({ ...prev, vibrationFiles: files }));
  }

  function handleModalityRetry(modality: keyof EvidenceCaptureProps["evidenceStatus"]) {
    setFormData((prev: any) => {
      const next = { ...prev };
      if (modality === "photo") {
        next.photoFiles = [];
        next.evidenceStatus = { ...next.evidenceStatus, photo: "not_provided" };
      } else if (modality === "audio") {
        next.audioFiles = [];
        next.evidenceStatus = { ...next.evidenceStatus, audio: "not_provided" };
      } else if (modality === "video") {
        next.videoFiles = [];
        next.evidenceStatus = { ...next.evidenceStatus, video: "not_provided" };
      } else if (modality === "vibration") {
        next.vibrationFiles = [];
        next.evidenceStatus = { ...next.evidenceStatus, vibration: "not_provided" };
      }
      return next;
    });
  }

  function handleError(message: string) {
    if (message) toast({ title: "Error", description: message, variant: "destructive" });
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "audio":
        if (!capabilities.audioUpload) {
          return (
            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{mediaUnavailableMessage("audio")}</span>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <AudioRecorder
              files={formData.audioFiles}
              onChange={handleAudioChange}
              onError={handleError}
            />
          </div>
        );

      case "video":
        if (!capabilities.videoUpload) {
          return (
            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{mediaUnavailableMessage("video")}</span>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <VideoRecorder
              files={formData.videoFiles}
              onChange={handleVideoChange}
              onError={handleError}
            />
          </div>
        );

      case "vibration":
        if (!capabilities.vibrationSensorCapture) {
          return (
            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{mediaUnavailableMessage("vibration")}</span>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <VibrationCapture
              files={formData.vibrationFiles}
              onChange={handleVibrationChange}
              onError={handleError}
            />
          </div>
        );

      case "photo":
        if (!capabilities.photoUpload) {
          return (
            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{mediaUnavailableMessage("photos")}</span>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
              <Image className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Add Photos</h3>
              <p className="text-gray-600 mb-4">
                Tap to choose photos of the vehicle issue. Dash lights, tires, leaks, damage, engine bay.
                <br />
                <span className="text-xs text-gray-500">Max 8 photos, 12 MB each. JPEG, PNG, WebP, HEIC.</span>
              </p>

              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-automotive-orange hover:bg-orange-600 text-white"
              >
                <Upload className="w-4 h-4 mr-2" /> Choose Photos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                hidden
                onChange={handlePhotoUpload}
              />
            </div>

            {formData.photoFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Selected Photos ({formData.photoFiles.length}/8)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {formData.photoFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="relative aspect-square border rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
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

            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
            >
              <Camera className="w-4 h-4 mr-2" /> Take Photo with Camera
            </Button>
          </div>
        );

      case "description":
        return (
          <div className="space-y-4">
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Describe the issue in your own words
              </Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
                className="w-full resize-none focus:ring-automotive-orange focus:border-automotive-orange"
                rows={6}
                placeholder="e.g., My car makes a squealing noise when I brake, especially in the morning. The sound gets worse when it's cold outside..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  When does it occur?
                </Label>
                <Select value={formData.timing} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, timing: value }))}>
                  <SelectTrigger className="focus:ring-automotive-orange focus:border-automotive-orange">
                    <SelectValue placeholder="Select timing..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="startup">During startup</SelectItem>
                    <SelectItem value="driving">While driving</SelectItem>
                    <SelectItem value="braking">When braking</SelectItem>
                    <SelectItem value="accelerating">When accelerating</SelectItem>
                    <SelectItem value="turning">When turning</SelectItem>
                    <SelectItem value="always">All the time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle information
                </Label>
                <Input
                  value={formData.vehicleInfo}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, vehicleInfo: e.target.value }))}
                  className="focus:ring-automotive-orange focus:border-automotive-orange"
                  placeholder="e.g., 2018 Honda Civic"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Evidence Status Bar */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
        <Shield className="w-4 h-4 text-blue-600" />
        <span className="text-blue-800 font-medium">Evidence Status: {formData.photoFiles.length > 0 ? "provided" : "not_provided"}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Photos: {formData.photoFiles.length}/8</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Audio: {formData.audioFiles.length}/{MAX_AUDIO_FILES}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Video: {formData.videoFiles.length}/{MAX_VIDEO_FILES}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Vibration: {formData.vibrationFiles.length}/{MAX_VIBRATION_FILES}</span>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const count = tab.id === "audio" ? formData.audioFiles.length :
                          tab.id === "video" ? formData.videoFiles.length :
                          tab.id === "vibration" ? formData.vibrationFiles.length :
                          tab.id === "photo" ? formData.photoFiles.length : 0;
            const modalityStatus = tab.id === "audio" ? evidenceStatus?.audio :
                                   tab.id === "video" ? evidenceStatus?.video :
                                   tab.id === "vibration" ? evidenceStatus?.vibration :
                                   evidenceStatus?.photo;
            const statusClass = modalityStatus === "persisted" ? "bg-green-100 text-green-800" :
                               modalityStatus === "failed" ? "bg-red-100 text-red-800" :
                               "bg-gray-100 text-gray-800";
            const statusText = modalityStatus || "pending";
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-automotive-orange text-automotive-orange"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <IconComponent className="w-4 h-4" />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="bg-automotive-orange text-white text-xs px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
                {count > 0 && modalityStatus && (
                  <span className={`ml-2 text-xs font-normal ${statusClass}`}>
                    {statusText}
                  </span>
                )}
                {modalityStatus === "failed" && (
                  <button
                    type="button"
                    className="ml-2 text-xs font-medium text-red-600 hover:text-red-800"
                    onClick={handleModalityRetry}
                  >
                    Retry
                  </button>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mb-6">
        {renderTabContent()}
      </div>
    </>
  );
}