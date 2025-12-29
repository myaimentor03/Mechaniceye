import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import type { Diagnosis } from "@shared/schema";

interface ConfidenceTrackerProps {
  diagnosis: Diagnosis;
  previousConfidence?: number;
}

export function ConfidenceTracker({ diagnosis, previousConfidence }: ConfidenceTrackerProps) {
  const currentConfidence = diagnosis.confidenceScore || diagnosis.primaryDiagnosis?.confidence || 0;
  const confidenceLevel = diagnosis.confidenceLevel || getConfidenceLevel(currentConfidence);
  
  function getConfidenceLevel(score: number): string {
    if (score >= 80) return "high";
    if (score >= 60) return "medium";
    return "low";
  }

  function getConfidenceColor(level: string) {
    switch (level) {
      case "high": return "text-green-600 bg-green-50 border-green-200";
      case "medium": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  }

  function getConfidenceIcon(level: string) {
    switch (level) {
      case "high": return Target;
      case "medium": return AlertTriangle;
      case "low": return AlertTriangle;
      default: return Target;
    }
  }

  const hasImproved = previousConfidence && currentConfidence > previousConfidence;
  const hasDeclined = previousConfidence && currentConfidence < previousConfidence;
  
  const Icon = getConfidenceIcon(confidenceLevel);

  return (
    <Card className={`border-2 ${getConfidenceColor(confidenceLevel).split(' ')[2]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getConfidenceColor(confidenceLevel)}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Confidence Score</div>
              <div className="text-sm text-gray-600">
                Based on input quality and system analysis
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-gray-900">
                {currentConfidence}%
              </span>
              {previousConfidence && (
                <div className="flex items-center">
                  {hasImproved && (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  )}
                  {hasDeclined && (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            <Badge className={getConfidenceColor(confidenceLevel)}>
              {confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)} Confidence
            </Badge>
          </div>
        </div>
        
        {/* Confidence Bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                confidenceLevel === 'high' ? 'bg-green-500' :
                confidenceLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${currentConfidence}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Improvement Tips */}
        {confidenceLevel !== 'high' && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-900 mb-1">
              Tips to improve confidence:
            </div>
            <ul className="text-xs text-blue-800 space-y-1">
              {confidenceLevel === 'low' && (
                <>
                  <li>• Provide more detailed description of the problem</li>
                  <li>• Upload audio recordings of unusual sounds</li>
                  <li>• Add photos of any visible issues</li>
                </>
              )}
              {confidenceLevel === 'medium' && (
                <>
                  <li>• Add vibration data if available</li>
                  <li>• Provide more specific timing information</li>
                  <li>• Include recent maintenance history</li>
                </>
              )}
            </ul>
          </div>
        )}

        {/* Iteration Impact */}
        {diagnosis.iterationCount && diagnosis.iterationCount > 1 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-sm font-medium text-yellow-900">
              Follow-up Analysis #{diagnosis.iterationCount - 1}
            </div>
            <div className="text-xs text-yellow-800 mt-1">
              {hasDeclined 
                ? "Confidence decreased - the problem may be more complex than initially thought"
                : hasImproved 
                ? "Confidence improved with additional information!"
                : "Analyzing with new information provided"
              }
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}