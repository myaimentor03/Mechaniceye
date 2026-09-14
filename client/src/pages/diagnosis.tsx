import { useState } from "react";
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

export default function Diagnosis() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    vehicleInfo: "",
    timing: "",
    audioFiles: [] as File[],
    videoFiles: [] as File[],
    photoFiles: [] as File[],
    vibrationFiles: [] as File[],
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
        title: "Case saved",
        description: "Your evidence has been stored with your case. It has not been analyzed yet.",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
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

    const formDataToSend = new FormData();
    formDataToSend.append("description", formData.description);
    formDataToSend.append("vehicleInfo", formData.vehicleInfo);
    formDataToSend.append("timing", formData.timing);

    formData.audioFiles.forEach((file) => {
      formDataToSend.append("audio", file);
    });

    formData.videoFiles.forEach((file) => {
      formDataToSend.append("video", file);
    });

    formData.photoFiles.forEach((file) => {
      formDataToSend.append("photos", file);
    });

    formData.vibrationFiles.forEach((file) => {
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
            
            {/* Progress Steps */}
            <div className="flex items-center space-x-4 mb-8">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-automotive-orange text-white rounded-full flex items-center justify-center text-sm font-semibold">1</div>
                <span className="ml-2 text-automotive-orange font-medium">Gather Evidence</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-semibold">2</div>
                <span className="ml-2 text-gray-500">Case Saved</span>
              </div>
              <div className="flex-1 h-0.5 bg-gray-200"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-semibold">3</div>
                <span className="ml-2 text-gray-500">Next Steps</span>
              </div>
            </div>

            <EvidenceCapture formData={formData} setFormData={setFormData} />

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