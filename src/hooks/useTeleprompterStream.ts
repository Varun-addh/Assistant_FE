import { useState, useEffect, useRef } from 'react';

interface StreamingOptions {
  enabled: boolean;
  chunkSize?: number;
  delay?: number;
}

export const useTeleprompterStream = (
  fullText: string,
  options: StreamingOptions = { enabled: true, chunkSize: 3, delay: 50 }
) => {
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingComplete, setStreamingComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTextRef = useRef('');

  useEffect(() => {
    // Reset streaming when text changes
    if (fullText !== lastTextRef.current) {
      lastTextRef.current = fullText;
      setStreamedText('');
      setStreamingComplete(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (!options.enabled || !fullText) {
        setStreamedText(fullText);
        setStreamingComplete(true);
        setIsStreaming(false);
        return;
      }

      // Start streaming
      setIsStreaming(true);
      const words = fullText.split(/(\s+)/); // Split but keep whitespace
      let currentIndex = 0;

      intervalRef.current = setInterval(() => {
        if (currentIndex >= words.length) {
          setIsStreaming(false);
          setStreamingComplete(true);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        // Add chunks of words
        const endIndex = Math.min(currentIndex + (options.chunkSize || 3), words.length);
        const newChunk = words.slice(currentIndex, endIndex).join('');
        
        setStreamedText(prev => prev + newChunk);
        currentIndex = endIndex;
      }, options.delay || 50);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fullText, options.enabled, options.chunkSize, options.delay]);

  const skipToEnd = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStreamedText(fullText);
    setIsStreaming(false);
    setStreamingComplete(true);
  };

  const restartStream = () => {
    setStreamedText('');
    setStreamingComplete(false);
    lastTextRef.current = ''; // Force restart
  };

  return {
    streamedText,
    isStreaming,
    streamingComplete,
    skipToEnd,
    restartStream,
  };
};
