import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Battery, AlertCircle, Car, Calendar, Building2, Settings } from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import type { Diagnosis } from "@shared/schema";

export default function Home() {
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleType, setVehicleType] = useState("");

  const { data: recentDiagnoses, isLoading } = useQuery<Diagnosis[]>({
    queryKey: ["/api/diagnoses/recent"],
  });

  const getIconForDiagnosis = (title: string) => {
    if (title.toLowerCase().includes('battery')) return Battery;
    if (title.toLowerCase().includes('brake') || title.toLowerCase().includes('engine')) return AlertCircle;
    return Wrench;
  };

  // Generate years from 1930 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1929 }, (_, i) => currentYear - i);

  // Vehicle manufacturers
  const manufacturers = [
    "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", "Cadillac", 
    "Chevrolet", "Chrysler", "Dodge", "Ferrari", "Fiat", "Ford", "Genesis", "GMC", 
    "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Lamborghini", "Land Rover",
    "Lexus", "Lincoln", "Maserati", "Mazda", "McLaren", "Mercedes-Benz", "MINI", "Mitsubishi",
    "Nissan", "Porsche", "Ram", "Rolls-Royce", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo"
  ];

  // Sample models (in real app, this would be filtered by manufacturer)
  const models = vehicleMake ? getModelsForMake(vehicleMake) : [];

  // Vehicle types
  const vehicleTypes = [
    "Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Pickup Truck", 
    "Wagon", "Minivan", "Crossover", "Sports Car", "Luxury Car", "Electric Vehicle"
  ];

  function getModelsForMake(make: string): string[] {
    const modelData: Record<string, string[]> = {
      "Toyota": ["Camry", "Corolla", "RAV4", "Highlander", "Prius", "Tacoma", "Tundra", "4Runner"],
      "Honda": ["Civic", "Accord", "CR-V", "Pilot", "Fit", "Odyssey", "Ridgeline", "HR-V"],
      "Ford": ["F-150", "Mustang", "Explorer", "Escape", "Focus", "Fusion", "Expedition", "Edge"],
      "Chevrolet": ["Silverado", "Equinox", "Malibu", "Tahoe", "Cruze", "Impala", "Suburban", "Traverse"],
      "Nissan": ["Altima", "Sentra", "Rogue", "Pathfinder", "Maxima", "Murano", "Titan", "Armada"],
      "BMW": ["3 Series", "5 Series", "X3", "X5", "7 Series", "X1", "4 Series", "X7"],
      "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLC", "GLE", "A-Class", "CLA", "GLS"],
      "Audi": ["A4", "A6", "Q5", "Q7", "A3", "Q3", "A8", "Q8"],
      "Volkswagen": ["Jetta", "Passat", "Tiguan", "Atlas", "Golf", "Beetle", "Arteon", "ID.4"],
      "Hyundai": ["Elantra", "Sonata", "Tucson", "Santa Fe", "Accent", "Palisade", "Kona", "Veloster"]
    };
    
    return modelData[make] || ["Select manufacturer first"];
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-4xl pb-20 md:pb-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-automotive-blue to-blue-600 text-white rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Welcome to Mechanic's Eye</h2>
          <p className="text-gray-700 mb-6">
            AI-powered vehicle diagnostics at your fingertips. Upload audio, video, or describe your vehicle issue for instant analysis.
          </p>
          
          {/* Vehicle Selection Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800 flex items-center">
                <Calendar className="w-4 h-4 mr-2" />
                Year
              </label>
              <Select value={vehicleYear} onValueChange={setVehicleYear}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800 flex items-center">
                <Building2 className="w-4 h-4 mr-2" />
                Make
              </label>
              <Select value={vehicleMake} onValueChange={(value) => {
                setVehicleMake(value);
                setVehicleModel(""); // Reset model when make changes
              }}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="Select make" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((make) => (
                    <SelectItem key={make} value={make}>
                      {make}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800 flex items-center">
                <Car className="w-4 h-4 mr-2" />
                Model
              </label>
              <Select value={vehicleModel} onValueChange={setVehicleModel} disabled={!vehicleMake}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder={vehicleMake ? "Select model" : "Select make first"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800 flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                Type
              </label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
