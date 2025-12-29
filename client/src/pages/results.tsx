import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { DiagnosisResults } from "@/components/diagnosis-results";
import type { Diagnosis } from "@shared/schema";

export default function Results() {
  const [match, params] = useRoute("/results/:id");
  const diagnosisId = params?.id;

  const { data: diagnosis, isLoading, error } = useQuery<Diagnosis>({
    queryKey: ["/api/diagnoses", diagnosisId],
    enabled: !!diagnosisId,
  });

  if (!match || !diagnosisId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Invalid Diagnosis ID</h1>
            <Link href="/">
              <Button>Return Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="h-40 bg-gray-200 rounded"></div>
                <div className="space-y-3">
                  <div className="h-20 bg-gray-200 rounded"></div>
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
        <BottomNavigation currentPage="diagnosis" />
      </div>
    );
  }

  if (error || !diagnosis) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <h1 className="text-xl font-bold text-gray-900 mb-4">Diagnosis Not Found</h1>
              <p className="text-gray-600 mb-4">The requested diagnosis could not be found.</p>
              <Link href="/">
                <Button>Return Home</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
        <BottomNavigation currentPage="diagnosis" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
        <DiagnosisResults diagnosis={diagnosis} />
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}
