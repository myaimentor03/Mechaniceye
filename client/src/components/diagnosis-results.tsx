import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Download, RotateCcw, MapPin, Camera, Mic, Video, Waves } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { featureFlags } from "@/lib/featureFlags";
import { ComingSoon } from "./coming-soon";
import { StepByStepRepair } from "./step-by-step-repair";
import { FixHistoryLogComponent } from "./fix-history-log";
import { ChatExport } from "./chat-export";
import { EvidenceVerificationPanel } from "./EvidenceVerificationPanel";
import type { Diagnosis } from "@shared/schema";

const EVIDENCE_STATUS = "uploaded_not_analyzed";

interface EvidenceSummary {
  photos: { provided: number; persisted: number; status: string };
  audio: { provided: number; persisted: number; status: string };
  video: { provided: number; persisted: number; status: string };
  vibration: { provided: number; persisted: number; status: string };
}

interface DiagnosisResultsProps {
  diagnosis: Diagnosis & {
    attachments?: Array<{ kind: string }>;
    evidenceSummary?: EvidenceSummary;
  };
}

export function DiagnosisResults({ diagnosis }: DiagnosisResultsProps) {
  const { toast } = useToast();
  const summary = diagnosis.evidenceSummary;
  const attachments = diagnosis.attachments ?? [];
  const photoCount = summary?.photos?.persisted ?? attachments.filter((a) => a.kind === "photo").length ?? 0;
  const audioCount = summary?.audio?.persisted ?? attachments.filter((a) => a.kind === "audio").length ?? 0;
  const videoCount = summary?.video?.persisted ?? attachments.filter((a) => a.kind === "video").length ?? 0;
  const vibrationCount = summary?.vibration?.persisted ?? attachments.filter((a) => a.kind === "sensor_session").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Case Evidence</h2>
            <div className="flex items-center space-x-2 text-sm text-blue-600">
              <Shield className="w-4 h-4" />
              <span>Evidence {attachments.length > 0 ? `Stored (${attachments.length} file(s))` : "Not Provided"}</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-1">Your evidence has been saved securely.</p>
            <p className="text-blue-700 text-sm">
              Photos, audio, video, and vibration data are stored with this case. Evidence has not been analyzed.
              A mechanic or reviewer will review your evidence before any diagnosis is prepared.
            </p>
          </div>

          {/* Evidence Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{photoCount}</div>
              <div className="text-xs text-gray-500">Photos {photoCount > 0 ? `✓` : "—"}</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{audioCount}</div>
              <div className="text-xs text-gray-500">Audio {audioCount > 0 ? `✓` : "—"}</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{videoCount}</div>
              <div className="text-xs text-gray-500">Video {videoCount > 0 ? `✓` : "—"}</div>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{vibrationCount}</div>
              <div className="text-xs text-gray-500">Vibration {vibrationCount > 0 ? `✓` : "—"}</div>
            </div>
          </div>
          {attachments.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 font-medium mb-1">Evidence stored and awaiting review.</p>
              <p className="text-green-700 text-sm">
                {attachments.length} file(s) captured across {new Set(attachments.map((a) => a.kind)).size} modality/modalities.
                All evidence is stored privately and has not been analyzed by any AI. A human reviewer will examine it before any diagnosis is prepared.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Tabbed Interface */}
      <Tabs defaultValue="diagnosis" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="repair">Step-by-Step{!featureFlags.stepByStepRepair ? " (Soon)" : ""}</TabsTrigger>
          <TabsTrigger value="history">Fix History{!featureFlags.fixHistory ? " (Soon)" : ""}</TabsTrigger>
          <TabsTrigger value="export">Export{!featureFlags.chatExport ? " (Soon)" : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnosis" className="space-y-6 mt-6">
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
                    <span>{diagnosis.primaryDiagnosis.severity}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>{diagnosis.primaryDiagnosis.cost}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                </div>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Need help fixing it?</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate a repair guide tailored to this diagnosis and your vehicle.
                  </p>
                </div>
                <Badge variant="secondary">Guide</Badge>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  toast({ title: "Repair guides are coming soon", description: "This will generate and email you a step-by-step guide for your exact issue." });
                }}
                disabled={!featureFlags.repairGuideGenerator}
              >
                Generate Repair Guide{!featureFlags.repairGuideGenerator ? " (Soon)" : ""}
              </Button>
              {!featureFlags.repairGuideGenerator ? (
                <p className="text-xs text-muted-foreground">
                  Coming soon: one-click guide generation and email delivery.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-6 mt-6">
          <EvidenceVerificationPanel caseId={diagnosis.id} />
        </TabsContent>

        <TabsContent value="repair" className="space-y-6 mt-6">
          {featureFlags.stepByStepRepair ? (
            <StepByStepRepair
              diagnosisId={diagnosis.id}
              suggestion={{
                title: "Review repair guidance carefully",
                description: "Confirm the evidence and use professional repair guidance before attempting repairs.",
                confidence: 0.6,
                severity: "medium",
                cost: "Varies",
                instructions: ["Review the diagnosis result.", "Confirm the evidence before starting work."],
                requiredTools: [],
                estimatedTime: "Varies"
              }}
              suggestionIndex={0}
            />
          ) : (
            <ComingSoon title="Step-by-Step Repair Guides" description="Personalized repair steps matched to your vehicle and diagnosis." />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6 mt-6">
          {featureFlags.fixHistory ? (
            <FixHistoryLogComponent diagnosisId={diagnosis.id} />
          ) : (
            <ComingSoon title="Fix History" description="Log what you tried, what worked, and what didn't." />
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-6 mt-6">
          {featureFlags.chatExport ? (
            <ChatExport diagnosisId={diagnosis.id} diagnosis={diagnosis} />
          ) : (
            <ComingSoon title="Export for Mechanic Review" description="Share a clean report with a mechanic when you want a second opinion." />
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
