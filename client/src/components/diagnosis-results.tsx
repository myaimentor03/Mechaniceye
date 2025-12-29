import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, TriangleAlert, DollarSign, MapPin, Download, RotateCcw, Wrench, Clock, ChevronDown, RefreshCw, Phone } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { featureFlags } from "@/lib/featureFlags";
import { ComingSoon } from "./coming-soon";
import { ConfidenceTracker } from "./confidence-tracker";
import { StepByStepRepair } from "./step-by-step-repair";
import { FixHistoryLogComponent } from "./fix-history-log";
import { ChatExport } from "./chat-export";
import type { Diagnosis } from "@shared/schema";

interface DiagnosisResultsProps {
  diagnosis: Diagnosis;
}

export function DiagnosisResults({ diagnosis }: DiagnosisResultsProps) {
  const { toast } = useToast();
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

          {/* Confidence Score Tracker */}
          <ConfidenceTracker diagnosis={diagnosis} />
        </CardContent>
      </Card>

      {/* Main Tabbed Interface */}
      <Tabs defaultValue="diagnosis" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
          <TabsTrigger value="repair">Step-by-Step{!featureFlags.stepByStepRepair ? " (Soon)" : ""}</TabsTrigger>
          <TabsTrigger value="history">Fix History{!featureFlags.fixHistory ? " (Soon)" : ""}</TabsTrigger>
          <TabsTrigger value="export">Export{!featureFlags.chatExport ? " (Soon)" : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnosis" className="space-y-6 mt-6">
          {/* Primary Diagnosis */}
          {diagnosis.primaryDiagnosis && (
            <div className="bg-gradient-to-r from-automotive-blue to-blue-600 text-white rounded-xl p-6">
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
                
                <div className="flex items-center space-x-4 text-sm">
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
        
          {/* Repair Guide Escape Hatch */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Need help fixing it?</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate a repair guide tailored to this diagnosis and your vehicle. (Included with paid diagnoses and subscriptions.)
                  </p>
                </div>
                <Badge variant="secondary">Guide</Badge>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  // Launch version: keep the button visible but gated.
                  // Weâ€™ll wire this to the server-side guide generator once payments are live.
                  toast({ title: "Repair guides are coming soon", description: "This will generate and email you a step-by-step guide for your exact issue." });
                }}
                disabled={!featureFlags.repairGuideGenerator}
              >
                Generate Repair Guide{!featureFlags.repairGuideGenerator ? " (Soon)" : ""}
              </Button>
              {!featureFlags.repairGuideGenerator ? (
                <p className="text-xs text-muted-foreground">
                  Coming soon: one-click guide generation and email delivery, bundled with your diagnosis.
                </p>
              ) : null}
            </CardContent>
          </Card>
</TabsContent>

        <TabsContent value="repair" className="space-y-6 mt-6">
          {featureFlags.stepByStepRepair ? (
            <StepByStepRepair diagnosis={diagnosis} />
          ) : (
            <ComingSoon
              title="Step-by-Step Repair Guides"
              description="Personalized repair steps matched to your vehicle and diagnosis."
             items={[
  "Tools list and difficulty rating",
  "Step-by-step instructions",
]}

 
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6 mt-6">
          {featureFlags.fixHistory ? (
            <FixHistoryLogComponent diagnosisId={diagnosis.id} />
          ) : (
            <ComingSoon
              title="Fix History"
              description="Log what you tried, what worked, and what didn't. Useful for DIYers and mechanics."
              items={[
  { title: "Tools list and difficulty rating", description: "Step-by-step instructions" },
]}

            />
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-6 mt-6">
          {featureFlags.chatExport ? (
            <ChatExport diagnosisId={diagnosis.id} diagnosis={diagnosis} />
          ) : (
            <ComingSoon
              title="Export for Mechanic Review"
              description="Share a clean report with a mechanic when you want a second opinion."
items={["Download a shareable report","Include your inputs and results","Bring it to a shop with confidence"]}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-6">
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
        </CardContent>
      </Card>
    </div>
  );
}




