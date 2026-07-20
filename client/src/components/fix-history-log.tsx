import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, XCircle, Clock, ChevronDown, FileText, Download } from "lucide-react";
import type { FixHistoryLog, Diagnosis } from "@shared/schema";

interface FixHistoryLogProps {
  diagnosisId: string;
}

export function FixHistoryLogComponent({ diagnosisId }: FixHistoryLogProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: historyLog, isLoading } = useQuery<FixHistoryLog[]>({
    queryKey: ["/api/fix-history", diagnosisId],
  });

  const { data: diagnosis } = useQuery<Diagnosis>({
    queryKey: ["/api/diagnoses", diagnosisId],
  });

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return { label: "High", variant: "default" as const, color: "bg-green-100 text-green-800" };
    if (confidence >= 60) return { label: "Medium", variant: "secondary" as const, color: "bg-yellow-100 text-yellow-800" };
    return { label: "Low", variant: "outline" as const, color: "bg-red-100 text-red-800" };
  };

  const getInputTypes = () => {
    if (!diagnosis) return [];
    const types = [];
    if (diagnosis.audioFile) types.push("Audio");
    if (diagnosis.videoFile) types.push("Video");
    if (diagnosis.vibrationData) types.push("Vibration");
    if (diagnosis.description) types.push("Description");
    return types;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-automotive-orange" />
            Fix History Log
          </h3>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Current Diagnosis Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-blue-900 mb-2">Current Session</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-blue-700 mb-1">Inputs Used:</div>
              <div className="flex flex-wrap gap-2">
                {getInputTypes().map((type) => (
                  <Badge key={type} variant="secondary" className="bg-blue-100 text-blue-800">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-blue-700 mb-1">AI Suggestions:</div>
              <div className="text-blue-900 font-medium">
                3 solutions provided
              </div>
            </div>
          </div>
          
          {diagnosis?.primaryDiagnosis && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="text-sm text-blue-700 mb-1">Primary Diagnosis:</div>
              <div className="font-medium text-blue-900">{diagnosis.primaryDiagnosis.title}</div>
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={getConfidenceBadge(diagnosis.primaryDiagnosis.confidence).color}>
                  {getConfidenceBadge(diagnosis.primaryDiagnosis.confidence).label} Confidence
                </Badge>
                <span className="text-sm text-blue-700">
                  {diagnosis.primaryDiagnosis.confidence}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Previous Attempts */}
        {historyLog && historyLog.length > 0 ? (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Previous Attempts</h4>
            {historyLog.map((attempt) => {
              const isExpanded = expandedItems.has(attempt.id);
              const confidence = attempt.suggestedFix?.confidence || 0;
              const badge = getConfidenceBadge(confidence);
              
              return (
                <Collapsible
                  key={attempt.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(attempt.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="w-full p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            {attempt.wasSuccessful ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            <span className="font-medium text-gray-900">
                              Attempt #{attempt.attemptNumber}
                            </span>
                          </div>
                          <Badge className={badge.color}>
                            {badge.label}
                          </Badge>
                          {attempt.timeSpent && (
                            <div className="flex items-center text-sm text-gray-600">
                              <Clock className="w-4 h-4 mr-1" />
                              {attempt.timeSpent}min
                            </div>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                      <div className="mt-2 text-left">
                        <div className="font-medium text-gray-800">
                          {attempt.suggestedFix?.title || 'Unknown Fix'}
                        </div>
                        <div className="text-sm text-gray-600">
                          {attempt.wasSuccessful ? 'Fixed the problem' : 'Did not resolve the issue'}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-2 mx-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                      {attempt.suggestedFix?.description && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Description:</h5>
                          <p className="text-gray-700 text-sm">{attempt.suggestedFix.description}</p>
                        </div>
                      )}
                      
                      {attempt.suggestedFix?.instructions && attempt.suggestedFix.instructions.length > 0 && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Instructions:</h5>
                          <ol className="space-y-1 text-sm">
                            {attempt.suggestedFix.instructions.map((instruction, index) => {
                              const isCompleted = attempt.stepsCompleted?.includes(index);
                              return (
                                <li key={index} className={`flex items-start space-x-2 ${isCompleted ? 'text-green-700' : 'text-gray-700'}`}>
                                  <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                                    isCompleted 
                                      ? 'bg-green-100 border-green-500 text-green-700' 
                                      : 'border-gray-300 text-gray-500'
                                  }`}>
                                    {isCompleted ? '✓' : index + 1}
                                  </span>
                                  <span className={isCompleted ? 'line-through' : ''}>{instruction}</span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                      
                      {attempt.userFeedback && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">User Feedback:</h5>
                          <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded">
                            {attempt.userFeedback}
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No previous attempts yet. This is your first diagnosis!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}