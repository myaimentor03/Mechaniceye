import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { UploadTabs } from "@/components/upload-tabs";
import { AnalysisProgress } from "@/components/analysis-progress";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertCircle, Mic, Video, Vibrate, FileIcon, X } from "lucide-react";
import type { Diagnosis } from "@shared/schema";

const SUBMISSION_TIMEOUT_MS = 20000;
const CASE_RECOVERY_TIMEOUT_MS = 20000;
const FOLLOW_UP_ORIGIN = "diagnosis-follow-up";

export default function FollowUp() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/follow-up/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const diagnosisId = params?.id;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [formData, setFormData] = useState({
    description: "",
    vehicleInfo: "",
    timing: "",
    audioFile: null as File | null,
    videoFile: null as File | null,
    capturedPhoto: null as File | null,
    vibrationData: null as any,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const prevCustomerIdRef = useRef<string | null>(null);

  const { data: originalDiagnosis, isLoading } = useQuery<Diagnosis>({
    queryKey: ["/api/diagnoses", diagnosisId],
    enabled: !!diagnosisId,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (!active) return;
        setCustomer(body.user || null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setCustomer(null);
        } else {
          setCustomer(null);
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setAuthChecked(true);
      });
    return () => { active = false; controller.abort(); window.clearTimeout(timeoutId); };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const currentId = customer?.id ?? null;
    if (prevCustomerIdRef.current !== null && prevCustomerIdRef.current !== currentId) {
      setError("");
    }
    prevCustomerIdRef.current = currentId;
  }, [authChecked, customer?.id]);

  useEffect(() => {
    if (!error && authChecked && customer && diagnosisId) {
      let savedCaseId: string | null = null;
      let savedOrigin: string | null = null;
      try {
        savedCaseId = sessionStorage.getItem("drivable-last-case-id");
        savedOrigin = sessionStorage.getItem("drivable-last-case-origin");
      } catch {}
      if (!savedCaseId) return;
      if (savedOrigin !== FOLLOW_UP_ORIGIN) return;
      if (savedCaseId !== diagnosisId) return;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), CASE_RECOVERY_TIMEOUT_MS);
      fetch(`/api/my-cases/${encodeURIComponent(savedCaseId)}`, { credentials: "same-origin", signal: controller.signal })
        .then(async (res) => {
          window.clearTimeout(timeoutId);
          if (!res.ok) {
            if (res.status === 401) {
              setCustomer(null);
              setError("Your session expired. Please sign in again to view your case.");
              return;
            }
            if (res.status === 404) {
              try { sessionStorage.removeItem("drivable-last-case-id"); sessionStorage.removeItem("drivable-last-case-origin"); } catch {}
            }
            return;
          }
          const body = await res.json().catch(() => null);
          if (body && typeof body.id === "string") {
            toast({ title: "Case Restored", description: "Your previous case has been restored." });
          }
        })
        .catch((err) => {
          window.clearTimeout(timeoutId);
          if (err.name === "AbortError") {
            setError("Couldn't verify your saved case (timeout). Your Case ID is preserved for retry.");
          } else {
            setError("Couldn't verify your saved case (network issue). Your Case ID is preserved for retry.");
          }
        });
      return () => { controller.abort(); window.clearTimeout(timeoutId); };
    }
  }, [authChecked, customer, error, diagnosisId]);

  const followUpMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/follow-up`, data);
      return response.json();
    },
    onSuccess: (newDiagnosis) => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses"] });
      try { sessionStorage.setItem("drivable-last-case-id", newDiagnosis.id); sessionStorage.setItem("drivable-last-case-origin", FOLLOW_UP_ORIGIN); } catch {}
      setLocation(`/results/${newDiagnosis.id}`);
      toast({
        title: "Follow-up Submitted",
        description: "Your written details were processed. Any audio or video is evidence for human review and was not analyzed automatically.",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      setLoading(false);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze additional information",
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
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);
    setError("");
    setIsAnalyzing(true);

    const formDataToSend = new FormData();
    formDataToSend.append("additionalInfo", additionalInfo);

    if (formData.audioFile) {
      formDataToSend.append("audio", formData.audioFile);
    }

    if (formData.videoFile) {
      formDataToSend.append("video", formData.videoFile);
    }

    if (formData.capturedPhoto) {
      formDataToSend.append("photo", formData.capturedPhoto);
    }

    if (formData.vibrationData) {
      formDataToSend.append("vibrationData", JSON.stringify(formData.vibrationData));
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/diagnoses/${diagnosisId}/follow-up`, {
        method: "POST",
        body: formDataToSend,
        signal: controller.signal,
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setCustomer(null);
          setError("Your session expired. Please sign in again to submit your follow-up.");
          return;
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const retryHint = retryAfter ? ` Please wait ${retryAfter} seconds and try again.` : " Please wait a minute and try again.";
          throw new Error(`Too many requests.${retryHint}`);
        }
        if (res.status === 507) {
          try {
            const errorText = await res.text();
            if (errorText) {
              const parsed = JSON.parse(errorText) as any;
              const serverMsg = parsed?.message || parsed?.error;
              if (typeof serverMsg === "string" && serverMsg.trim()) {
                throw new Error(serverMsg);
              }
            }
          } catch {}
          throw new Error("Media evidence could not be saved. Please try again.");
        }
        try {
          const errorText = await res.text();
          if (errorText) {
            const parsed = JSON.parse(errorText) as any;
            const serverMsg = parsed?.message || parsed?.error;
            if (typeof serverMsg === "string" && serverMsg.trim()) {
              throw new Error(serverMsg);
            }
          }
        } catch {}
        if (res.status === 500) {
          throw new Error("We couldn't record your request (HTTP 500)");
        }
        throw new Error(`We couldn't record your request (HTTP ${res.status}). Please try again.`);
      }

      let data: any;
      const responseText = await res.text();
      if (!responseText.trim()) { throw new Error("empty"); }
      try { data = JSON.parse(responseText); } catch { throw new Error("We received a response we couldn't read. Please try again."); }

      await followUpMutation.mutateAsync(formDataToSend);
    } catch (err: any) { setError(err?.name === "AbortError" ? `Request timed out after ${SUBMISSION_TIMEOUT_MS / 1000} seconds. Please try again.` : err.message || String(err)); window.scrollTo({ top: 0, behavior: "smooth" }); } finally { window.clearTimeout(timeoutId); setLoading(false); setIsAnalyzing(false); } };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && !file.type.startsWith("audio/")) {
      toast({ title: "Invalid File Type", description: "Please select an audio file.", variant: "destructive" });
      return;
    }
    setFormData((prev) => ({ ...prev, audioFile: file }));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && !file.type.startsWith("video/")) {
      toast({ title: "Invalid File Type", description: "Please select a video file.", variant: "destructive" });
      return;
    }
    setFormData((prev) => ({ ...prev, videoFile: file }));
  };

  const handleVibrationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && !file.type.match(/^(application\/octet-stream|text\/|application\/json)/) && !file.name.endsWith(".bin") && !file.name.endsWith(".json") && !file.name.endsWith(".txt")) {
      toast({ title: "Invalid File Type", description: "Please select a vibration data file (.bin, .json, .txt).", variant: "destructive" });
      return;
    }
    setFormData((prev) => ({ ...prev, vibrationData: file }));
  };

  const clearFile = (field: keyof typeof formData) => {
    setFormData((prev) => ({ ...prev, [field]: null }));
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
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm" role="alert">
                {error}
              </div>
            )}

            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-automotive-orange bg-opacity-10 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-automotive-orange" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Need Another Fix?</h2>
                <p className="text-gray-600">Let's gather more details to find a better solution</p>
              </div>
            </div>

            {/* Original Diagnosis Summary */}
            {originalDiagnosis && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">Previous Diagnosis:</h3>
                <p className="text-blue-800">{originalDiagnosis.primaryDiagnosis?.title}</p>
                <p className="text-blue-700 text-sm mt-1">{originalDiagnosis.primaryDiagnosis?.description}</p>
              </div>
            )}

            {/* Questions to Answer */}
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
                  inputMode="text"
                  placeholder="Please tell me: Which fixes did you try? What happened? Any new symptoms? What tools did you use? How did the problem change (if at all)?"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {additionalInfo.length}/20 characters minimum
                </div>
              </div>
            </div>

            {/* Optional: Additional Files */}
            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Optional: Audio, Video, or Vibration Evidence
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                Audio, video, and vibration files can be saved for a human reviewer. Automated analysis is not available yet.
              </p>
              <UploadTabs formData={formData} setFormData={setFormData} />

              <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
                {/* Audio File Input */}
                <div>
                  <Label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                    <Mic className="w-4 h-4 text-automotive-orange" />
                    <span>Audio Recording</span>
                  </Label>
                  <div className="flex items-center space-x-4">
                    <Input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioChange}
                      className="flex-1"
                      inputMode="none"
                    />
                    {formData.audioFile && (
                      <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <FileIcon className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-800 truncate max-w-[200px]">{formData.audioFile.name}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => clearFile("audioFile")} className="text-green-600 hover:bg-green-100">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Supported: MP3, WAV, M4A, OGG</p>
                </div>

                {/* Video File Input */}
                <div>
                  <Label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                    <Video className="w-4 h-4 text-automotive-orange" />
                    <span>Video Recording</span>
                  </Label>
                  <div className="flex items-center space-x-4">
                    <Input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoChange}
                      className="flex-1"
                      inputMode="none"
                    />
                    {formData.videoFile && (
                      <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <FileIcon className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-800 truncate max-w-[200px]">{formData.videoFile.name}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => clearFile("videoFile")} className="text-green-600 hover:bg-green-100">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Supported: MP4, MOV, WebM</p>
                </div>

                {/* Vibration Data Input */}
                <div>
                  <Label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                    <Vibrate className="w-4 h-4 text-automotive-orange" />
                    <span>Vibration / Motion Data</span>
                  </Label>
                  <div className="flex items-center space-x-4">
                    <Input
                      type="file"
                      accept=".bin,.json,.txt,application/octet-stream,text/*"
                      onChange={handleVibrationChange}
                      className="flex-1"
                      inputMode="none"
                    />
                    {formData.vibrationData && (
                      <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <FileIcon className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-800 truncate max-w-[200px]">{formData.vibrationData.name}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => clearFile("vibrationData")} className="text-green-600 hover:bg-green-100">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Supported: .bin (raw sensor data), .json (structured), .txt</p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-6 border-t border-gray-200">
              <Button
                onClick={handleSubmitFollowUp}
                disabled={followUpMutation.isPending || (loading) || additionalInfo.length < 20}
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