import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useJourneyState } from "@/hooks/useJourneyState";
import { type JourneyStep } from "@/hooks/useJourneyState";
import { Upload, Check, Camera, Mic, Video, Waves, Edit, Image, Trash2, Play, X, Shield, AlertCircle } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { VideoRecorder } from "@/components/VideoRecorder";
import { VibrationCapture } from "@/components/VibrationCapture";
import { type MediaCapabilities, MEDIA_UNAVAILABLE, mediaUnavailableMessage } from "@/lib/mediaAvailability";
import { MAX_PHOTO_COUNT, validatePhotoFiles } from "@/lib/photoValidation";
import { MAX_AUDIO_COUNT as MAX_AUDIO_FILES, MAX_VIDEO_COUNT as MAX_VIDEO_FILES } from "@/lib/mediaValidation";
const MAX_VIBRATION_FILES = 4;

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
  onRetry?: (modality: keyof NonNullable<EvidenceCaptureProps["evidenceStatus"]>) => void;
  journeyStep?: JourneyStep;
  onStepChange?: (step: JourneyStep) => void;
}

export function EvidenceCapture({ formData, setFormData, capabilities = MEDIA_UNAVAILABLE, evidenceStatus, onRetry, journeyStep, onStepChange }: EvidenceCaptureProps) {
  const { toast } = useToast();
  const internalJourney = useJourneyState();
  const journey = journeyStep && onStepChange
    ? {
        step: journeyStep,
        setStep: onStepChange,
        proceedToEvidence: () => onStepChange("evidence"),
        proceedToReview: () => onStepChange("review"),
        goToComplete: () => onStepChange("complete"),
        resetToDescribe: () => onStepChange("describe"),
      } as ReturnType<typeof useJourneyState>
    : internalJourney;
  const [activeTab, setActiveTab] = useState("description");

  const evidenceStatusText = journey.step === "describe"
      ? "Describe the vehicle issue"
      : journey.step === "evidence"
      ? formData.photoFiles.length + formData.audioFiles.length + formData.videoFiles.length + formData.vibrationFiles.length > 0
        ? `Evidence: ${formData.photoFiles.length} photo${formData.photoFiles.length !== 1 ? "s" : ""}, ${formData.audioFiles.length} audio${formData.audioFiles.length !== 1 ? "s" : ""}, ${formData.videoFiles.length} video${formData.videoFiles.length !== 1 ? "s" : ""}, ${formData.vibrationFiles.length} vibration${formData.vibrationFiles.length !== 1 ? "s" : ""}`
        : "Add evidence (photo, audio, video, or vibration)"
      : journey.step === "review"
      ? `Review evidence${formData.photoFiles.length + formData.audioFiles.length + formData.videoFiles.length + formData.vibrationFiles.length > 0 ? " (${formData.photoFiles.length + formData.audioFiles.length + formData.videoFiles.length + formData.vibrationFiles.length} file(s))" : ""} before saving`
      : "Your case has been saved";

  const getModalityStatus = (modality: "photo" | "audio" | "video" | "vibration") => {
    const status = evidenceStatus?.[modality];
    if (status === "persisted") return "stored";
    if (status === "failed") return "failed";
    return "not provided";
  };

  const evidenceStatusColor = journey.step === "describe"
      ? "text-gray-600"
      : journey.step === "evidence"
      ? formData.photoFiles.length + formData.audioFiles.length + formData.videoFiles.length + formData.vibrationFiles.length > 0
        ? "text-automotive-orange"
        : "text-gray-400"
      : journey.step === "review"
      ? "text-automotive-orange"
      : "text-green-600";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Object URLs are a side effect: create them in an effect so every
  // created URL is revoked exactly once (on change or unmount).
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = formData.photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoUrls(urls);
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.photoFiles]);

  const tabs = [
    { id: "audio", label: "Audio", icon: Mic },
    { id: "video", label: "Video", icon: Video },
    { id: "vibration", label: "Vibration", icon: Waves },
    { id: "photo", label: "Photos", icon: Image },
    { id: "description", label: "Description", icon: Edit },
  ];

  function addPhotoFiles(candidates: File[]) {
    if (candidates.length === 0) return;
    const { validFiles, errors } = validatePhotoFiles(candidates, formData.photoFiles.length);
    if (errors.length > 0) {
      toast({
        title: validFiles.length > 0 ? "Some Photos Could Not Be Added" : "Photo Upload Issues",
        description: errors.join("\n"),
        variant: "destructive",
      });
    }
    if (validFiles.length > 0) {
      const nextFiles = [...formData.photoFiles, ...(validFiles as File[])];
      setFormData((prev: any) => ({ ...prev, photoFiles: nextFiles }));
      toast({ title: "Photos Saved", description: `${validFiles.length} photo(s) stored with your case.` });
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    addPhotoFiles(Array.from(e.target.files || []));
    e.target.value = "";
  }

  function removePhoto(index: number) {
    const next = formData.photoFiles.filter((_, i) => i !== index);
    setFormData((prev: any) => ({ ...prev, photoFiles: next }));
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

  function handleModalityRetry(modality: keyof NonNullable<EvidenceCaptureProps["evidenceStatus"]>) {
    // Clear files for that modality; parent owns evidenceStatus so delegate reset via onRetry
    setFormData((prev: any) => {
      const next = { ...prev };
      if (modality === "photo") next.photoFiles = [];
      else if (modality === "audio") next.audioFiles = [];
      else if (modality === "video") next.videoFiles = [];
      else if (modality === "vibration") next.vibrationFiles = [];
      return next;
    });
    if (onRetry) onRetry(modality);
    toast({ title: "Cleared", description: `${modality} files cleared. Please re-add evidence and save again.` });
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
                Take a photo of the vehicle issue right now, or choose photos you already have. Dash lights, tires, leaks, damage, engine bay.
                <br />
                <span className="text-xs text-gray-500">Max 8 photos, 12 MB each. JPEG, PNG, WebP, HEIC.</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  className="bg-automotive-orange hover:bg-orange-600 text-white"
                >
                  <Camera className="w-4 h-4 mr-2" /> Take Photo
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
                >
                  <Upload className="w-4 h-4 mr-2" /> Choose Photos
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                hidden
                onChange={handlePhotoUpload}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
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
                        src={photoUrls[index]}
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

            <p className="text-xs text-gray-500">
              Photos are stored with your case only. They are not analyzed automatically.
            </p>
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
        <span className={evidenceStatusColor}>
          Evidence: {evidenceStatusText}
        </span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Photos: {formData.photoFiles.length}/{MAX_PHOTO_COUNT}{evidenceStatus?.photo === "persisted" ? " ✓" : ""}{evidenceStatus?.photo === "failed" ? " ✕" : ""}{evidenceStatus?.photo === "not_provided" ? " —" : ""}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Audio: {formData.audioFiles.length}/{MAX_AUDIO_FILES}{evidenceStatus?.audio === "persisted" ? " ✓" : ""}{evidenceStatus?.audio === "failed" ? " ✕" : ""}{evidenceStatus?.audio === "not_provided" ? " —" : ""}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Video: {formData.videoFiles.length}/{MAX_VIDEO_FILES}{evidenceStatus?.video === "persisted" ? " ✓" : ""}{evidenceStatus?.video === "failed" ? " ✕" : ""}{evidenceStatus?.video === "not_provided" ? " —" : ""}</span>
        <span className="text-blue-600">|</span>
        <span className="text-blue-700">Vibration: {formData.vibrationFiles.length}/{MAX_VIBRATION_FILES}{evidenceStatus?.vibration === "persisted" ? " ✓" : ""}{evidenceStatus?.vibration === "failed" ? " ✕" : ""}{evidenceStatus?.vibration === "not_provided" ? " —" : ""}</span>
      </div>

      {/* Journey Step Controls */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="outline"
          onClick={() => journey.resetToDescribe()}
          disabled={journey.step === "describe"}
          className="flex-1 sm:flex-none text-sm text-gray-500 hover:text-gray-700"
        >
          <Edit className="w-3 h-3 mr-1" /> Describe
        </Button>
        {journey.step !== "describe" && (
          <Button
            variant="outline"
            onClick={() => journey.proceedToEvidence()}
            disabled={!(
              formData.description.trim() &&
              formData.vehicleInfo.trim() &&
              formData.timing.trim()
            )}
            className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
          >
            <Mic className="w-3 h-3 mr-1" /> Add Evidence
          </Button>
        )}
        {journey.step === "evidence" && (
          <Button
            variant="outline"
            onClick={() => journey.proceedToReview()}
            disabled={formData.photoFiles.length + formData.audioFiles.length + formData.videoFiles.length + formData.vibrationFiles.length === 0}
            className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
          >
            <Video className="w-3 h-3 mr-1" /> Review
          </Button>
        )}
        {journey.step === "review" && (
          <Button
            onClick={() => journey.goToComplete()}
            className="flex-1 sm:flex-none bg-automotive-orange hover:bg-orange-600 text-white"
          >
            <Shield className="w-3 h-3 mr-1" /> Save Case
          </Button>
        )}
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto pb-1" aria-label="Evidence sections">
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
            const modalityKey = (tab.id === "photo" ? "photo" : tab.id) as keyof NonNullable<EvidenceCaptureProps["evidenceStatus"]>;
            const isFailed = modalityStatus === "failed";
            return (
              <div key={tab.id} className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-automotive-orange text-automotive-orange"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  aria-selected={activeTab === tab.id}
                >
                  <IconComponent className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span className="bg-automotive-orange text-white text-xs px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                  {count > 0 && modalityStatus && (
                    <span className={`ml-1 text-xs font-normal px-1 py-0.5 rounded ${statusClass}`}>
                      {statusText}
                    </span>
                  )}
                </button>
                {isFailed && (
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:text-red-800 px-1 py-1"
                    onClick={(e) => { e.stopPropagation(); handleModalityRetry(modalityKey); }}
                    aria-label={`Clear failed ${tab.label} and retry`}
                  >
                    Retry
                  </button>
                )}
              </div>
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