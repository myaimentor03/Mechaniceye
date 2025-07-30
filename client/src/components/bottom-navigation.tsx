import { Link, useLocation } from "wouter";
import { Home, History, User } from "lucide-react";

interface BottomNavigationProps {
  currentPage?: string;
}

export function BottomNavigation({ currentPage }: BottomNavigationProps) {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && (location === "/" || currentPage === "home")) return true;
    if (path === "/diagnosis" && (location.includes("/diagnosis") || location.includes("/results") || currentPage === "diagnosis")) return true;
    return false;
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
      <div className="flex items-center justify-around">
        <Link href="/">
          <button className={`flex flex-col items-center space-y-1 ${isActive("/") ? "text-automotive-orange" : "text-gray-500"}`}>
            <Home className="w-5 h-5" />
            <span className="text-xs font-medium">Home</span>
          </button>
        </Link>
        <Link href="/diagnosis">
          <button className={`flex flex-col items-center space-y-1 ${isActive("/diagnosis") ? "text-automotive-orange" : "text-gray-500"}`}>
            <History className="w-5 h-5" />
            <span className="text-xs font-medium">Diagnose</span>
          </button>
        </Link>
        <button className="flex flex-col items-center space-y-1 text-gray-500">
          <User className="w-5 h-5" />
          <span className="text-xs font-medium">Profile</span>
        </button>
      </div>
    </nav>
  );
}
