import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, CheckCircle, Clock, Loader2 } from "lucide-react";

export function AnalysisProgress() {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { label: "Processing audio data", completed: false },
    { label: "Matching sound patterns", completed: false },
    { label: "Generating diagnosis", completed: false },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + Math.random() * 15;
        
        if (newProgress >= 33 && currentStep < 1) {
          setCurrentStep(1);
        } else if (newProgress >= 66 && currentStep < 2) {
          setCurrentStep(2);
        }
        
        return Math.min(newProgress, 95);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-automotive-orange bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="w-8 h-8 text-automotive-orange animate-spin" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Your Vehicle</h2>
          <p className="text-gray-600 mb-8">Our AI is processing your data to identify the issue</p>
          
          {/* Progress Steps */}
          <div className="space-y-4 max-w-md mx-auto">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isActive = index === currentStep;
              const isPending = index > currentStep;
              
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
                    {isCompleted ? "Complete" : isActive ? "In progress" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Progress Bar */}
          <div className="mt-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Analysis Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-automotive-orange h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
