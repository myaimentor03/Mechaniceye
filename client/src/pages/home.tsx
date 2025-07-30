import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Battery, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import type { Diagnosis } from "@shared/schema";

export default function Home() {
  const { data: recentDiagnoses, isLoading } = useQuery<Diagnosis[]>({
    queryKey: ["/api/diagnoses/recent"],
  });

  const getIconForDiagnosis = (title: string) => {
    if (title.toLowerCase().includes('battery')) return Battery;
    if (title.toLowerCase().includes('brake') || title.toLowerCase().includes('engine')) return AlertCircle;
    return Wrench;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-automotive-blue to-blue-600 text-white rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-2">Welcome to Mechanic's Eye</h2>
          <p className="text-blue-100 mb-4">
            AI-powered vehicle diagnostics at your fingertips. Upload audio, video, or describe your vehicle issue for instant analysis.
          </p>
          <Link href="/diagnosis">
            <Button className="bg-automotive-orange hover:bg-orange-600 text-white font-semibold">
              Start New Diagnosis
            </Button>
          </Link>
        </div>

        {/* Recent Diagnoses */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Diagnoses</h3>
            
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !recentDiagnoses || recentDiagnoses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Wrench className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No diagnoses yet. Start your first analysis above!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDiagnoses.map((diagnosis) => {
                  const IconComponent = getIconForDiagnosis(diagnosis.primaryDiagnosis?.title || '');
                  return (
                    <Link key={diagnosis.id} href={`/results/${diagnosis.id}`}>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-automotive-orange bg-opacity-10 rounded-lg flex items-center justify-center">
                            <IconComponent className="w-5 h-5 text-automotive-orange" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {diagnosis.primaryDiagnosis?.title || 'Unknown Issue'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {diagnosis.createdAt && new Intl.DateTimeFormat('en-US', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              }).format(new Date(diagnosis.createdAt))} • {diagnosis.vehicleInfo}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-automotive-blue">
                            {diagnosis.primaryDiagnosis?.confidence || 0}%
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <BottomNavigation currentPage="home" />
    </div>
  );
}
