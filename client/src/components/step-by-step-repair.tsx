import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  CheckCircle, 
  Circle, 
  Clock, 
  Wrench, 
  AlertCircle, 
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  MessageSquare 
} from "lucide-react";

interface StepByStepRepairProps {
  diagnosisId: string;
  suggestion: {
    title: string;
    description: string;
    confidence: number;
    severity: string;
    cost: string;
    instructions: string[];
    requiredTools: string[];
    estimatedTime: string;
    wasSuccessful?: boolean;
    stepsCompleted?: number[];
  };
  suggestionIndex: number; // 0 for primary, 1+ for alternatives
}

export function StepByStepRepair({ diagnosisId, suggestion, suggestionIndex }: StepByStepRepairProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    new Set(suggestion.stepsCompleted || [])
  );
  const [showFeedback, setShowFeedback] = useState(false);
  const [isFixed, setIsFixed] = useState<boolean | null>(suggestion.wasSuccessful || null);
  const [timeSpent, setTimeSpent] = useState(0);
  const [startTime] = useState(Date.now());
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStepMutation = useMutation({
    mutationFn: async (data: { stepIndex: number; completed: boolean }) => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/steps`, {
        suggestionIndex,
        stepIndex: data.stepIndex,
        completed: data.completed,
        timeSpent: Math.floor((Date.now() - startTime) / 60000) // minutes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses", diagnosisId] });
    }
  });

  const markFixCompleteMutation = useMutation({
    mutationFn: async (data: { wasSuccessful: boolean; feedback?: string }) => {
      const response = await apiRequest("POST", `/api/diagnoses/${diagnosisId}/fix-complete`, {
        suggestionIndex,
        wasSuccessful: data.wasSuccessful,
        feedback: data.feedback,
        timeSpent: Math.floor((Date.now() - startTime) / 60000),
        stepsCompleted: Array.from(completedSteps)
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/diagnoses", diagnosisId] });
      toast({
        title: data.wasSuccessful ? "Great news!" : "Thanks for the feedback",
        description: data.wasSuccessful 
          ? "Your fix has been marked as successful!" 
          : "We'll use this information to improve future diagnoses.",
      });
    }
  });

  const toggleStep = (stepIndex: number) => {
    const newCompleted = new Set(completedSteps);
    const isCompleting = !newCompleted.has(stepIndex);
    
    if (isCompleting) {
      newCompleted.add(stepIndex);
    } else {
      newCompleted.delete(stepIndex);
    }
    
    setCompletedSteps(newCompleted);
    updateStepMutation.mutate({ stepIndex, completed: isCompleting });
  };

  const handleFixResult = (successful: boolean) => {
    setIsFixed(successful);
    setShowFeedback(true);
    const currentTime = Math.floor((Date.now() - startTime) / 60000);
    setTimeSpent(currentTime);
  };

  const submitFeedback = (feedback?: string) => {
    markFixCompleteMutation.mutate({
      wasSuccessful: isFixed!,
      feedback
    });
    setShowFeedback(false);
  };

  const progressPercentage = suggestion.instructions.length > 0 
    ? (completedSteps.size / suggestion.instructions.length) * 100 
    : 0;

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high priority": return "text-red-600 bg-red-50";
      case "medium priority": return "text-yellow-600 bg-yellow-50";
      case "low priority": return "text-green-600 bg-green-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <Card className="border-l-4 border-l-automotive-orange">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">
              {suggestion.title}
            </h4>
            <p className="text-gray-700 text-sm mb-3">
              {suggestion.description}
            </p>
            
            <div className="flex items-center space-x-4 text-sm">
              <Badge className={getSeverityColor(suggestion.severity)}>
                {suggestion.severity}
              </Badge>
              <div className="flex items-center space-x-1 text-gray-600">
                <DollarSign className="w-4 h-4" />
                <span>{suggestion.cost}</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{suggestion.estimatedTime}</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-600">
                <AlertCircle className="w-4 h-4" />
                <span>{suggestion.confidence}% confidence</span>
              </div>
            </div>
          </div>
        </div>

        {/* Required Tools */}
        {suggestion.requiredTools && suggestion.requiredTools.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center mb-2">
              <Wrench className="w-4 h-4 text-blue-600 mr-2" />
              <span className="font-medium text-blue-900">Required Tools:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestion.requiredTools.map((tool, index) => (
                <Badge key={index} variant="secondary" className="bg-blue-100 text-blue-800">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {suggestion.instructions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Progress: {completedSteps.size} of {suggestion.instructions.length} steps
              </span>
              <span className="text-sm text-gray-600">
                {Math.round(progressPercentage)}% complete
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        )}

        {/* Step-by-Step Instructions */}
        <div className="space-y-3 mb-6">
          <h5 className="font-medium text-gray-900">Step-by-Step Instructions:</h5>
          
          {suggestion.instructions.map((instruction, index) => {
            const isCompleted = completedSteps.has(index);
            
            return (
              <div
                key={index}
                className={`flex items-start space-x-3 p-3 rounded-lg border transition-all ${
                  isCompleted
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={() => toggleStep(index)}
                  className="mt-1"
                />
                
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`text-sm font-medium ${
                      isCompleted ? "text-green-700" : "text-gray-700"
                    }`}>
                      Step {index + 1}
                    </span>
                    {isCompleted && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <p className={`text-sm ${
                    isCompleted 
                      ? "text-green-700 line-through" 
                      : "text-gray-700"
                  }`}>
                    {instruction}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fix Result Actions */}
        {completedSteps.size > 0 && isFixed === null && (
          <div className="border-t border-gray-200 pt-4">
            <div className="text-center">
              <p className="text-gray-700 mb-4">Did this fix resolve your problem?</p>
              <div className="flex justify-center space-x-4">
                <Button
                  onClick={() => handleFixResult(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Yes, it's fixed!
                </Button>
                <Button
                  onClick={() => handleFixResult(false)}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  No, still have issues
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success/Failure Status */}
        {isFixed !== null && (
          <div className={`border-t border-gray-200 pt-4 ${
            isFixed ? "bg-green-50" : "bg-red-50"
          } -m-6 mt-4 p-6 rounded-b-lg`}>
            <div className="flex items-center justify-center">
              {isFixed ? (
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="font-medium text-green-800">Fix Successful!</p>
                  <p className="text-sm text-green-700">
                    Time spent: {timeSpent} minutes • Steps completed: {completedSteps.size}/{suggestion.instructions.length}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Circle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="font-medium text-red-800">Fix Unsuccessful</p>
                  <p className="text-sm text-red-700">
                    Don't worry - we can try alternative solutions or gather more information.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Modal */}
        {showFeedback && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <div className="flex items-center mb-4">
                <MessageSquare className="w-5 h-5 text-automotive-orange mr-2" />
                <h3 className="text-lg font-semibold">
                  {isFixed ? "Great news!" : "Tell us more"}
                </h3>
              </div>
              
              <p className="text-gray-700 mb-4">
                {isFixed 
                  ? "Would you like to share any additional details about how the fix worked?"
                  : "What happened when you tried this fix? This helps us improve future suggestions."
                }
              </p>
              
              <textarea
                placeholder={isFixed 
                  ? "Optional: Share your experience..."
                  : "Describe what happened when you tried the fix..."
                }
                className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-none"
                rows={3}
                id="feedback-text"
              />
              
              <div className="flex justify-end space-x-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => submitFeedback()}
                >
                  Skip
                </Button>
                <Button
                  onClick={() => {
                    const feedback = (document.getElementById('feedback-text') as HTMLTextAreaElement)?.value;
                    submitFeedback(feedback);
                  }}
                  className="bg-automotive-orange hover:bg-orange-600 text-white"
                >
                  Submit
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}