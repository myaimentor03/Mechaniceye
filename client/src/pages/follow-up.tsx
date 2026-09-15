import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { EvidenceVerificationPanel } from "@/components/EvidenceVerificationPanel";
import { AnalysisProgress } from "@/components/analysis-progress";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { Diagnosis } from "@shared/schema";
import { MEDIA_UNAVAILABLE, parseMediaCapabilities, filterSubmittableEvidence, type MediaCapabilities } from "@/lib/mediaAvailability";
import { EvidenceAttachment } from "@shared/drivableEvidence";

export default function FollowUp() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/follow-up/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const diagnosisId = params?.id;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [capabilities, setCapabilities] = useState<MediaCapabilities>(MEDIA_UNAVAILABLE);
  const [evidenceStatus, setEvidenceStatus] = useState<{
    photo: "persisted" | "not_provided" | "failed";
    audio: "persisted" | "not_provided" | "failed";
    video: "persisted" | "not_provided" | "failed";
    vibration: "persisted" | "not_provided" | "failed";
  } | undefined>(undefined);

  const [formData, setFormData] = useState({
    description: "",
    vehicleInfo: "",
    timing: "",
    audioFiles: [] as File[],
    videoFiles: [] as File[],
    photoFiles: [] as File[],
    vibrationFiles: [] as File[],
  });

  const { data: originalDiagnosis, isLoading } = useQuery<Diagnosis>({
    queryKey: ["/api/diagnoses", diagnosisId],
    enabled: !!diagnosisId,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities", { headers: { "Cache-Control": "no-store" } })
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setCapabilities(parseMediaCapabilities(body)); })
      .catch(() => { if (!cancelled) setCapabilities({ ...MEDIA_UNAVAILABLE }); });
    return () => { cancelled = true; };
  }, []);

  const followUpMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/follow-up`, data);
      return response.json();
    },
    onSuccess: (newDiagnosis) => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses"] });
      setLocation(`/results/${newDiagnosis.id}`);
      const ep = newDiagnosis.evidenceProcessing;
      const parts: string[] = [];
      if (ep?.photo && ep.photo !== "not_provided") parts.push("photos");
      if (ep?.audio && ep.audio !== "not_provided") parts.push("audio");
      if (ep?.video && ep.video !== "not_provided") parts.push("video");
      if (ep?.vibration && ep.vibration !== "not_provided") parts.push("vibration");
      toast({
        title: "Follow-up Submitted",
        description: `Your details and ${parts.length > 0 ? parts.join(", ") + " evidence" : "details"} were saved. All media is stored privately for human review and has not been analyzed automatically.`,
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      toast({
        title: "Follow-up Failed",
        description: error.message || "Could not submit your follow-up. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitFollowUp = async () => {
    if (!additionalInfo.trim() || additionalInfo.length < 20) {
      toast({
        title: "More Details Needed",
        description: "Please provide at least 20 characters describing what you tried and what happened",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    const filtered = filterSubmittableEvidence(
      { photos: formData.photoFiles, audio: formData.audioFiles, video: formData.videoFiles, vibration: formData.vibrationFiles },
      capabilities,
    );

    const droppedTotal =
      formData.photoFiles.length - filtered.photos.length +
      formData.audioFiles.length - filtered.audio.length +
      formData.videoFiles.length - filtered.video.length +
      formData.vibrationFiles.length - filtered.vibration.length;

    if (droppedTotal > 0) {
      const parts: string[] = [];
      if (formData.photoFiles.length !== filtered.photos.length) parts.push("photos");
      if (formData.audioFiles.length !== filtered.audio.length) parts.push("audio files");
      if (formData.videoFiles.length !== filtered.video.length) parts.push("video files");
      if (formData.vibrationFiles.length !== filtered.vibration.length) parts.push("vibration files");
      toast({
        title: "Some files were not submitted",
        description: `${parts.join(", ")} were held back because that upload type is temporarily unavailable. Your case will be saved without them.`,
        variant: "destructive",
      });
    }

    const formDataToSend = new FormData();
    formDataToSend.append("additionalInfo", additionalInfo);

    filtered.photos.forEach((file) => formDataToSend.append("photos", file));
    filtered.audio.forEach((file) => formDataToSend.append("audio", file));
    filtered.video.forEach((file) => formDataToSend.append("video", file));
    filtered.vibration.forEach((file) => formDataToSend.append("vibration", file));

    followUpMutation.mutate(formDataToSend);
  };

  if (!match || !diagnosisId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Invalid Diagnosis ID</h1>
            <Button onClick={() => setLocation("/")}>Return Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            </CardContent>
          </Card>
        </main>
        <BottomNavigation currentPage="diagnosis" />
      </div>
    );
  }

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
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-automotive-orange bg-opacity-10 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-automotive-orange" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Need Another Fix?</h2>
                <p className="text-gray-600">Let's gather more details and any evidence to find a better solution</p>
              </div>
            </div>

            {originalDiagnosis && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">Previous Diagnosis:</h3>
                <p className="text-blue-800">{originalDiagnosis.primaryDiagnosis?.title}</p>
                <p className="text-blue-700 text-sm mt-1">{originalDiagnosis.primaryDiagnosis?.description}</p>
              </div>
            )}

            {originalDiagnosis?.additionalQuestions && originalDiagnosis.additionalQuestions.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-900 mb-2">Please answer these questions:</h3>
                    <ul className="space-y-2 text-yellow-800 text-sm">
                      {originalDiagnosis.additionalQuestions.map((question, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-automotive-orange font-bold">{index + 1}.</span>
                          <span>{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Evidence Status */}
            {diagnosisId && (
              <div className="mb-6">
                <EvidenceVerificationPanel caseId={diagnosisId} />
              </div>
            )}

            {/* Additional Information Input */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What happened when you tried the previous fixes? What additional details can you provide?
                </label>
                <Textarea
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  className="w-full resize-none focus:ring-automotive-orange focus:border-automotive-orange"
                  rows={6}
                  placeholder="Please tell me: Which fixes did you try? What happened? Any new symptoms? What tools did you use? How did the problem change (if at all)?"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {additionalInfo.length}/20 characters minimum
                </div>
              </div>
            </div>

            {/* Evidence Capture - includes photo, audio, video, vibration */}
            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Optional: Add Evidence (Photo, Audio, Video, Vibration)
              </h3>
              <EvidenceCapture
                formData={formData}
                setFormData={setFormData}
                capabilities={capabilities}
                evidenceStatus={evidenceStatus}
                onRetry={(modality) => {
                  setEvidenceStatus((prev) => prev ? { ...prev, [modality]: "not_provided" } : undefined);
                }}
              />
            </div>

            {/* Submit Button */}
            <div className="pt-6 border-t border-gray-200">
              <Button
                onClick={handleSubmitFollowUp}
                disabled={followUpMutation.isPending || additionalInfo.length < 20}
                className="w-full bg-automotive-orange hover:bg-orange-600 text-white py-4 px-6 rounded-xl font-semibold text-lg"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Submit Follow-up for Review
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}
