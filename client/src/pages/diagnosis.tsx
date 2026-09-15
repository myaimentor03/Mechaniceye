import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { AnalysisProgress } from "@/components/analysis-progress";
import { apiRequest } from "@/lib/queryClient";
import { filterSubmittableEvidence, parseMediaCapabilities, MEDIA_UNAVAILABLE, type MediaCapabilities } from "@/lib/mediaAvailability";
import { useEvidenceDraft } from "@/hooks/useEvidenceDraft";
import { useJourneyState } from "@/hooks/useJourneyState";

export default function Diagnosis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capabilities, setCapabilities] = useState<MediaCapabilities>(MEDIA_UNAVAILABLE);
  const [evidenceStatus, setEvidenceStatus] = useState<{
    photo: "persisted" | "not_provided" | "failed";
    audio: "persisted" | "not_provided" | "failed";
    video: "persisted" | "not_provided" | "failed";
    vibration: "persisted" | "not_provided" | "failed";
  } | undefined>(undefined);
  const journey = useJourneyState();
  const [formData, setFormData] = useState({
    description: "",
    vehicleInfo: "",
    timing: "",
    audioFiles: [] as File[],
    videoFiles: [] as File[],
    photoFiles: [] as File[],
    vibrationFiles: [] as File[],
  });

  const draft = useEvidenceDraft(formData);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities", { headers: { "Cache-Control": "no-store" } })
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setCapabilities(parseMediaCapabilities(body)); })
      .catch(() => { if (!cancelled) setCapabilities({ ...MEDIA_UNAVAILABLE }); });
    return () => { cancelled = true; };
  }, []);

  const createDiagnosisMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/diagnoses", data);
      return response.json();
    },
    onSuccess: (diagnosis) => {
      draft.clearAfterSubmit();
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses"] });
      const summary = diagnosis.evidenceSummary;
      if (summary) {
        setEvidenceStatus({
          photo: summary.photos?.status as "persisted" | "not_provided" | "failed" ?? "not_provided",
          audio: summary.audio?.status as "persisted" | "not_provided" | "failed" ?? "not_provided",
          video: summary.video?.status as "persisted" | "not_provided" | "failed" ?? "not_provided",
          vibration: summary.vibration?.status as "persisted" | "not_provided" | "failed" ?? "not_provided",
        });
      }
      journey.goToComplete();
      setLocation(`/results/${diagnosis.id}`);
      toast({
        title: "Case saved",
        description: "Your evidence has been stored with your case. It has not been analyzed yet.",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      // Truthful failed status so retry UI surfaces per modality that had files
      setEvidenceStatus({
        photo: formData.photoFiles.length > 0 ? "failed" : "not_provided",
        audio: formData.audioFiles.length > 0 ? "failed" : "not_provided",
        video: formData.videoFiles.length > 0 ? "failed" : "not_provided",
        vibration: formData.vibrationFiles.length > 0 ? "failed" : "not_provided",
      });
      journey.resetToDescribe();
      toast({
        title: "Upload failed",
        description: error.message || "Could not save your evidence. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = async () => {
    if (!formData.description.trim() || !formData.vehicleInfo.trim() || !formData.timing) {
      toast({
        title: "Missing Information",
        description: "Please fill in the description, vehicle info, and timing fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.description.length < 10) {
      toast({
        title: "Description Too Short",
        description: "Please provide at least 10 characters describing the issue",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    const filtered = filterSubmittableEvidence(
      { photos: formData.photoFiles, audio: formData.audioFiles, video: formData.videoFiles, vibration: formData.vibrationFiles },
      capabilities,
    );
    // Truthful gate: never submit files for unavailable modalities; stale recordings are dropped.
    const droppedCounts = {
      photos: formData.photoFiles.length - filtered.photos.length,
      audio: formData.audioFiles.length - filtered.audio.length,
      video: formData.videoFiles.length - filtered.video.length,
      vibration: formData.vibrationFiles.length - filtered.vibration.length,
    };
    const droppedTotal = droppedCounts.photos + droppedCounts.audio + droppedCounts.video + droppedCounts.vibration;
    if (droppedTotal > 0) {
      const parts: string[] = [];
      if (droppedCounts.photos) parts.push(`${droppedCounts.photos} photo(s)`);
      if (droppedCounts.audio) parts.push(`${droppedCounts.audio} audio file(s)`);
      if (droppedCounts.video) parts.push(`${droppedCounts.video} video file(s)`);
      if (droppedCounts.vibration) parts.push(`${droppedCounts.vibration} vibration file(s)`);
      toast({
        title: "Some files were not submitted",
        description: `${parts.join(", ")} were held back because that upload type is temporarily unavailable. Your case will be saved without them. Describe the issue in words instead.`,
        variant: "destructive",
      });
    }

    const formDataToSend = new FormData();
    formDataToSend.append("description", formData.description);
    formDataToSend.append("vehicleInfo", formData.vehicleInfo);
    formDataToSend.append("timing", formData.timing);

    filtered.audio.forEach((file) => {
      formDataToSend.append("audio", file);
    });

    filtered.video.forEach((file) => {
      formDataToSend.append("video", file);
    });

    filtered.photos.forEach((file) => {
      formDataToSend.append("photos", file);
    });

    filtered.vibration.forEach((file) => {
      formDataToSend.append("vibration", file);
    });

    createDiagnosisMutation.mutate(formDataToSend);
  };

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
          <AnalysisProgress />
        </main>
        <BottomNavigation currentPage="diagnosis" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Vehicle Evidence</h2>
              <div className="flex items-center space-x-2 text-sm text-automotive-gray">
                <span className="text-automotive-orange">&#128274;</span>
                <span>Evidence Stored Privately</span>
              </div>
            </div>
            
            {/* Draft recovery banner */}
            {draft.showBanner && draft.draftAvailable && (
              <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-sm text-amber-900">
                  <span className="font-semibold">Draft recovered</span> — your description, vehicle, and timing from {new Date(draft.draftAvailable.updatedAt).toLocaleString()} were restored. Photos, audio, video, and vibration files must be re-added after a reload.
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const restored = draft.restore();
                      if (restored) {
                        setFormData((prev) => ({
                          ...prev,
                          description: restored.description,
                          vehicleInfo: restored.vehicleInfo,
                          timing: restored.timing,
                        }));
                        toast({ title: "Draft restored", description: "Your previous text was restored. Re-add any media files, then save again." });
                      }
                    }}
                  >
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={draft.discard}>
                    Discard
                  </Button>
                </div>
              </div>
            )}

            {/* Progress Steps */}
            <div className="flex items-center space-x-4 mb-8">
              {journey.step !== "complete" && (
                <div className="flex items-center space-x-1">
                  <div className={`w-8 h-8 rounded-full border-2 ${
                    journey.step === "describe" ? "border-automotive-orange" : journey.step === "evidence" ? "border-automotive-orange" : journey.step === "review" ? "border-automotive-orange" : "border-gray-200"
                  } bg-${
                    journey.step === "describe"
                      ? "automotive-orange"
                      : journey.step === "evidence"
                      ? "automotive-orange"
                      : journey.step === "review"
                      ? "automotive-orange"
                      : "gray-200"
                  } text-white text-sm font-semibold`}
                    >{journey.step === "describe" ? "1" : journey.step === "evidence" ? "2" : journey.step === "review" ? "3" : ""}</div>
                  <span className="text-automotive-orange font-medium text-sm">{journey.step === "describe" ? "Describe Issue" : journey.step === "evidence" ? "Add Evidence" : journey.step === "review" ? "Review" : "Complete"}</span>
                </div>
              )}
              {journey.step !== "describe" && journey.step !== "complete" && (
                <div className="flex items-center space-x-1">
                  <div className={`w-8 h-8 rounded-full border-2 bg-${
                    journey.step === "evidence" || journey.step === "review" || journey.step === "describe"
                      ? "automotive-orange"
                      : "gray-200"
                  } text-white text-sm font-semibold`}
                    >{journey.step === "evidence" || journey.step === "review" || journey.step === "describe" ? "2" : "3"}</div>
                  <span className="text-gray-500 text-sm">{journey.step === "evidence" ? "Add Evidence" : journey.step === "review" ? "Review Evidence" : journey.step === "describe" ? "Describe Issue" : "Next Steps"}</span>
                </div>
              )}
              {journey.step !== "describe" && journey.step !== "complete" && (
                <div className="flex items-center space-x-1">
                  <div className={`w-8 h-8 rounded-full border-2 bg-${
                    journey.step === "review" || journey.step === "evidence" || journey.step === "describe"
                      ? "automotive-orange"
                      : "gray-200"
                  } text-white text-sm font-semibold`}
                    >{journey.step === "review" || journey.step === "evidence" || journey.step === "describe" ? "3" : "4"}</div>
                  <span className="text-gray-500 text-sm">{journey.step === "review" ? "Prepare Submission" : journey.step === "evidence" ? "Add Evidence" : journey.step === "describe" ? "Describe Issue" : "Complete"}</span>
                </div>
              )}
            </div>

            <EvidenceCapture
              formData={formData}
              setFormData={setFormData}
              capabilities={capabilities}
              evidenceStatus={evidenceStatus}
              onRetry={(modality) => {
                setEvidenceStatus((prev) => prev ? { ...prev, [modality]: "not_provided" } : undefined);
              }}
              journeyStep={journey.step}
              onStepChange={journey.setStep}
            />

            {/* Submit Button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <Button 
                onClick={handleAnalyze}
                disabled={createDiagnosisMutation.isPending}
                className="w-full bg-automotive-blue hover:bg-blue-800 text-white py-4 px-6 rounded-xl font-semibold text-lg"
              >
                Save Evidence to Case
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}