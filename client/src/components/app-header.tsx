import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Wrench, History, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { featureFlags } from "@/lib/featureFlags";

export function AppHeader() {
  const { toast } = useToast();
  return (
    <header className="bg-automotive-blue text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-automotive-orange rounded-lg flex items-center justify-center">
              <Wrench className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Mechanic's Eye</h1>
              <p className="text-blue-200 text-sm">AI Vehicle Diagnostics</p>
            </div>
          </Link>
          <div className="hidden md:flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-blue-700"
              onClick={() => toast({ title: "Coming Soon", description: "History will let you save past diagnoses and vehicles." })}
              disabled={!featureFlags.history}
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-blue-700"
              onClick={() => toast({ title: "Coming Soon", description: "Profiles will unlock saved vehicles, subscriptions, and settings." })}
              disabled={!featureFlags.profile}
            >
              <UserCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
