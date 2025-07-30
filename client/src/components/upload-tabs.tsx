import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mic, Video, Waves, Edit, Upload, Check } from "lucide-react";

interface UploadTabsProps {
  formData: {
    description: string;
    vehicleInfo: string;
    timing: string;
    audioFile: File | null;
    videoFile: File | null;
    vibrationData: any;
  };
  setFormData: (data: any) => void;
}

export function UploadTabs({ formData, setFormData }: UploadTabsProps) {
  const [activeTab, setActiveTab] = useState("description");
  const [vibrationRecording, setVibrationRecording] = useState(false);
  const { toast } = useToast();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "audio", label: "Audio", icon: Mic },
    { id: "video", label: "Video", icon: Video },
    { id: "vibration", label: "Vibration", icon: Waves },
    { id: "description", label: "Description", icon: Edit },
  ];

  const handleFileUpload = (type: 'audio' | 'video', file: File) => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    const allowedTypes = type === 'audio' 
      ? ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a']
      : ['video/mp4', 'video/quicktime', 'video/x-msvideo'];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: `Please select a valid ${type} file`,
        variant: "destructive",
      });
      return;
    }

    setFormData((prev: any) => ({
      ...prev,
      [`${type}File`]: file,
    }));

    toast({
      title: "File Uploaded",
      description: `${file.name} has been uploaded successfully`,
    });
  };

  const startVibrationRecording = async () => {
    if (!navigator.permissions) {
      toast({
        title: "Not Supported",
        description: "Vibration recording is not supported on this device",
        variant: "destructive",
      });
      return;
    }

    try {
      setVibrationRecording(true);
      
      // Simulate vibration recording for 5 seconds
      const vibrationData = {
        duration: 5000,
        timestamp: Date.now(),
        readings: Array.from({ length: 50 }, (_, i) => ({
          x: Math.random() * 2 - 1,
          y: Math.random() * 2 - 1,
          z: Math.random() * 2 - 1,
          timestamp: Date.now() + i * 100,
        })),
      };

      setTimeout(() => {
        setFormData((prev: any) => ({
          ...prev,
          vibrationData,
        }));
        setVibrationRecording(false);
        
        toast({
          title: "Vibration Recorded",
          description: "5 seconds of vibration data captured",
        });
      }, 5000);
    } catch (error) {
      setVibrationRecording(false);
      toast({
        title: "Recording Failed",
        description: "Could not access device sensors",
        variant: "destructive",
      });
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "audio":
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
            <Mic className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Audio Recording</h3>
            <p className="text-gray-600 mb-4">Record or upload audio of the vehicle issue (MP3, WAV, M4A)</p>
            
            {formData.audioFile ? (
              <div className="flex items-center justify-center space-x-2 text-green-600 mb-4">
                <Check className="w-5 h-5" />
                <span>{formData.audioFile.name}</span>
              </div>
            ) : null}
            
            <Button 
              onClick={() => audioInputRef.current?.click()}
              className="bg-automotive-orange hover:bg-orange-600 text-white"
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose Audio File
            </Button>
            <input
              ref={audioInputRef}
              type="file"
              className="hidden"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload('audio', file);
              }}
            />
          </div>
        );

      case "video":
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
            <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Video Recording</h3>
            <p className="text-gray-600 mb-4">Show the vehicle issue in action (MP4, MOV, AVI)</p>
            
            {formData.videoFile ? (
              <div className="flex items-center justify-center space-x-2 text-green-600 mb-4">
                <Check className="w-5 h-5" />
                <span>{formData.videoFile.name}</span>
              </div>
            ) : null}
            
            <Button 
              onClick={() => videoInputRef.current?.click()}
              className="bg-automotive-orange hover:bg-orange-600 text-white"
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose Video File
            </Button>
            <input
              ref={videoInputRef}
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload('video', file);
              }}
            />
          </div>
        );

      case "vibration":
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
            <Waves className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Vibration Data</h3>
            <p className="text-gray-600 mb-4">Use your device's accelerometer to detect vibrations</p>
            
            {formData.vibrationData ? (
              <div className="flex items-center justify-center space-x-2 text-green-600 mb-4">
                <Check className="w-5 h-5" />
                <span>Vibration data captured</span>
              </div>
            ) : null}
            
            <Button 
              onClick={startVibrationRecording}
              disabled={vibrationRecording}
              className="bg-automotive-orange hover:bg-orange-600 text-white"
            >
              {vibrationRecording ? (
                <>📊 Recording... {/* Progress would show here */}</>
              ) : (
                <>▶️ Start Recording Vibration</>
              )}
            </Button>
          </div>
        );

      case "description":
        return (
          <div className="space-y-4">
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-2">
                Describe the issue in your own words
              </Label>
              <Textarea 
                value={formData.description}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
                className="w-full resize-none focus:ring-automotive-orange focus:border-automotive-orange" 
                rows={6} 
                placeholder="e.g., My car makes a squealing noise when I brake, especially in the morning. The sound gets worse when it's cold outside..."
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  When does it occur?
                </Label>
                <Select value={formData.timing} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, timing: value }))}>
                  <SelectTrigger className="focus:ring-automotive-orange focus:border-automotive-orange">
                    <SelectValue placeholder="Select timing..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="startup">During startup</SelectItem>
                    <SelectItem value="driving">While driving</SelectItem>
                    <SelectItem value="braking">When braking</SelectItem>
                    <SelectItem value="accelerating">When accelerating</SelectItem>
                    <SelectItem value="turning">When turning</SelectItem>
                    <SelectItem value="always">All the time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle information
                </Label>
                <Input 
                  value={formData.vehicleInfo}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, vehicleInfo: e.target.value }))}
                  className="focus:ring-automotive-orange focus:border-automotive-orange" 
                  placeholder="e.g., 2018 Honda Civic"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Upload Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-automotive-orange text-automotive-orange"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <IconComponent className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mb-6">
        {renderTabContent()}
      </div>
    </>
  );
}
