import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Clock, Loader2, Shield } from "lucide-react";

interface AnalysisProgressProps {
  uploadProgress?: number;
}

export function AnalysisProgress({ uploadProgress = 0 }: AnalysisProgressProps) {
  const progress = uploadProgress;

  const steps = [
    { label: "Uploading your evidence", threshold: 0 },
    { label: "Verifying file integrity", threshold: 50 },
    { label: "Storing evidence securely", threshold: 85 },
  ];

  const currentStepIndex = steps.findIndex((step, index) => {
    const nextThreshold = steps[index + 1]?.threshold ?? 100;
    return progress >= step.threshold && progress < nextThreshold;
  });

  const safeCurrentStepIndex = currentStepIndex === -1 ? steps.length - 1 : currentStepIndex;

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-automotive-blue bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-automotive-blue animate-spin" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Storing Your Evidence</h2>
          <p className="text-gray-600 mb-8">
            Your photos, audio, and video are being saved securely. Evidence is not analyzed yet.
          </p>

          {/* Progress Steps */}
          <div className="space-y-4 max-w-md mx-auto">
            {steps.map((step, index) => {
              const isCompleted = index < safeCurrentStepIndex;
              const isActive = index === safeCurrentStepIndex && progress < 100;
              const isPending = index > safeCurrentStepIndex;

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    isCompleted
                      ? "bg-green-50 border-green-200"
                      : isActive
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : isActive ? (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    ) : (
                      <Clock className="w-5 h-5 text-gray-400" />
                    )}
                    <span className={`font-medium ${
                      isCompleted
                        ? "text-green-800"
                        : isActive
                        ? "text-blue-800"
                        : "text-gray-600"
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  <span className={`text-sm ${
                    isCompleted
                      ? "text-green-600"
                      : isActive
                      ? "text-blue-600"
                      : "text-gray-500"
                  }`}>
                    {isCompleted ? "Done" : isActive ? "In progress" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="mt-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Evidence Storage Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-automotive-blue h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              ></div>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Your evidence is stored privately. It will not be analyzed until a mechanic or reviewer reviews it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
