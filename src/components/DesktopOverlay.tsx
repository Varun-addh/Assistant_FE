import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Settings, Move, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeleprompterStream } from '@/hooks/useTeleprompterStream';

interface DesktopOverlayProps {
  text: string;
  isVisible: boolean;
  onClose: () => void;
  onToggleVisibility: () => void;
}

interface OverlaySettings {
  fontSize: number;
  scrollSpeed: number;
  opacity: number;
  width: number;
  height: number;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
}

export const DesktopOverlay: React.FC<DesktopOverlayProps> = ({
  text,
  isVisible,
  onClose,
  onToggleVisibility,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [settings, setSettings] = useState<OverlaySettings>({
    fontSize: 18,
    scrollSpeed: 30,
    opacity: 85,
    width: 350,
    height: 250,
    x: window.innerWidth - 370,
    y: 20,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    borderRadius: 8,
  });

  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; height: number; startX: number; startY: number } | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use streaming hook for real-time text display
  const { streamedText, isStreaming, skipToEnd } = useTeleprompterStream(text, {
    enabled: true,
    chunkSize: 1,
    delay: 60,
  });

  // Format text for overlay display (more compact than full teleprompter)
  const formatOverlayText = useCallback((rawText: string): string => {
    if (!rawText) return '';

    let formatted = rawText
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\*\*(.*?)\*\*/g, '<span style="font-weight: bold; color: #ffd700;">$1</span>') // Highlight bold in gold
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/#{1,6}\s+(.*)/g, '<span style="font-weight: bold; color: #ffd700;">$1</span>')
      .replace(/^\d+\.\s+/gm, '• ') // Convert numbered lists to bullets
      .replace(/^[-*]\s+/gm, '• ')
      .trim();

    // Create shorter, punchier lines for overlay
    const sentences = formatted.split(/[.!?]+/).filter(s => s.trim());
    const lines: string[] = [];

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      // Keep lines shorter for overlay (max 60 chars)
      if (trimmed.length > 60) {
        const words = trimmed.split(' ');
        let currentLine = '';
        
        words.forEach(word => {
          if ((currentLine + ' ' + word).length > 60 && currentLine) {
            lines.push(currentLine.trim());
            currentLine = word;
          } else {
            currentLine += (currentLine ? ' ' : '') + word;
          }
        });
        
        if (currentLine) {
          lines.push(currentLine.trim());
        }
      } else {
        lines.push(trimmed);
      }
    });

    return lines.join('\n\n');
  }, []);

  // Auto-scroll functionality
  useEffect(() => {
    if (isPlaying && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollStep = settings.scrollSpeed / 15;

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
  }, [isPlaying, settings.scrollSpeed]);

  // Global hotkeys
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Shift+T to toggle visibility
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        onToggleVisibility();
        return;
      }

      if (!isVisible) return;

      // Space to play/pause (only when overlay is focused)
      if (e.key === ' ' && document.activeElement === overlayRef.current) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
        return;
      }

      // Speed controls with Ctrl+Arrow keys
      if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, scrollSpeed: Math.min(100, prev.scrollSpeed + 5) }));
        return;
      }
      if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, scrollSpeed: Math.max(5, prev.scrollSpeed - 5) }));
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyPress);
    return () => window.removeEventListener('keydown', handleGlobalKeyPress);
  }, [isVisible, onToggleVisibility]);

  // Mouse events for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('drag-handle')) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: settings.x,
        startY: settings.y,
      };
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragStartRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      
      setSettings(prev => ({
        ...prev,
        x: Math.max(0, Math.min(window.innerWidth - prev.width, dragStartRef.current!.startX + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - prev.height, dragStartRef.current!.startY + deltaY)),
      }));
    }

    if (isResizing && resizeStartRef.current) {
      const deltaX = e.clientX - resizeStartRef.current.startX;
      const deltaY = e.clientY - resizeStartRef.current.startY;
      
      setSettings(prev => ({
        ...prev,
        width: Math.max(200, resizeStartRef.current!.width + deltaX),
        height: Math.max(150, resizeStartRef.current!.height + deltaY),
      }));
    }
  }, [isDragging, isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Auto-hide controls
  const showControlsTemporarily = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // Reset scroll when text changes
  useEffect(() => {
    setScrollPosition(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [text]);

  // Handle resize corner
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      width: settings.width,
      height: settings.height,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const formattedText = formatOverlayText(streamedText);

  if (!isVisible) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${settings.x}px`,
    top: `${settings.y}px`,
    width: `${settings.width}px`,
    height: `${settings.height}px`,
    zIndex: 999999, // Very high z-index for overlay
    backgroundColor: `${settings.backgroundColor}${Math.round(settings.opacity * 2.55).toString(16).padStart(2, '0')}`,
    color: settings.textColor,
    borderRadius: `${settings.borderRadius}px`,
    border: '1px solid rgba(255,255,255,0.1)',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      ref={overlayRef}
      style={overlayStyle}
      className={`teleprompter-overlay stealth-overlay`}
      onMouseDown={handleMouseDown}
      onMouseEnter={showControlsTemporarily}
      onMouseLeave={() => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 1000);
      }}
      tabIndex={0}
    >
      {/* Controls Bar */}
      {showControls && (
        <div className="flex items-center justify-between p-1 bg-black/60 backdrop-blur-sm drag-handle">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying(!isPlaying);
              }}
              className="h-6 w-6 p-0 text-white hover:bg-white/20 teleprompter-control"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            
            {isStreaming && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  skipToEnd();
                }}
                className="h-6 w-6 p-0 text-white hover:bg-white/20 text-xs teleprompter-control"
                title="Skip to end"
              >
                »
              </Button>
            )}
            
            {/* Transparency toggle removed */}

            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setScrollPosition(0);
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = 0;
                }
              }}
              className="h-6 w-6 p-0 text-white hover:bg-white/20"
              title="Reset to Top"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-white/60">{settings.scrollSpeed}%</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="h-6 w-6 p-0 text-white hover:bg-white/20"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3 teleprompter-scrollbar teleprompter-smooth-scroll"
        style={{
          height: showControls ? 'calc(100% - 32px)' : '100%',
          fontSize: `${settings.fontSize}px`,
          lineHeight: 1.5,
        }}
        onScroll={(e) => setScrollPosition((e.target as HTMLDivElement).scrollTop)}
      >
        <div
          className="teleprompter-text"
          style={{
            paddingBottom: '30vh', // Extra space for smooth scrolling
            textAlign: 'left',
            whiteSpace: 'pre-line',
          }}
          dangerouslySetInnerHTML={{ __html: formattedText }}
        />
      </div>

      {/* Resize Handle */}
      {showControls && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-white/20 hover:bg-white/30"
          style={{
            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          }}
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
};

export default DesktopOverlay;
