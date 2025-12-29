import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Download, 
  Send, 
  FileText, 
  Clock, 
  User, 
  Bot,
  CheckCircle,
  XCircle,
  Phone
} from "lucide-react";
import type { Diagnosis, FixHistoryLog } from "@shared/schema";

interface ChatExportProps {
  diagnosisId: string;
  diagnosis: Diagnosis;
}

export function ChatExport({ diagnosisId, diagnosis }: ChatExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data: fixHistory } = useQuery<FixHistoryLog[]>({
    queryKey: ["/api/fix-history", diagnosisId],
  });

  const exportChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/export-chat`);
      return response.json();
    },
    onSuccess: (data) => {
      // Create and download the export file
      const exportData = JSON.stringify(data, null, 2);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mechanic-chat-export-${diagnosisId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Chat Export Complete",
        description: "Your diagnostic history has been exported and is ready for mechanic review.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export chat history",
        variant: "destructive",
      });
    }
  });

  const sendToMechanicMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/send-to-mechanic`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sent to Mechanic",
        description: "Your complete diagnostic history has been shared with available mechanics.",
      });
    }
  });

  const generateExportPreview = () => {
    const inputTypes = [];
    if (diagnosis.audioFile) inputTypes.push("Audio");
    if (diagnosis.videoFile) inputTypes.push("Video");  
    if (diagnosis.vibrationData) inputTypes.push("Vibration");
    if (diagnosis.description) inputTypes.push("Description");

    const aiSuggestions = [
      diagnosis.primaryDiagnosis,
      ...(diagnosis.alternativeScenarios || [])
    ].filter(Boolean);

    const successfulFixes = fixHistory?.filter(h => h.wasSuccessful) || [];
    const failedFixes = fixHistory?.filter(h => !h.wasSuccessful) || [];

    return {
      inputTypes,
      aiSuggestions,
      successfulFixes: successfulFixes.length,
      failedFixes: failedFixes.length,
      totalAttempts: (fixHistory?.length || 0) + 1,
      confidenceScore: diagnosis.confidenceScore || diagnosis.primaryDiagnosis?.confidence || 0
    };
  };

  const exportPreview = generateExportPreview();

  const handleExport = () => {
    setIsExporting(true);
    exportChatMutation.mutate();
    setTimeout(() => setIsExporting(false), 2000);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-automotive-orange" />
            Mechanic Handoff Package
          </h3>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Expert Tier Feature
          </Badge>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-700">
            Export your complete diagnostic session for professional mechanic review. This includes all inputs, 
            AI suggestions, attempted fixes, and confidence scores.
          </p>

          {/* Export Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Export Contents:</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    User Inputs
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {exportPreview.inputTypes.map((type) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <Bot className="w-4 h-4 mr-2" />
                    AI Suggestions
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {exportPreview.aiSuggestions.length} solutions
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    Confidence Score
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {exportPreview.confidenceScore}%
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                    Successful Fixes
                  </span>
                  <span className="text-sm font-medium text-green-700">
                    {exportPreview.successfulFixes}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <XCircle className="w-4 h-4 mr-2 text-red-500" />
                    Failed Attempts
                  </span>
                  <span className="text-sm font-medium text-red-700">
                    {exportPreview.failedFixes}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Total Attempts
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {exportPreview.totalAttempts}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Information */}
          {diagnosis.vehicleInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-medium text-blue-900 mb-2">Vehicle Information:</h5>
              <p className="text-blue-800 text-sm">{diagnosis.vehicleInfo}</p>
              {diagnosis.timing && (
                <p className="text-blue-700 text-xs mt-1">
                  <strong>Timing:</strong> {diagnosis.timing}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={handleExport}
            disabled={isExporting || exportChatMutation.isPending}
            className="bg-automotive-orange hover:bg-orange-600 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exporting..." : "Download Export File"}
          </Button>

          <Button
            onClick={() => sendToMechanicMutation.mutate()}
            disabled={sendToMechanicMutation.isPending}
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            <Phone className="w-4 h-4 mr-2" />
            Send to Available Mechanic
          </Button>
        </div>

        {/* Export Format Info */}
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm font-medium text-yellow-900 mb-1">
            Export Format: JSON
          </div>
          <div className="text-xs text-yellow-800">
            This structured format ensures mechanics can quickly understand your complete diagnostic journey, 
            including what's been tried, what worked, and what didn't. The export is compatible with 
            professional diagnostic software.
          </div>
        </div>

        {/* Pro Tier Upgrade Notice */}
        {diagnosis.userId && (
          <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-green-900">Need Live Mechanic Support?</div>
                <div className="text-sm text-green-800 mt-1">
                  Upgrade to Expert tier for real-time video consultations with certified mechanics.
                </div>
              </div>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                Upgrade Now
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}