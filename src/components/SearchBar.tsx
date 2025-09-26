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
  const isListeningRef = useRef(false);

  const startListening = () => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
    };

    recognitionRef.current.onresult = (event: any) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      
      // Only append final transcripts to avoid duplicates
      if (finalTranscript.trim()) {
        onChange(value + finalTranscript);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      // Only stop listening on critical errors
      if (event.error === 'network' || event.error === 'not-allowed') {
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    recognitionRef.current.onend = () => {
      // Restart recognition if we're still supposed to be listening
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              setIsListening(false);
              isListeningRef.current = false;
            }
          }
        }, 100);
      }
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
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