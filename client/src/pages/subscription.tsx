import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/app-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { Check, X, Crown, Shield, Star } from "lucide-react";

const tiers = {
  basic: {
    name: "Basic",
    price: 14.99,
    description: "Perfect for occasional car troubleshooting",
    icon: Shield,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    maxAnalyses: 5,
    popular: false,
    features: [
      "5 diagnoses per month",
      "Audio recording and upload",
      "Photo upload support", 
      "Text problem descriptions",
      "Basic repair suggestions",
      "Cost estimates"
    ],
    limitations: [
      "No vibration analysis",
      "No live mechanic consultations",
      "Basic fix instructions only"
    ]
  },
  premium: {
    name: "Premium",
    price: 19.99,
    description: "Advanced diagnostics with vibration analysis",
    icon: Star,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    maxAnalyses: 20,
    popular: true,
    features: [
      "20 diagnoses per month",
      "All Basic features included",
      "Vibration pattern analysis",
      "Detailed step-by-step fix instructions",
      "Required tools list",
      "Follow-up diagnostic support",
      "Priority email support"
    ],
    limitations: [
      "No live mechanic consultations"
    ]
  },
  expert: {
    name: "Expert",
    price: 24.99,
    description: "Complete automotive diagnostic solution",
    icon: Crown,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    maxAnalyses: -1,
    popular: false,
    features: [
      "Unlimited diagnoses",
      "All Premium features included",
      "Live mechanic consultations",
      "Real-time video calls with certified mechanics",
      "Personalized repair guidance",
      "Priority phone support",
      "Expert-level troubleshooting",
      "Performance-based mechanic matching"
    ],
    limitations: []
  }
};

export default function Subscription() {
  const [selectedTier, setSelectedTier] = useState<string>("premium");

  const { data: subscriptionInfo } = useQuery({
    queryKey: ["/api/subscription/tiers"],
  });

  const mechanicGrading = [
    { grade: "A", range: "90-100%", color: "text-green-600", description: "Exceptional mechanics - highest success rate" },
    { grade: "B", range: "80-89%", color: "text-blue-600", description: "Great mechanics - strong diagnostic skills" },
    { grade: "C", range: "70-79%", color: "text-yellow-600", description: "Good mechanics - meets minimum standards" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-6xl pb-20 md:pb-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Diagnostic Plan</h1>
          <p className="text-gray-600 text-lg">
            Get the automotive expertise you need with our tiered subscription plans
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {Object.entries(tiers).map(([key, tier]) => {
            const Icon = tier.icon;
            const isSelected = selectedTier === key;
            const isPopular = tier.popular;
            
            return (
              <Card 
                key={key} 
                className={`relative transition-all duration-200 cursor-pointer ${
                  isSelected ? 'ring-2 ring-automotive-orange transform scale-105' : 'hover:shadow-lg'
                } ${isPopular ? 'border-purple-300' : ''}`}
                onClick={() => setSelectedTier(key)}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white px-4 py-1">Most Popular</Badge>
                  </div>
                )}
                
                <CardContent className="p-6">
                  <div className={`w-12 h-12 ${tier.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${tier.color}`} />
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{tier.description}</p>
                  
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-gray-900">${tier.price}</span>
                    <span className="text-gray-600">/month</span>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    {tier.features.map((feature, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </div>
                    ))}
                    
                    {tier.limitations.map((limitation, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <X className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-500 text-sm">{limitation}</span>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    className={`w-full ${
                      isSelected 
                        ? 'bg-automotive-orange hover:bg-orange-600 text-white' 
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {isSelected ? 'Selected Plan' : 'Select Plan'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Mechanic Rating System */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Our Mechanic Rating System</h3>
            <p className="text-gray-600 mb-6">
              All Expert tier consultations include access to our certified mechanics, rated on performance using a school grading scale.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mechanicGrading.map((grade) => (
                <div key={grade.grade} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`w-8 h-8 rounded-full bg-white border-2 ${grade.color.replace('text-', 'border-')} flex items-center justify-center`}>
                      <span className={`font-bold ${grade.color}`}>{grade.grade}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Grade {grade.grade}</div>
                      <div className="text-sm text-gray-600">{grade.range} success rate</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{grade.description}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Fair Pay for Quality Service</h4>
              <p className="text-blue-800 text-sm">
                Mechanics keep 80% of consultation fees, with their final pay percentage matching their grade (A=90-100%, B=80-89%, C=70-79%). 
                This ensures you get high-quality service while mechanics are fairly compensated for their expertise.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Comparison */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Feature Comparison</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Feature</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-900">Basic</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-900">Premium</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-900">Expert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 px-4 text-gray-700">Monthly Diagnoses</td>
                    <td className="py-3 px-4 text-center">5</td>
                    <td className="py-3 px-4 text-center">20</td>
                    <td className="py-3 px-4 text-center text-green-600 font-semibold">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-700">Audio & Photo Upload</td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-700">Vibration Analysis</td>
                    <td className="py-3 px-4 text-center"><X className="w-5 h-5 text-gray-400 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-700">Live Mechanic Consultation</td>
                    <td className="py-3 px-4 text-center"><X className="w-5 h-5 text-gray-400 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><X className="w-5 h-5 text-gray-400 mx-auto" /></td>
                    <td className="py-3 px-4 text-center"><Check className="w-5 h-5 text-green-500 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-700">Step-by-Step Instructions</td>
                    <td className="py-3 px-4 text-center text-gray-500">Basic</td>
                    <td className="py-3 px-4 text-center text-blue-600">Detailed</td>
                    <td className="py-3 px-4 text-center text-green-600">Expert-Level</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="mt-8 text-center">
          <Button className="bg-automotive-orange hover:bg-orange-600 text-white px-8 py-4 text-lg">
            Start with {tiers[selectedTier as keyof typeof tiers].name} Plan - ${tiers[selectedTier as keyof typeof tiers].price}/month
          </Button>
          <p className="text-gray-600 text-sm mt-2">Cancel anytime • 7-day money-back guarantee</p>
        </div>
      </main>

      <BottomNavigation currentPage="diagnosis" />
    </div>
  );
}