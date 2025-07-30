import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, TriangleAlert, DollarSign, MapPin, Download, RotateCcw, Wrench, Clock, ChevronDown, RefreshCw, Phone } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Diagnosis } from "@shared/schema";

interface DiagnosisResultsProps {
  diagnosis: Diagnosis;
}

export function DiagnosisResults({ diagnosis }: DiagnosisResultsProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showNeedMoreHelp, setShowNeedMoreHelp] = useState(false);
  
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high priority":
        return "text-red-500";
      case "medium priority":
        return "text-yellow-500";
      case "low priority":
        return "text-green-500";
      default:
        return "text-gray-500";
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high priority":
        return "destructive";
      case "medium priority":
        return "default";
      case "low priority":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Diagnosis Complete</h2>
            <div className="flex items-center space-x-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Analysis Successful</span>
            </div>
          </div>
          
          {/* Primary Diagnosis */}
          {diagnosis.primaryDiagnosis && (
            <div className="bg-gradient-to-r from-automotive-blue to-blue-600 text-white rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold mb-2">Primary Diagnosis</h3>
                  <p className="text-blue-100">Most likely cause based on your data</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{diagnosis.primaryDiagnosis.confidence}%</div>
                  <div className="text-blue-200 text-sm">Confidence</div>
                </div>
              </div>
              
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-2">{diagnosis.primaryDiagnosis.title}</h4>
                <p className="text-blue-100 mb-3">{diagnosis.primaryDiagnosis.description}</p>
                
                <div className="flex items-center space-x-4 text-sm mb-4">
                  <div className="flex items-center space-x-1">
                    <TriangleAlert className="w-4 h-4 text-yellow-300" />
                    <span>{diagnosis.primaryDiagnosis.severity}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-4 h-4 text-green-300" />
                    <span>{diagnosis.primaryDiagnosis.cost}</span>
                  </div>
                  {diagnosis.primaryDiagnosis.estimatedTime && (
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4 text-blue-300" />
                      <span>{diagnosis.primaryDiagnosis.estimatedTime}</span>
                    </div>
                  )}
                </div>

                {diagnosis.primaryDiagnosis.instructions && diagnosis.primaryDiagnosis.instructions.length > 0 && (
                  <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between text-white hover:bg-white hover:bg-opacity-20">
                        <div className="flex items-center space-x-2">
                          <Wrench className="w-4 h-4" />
                          <span>Step-by-Step Fix Instructions</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4">
                      <div className="bg-white bg-opacity-5 rounded-lg p-4">
                        <h5 className="font-semibold mb-3">How to Fix This Issue:</h5>
                        <ol className="space-y-2 text-sm">
                          {diagnosis.primaryDiagnosis.instructions.map((instruction, index) => (
                            <li key={index} className="flex items-start space-x-2">
                              <span className="bg-automotive-orange text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">
                                {index + 1}
                              </span>
                              <span className="text-blue-100">{instruction}</span>
                            </li>
                          ))}
                        </ol>
                        
                        {diagnosis.primaryDiagnosis.requiredTools && diagnosis.primaryDiagnosis.requiredTools.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-white border-opacity-20">
                            <h6 className="font-semibold mb-2">Required Tools:</h6>
                            <div className="flex flex-wrap gap-2">
                              {diagnosis.primaryDiagnosis.requiredTools.map((tool, index) => (
                                <Badge key={index} variant="secondary" className="bg-white bg-opacity-20 text-blue-100">
                                  {tool}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          )}

          {/* Alternative Scenarios */}
          {diagnosis.alternativeScenarios && diagnosis.alternativeScenarios.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Alternative Possibilities</h3>
              
              {diagnosis.alternativeScenarios.map((scenario, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-automotive-orange transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{scenario.title}</h4>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-automotive-gray">{scenario.confidence}%</div>
                      <div className="text-xs text-gray-500">Confidence</div>
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm mb-2">{scenario.description}</p>
                  <div className="flex items-center space-x-3 text-xs">
                    <Badge variant={getSeverityBadgeVariant(scenario.severity)} className="text-xs">
                      {scenario.severity}
                    </Badge>
                    <span className="text-gray-500">{scenario.cost}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vehicle Information */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Analysis Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Vehicle:</span>
                <div className="font-medium">{diagnosis.vehicleInfo}</div>
              </div>
              <div>
                <span className="text-gray-500">Issue Timing:</span>
                <div className="font-medium capitalize">{diagnosis.timing}</div>
              </div>
              <div>
                <span className="text-gray-500">Analysis Date:</span>
                <div className="font-medium">
                  {diagnosis.createdAt && new Intl.DateTimeFormat('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }).format(new Date(diagnosis.createdAt))}
                </div>
              </div>
            </div>
          </div>

          {/* Need More Help Section */}
          {!diagnosis.isResolved && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 mb-2">Didn't Fix the Problem?</h4>
                <p className="text-yellow-700 text-sm mb-4">
                  If the suggested fixes didn't work, I can gather more detailed information to provide better solutions.
                </p>
                
                <Collapsible open={showNeedMoreHelp} onOpenChange={setShowNeedMoreHelp}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between border-yellow-300 text-yellow-800 hover:bg-yellow-100">
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="w-4 h-4" />
                        <span>Need Another Fix - Get More Help</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showNeedMoreHelp ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <div className="space-y-3">
                      {diagnosis.additionalQuestions && diagnosis.additionalQuestions.length > 0 && (
                        <div className="bg-white rounded border p-3">
                          <h5 className="font-medium text-gray-900 mb-2">I need more details to help you better:</h5>
                          <ul className="space-y-1 text-sm text-gray-700">
                            {diagnosis.additionalQuestions.map((question, index) => (
                              <li key={index} className="flex items-start space-x-2">
                                <span className="text-automotive-orange font-bold">•</span>
                                <span>{question}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Link href={`/follow-up/${diagnosis.id}`}>
                        <Button className="w-full bg-automotive-orange hover:bg-orange-600 text-white">
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Provide More Details for Better Diagnosis
                        </Button>
                      </Link>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}

          {/* Subscription-based Mechanic Consultation */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2">Still Need Help? Talk to a Real Mechanic</h4>
              <p className="text-green-700 text-sm mb-4">
                Get personalized guidance from certified mechanics who can walk you through the repair step-by-step.
              </p>
              <div className="flex items-center justify-between">
                <div className="text-sm text-green-600">
                  <span className="font-medium">Expert Tier</span> - Live mechanic consultation included
                </div>
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  <Phone className="w-4 h-4 mr-2" />
                  Consult Mechanic
                </Button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button className="bg-automotive-orange hover:bg-orange-600 text-white">
                <MapPin className="w-4 h-4 mr-2" />
                Find Mechanics
              </Button>
              <Button variant="outline" className="border-automotive-blue text-automotive-blue hover:bg-blue-50">
                <Download className="w-4 h-4 mr-2" />
                Save Report
              </Button>
              <Link href="/diagnosis">
                <Button variant="outline" className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  New Analysis
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
