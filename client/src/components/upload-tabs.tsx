import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Edit, Check, Camera } from "lucide-react";

interface UploadTabsProps {
  formData: {
    description: string;
    vehicleInfo: string;
    timing: string;
    audioFile: File | null;
    videoFile: File | null;
    capturedPhoto: File | null;
    vibrationData: any;
  };
  setFormData: (data: any) => void;
}

export function UploadTabs({ formData, setFormData }: UploadTabsProps) {
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const { toast } = useToast();

  const capturePhoto = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoElement = document.createElement("video");
      videoElement.srcObject = stream;
      await videoElement.play();
      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((track) => track.stop());
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
          setCapturedPhoto(file);
          setFormData((prev: any) => ({
            ...prev,
            capturedPhoto: file,
          }));
          toast({
            title: "Photo Captured",
            description: "Photo captured from camera.",
            variant: "default",
          });
        }
      }, "image/jpeg");
    } catch (err) {
      console.error("Photo capture failed:", err);
      toast({
        title: "Photo Capture Failed",
        description: "Could not access camera for photo.",
        variant: "destructive",
      });
    }
  };

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
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <Label className="block text-sm font-medium text-gray-700 mb-2">
          Capture evidence
        </Label>
        <Button 
          onClick={capturePhoto}
          className="bg-automotive-orange hover:bg-orange-600 text-white w-full mb-2"
        >
          <Camera className="w-4 h-4 mr-2" /> Take Photo
        </Button>
        {capturedPhoto ? (
          <div className="flex items-center justify-center space-x-2 text-green-600 mb-4">
            <Check className="w-5 h-5" />
            <span>{capturedPhoto.name}</span>
          </div>
        ) : null}
        <p className="text-xs text-gray-500 text-center mt-2">
          Audio, video, and vibration uploads will be available in a future release.
        </p>
      </div>
    </div>
  );
}
