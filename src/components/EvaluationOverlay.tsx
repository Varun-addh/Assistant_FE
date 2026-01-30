import { useEffect, useRef, useState } from "react";

interface EvaluationOverlayProps {
  open: boolean;
  title?: string;
  streamedText: string;
  onClose: () => void;
  isStreaming: boolean;
  summaryHtml?: string;
}

export const EvaluationOverlay = ({ open, title = "Evaluating...", streamedText, onClose, isStreaming, summaryHtml }: EvaluationOverlayProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Lock background scroll when overlay is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Word-by-word streaming effect
  useEffect(() => {
    if (!streamedText) {
      setDisplayedText("");
      return;
    }

    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    
    const words = streamedText.split(/(\s+)/);
    let currentIndex = 0;
    setIsTyping(true);

    typingTimerRef.current = setInterval(() => {
      if (currentIndex >= words.length) {
        setIsTyping(false);
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        return;
      }

      setDisplayedText(prev => prev + words[currentIndex]);
      currentIndex++;
    }, 30); // Faster than AnswerCard for more responsive feel

    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, [streamedText]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    
    const id = window.setInterval(() => {
      if (!isTyping) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 100);
    
    return () => window.clearInterval(id);
  }, [open, isTyping]);

  // Use preformatted markdown-like text produced by host post-processor; keep neutral background (no inner card)
  const formatEvaluationResponse = (text: string) => {
    const t = String(text || "");
    // Convert simple markdown headings and bullets for nicer look without heavy markdown lib
    let out = t
      .replace(/^###\s+(.+)$/gm, '<h4 class="section-title">$1</h4>')
      .replace(/^##\s+(.+)$/gm, '<h3 class="section-title">$1</h3>')
      .replace(/^#\s+(.+)$/gm, '<h2 class="section-title">$1</h2>');
    
    // Enhanced bullet point formatting for better UX
    // Handle different bullet styles: -, *, •, and numbered lists
    out = out.replace(/^(?:[-*•]\s+)(.+)$/gm, '<li class="bullet-item">$1</li>');
    out = out.replace(/^(\d+\.\s+)(.+)$/gm, '<li class="numbered-item">$2</li>');
    
    // Group consecutive bullet items into lists
    out = out.replace(/(<li class=\"bullet-item\">.*?<\/li>\s*)+/gs, (m) => `<ul class=\"bullet-list\">${m}</ul>`);
    out = out.replace(/(<li class=\"numbered-item\">.*?<\/li>\s*)+/gs, (m) => `<ol class=\"numbered-list\">${m}</ol>`);
    
    // Special handling for approach section - ensure it gets bullet formatting
    out = out.replace(/^###\s+Approach\s*$/gm, '<h4 class="section-title">Approach</h4>');
    
    // Convert approach content to bullets if it's not already formatted
    out = out.replace(/(<h4 class="section-title">Approach<\/h4>)\s*([^<]+?)(?=<h[1-6]|$)/gs, (match, heading, content) => {
      const trimmedContent = content.trim();
      if (trimmedContent && !trimmedContent.includes('<li')) {
        // Split by sentences and convert to bullet points
        const sentences = trimmedContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const bulletItems = sentences.map(sentence => `<li class="bullet-item">${sentence.trim()}</li>`).join('');
        return `${heading}\n<ul class="bullet-list">${bulletItems}</ul>`;
      }
      return match;
    });
    
    // paragraphs
    out = out.replace(/\n{2,}/g, '</p><p class="section-content">');
    out = `<p class="section-content">${out}</p>`;
    return out;
  };

  if (!open) return null;

  const isDark = true; // Dark mode only

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_-20%,rgba(59,130,246,0.15),rgba(0,0,0,0))]" />
      <div className="relative w-screen h-screen sm:w-[min(1200px,95vw)] sm:h-[min(80vh,85vh)] rounded-none sm:rounded-2xl border-0 sm:border shadow-xl sm:shadow-2xl sm:border-white/10 bg-transparent flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b ${
          isDark ? 'border-white/10 bg-white/5' : 'border-gray-200/50 bg-gray-50/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className={`text-sm md:text-base font-semibold tracking-wide ${
              isDark ? 'text-white/90' : 'text-gray-900'
            }`}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-sm sm:text-xs rounded-md border transition-colors active:opacity-90 ${
              isDark 
                ? 'border-white/10 text-white/80 hover:text-white hover:bg-white/10' 
                : 'border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Close
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto px-4 sm:px-6 py-5 sm:py-6" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <div className="prose prose-invert max-w-none">
            {(!displayedText || !displayedText.trim()) && isStreaming ? (
              <div className="flex flex-col items-center justify-center py-16 select-none">
                <div className={`h-8 w-8 rounded-full border-2 ${isDark ? 'border-white/30 border-t-white' : 'border-gray-400/50 border-t-gray-900'} animate-spin`} aria-label="Loading" />
                <div className={`mt-4 text-sm ${isDark ? 'text-white/80' : 'text-gray-600'}`}>Preparing evaluation…</div>
                <div className={`mt-6 h-1 w-40 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full animate-pulse`} />
              </div>
            ) : (
              <>
                <div
                  className={`text-[15px] leading-7 md:text-base text-white`}
                  dangerouslySetInnerHTML={{ __html: formatEvaluationResponse(displayedText) }}
                />
                {isTyping ? (
                  <div className={`mt-3 h-1 w-28 bg-gradient-to-r from-primary/60 via-primary to-primary/60 rounded-full animate-pulse`} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .evaluation-response {
          line-height: 1.7;
        }
        .section {
          margin-bottom: 2rem;
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: ${isDark ? '#ffffff' : '#111827'};
          padding-bottom: 0.25rem;
        }
        .section-content {
          margin-bottom: 0;
          color: ${isDark ? '#ffffff' : '#1f2937'};
        }
        .bullet-list { 
          padding-left: 1.25rem; 
          margin: 0.5rem 0 1rem; 
          list-style: none;
        }
        .bullet-item { 
          margin: 0.25rem 0; 
          position: relative;
          padding-left: 0.5rem;
        }
        .bullet-item::before {
          content: "•";
          position: absolute;
          left: -0.75rem;
          color: ${isDark ? '#60a5fa' : '#3b82f6'};
          font-weight: bold;
        }
        .numbered-list {
          padding-left: 1.25rem;
          margin: 0.5rem 0 1rem;
        }
        .numbered-item {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
};


