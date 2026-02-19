import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Settings, Monitor, Smartphone, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTeleprompterStream } from '@/hooks/useTeleprompterStream';

interface TeleprompterProps {
  text: string;
  isVisible: boolean;
  onClose: () => void;
  mode: 'desktop' | 'mobile';
  onModeChange: (mode: 'desktop' | 'mobile') => void;
}

interface TeleprompterSettings {
  fontSize: number;
  scrollSpeed: number;
  opacity: number;
  autoScroll: boolean;
  lineHeight: number;
  backgroundColor: string;
  textColor: string;
}

export const Teleprompter: React.FC<TeleprompterProps> = ({
  text,
  isVisible,
  onClose,
  mode,
  onModeChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [settings, setSettings] = useState<TeleprompterSettings>({
    fontSize: 24,
    scrollSpeed: 50,
    opacity: 90,
    autoScroll: true,
    lineHeight: 1.6,
    backgroundColor: '#000000',
    textColor: '#ffffff',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Use streaming hook for real-time text display
  const { streamedText, isStreaming, skipToEnd } = useTeleprompterStream(text, {
    enabled: true,
    chunkSize: 2,
    delay: 80,
  });

  // Format text for teleprompter display
  const formatTeleprompterText = useCallback((rawText: string): string => {
    if (!rawText) return '';

    // Remove markdown formatting for cleaner teleprompter display
    let formatted = rawText
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Convert bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Convert italic
      .replace(/#{1,6}\s+(.*)/g, '<strong>$1</strong>') // Convert headings to bold
      .replace(/^\d+\.\s+/gm, '') // Remove numbered list markers
      .replace(/^[-*]\s+/gm, '') // Remove bullet points
      .trim();

    // Split into sentences and create speaker-friendly lines
    const sentences = formatted.split(/[.!?]+/).filter(s => s.trim());
    const lines: string[] = [];

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      // Break long sentences at natural pause points
      if (trimmed.length > 80) {
        const parts = trimmed.split(/,|;|\s+(?:and|but|or|because|however|therefore|moreover)\s+/);
        parts.forEach(part => {
          if (part.trim()) {
            lines.push(part.trim() + (part.includes(',') ? '' : '.'));
          }
        });
      } else {
        lines.push(trimmed + '.');
      }
    });

    return lines.join('\n\n');
  }, []);

  // Auto-scroll functionality
  useEffect(() => {
    if (isPlaying && settings.autoScroll && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollStep = settings.scrollSpeed / 10;

      scrollIntervalRef.current = setInterval(() => {
        setScrollPosition(prev => {
          const newPosition = prev + scrollStep;
          const maxScroll = container.scrollHeight - container.clientHeight;
          
          if (newPosition >= maxScroll) {
            setIsPlaying(false);
            return maxScroll;
          }
          
          container.scrollTop = newPosition;
          return newPosition;
        });
      }, 100);
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [isPlaying, settings.autoScroll, settings.scrollSpeed]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isVisible) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSettings(prev => ({ ...prev, scrollSpeed: Math.min(100, prev.scrollSpeed + 5) }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSettings(prev => ({ ...prev, scrollSpeed: Math.max(10, prev.scrollSpeed - 5) }));
          break;
        case '+':
        case '=':
          e.preventDefault();
          setSettings(prev => ({ ...prev, fontSize: Math.min(48, prev.fontSize + 2) }));
          break;
        case '-':
          e.preventDefault();
          setSettings(prev => ({ ...prev, fontSize: Math.max(12, prev.fontSize - 2) }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isVisible, onClose]);

  // Reset scroll position when text changes
  useEffect(() => {
    setScrollPosition(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [text]);

  // Handle manual scroll
  const handleManualScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollPosition(target.scrollTop);
  };

  // Touch gestures for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    // Horizontal swipe for speed control
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // Swipe right - increase speed
        setSettings(prev => ({ ...prev, scrollSpeed: Math.min(100, prev.scrollSpeed + 10) }));
      } else {
        // Swipe left - decrease speed
        setSettings(prev => ({ ...prev, scrollSpeed: Math.max(10, prev.scrollSpeed - 10) }));
      }
    }

    setTouchStart(null);
  };

  const formattedText = formatTeleprompterText(streamedText);

  if (!isVisible) return null;

  const containerStyle: React.CSSProperties = {
    position: mode === 'desktop' ? 'fixed' : 'relative',
    top: mode === 'desktop' ? '20px' : 0,
    right: mode === 'desktop' ? '20px' : 0,
    width: mode === 'desktop' ? '400px' : '100vw',
    height: mode === 'desktop' ? '300px' : '100vh',
    zIndex: mode === 'desktop' ? 9999 : 1000,
    backgroundColor: mode === 'desktop' ? `${settings.backgroundColor}${Math.round(settings.opacity * 2.55).toString(16).padStart(2, '0')}` : settings.backgroundColor,
    color: settings.textColor,
    borderRadius: mode === 'desktop' ? '8px' : '0',
    border: mode === 'desktop' ? '1px solid rgba(255,255,255,0.2)' : 'none',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const ControlsPanel = () => (
    <div className={`flex items-center gap-2 p-2 ${mode === 'mobile' ? 'bg-black/80 backdrop-blur-sm' : 'bg-gray-900/90'}`}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsPlaying(!isPlaying)}
          className="text-white hover:bg-white/20"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        {isStreaming && (
          <Button
            size="sm"
            variant="ghost"
            onClick={skipToEnd}
            className="text-white hover:bg-white/20 text-xs"
            title="Skip to end"
          >
            Skip
          </Button>
        )}
      
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowSettings(!showSettings)}
        className="text-white hover:bg-white/20"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onModeChange(mode === 'desktop' ? 'mobile' : 'desktop')}
          className="text-white hover:bg-white/20"
        >
          {mode === 'desktop' ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSettings(prev => ({ ...prev, fontSize: Math.max(12, prev.fontSize - 2) }))}
          className="text-white hover:bg-white/20"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="text-xs text-white/80 min-w-[2rem] text-center">{settings.fontSize}px</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSettings(prev => ({ ...prev, fontSize: Math.min(48, prev.fontSize + 2) }))}
          className="text-white hover:bg-white/20"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onClose}
        className="text-white hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  const SettingsPanel = () => (
    <div className={`p-4 space-y-4 ${mode === 'mobile' ? 'bg-black/90 backdrop-blur-sm' : 'bg-gray-900/95'} border-t border-white/20`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-white text-sm">Scroll Speed</Label>
          <Slider
            value={[settings.scrollSpeed]}
            onValueChange={([value]) => setSettings(prev => ({ ...prev, scrollSpeed: value }))}
            min={10}
            max={100}
            step={5}
            className="mt-2"
          />
          <span className="text-xs text-white/60">{settings.scrollSpeed}%</span>
        </div>

        {mode === 'desktop' && (
          <div>
            <Label className="text-white text-sm">Opacity</Label>
            <Slider
              value={[settings.opacity]}
              onValueChange={([value]) => setSettings(prev => ({ ...prev, opacity: value }))}
              min={30}
              max={100}
              step={5}
              className="mt-2"
            />
            <span className="text-xs text-white/60">{settings.opacity}%</span>
          </div>
        )}

        <div>
          <Label className="text-white text-sm">Line Height</Label>
          <Slider
            value={[settings.lineHeight * 10]}
            onValueChange={([value]) => setSettings(prev => ({ ...prev, lineHeight: value / 10 }))}
            min={12}
            max={25}
            step={1}
            className="mt-2"
          />
          <span className="text-xs text-white/60">{settings.lineHeight}</span>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="auto-scroll"
            checked={settings.autoScroll}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoScroll: checked }))}
          />
          <Label htmlFor="auto-scroll" className="text-white text-sm">Auto Scroll</Label>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      style={containerStyle}
      className={`teleprompter-overlay ${mode === 'mobile' ? 'mobile-teleprompter' : ''}`}
    >
      <ControlsPanel />
      
      {showSettings && <SettingsPanel />}
      
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 teleprompter-scrollbar teleprompter-smooth-scroll"
        style={{
          height: mode === 'mobile' 
            ? `calc(100vh - ${showSettings ? '200px' : '60px'})` 
            : `calc(300px - ${showSettings ? '160px' : '60px'})`,
        }}
        onScroll={handleManualScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => mode === 'mobile' && setIsPlaying(!isPlaying)}
      >
        <div
          ref={textContainerRef}
          className={`teleprompter-text ${mode === 'mobile' ? 'mobile-teleprompter-text' : ''}`}
          style={{
            fontSize: mode === 'mobile' ? undefined : `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            textAlign: 'center',
            whiteSpace: 'pre-line',
            paddingBottom: '50vh', // Extra space for smooth scrolling
          }}
          dangerouslySetInnerHTML={{ __html: formattedText }}
        />
      </div>

      {mode === 'mobile' && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/60 text-xs">
          Tap to play/pause • Swipe left/right for speed
        </div>
      )}
    </div>
  );
};

export default Teleprompter;
