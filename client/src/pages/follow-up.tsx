import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { UploadTabs } from "@/components/upload-tabs";
import { AnalysisProgress } from "@/components/analysis-progress";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { Diagnosis } from "@shared/schema";

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
    vibrationData: null as any,
  });

  const { data: originalDiagnosis, isLoading } = useQuery<Diagnosis>({
    queryKey: ["/api/diagnoses", diagnosisId],
    enabled: !!diagnosisId,
  });

  const followUpMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/follow-up`, data);
      return response.json();
    },
    onSuccess: (newDiagnosis) => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses"] });
      setLocation(`/results/${newDiagnosis.id}`);
      toast({
        title: "Follow-up Analysis Complete",
        description: "I've analyzed your additional information and found new solutions!",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
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
      return;
    }

    setIsAnalyzing(true);

    // Create FormData for file upload
    const formDataToSend = new FormData();
    formDataToSend.append("additionalInfo", additionalInfo);
    
    if (formData.audioFile) {
      formDataToSend.append("audio", formData.audioFile);
    }
    
    if (formData.videoFile) {
      formDataToSend.append("video", formData.videoFile);
    }
    
    if (formData.vibrationData) {
      formDataToSend.append("vibrationData", JSON.stringify(formData.vibrationData));
    }

    // Simulate analysis delay for better UX
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
                Optional: Additional Audio, Video, or Vibration Data
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                If you have new sounds, videos, or noticed different vibrations, please upload them.
              </p>
              <UploadTabs formData={formData} setFormData={setFormData} />
            </div>

            {/* Submit Button */}
            <div className="pt-6 border-t border-gray-200">
              <Button 
                onClick={handleSubmitFollowUp}
                disabled={followUpMutation.isPending || additionalInfo.length < 20}
                className="w-full bg-automotive-orange hover:bg-orange-600 text-white py-4 px-6 rounded-xl font-semibold text-lg"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Get New Diagnosis Based on Additional Info
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}