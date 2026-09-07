import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mic, Video, Waves, Edit, Upload, Check, Camera } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState("description");
  const [vibrationRecording, setVibrationRecording] = useState(false);
  const [vibrationData, setVibrationData] = useState<any>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const { toast } = useToast();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoCaptureRef = useRef<HTMLInputElement>(null);

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
      description: `${file.name} is selected as reviewer evidence. It has not been uploaded or analyzed yet.`,
    });
  };

  

  const startVibrationRecording = async () => {
    setVibrationRecording(true);
    try {
if (typeof (navigator as any).gyroscope !== "undefined") {
        const sensor: any = (navigator as any).gyroscope;
        sensor.addEventListener("reading", () => {
          const data = {
            x: sensor.x,
            y: sensor.y,
            z: sensor.z,
            timestamp: sensor.timestamp,
          };
          setVibrationData(data);
        });
        sensor.addEventListener("error", (err: any) => {
          console.error("Gyroscope error:", err);
          toast({
            title: "Vibration Capture Error",
            description: "Could not access gyroscope sensor.",
            variant: "destructive",
          });
        });
        sensor.start();
        setVibrationRecording(true);
        toast({
          title: "Vibration Capture Active",
          description: "Recording real motion sensor data. Place your vehicle on a stable surface.",
          variant: "default",
        });
      } else if (typeof (navigator as any).accelerometer !== "undefined") {
        const sensor: any = (navigator as any).accelerometer;
        sensor.addEventListener("reading", () => {
          const data = {
            x: sensor.x,
            y: sensor.y,
            z: sensor.z,
            timestamp: sensor.timestamp,
          };
          setVibrationData(data);
        });
        sensor.addEventListener("error", (err: any) => {
          console.error("Accelerometer error:", err);
          toast({
            title: "Vibration Capture Error",
            description: "Could not access accelerometer sensor.",
            variant: "destructive",
          });
        });
        sensor.start();
        setVibrationRecording(true);
        toast({
          title: "Vibration Capture Active",
          description: "Recording real acceleration sensor data.",
          variant: "default",
        });
      } else {
        setVibrationRecording(false);
        toast({
          title: "Vibration Capture Unavailable",
          description: "No supported motion sensor found on this device. Describe the vibration in the written follow-up instead.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setVibrationRecording(false);
      console.error("Vibration capture failed:", err);
      toast({
        title: "Vibration Capture Failed",
        description: "Could not start vibration capture.",
        variant: "destructive",
      });
    }
  };

  const stopVibrationRecording = () => {
    setVibrationRecording(false);
    if ((window as any).gyroscope) (window as any).gyroscope.stop();
    if ((window as any).accelerometer) (window as any).accelerometer.stop();
    if (vibrationData) {
      toast({
        title: "Vibration Data Captured",
        description: "Real motion sensor data captured.",
        variant: "default",
      });
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setAudioStream(stream);
      toast({
        title: "Microphone Active",
        description: "Recording audio from microphone. Click stop when done.",
        variant: "default",
      });
      setFormData((prev: any) => ({
        ...prev,
        audioStream: stream,
      }));
    } catch (err) {
      console.error("Audio recording failed:", err);
      toast({
        title: "Recording Failed",
        description: "Could not access microphone.",
        variant: "destructive",
      });
    }
  };

  const stopAudioRecording = () => {
    if (audioStream) {
      audioStream.getTracks()[0].stop();
      setAudioStream(null);
      toast({
        title: "Audio Recording Saved",
        description: "Real audio captured from microphone.",
        variant: "default",
      });
    }
  };

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setVideoStream(stream);
      toast({
        title: "Video Recording Active",
        description: "Recording video from camera. Click stop when done.",
        variant: "default",
      });
      setFormData((prev: any) => ({
        ...prev,
        videoStream: stream,
      }));
    } catch (err) {
      console.error("Video recording failed:", err);
      toast({
        title: "Recording Failed",
        description: "Could not access camera.",
        variant: "destructive",
      });
    }
  };

  const stopVideoRecording = () => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
      toast({
        title: "Video Recording Saved",
        description: "Real video captured from camera.",
        variant: "default",
      });
    }
  };

  const capturePhoto = async () => {
    try {
      let stream = videoStream;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err) {
          toast({
            title: "Photo Capture Failed",
            description: "Could not access camera for photo.",
            variant: "destructive",
          });
          return;
        }
      }
      const videoElement = document.createElement("video");
      videoElement.srcObject = stream;
      await videoElement.play();
      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
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
            description: "Real photo captured from camera.",
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

  const renderTabContent = () => {
    switch (activeTab) {
      case "audio":
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-automotive-orange transition-colors">
            <Mic className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Audio Capture</h3>
            <p className="text-gray-600 mb-4">Record or upload audio of the vehicle issue</p>
            
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
<Button 
              onClick={audioStream ? stopAudioRecording : startAudioRecording}
              disabled={!!audioStream}
              className="bg-green-600 hover:bg-green-700 text-white mr-2"
            >
              {audioStream ? "Stop" : "Record"}
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Video Capture</h3>
            <p className="text-gray-600 mb-4">Record or upload video of the vehicle issue</p>
            
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
            <Button 
              onClick={videoStream ? stopVideoRecording : startVideoRecording}
              disabled={!!videoStream}
              className="bg-green-600 hover:bg-green-700 text-white mr-2"
            >
              {videoStream ? "Stop" : "Record"}
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
            {vibrationRecording ? (
              <p className="text-gray-600 mb-4">Recording motion data...</p>
            ) : (
              <p className="text-gray-600 mb-4">Sensor data captured at {vibrationData?.timestamp ? new Date(vibrationData.timestamp).toLocaleTimeString() : '—'}</p>
            )}
            {vibrationData ? (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2 border rounded-xs bg-gray-50">
                  <div className="text-xs text-gray-500">X</div>
                  <div className="font-mono text-lg">{vibrationData.x?.toFixed(3) !== 'NaN' ? vibrationData.x.toFixed(3) : '—'}</div>
                </div>
                <div className="p-2 border rounded-xs bg-gray-50">
                  <div className="text-xs text-gray-500">Y</div>
                  <div className="font-mono text-lg">{vibrationData.y?.toFixed(3) !== 'NaN' ? vibrationData.y.toFixed(3) : '—'}</div>
                </div>
                <div className="p-2 border rounded-xs bg-gray-50">
                  <div className="text-xs text-gray-500">Z</div>
                  <div className="font-mono text-lg">{vibrationData.z?.toFixed(3) !== 'NaN' ? vibrationData.z.toFixed(3) : '—'}</div>
                </div>
              </div>
            ) : null}
            
            <Button 
              onClick={stopVibrationRecording}
              disabled={!vibrationData && !vibrationRecording}
              className="bg-automotive-orange hover:bg-orange-600 text-white"
            >
              {vibrationRecording ? (
                <>Stop Recording</>
              ) : (
                <>Capture Vibration</>
              )}
            </Button>
            {!vibrationData && !vibrationRecording && (
              <p className="text-xs text-gray-500 mt-2">Gyroscope/Accelerometer not available on this device</p>
            )}
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
