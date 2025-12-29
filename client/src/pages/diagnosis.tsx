import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { UploadTabs } from "@/components/upload-tabs";
import { AnalysisProgress } from "@/components/analysis-progress";
import { apiRequest } from "@/lib/queryClient";

export default function Diagnosis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    vehicleInfo: "",
    timing: "",
    audioFile: null as File | null,
    videoFile: null as File | null,
    vibrationData: null as any,
  });

  const createDiagnosisMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/diagnoses", data);
      return response.json();
    },
    onSuccess: (diagnosis) => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses"] });
      setLocation(`/results/${diagnosis.id}`);
      toast({
        title: "Analysis Complete",
        description: "Your vehicle diagnosis is ready!",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze vehicle data",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = async () => {
    // Validate required fields
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

    // Create FormData for file upload
    const formDataToSend = new FormData();
    formDataToSend.append("description", formData.description);
    formDataToSend.append("vehicleInfo", formData.vehicleInfo);
    formDataToSend.append("timing", formData.timing);
    
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
              <h2 className="text-2xl font-bold text-gray-900">Vehicle Diagnosis</h2>
              <div className="flex items-center space-x-2 text-sm text-automotive-gray">
                <span className="text-automotive-orange">🛡️</span>
                <span>Secure Analysis</span>
              </div>
            </div>
            
            {/* Progress Steps */}
            <div className="flex items-center space-x-4 mb-8">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-automotive-orange text-white rounded-full flex items-center justify-center text-sm font-semibold">1</div>
                <span className="ml-2 text-automotive-orange font-medium">Upload Data</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-semibold">2</div>
                <span className="ml-2 text-gray-500">Analysis</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-semibold">3</div>
                <span className="ml-2 text-gray-500">Results</span>
              </div>
            </div>

            <UploadTabs formData={formData} setFormData={setFormData} />

            {/* Submit Button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <Button 
                onClick={handleAnalyze}
                disabled={createDiagnosisMutation.isPending}
                className="w-full bg-automotive-blue hover:bg-blue-800 text-white py-4 px-6 rounded-xl font-semibold text-lg"
              >
                🔍 Analyze Vehicle Issue
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}
