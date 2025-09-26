import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = ({ value, onChange, placeholder = "Type your question..." }: SearchBarProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      onChange(text);
      setIsListening(false);
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const handleSpeechToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="relative max-w-3xl mx-auto">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[120px] p-6 text-lg bg-card border border-border rounded-xl shadow-md focus:shadow-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 resize-none"
          rows={4}
        />
        
        {/* Speech-to-text button */}
        {isSupported && (
          <Button
            onClick={handleSpeechToggle}
            variant="ghost"
            size="icon"
            className={`absolute bottom-4 right-4 transition-all duration-200 ${
              isListening 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                : "bg-secondary text-secondary-foreground hover:bg-secondary-hover"
            }`}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
      
      {isListening && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-card px-3 py-1 rounded-full shadow-md">
            <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
            <span>Listening...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}