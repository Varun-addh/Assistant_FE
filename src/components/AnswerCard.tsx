import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { apiRenderMermaid } from "@/lib/api";
import { Copy, Check, MessageSquare, Edit3, ChevronLeft, ChevronRight, Send, Share, X, Play, Edit, Download, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startEvaluationOverlay } from "@/overlayHost";

// Keep a module-level cache so that answers marked as "seen" survive
// component unmounts/remounts (history opens often unmount/mount the card).
const seenAnswersGlobal = new Set<string>();

// Expose on window for clearing when starting new chat
if (typeof window !== 'undefined') {
  (window as any).__seenAnswersCache = seenAnswersGlobal;
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MermaidEditor } from "@/components/MermaidEditor";
import { downloadAnswerPdf, waitForSvgInDiagram, preloadHtml2Pdf } from "@/lib/utils";
import { svgElementToPngImage } from "@/lib/utils";
import { replaceDiagramSvgWithImg } from "@/lib/utils";

interface AnswerCardProps {
  answer: string;
  question: string;
  mode?: "answer" | "mirror";
  // When false, render instantly without typewriter/streaming effect (used for history)
  streaming?: boolean;
  // Whether evaluation (the Evaluate button) is allowed for this question.
  evaluationAllowed?: boolean | null;
  evaluationReason?: string | null;
  onEdit?: () => void;
  onSubmitEdit?: (newQuestion: string) => void;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  versionLabel?: string; // e.g., "Original" or "Latest"
  isGenerating?: boolean;
  versionIndex?: number; // 1-based index
  versionTotal?: number;
  onShowUpgrade?: () => void; // Callback when upgrade is suggested
  id?: string; // Unique identifier for the answer (e.g. timestamp or UUID) to enable correct caching
}

export const AnswerCard = ({ answer, question, mode, streaming = true, onEdit, onSubmitEdit, canPrev, canNext, onPrev, onNext, versionLabel, isGenerating, versionIndex, versionTotal, evaluationAllowed = null, evaluationReason = null, onShowUpgrade, id }: AnswerCardProps) => {
  const [copied, setCopied] = useState(false);
  const [isDetailed] = useState(true);
  const [typedText, setTypedText] = useState("");
  const [displayedBlocks, setDisplayedBlocks] = useState<Array<{ type: string, content: string, lang?: string }>>([]);
  const { toast } = useToast();
  const typingTimerRef = useRef<any>(null);
  const lastAnswerRef = useRef<string>("");
  const lastStreamingRef = useRef<boolean>(streaming);
  const targetTextRef = useRef("");
  const displayedTextRef = useRef("");
  const isGeneratingRef = useRef(isGenerating);
  const lastIdRef = useRef<string>(id);
  const navigate = useNavigate();

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  // NOTE: `seenAnswersGlobal` (module-level) is used below to persist
  // which answers were rendered fully across component unmounts.
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<string>(question);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [mermaidEditorOpen, setMermaidEditorOpen] = useState(false);
  const [mermaidEditorCode, setMermaidEditorCode] = useState<string>("");
  const mermaidRanRef = useRef<number>(0);
  const mermaidProcessingRef = useRef<boolean>(false);
  const currentScaleRef = useRef<number>(1.0);
  const [expandedDiagram, setExpandedDiagram] = useState<string | null>(null);
  const [expandedSvgHtml, setExpandedSvgHtml] = useState<string | null>(null);
  const [expandedLoading, setExpandedLoading] = useState<boolean>(false);
  const [responseComplete, setResponseComplete] = useState<boolean>(false);
  const [isTypingAnimation, setIsTypingAnimation] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Track when response is complete - only when typing animation finishes AND not generating
  useEffect(() => {
    if (isGenerating) {
      // If AI is still generating, response is not complete
      setResponseComplete(false);
    } else if (!streaming && answer.length > 0 && !answer.includes("Analyzing your question")) {
      // If not streaming, not generating, has content, and not the loading message
      setResponseComplete(true);
    } else if (streaming) {
      // If streaming, response is not complete until typing animation finishes
      // This ensures button stays disabled during word-by-word streaming
      setResponseComplete(false);
    }
  }, [streaming, answer.length, isGenerating, answer]);

  // Track when typing animation completes during streaming
  useEffect(() => {
    if (streaming && !isTypingAnimation && !isGenerating && !answer.includes("Analyzing your question")) {
      // Only enable when: streaming is true, typing animation is finished, not generating, and not loading message
      // Note: We don't check answer.length here because we want to ensure typing animation is completely done
      setResponseComplete(true);
    } else if (streaming) {
      // If streaming is active, keep disabled until typing animation finishes
      setResponseComplete(false);
    }
  }, [streaming, isTypingAnimation, isGenerating, answer]);

  // Close expanded diagram when clicking outside
  useEffect(() => {
    if (expandedDiagram) {
      document.body.style.overflow = 'hidden';
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.expanded-content-wrapper') && !target.closest('.diagram-action-btn')) {
          setExpandedDiagram(null);
        }
      };
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setExpandedDiagram(null);
        }
      };
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [expandedDiagram]);

  // Clear expanded artifacts when closing
  useEffect(() => {
    if (!expandedDiagram) {
      setExpandedSvgHtml(null);
      setExpandedLoading(false);
    }
  }, [expandedDiagram]);

  // Restore normal Mermaid diagrams when closing expanded view
  useEffect(() => {
    if (!expandedDiagram && contentRef.current) {
      const timer = setTimeout(() => {
        // Force re-render of all normal Mermaid diagrams in THIS card using backend API only
        const normalMermaidElements = contentRef.current?.querySelectorAll('.mermaid:not(.expanded-content-wrapper .mermaid)');
        normalMermaidElements?.forEach(async (element) => {
          const content = element.textContent || '';
          if (content && !element.querySelector('svg') && !(element as any).dataset.mermaidFailed) {
            try {
              const svg = await apiRenderMermaid({
                code: content,
                theme: 'neutral',
                style: 'modern',
                size: 'medium'
              });
              if (svg && svg.trim().startsWith('<svg')) {
                element.innerHTML = svg;
              }
            } catch (error) {
              console.error('Failed to re-render Mermaid diagram:', error);
            }
          }
        });
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [expandedDiagram]);

  // Compose base (auto) scale with user zoom to keep consistent sizing
  const applyScale = (container: HTMLElement) => {
    const svgEl = container.querySelector('svg') as (SVGSVGElement | null);
    if (!svgEl) return;
    const baseScaleAttr = (svgEl as any).dataset?.baseScale;
    const baseScale = baseScaleAttr ? parseFloat(baseScaleAttr) : 1.0;
    const combined = Math.max(0.5, Math.min(1.5, baseScale * currentScaleRef.current));
    (svgEl as unknown as HTMLElement).style.transform = `scale(${combined})`;
    ((svgEl as unknown as HTMLElement).style as any).transformOrigin = 'top center';
  };

  // Compute a base scale to fit container width for consistent medium sizing
  const adjustSvgScale = (container: HTMLElement) => {
    const svgEl = container.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) return;
    // Prefer viewBox width if available; fallback to bounding box
    let svgWidth = 0;
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4 && isFinite(parts[2])) svgWidth = parts[2];
    }
    if (!svgWidth) {
      try {
        const bbox = svgEl.getBBox?.();
        if (bbox && isFinite(bbox.width)) svgWidth = bbox.width;
      } catch { }
    }
    if (!svgWidth) {
      svgWidth = svgEl.getBoundingClientRect().width || container.clientWidth || 900;
    }
    const targetWidth = Math.max(720, Math.min(960, container.clientWidth || 900));
    // Never upscale small diagrams: cap autoscale at 1.0 so they remain medium-sized
    let baseScale = svgWidth > 0 ? Math.min(1.0, targetWidth / svgWidth) : 1.0;
    // Clamp to reasonable range to avoid extreme scaling but avoid enlarging
    baseScale = Math.max(0.7, Math.min(1.0, baseScale));
    (svgEl as any).dataset = { ...(svgEl as any).dataset, baseScale: String(baseScale) };
    applyScale(container);
  };

  // Utility function to clean SVG content and ensure text is visible
  const cleanSvgContent = (svgContent: string): string => {
    let cleaned = svgContent
      .replace(/aria-roledescription="[^"]*"/g, '') // Remove aria-roledescription attributes
      .replace(/role="graphics-document[^"]*"/g, '') // Remove problematic role attributes
      .trim();

    // Additional cleanup for any remaining problematic attributes
    cleaned = cleaned.replace(/aria-roledescription\s*=\s*"[^"]*"/g, '');
    cleaned = cleaned.replace(/role\s*=\s*"graphics-document[^"]*"/g, '');

    // CRITICAL: Ensure text elements have visible fill color
    // This fixes the empty boxes issue in PDFs by ensuring text has proper color
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');

    if (svgEl) {
      // Ensure all text elements have visible fill
      svgEl.querySelectorAll('text').forEach(text => {
        const fill = text.getAttribute('fill');
        if (!fill || fill === 'none' || fill === 'transparent' || fill === '') {
          text.setAttribute('fill', '#1e293b');
        }
        // Ensure font-family is set for consistent rendering
        if (!text.getAttribute('font-family')) {
          text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
        }
      });

      // Ensure foreignObject inner divs have visible text
      svgEl.querySelectorAll('foreignObject div, foreignObject span').forEach(el => {
        const htmlEl = el as HTMLElement;
        const color = htmlEl.style.color;
        if (!color || color === 'transparent' || color === '') {
          htmlEl.style.color = '#1e293b';
        }
        // Set font family
        if (!htmlEl.style.fontFamily) {
          htmlEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
        }
      });

      // Add a style block to ensure text visibility (backup approach)
      const existingStyle = svgEl.querySelector('style');
      const textStyleRule = `
        .nodeLabel, .label, .edgeLabel, .cluster-label { 
          fill: #1e293b !important; 
          color: #1e293b !important;
          font-family: Arial, Helvetica, sans-serif !important;
        }
        text { fill: #1e293b; }
        foreignObject div, foreignObject span { color: #1e293b !important; }
      `;

      if (existingStyle) {
        existingStyle.textContent = (existingStyle.textContent || '') + textStyleRule;
      } else {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = textStyleRule;
        svgEl.insertBefore(styleEl, svgEl.firstChild);
      }

      const serializer = new XMLSerializer();
      cleaned = serializer.serializeToString(svgEl);
    }

    return cleaned;
  };

  // PROACTIVE APPROACH: Mermaid template system for consistent generation
  const getMermaidTemplate = (type: 'architecture' | 'workflow' | 'system'): string => {
    const templates = {
      architecture: `flowchart TD
    %% Architecture components
    A[Component A] --> B[Component B]
    B --> C[Component C]
    
    %% Styling
    classDef component fill:#e1f5fe, stroke:#01579b, color:#000
    classDef service fill:#fff8e1, stroke:#f57f17, color:#000
    classDef database fill:#e3f2fd, stroke:#0d47a1, color:#000`,

      workflow: `flowchart TD
    %% Workflow steps
    Start([Start]) --> Step1[Step 1]
    Step1 --> Step2[Step 2]
    Step2 --> End([End])
    
    %% Styling
    classDef start fill:#e8f5e8, stroke:#1b5e20, color:#000
    classDef step fill:#fff3e0, stroke:#e65100, color:#000
    classDef end fill:#ffebee, stroke:#c62828, color:#000`,

      system: `flowchart TD
    %% System components
    subgraph Client[Client Layer]
        UI[User Interface]
    end
    
    subgraph Server[Server Layer]
        API[API Gateway]
        Service[Business Service]
    end
    
    subgraph Data[Data Layer]
        DB[(Database)]
        Cache[(Cache)]
    end
    
    UI --> API
    API --> Service
    Service --> DB
    Service --> Cache
    
    %% Styling
    classDef client fill:#e1f5fe, stroke:#01579b, color:#000
    classDef server fill:#fff8e1, stroke:#f57f17, color:#000
    classDef data fill:#e3f2fd, stroke:#0d47a1, color:#000`
    };

    return templates[type] || templates.architecture;
  };

  // Zoom functionality for diagrams
  const zoomIn = () => {
    currentScaleRef.current = Math.min(1.5, currentScaleRef.current + 0.1);
    updateScale();
  };

  const zoomOut = () => {
    currentScaleRef.current = Math.max(0.5, currentScaleRef.current - 0.1);
    updateScale();
  };

  const resetZoom = () => {
    currentScaleRef.current = 0.9;
    updateScale();
  };

  const handleDownloadPdf = async () => {
    try {
      // Quick check - if actively processing, wait max 500ms
      if (mermaidProcessingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // FIRST: Collect all mermaid source codes BEFORE cloning
      // This is critical because the SVG rendering may have replaced the original text content
      const mermaidSources: Map<number, string> = new Map();
      if (contentRef.current) {
        contentRef.current.querySelectorAll('[data-mermaid-source]').forEach((el, idx) => {
          const source = el.getAttribute('data-mermaid-source');
          if (source) {
            mermaidSources.set(idx, source);
            console.log(`[PDF] Found mermaid source ${idx}:`, source.substring(0, 50) + '...');
          }
        });
      }

      // Work on a cloned tree so we do NOT mutate the on-screen UI
      const root = (contentRef.current?.cloneNode(true) as HTMLElement) || null;
      if (root) {
        // Re-attach mermaid sources to cloned elements (in case they were lost)
        root.querySelectorAll('.diagram-container, .mermaid, .mermaid-rendered').forEach((el, idx) => {
          const source = mermaidSources.get(idx);
          if (source && !el.getAttribute('data-mermaid-source')) {
            el.setAttribute('data-mermaid-source', source);
            console.log(`[PDF] Re-attached mermaid source to cloned element ${idx}`);
          }
        });

        // Remove ALL UI-only elements (buttons, icons, action bars) from the clone
        root.querySelectorAll('.diagram-action-btn, button, .lucide, [class*="copy-"]').forEach(el => el.remove());

        root.querySelectorAll('table').forEach((table) => {
          const t = table as HTMLElement;
          t.style.borderCollapse = 'collapse';
          t.style.width = '100%';
          // Ensure table does not have overflow or height constraints in PDF
          t.style.overflow = 'visible';
          t.style.height = 'auto';
        });
      }

      const html = root ? root.innerHTML : (contentRef.current?.innerHTML || "");

      // Pass mermaid sources separately for guaranteed availability
      await downloadAnswerPdf({
        question,
        answerHtml: html,
        fileName: `Stratax-AI-${new Date().toISOString().slice(0, 10)}.pdf`,
        mermaidSources: Array.from(mermaidSources.values())
      });
    } catch (e) {
      console.error('[PDF] Download failed:', e);
      toast({
        title: "Download failed",
        description: "We couldn't generate the PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  const updateScale = () => {
    const container = document.querySelector('.diagram-container') as HTMLElement | null;
    if (container) applyScale(container);
  };

  // Add sequential connection numbers to Mermaid diagrams
  const addConnectionNumbers = (mermaidCode: string): string => {
    let code = mermaidCode;
    let connectionCounter = 1;

    // First, handle bidirectional arrows (they should be processed first)
    code = code.replace(/([A-Za-z0-9_\[\]()\s&\/-]+?)\s*<-->\s*([A-Za-z0-9_\[\]()\s&\/-]+?)(?=\s*$|\s*\n|\s*classDef|\s*class\s)/gm, (match, from, to) => {
      const cleanFrom = from.trim();
      const cleanTo = to.trim();
      if (cleanFrom && cleanTo && !cleanFrom.includes('classDef') && !cleanTo.includes('classDef')) {
        const numbered = `${cleanFrom} -- ${connectionCounter} --> ${cleanTo}\n${cleanTo} -- ${connectionCounter + 1} --> ${cleanFrom}`;
        connectionCounter += 2;
        return numbered;
      }
      return match;
    });

    // Then handle simple arrows, but only if they don't already have labels
    code = code.replace(/([A-Za-z0-9_\[\]()\s&\/-]+?)\s*-->\s*([A-Za-z0-9_\[\]()\s&\/-]+?)(?=\s*$|\s*\n|\s*classDef|\s*class\s)/gm, (match, from, to) => {
      const cleanFrom = from.trim();
      const cleanTo = to.trim();

      // Skip if this connection already has a label (contains -- text -->)
      if (match.includes('--') && match.includes('-->') && !match.includes('<-->')) {
        return match;
      }

      if (cleanFrom && cleanTo && !cleanFrom.includes('classDef') && !cleanTo.includes('classDef')) {
        const numbered = `${cleanFrom} -- ${connectionCounter} --> ${cleanTo}`;
        connectionCounter++;
        return numbered;
      }
      return match;
    });

    return code;
  };

  // Fix common Mermaid edge syntax mistakes in user-provided diagrams
  const fixCommonMermaidEdgeSyntax = (src: string): string => {
    let out = src;
    // 1) A <--> B  =>  A --> B\nB --> A
    out = out.replace(/(^|\n)\s*([^\n]+?)\s*<-->\s*([^\n]+?)\s*(?=\n|$)/g, (_m, lead, a, b) => {
      const left = String(a).trim();
      const right = String(b).trim();
      return `${lead}${left} --> ${right}\n${right} --> ${left}`;
    });
    // 2) A <- label -> B  => two labeled arrows
    out = out.replace(/(^|\n)\s*([^\n]+?)\s*<-\s*([^>\n]+?)\s*->\s*([^\n]+?)\s*(?=\n|$)/g, (_m, lead, a, label, b) => {
      const left = String(a).trim();
      const right = String(b).trim();
      const lbl = String(label).trim();
      return `${lead}${left} -- ${lbl} --> ${right}\n${right} -- ${lbl} --> ${left}`;
    });
    // 3) A --> B (Label)  =>  A -- Label --> B
    out = out.replace(/(^|\n)\s*([^\n]+?)\s*-->\s*([^\n(]+?)\s*\(([^)]+)\)\s*(?=\n|$)/g, (_m, lead, a, b, label) => {
      const left = String(a).trim();
      const right = String(b).trim();
      const lbl = String(label).trim();
      return `${lead}${left} -- ${lbl} --> ${right}`;
    });
    // 4) A --(Label)--> B  =>  A -- Label --> B
    out = out.replace(/(^|\n)\s*([^\n]+?)\s*--\s*\(([^)]+)\)\s*-->\s*([^\n]+?)\s*(?=\n|$)/g, (_m, lead, a, label, b) => {
      const left = String(a).trim();
      const right = String(b).trim();
      const lbl = String(label).trim();
      return `${lead}${left} -- ${lbl} --> ${right}`;
    });
    return out;
  };

  // Detect crow's-foot ER syntax and convert to erDiagram
  const crowFootToErDiagram = (src: string): string => {
    const t = (src || '').trim();
    if (!t) return t;
    const relLineRegex = /(^|\n)\s*[A-Za-z_][\w]*\s+(\|\||\|o|o\||\{o|o\{|\{\}|\}\{|\}\}|o\{|\}o|\}\||\|\{)\s*-{1,2}\s*(\|\||\|o|o\||\{o|o\{|\{\}|\}\{|\}\}|o\{|\}o|\}\||\|\{)\s+[A-Za-z_][\w]*/;
    const hasCrow = relLineRegex.test(t);
    const hasEntityBlocks = /(\n|^)\s*[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*?\}/.test(t);
    if (!hasCrow && !hasEntityBlocks) return t;
    const ensureErDirective = (body: string) => {
      if (/^erDiagram\b/.test(body)) return body;
      const lines = body.split(/\r?\n/);
      const withoutDirective = lines.filter((l, idx) => idx !== 0 || !(/^\s*(flowchart|graph)\b/.test(l))).join('\n');
      return `erDiagram\n${withoutDirective}`.trim();
    };
    const sanitizeBlocks = (body: string): string => {
      return body.replace(/(^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g, (_m, lead, entity, inner) => {
        const cleaned: string[] = [];
        inner.split(/\r?\n/).forEach((raw) => {
          let line = raw.trim();
          if (!line) return;
          if (/^(KEY|UNIQUE|INDEX)\b/i.test(line)) return;
          if (/^"[^"]*"$/.test(line)) return; // pure quoted comment line
          line = line.replace(/\s+"[^"]*"$/g, ''); // strip trailing quotes
          line = line.replace(/\b(unique|optional)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
          const keyOnly = /^([A-Za-z_][\w]*)\s+(PK|FK|pk|fk)$/.exec(line);
          if (keyOnly) {
            line = `VARCHAR ${keyOnly[1]} ${keyOnly[2].toUpperCase()}`;
          }
          const parts = line.split(/\s+/);
          if (parts.length >= 1 && parts[0] && (parts.length === 1 || ["PK", "FK", "pk", "fk"].includes(parts[1]))) {
            const name = parts[0];
            const rest = parts.slice(1).map(s => s.toUpperCase()).join(' ');
            line = `VARCHAR ${name}${rest ? ' ' + rest : ''}`;
          }
          cleaned.push(`  ${line}`);
        });
        return `${lead}${entity} {\n${cleaned.join('\n')}\n}`;
      });
    };
    return ensureErDirective(sanitizeBlocks(t));
  };

  // Helper retained if needed later
  const isErDiagramCode = (src: string): boolean => /^erDiagram\b/.test(crowFootToErDiagram(src).trim());

  // Remove code fences/BOM and HTML wrappers that can sneak into blocks
  const stripMermaidFences = (s: string): string => {
    if (!s) return '';
    let t = s.replace(/^[\uFEFF\u200B\u200C\u200D]+/, '');
    // Remove ```mermaid ... ``` or generic ``` blocks (start/end on own lines)
    t = t.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/i, '');
    // Remove duplicated fences if present within
    t = t.replace(/^```[\s\S]*?\n/, (m) => m.replace(/^```.*?\n/, ''));
    t = t.replace(/\n```\s*$/, '');
    // Remove <pre><code> wrappers
    t = t.replace(/<pre[^>]*><code[^>]*>/gi, '').replace(/<\/code><\/pre>/gi, '');
    return t.trim();
  };

  const containsSubgraph = (s: string): boolean => /(^|\n)\s*subgraph\b/.test(s);

  // 🛡️ SANITIZE: Strip CSS/HTML markup from Mermaid code
  const sanitizeMermaidCode = (code: string): string => {
    let sanitized = code.trim();
    
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
    
    // Remove CSS style blocks
    sanitized = sanitized.replace(/style\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove CSS class declarations that aren't Mermaid classDef
    sanitized = sanitized.replace(/\.[\w-]+\s*\{[^}]*\}/g, '');
    
    // Remove inline CSS comments (/* ... */)
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove CSS @rules
    sanitized = sanitized.replace(/@[\w-]+[^{]*\{[^}]*\}/g, '');
    
    // Decode HTML entities
    sanitized = sanitized
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Remove excessive whitespace but preserve structure
    sanitized = sanitized
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    return sanitized;
  };

  // PROACTIVE APPROACH: Comprehensive Mermaid syntax validation and correction
  const validateAndFixMermaidSyntax = (mermaidCode: string): { isValid: boolean; fixedCode: string; errors: string[] } => {
    const errors: string[] = [];
    let fixed = mermaidCode.trim();

    // EARLY: If it's ER-style content, force erDiagram directive
    const maybeEr = crowFootToErDiagram(fixed);
    if (maybeEr !== fixed) {
      fixed = maybeEr;
    }

    // ER-specific fast path: skip flowchart/class validations
    if (fixed.startsWith('erDiagram')) {
      // Normalize line endings and trim trailing spaces
      fixed = fixed.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
      // Ensure consistent two-space indentation inside entity blocks
      fixed = fixed.replace(/(^|\n)([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g, (_m, lead, entity, inner) => {
        const lines = (inner || '').split(/\n/)
          .map(l => l.trim())
          .filter(l => !!l);
        const body = lines.map(l => `  ${l}`).join('\n');
        return `${lead}${entity} {\n${body}\n}`;
      });
      return { isValid: true, fixedCode: fixed, errors: [] };
    }

    // Validation 1: Check for diagram type declaration
    if (!fixed.startsWith('flowchart') && !fixed.startsWith('graph') && !fixed.startsWith('sequenceDiagram') && !fixed.startsWith('classDiagram') && !fixed.startsWith('erDiagram')) {
      if (fixed.includes('-->') || fixed.includes('--') || fixed.includes('subgraph')) {
        errors.push('Missing diagram type declaration');
        // Prefer erDiagram if ER markers exist
        if (/^erDiagram\b/.test(maybeEr)) {
          fixed = maybeEr;
        } else {
          fixed = 'flowchart TD\n' + fixed;
        }
      }
    }

    // Validation 2: Check for incomplete arrows
    const incompleteArrows = fixed.match(/-->\s*$/gm) || [];
    if (incompleteArrows.length > 0) {
      errors.push(`Found ${incompleteArrows.length} incomplete arrows`);
      fixed = fixed.replace(/-->\s*$/gm, '');
    }

    // Validation 3: Check for malformed arrows
    const malformedArrows = fixed.match(/-->\s*-->/g) || [];
    if (malformedArrows.length > 0) {
      errors.push(`Found ${malformedArrows.length} malformed arrows`);
      fixed = fixed.replace(/-->\s*-->/g, '-->');
    }

    // Validation 4: Check for proper subgraph syntax
    const subgraphErrors = fixed.match(/subgraph\s+(\w+)\s*\[/g) || [];
    if (subgraphErrors.length > 0) {
      errors.push(`Found ${subgraphErrors.length} malformed subgraph declarations`);
      fixed = fixed.replace(/subgraph\s+(\w+)\s*\[/g, 'subgraph $1[');
    }

    // Validation 5: Check for classDef placement
    const classDefLines = fixed.split('\n').filter(line => line.trim().startsWith('classDef'));
    const nonClassDefLines = fixed.split('\n').filter(line => !line.trim().startsWith('classDef'));

    if (classDefLines.length > 0) {
      // Check if classDef is at the end
      const lastNonEmptyLine = nonClassDefLines.filter(line => line.trim()).pop();
      const firstClassDefLine = classDefLines[0];
      if (lastNonEmptyLine && firstClassDefLine && fixed.indexOf(firstClassDefLine) < fixed.indexOf(lastNonEmptyLine)) {
        errors.push('classDef statements should be at the end');
        fixed = nonClassDefLines.join('\n') + '\n' + classDefLines.join('\n');
      }
    }

    // Validation 6: Check for class applications
    const classLines = fixed.split('\n').filter(line => line.trim().includes(':::'));
    const nonClassLines = fixed.split('\n').filter(line => !line.trim().includes(':::'));

    if (classLines.length > 0) {
      // Check if class applications are after classDef
      const classDefIndex = fixed.indexOf('classDef');
      const classIndex = fixed.indexOf(':::');
      if (classDefIndex !== -1 && classIndex !== -1 && classIndex < classDefIndex) {
        errors.push('Class applications should be after classDef statements');
        fixed = nonClassLines.join('\n') + '\n' + classLines.join('\n');
      }
    }

    // Validation 7: Check for empty lines and normalize
    const emptyLines = fixed.split('\n').filter(line => !line.trim());
    if (emptyLines.length > 0) {
      errors.push(`Found ${emptyLines.length} empty lines`);
      fixed = fixed.split('\n').filter(line => line.trim()).join('\n');
    }

    // Validation 8: Fix inline comments (Mermaid doesn't support inline comments with %)
    const commentErrors = fixed.match(/\s+%\s+[^\n]*/g) || [];
    if (commentErrors.length > 0) {
      errors.push(`Found ${commentErrors.length} inline comments that need to be on separate lines`);
      // Move inline comments to separate lines
      fixed = fixed.replace(/\s+%\s+([^\n]*)/g, (match, comment) => {
        return '\n  %% ' + comment.trim();
      });
    }

    // Validation 9: Fix classDef formatting issues
    // Check for classDef statements that might have formatting issues
    const classDefFormatLines = fixed.split('\n').filter(line => line.trim().startsWith('classDef'));
    classDefFormatLines.forEach((line, index) => {
    });

    // Deduplicate classDef statements
    const uniqueClassDefs = new Map<string, string>();
    fixed.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('classDef ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length > 1) {
          const name = parts[1];
          uniqueClassDefs.set(name, trimmed);
        }
      }
    });

    if (uniqueClassDefs.size > 0 && classDefLines.length > uniqueClassDefs.size) {
      errors.push(`Deduplicated ${classDefLines.length - uniqueClassDefs.size} classDef statements`);
      const otherLines = fixed.split('\n').filter(line => !line.trim().startsWith('classDef '));
      fixed = otherLines.join('\n') + '\n' + Array.from(uniqueClassDefs.values()).join('\n');
    }

    // Deduplicate linkStyle statements
    const linkStyleLines = fixed.split('\n').filter(line => line.trim().startsWith('linkStyle '));
    const uniqueLinkStyles = new Map<string, string>();
    fixed.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('linkStyle ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length > 1) {
          const index = parts[1];
          uniqueLinkStyles.set(index, trimmed);
        }
      }
    });

    if (uniqueLinkStyles.size > 0 && linkStyleLines.length > uniqueLinkStyles.size) {
      errors.push(`Deduplicated ${linkStyleLines.length - uniqueLinkStyles.size} linkStyle statements`);
      const otherLines = fixed.split('\n').filter(line => !line.trim().startsWith('linkStyle '));
      fixed = otherLines.join('\n') + '\n' + Array.from(uniqueLinkStyles.values()).join('\n');
    }

    // Validation 10: Ensure proper line breaks between classDef statements
    const classDefSection = fixed.split('\n').filter(line => line.trim().startsWith('classDef'));
    if (classDefSection.length > 1) {
      // Check if classDef statements are properly separated
      const classDefText = classDefSection.join('\n');
      if (!classDefText.includes('\nclassDef')) {
        errors.push('classDef statements should be on separate lines');
        fixed = fixed.replace(/classDef/g, '\nclassDef').replace(/^\n/, '');
      }
    }

    // Validation 11: Fix semicolons in arrow connections (invalid Mermaid syntax)
    const semicolonErrors = fixed.match(/--[^>]*;[^>]*-->/g) || [];
    if (semicolonErrors.length > 0) {
      errors.push(`Found ${semicolonErrors.length} semicolons in arrow connections`);
      // Remove semicolons from arrow connections
      fixed = fixed.replace(/--([^>]*);([^>]*)-->/g, '--$1$2-->');
    }

    // Validation 12: Fix multiple arrows on same line
    const multipleArrowErrors = fixed.match(/--[^>]*-->\s*[A-Za-z][^;]*-->/g) || [];
    if (multipleArrowErrors.length > 0) {
      errors.push(`Found ${multipleArrowErrors.length} multiple arrows on same line`);
      // Split multiple arrows into separate lines
      fixed = fixed.replace(/(--[^>]*-->)\s*([A-Za-z][^;]*-->)/g, '$1\n  $2');
    }

    // Validation 9: Check for proper indentation
    const lines = fixed.split('\n');
    let indentationErrors = 0;
    const fixedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('subgraph')) {
        if (!line.startsWith('  ')) indentationErrors++;
        return '  ' + trimmed;
      } else if (trimmed.startsWith('end')) {
        if (!line.startsWith('  ')) indentationErrors++;
        return '  ' + trimmed;
      } else if (trimmed.includes('-->') || trimmed.includes('--')) {
        if (!line.startsWith('    ')) indentationErrors++;
        return '    ' + trimmed;
      } else if (trimmed.startsWith('classDef')) {
        return trimmed;
      } else if (trimmed.includes(':::')) {
        return trimmed;
      } else if (trimmed.startsWith('%%')) {
        // Comments should be on their own lines
        return '  ' + trimmed;
      }
      return trimmed;
    });

    if (indentationErrors > 0) {
      errors.push(`Found ${indentationErrors} indentation issues`);
    }

    fixed = fixedLines.join('\n');

    const isValid = errors.length === 0;

    if (!isValid) {
      console.warn('Mermaid syntax validation failed:', errors);
      console.log('Fixed syntax:', fixed.substring(0, 200) + '...');
    } else {
      console.log('Mermaid syntax validation passed');
    }

    return { isValid, fixedCode: fixed, errors };
  };

  // SAFELY set content without destroying global mermaid
  const setSvgContentSafely = (element: HTMLElement, svgContent: string) => {
    console.log('[AnswerCard] Setting SVG content safely for', element);

    // Remove mermaid class and add rendered class
    element.classList.remove('mermaid');
    element.classList.add('mermaid-rendered');
    element.classList.remove('mermaid-failed');

    // Mark as processed with multiple flags to prevent re-processing
    (element as any).dataset.processed = '1';
    (element as any).dataset.mermaidProcessed = 'true';
    (element as any).dataset.mermaidRendered = 'true';
    (element as any).dataset.mermaidBypassed = 'true';
    delete (element as any).dataset.mermaidFailed;

    // Set the cleaned SVG content DIRECTLY
    element.innerHTML = svgContent;

    try {
      const container = element.closest('.diagram-container') as HTMLElement | null;
      if (container) {
        currentScaleRef.current = 1.0;
        adjustSvgScale(container);
      }
    } catch { }
  };

  const startLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setShowQuickActions(true);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Close quick actions when clicking outside
  useEffect(() => {
    if (!showQuickActions) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!actionsRef.current) return setShowQuickActions(false);
      if (!actionsRef.current.contains(target)) {
        setShowQuickActions(false);
      }
    };
    document.addEventListener('click', onDocClick, { capture: true });
    return () => document.removeEventListener('click', onDocClick, { capture: true } as any);
  }, [showQuickActions]);

  // Re-run Mermaid on block updates (scoped to this component)
  useEffect(() => {
    if (!contentRef.current) return;

    // Define retry handler at useEffect scope for proper cleanup
    const handleRetry = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.retry-mermaid-btn');
      if (btn && contentRef.current) {
        const container = btn.closest('.mermaid') as HTMLElement;
        if (container) {
          console.log('Manually retrying Mermaid render...');
          delete (container as any).dataset.mermaidFailed;
          delete (container as any).dataset.mermaidProcessed;
          container.classList.remove('mermaid-failed');
          const source = (container as any).dataset.mermaidSource || container.textContent || '';
          container.innerHTML = source;
          // Re-trigger rendering
          triggerRender();
        }
      }
    };

    contentRef.current.addEventListener('click', handleRetry);

    let timeoutId: any = null;

    const triggerRender = () => {
      if (timeoutId) clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        try {
          if (mermaidProcessingRef.current || !contentRef.current) return;

          const mm: any = (window as any)?.mermaid;
          const now = Date.now();
          if (now - mermaidRanRef.current < 200) return;
          mermaidRanRef.current = now;

          const unprocessedNodes = Array.from(contentRef.current.querySelectorAll('.mermaid:not(.mermaid-rendered):not(.mermaid-disabled):not([data-mermaid-processed="true"]):not([data-mermaid-rendered="true"]):not([data-mermaid-bypassed="true"]):not([data-mermaid-failed="true"])')) as HTMLElement[];

          if (unprocessedNodes.length === 0) return;

          mermaidProcessingRef.current = true;

          const normalizeMermaid = (src: string): string => {
            let t = (src || '').trim();
            if (t.includes('subgraph') || t.includes('classDef') || t.includes('class ') || t.includes(':::')) return t;
            const newlineCount = (t.match(/\n/g) || []).length;
            if (newlineCount >= 3) return t;
            const lines: string[] = [];
            let currentLine = '';
            const parts = t.split(/(\s+subgraph\s+|\s+end\s+|\s+classDef\s+|\s+-->\s+)/);
            for (let j = 0; j < parts.length; j++) {
              const part = parts[j].trim();
              if (!part) continue;
              if (part.startsWith('flowchart') || part.startsWith('subgraph') || part === 'end' || part.startsWith('classDef') || part.includes('-->') || (part.includes('[') && part.includes(']')) || part.includes(':::')) {
                lines.push(part);
              } else {
                if (currentLine) currentLine += ' ' + part;
                else currentLine = part;
              }
            }
            if (currentLine) lines.push(currentLine);
            return lines.join('\n');
          };

          const tryRender = async (el: HTMLElement, i: number) => {
            if ((el as any).dataset.mermaidProcessed === 'true') return;
            (el as any).dataset.mermaidProcessed = 'true';

            try {
              const srcRaw = el.textContent || '';

              // 🛡️ SANITIZE: Remove CSS/HTML markup before processing
              const sanitizedSrc = sanitizeMermaidCode(srcRaw);

              // CRITICAL: Store original source for PDF export BEFORE any processing
              if (!el.getAttribute('data-mermaid-source')) {
                el.setAttribute('data-mermaid-source', sanitizedSrc.trim());
              }

              const containsSubgraph = /\bsubgraph\b/.test(sanitizedSrc);
              let fixedSrc = sanitizedSrc;

              if (!containsSubgraph) {
                let src = normalizeMermaid(sanitizedSrc);
                src = crowFootToErDiagram(src);
                const validation = validateAndFixMermaidSyntax(src);
                fixedSrc = validation.fixedCode;
                if (fixedSrc !== sanitizedSrc) el.textContent = fixedSrc;
              }

              if (containsSubgraph) {
                fixedSrc = fixedSrc.replace(/(^|\n)\s*subgraph\s+([A-Za-z0-9_-]+)\s*\[(.*?)\]/g, (_m, lead, id, label) => {
                  const needsLayer = !/layer$/i.test(String(label).trim());
                  return `${lead}subgraph ${id}[${needsLayer ? `${label} Layer` : label}]`;
                });
                fixedSrc = fixedSrc.replace(/(^|\n)\s*subgraph\s+([A-Za-z0-9_-]+)\s*$/gm, (_m, lead, id) => {
                  const title = id.replace(/_/g, ' ');
                  const needsLayer = !/layer$/i.test(title);
                  return `${lead}subgraph ${id}[${needsLayer ? `${title} Layer` : title}]`;
                });
              }

              fixedSrc = fixCommonMermaidEdgeSyntax(fixedSrc);
              fixedSrc = addConnectionNumbers(fixedSrc);

              const hasInitDirective = /^%%\{\s*init:/m.test(fixedSrc);
              if (!hasInitDirective) {
                // Use htmlLabels: false for better PDF compatibility - native SVG text renders more reliably
                // Also explicitly set text colors to ensure visibility
                const initDirective = "%%{init: { 'theme': 'neutral', 'flowchart': { 'useMaxWidth': true, 'htmlLabels': false, 'nodeSpacing': 80, 'rankSpacing': 120, 'padding': 16, 'curve': 'basis' }, 'themeVariables': { 'fontFamily': 'Arial, Helvetica, sans-serif', 'fontSize': '14px', 'primaryColor': '#eef2ff', 'primaryBorderColor': '#a5b4fc', 'primaryTextColor': '#1e293b', 'secondaryTextColor': '#334155', 'tertiaryTextColor': '#475569', 'lineColor': '#94a3b8', 'textColor': '#1e293b', 'mainBkg': '#ffffff', 'nodeBorder': '#94a3b8', 'clusterBkg': '#f8fafc', 'clusterBorder': '#cbd5e1', 'nodeTextColor': '#1e293b' } }}%%\n";
                fixedSrc = initDirective + fixedSrc;
              }

              // Primary: Backend
              try {
                const responseText = await apiRenderMermaid({ code: fixedSrc, theme: 'neutral', style: 'modern', size: 'medium' });
                if (responseText.trim().startsWith('<svg')) {
                  const looksLikeError = /aria-roledescription\s*=\s*["']?error|Syntax error in text|Syntax error/i.test(responseText) || responseText.includes('class="error"');
                  if (looksLikeError) {
                    try {
                      const retry = await apiRenderMermaid({ code: (el.textContent || '').trim() || fixedSrc, theme: 'neutral', style: 'modern', size: 'medium' });
                      if (retry && retry.trim().startsWith('<svg') && !/Syntax error/i.test(retry)) {
                        setSvgContentSafely(el, cleanSvgContent(retry));
                        return;
                      }
                    } catch { }
                  } else {
                    setSvgContentSafely(el, cleanSvgContent(responseText));
                    return;
                  }
                }
              } catch { }

              // Fallback: Client
              if (mm && typeof mm.render === 'function') {
                try {
                  const out = await mm.render(`mmd-${Date.now()}-${i}`, fixedSrc);
                  if (out && out.svg) {
                    setSvgContentSafely(el, cleanSvgContent(out.svg as string));
                    return;
                  }
                } catch { }
              }

              // Fallback: Kroki
              try {
                const resp = await fetch('https://kroki.io/mermaid/svg', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: fixedSrc });
                if (resp.ok) {
                  const svg = await resp.text();
                  setSvgContentSafely(el, cleanSvgContent(svg));
                  return;
                }
              } catch { }

              throw new Error('All render attempts failed');

            } catch (error) {
              console.warn('Mermaid render failed permanently for node:', error);
              (el as any).dataset.mermaidFailed = 'true';
              el.classList.add('mermaid-failed');
              el.innerHTML = `
                <div class="mermaid-error-container p-6 border border-destructive/20 rounded-xl bg-destructive/5 flex flex-col items-center justify-center gap-3 text-center my-4">
                  <div class="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Diagram Render Failed</h4>
                    <p class="text-xs text-muted-foreground mt-1 max-w-[240px]">The diagram syntax is complex or the renderer timed out.</p>
                  </div>
                  <button type="button" class="retry-mermaid-btn flex items-center gap-2 px-4 py-1.5 bg-background border border-border rounded-full text-xs font-medium hover:bg-accent transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                    Manual Retry
                  </button>
                </div>
              `;
            }
          };

          const processAll = async () => {
            for (let i = 0; i < unprocessedNodes.length; i++) {
              await tryRender(unprocessedNodes[i], i);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            mermaidProcessingRef.current = false;
          };

          processAll();
        } catch (error) {
          console.error('Global Mermaid processing error:', error);
          mermaidProcessingRef.current = false;
        }
      }, 50);
    };

    triggerRender();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (contentRef.current) {
        contentRef.current.removeEventListener('click', handleRetry);
      }
    };
  }, [displayedBlocks]);

  // Typewriter effect for progressive reveal with real-time formatting
  // Robust typewriter effect for progressive reveal
  useEffect(() => {
    const cacheKey = id || answer;

    // 1. Handle Loading State
    const isLoadingMessage = answer.includes("Analyzing your question");
    if (!answer || isLoadingMessage) {
      if (isLoadingMessage) {
        lastAnswerRef.current = answer;
        setTypedText(answer);
        setIsTypingAnimation(false);
        displayedTextRef.current = answer;
        targetTextRef.current = answer;
        // DO NOT update lastIdRef here, wait for real answer or static render
      }
      return;
    }

    // 2. Handle Streaming Disabled
    if (!streaming) {
      lastStreamingRef.current = streaming;
      if (lastAnswerRef.current !== answer || (id && id !== lastIdRef.current)) {
        lastAnswerRef.current = answer;
        if (id) lastIdRef.current = id;
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setTypedText("");
        setIsTypingAnimation(false);
        try {
          const blocks = parseContent(answer);
          setDisplayedBlocks(blocks);
          seenAnswersGlobal.add(cacheKey);
        } catch {
          setDisplayedBlocks([{ type: 'p', content: answer } as any]);
          seenAnswersGlobal.add(cacheKey);
        }
      }
      return;
    }

    // 3. Handle Streaming Enabled
    lastStreamingRef.current = streaming;
    targetTextRef.current = answer;

    // CRITICAL: Check if this answer was already fully rendered (prevents re-streaming on tab switch)
    if (seenAnswersGlobal.has(cacheKey) && !isGenerating) {
      // Already rendered this answer before - show it instantly without re-animation
      if (lastAnswerRef.current !== answer) {
        lastAnswerRef.current = answer;
        if (id) lastIdRef.current = id;
        if (typingTimerRef.current) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        setTypedText("");
        setIsTypingAnimation(false);
        displayedTextRef.current = answer;
        try {
          const blocks = parseContent(answer);
          setDisplayedBlocks(blocks);
        } catch {
          setDisplayedBlocks([{ type: 'p', content: answer } as any]);
        }
      }
      return;
    }

    // Reset if target diverged (e.g. content changed significantly or completely new response)
    // We strictly check if 'answer' starts with 'displayed'. If not, it's a new context.
    // We ALSO check if the ID changed (new question), forcing a reset even if text overlaps.
    const idChanged = id !== lastIdRef.current;

    if (idChanged || (!answer.startsWith(displayedTextRef.current) && displayedTextRef.current.length > 0)) {
      displayedTextRef.current = "";
      setTypedText("");
      setDisplayedBlocks([]);
      if (idChanged) lastIdRef.current = id;
    }

    // Identify if we need to start the loop
    if (!typingTimerRef.current) {
      setIsTypingAnimation(true);
      // Clear blocks while animating
      setDisplayedBlocks([]);

      typingTimerRef.current = setInterval(() => {
        const current = displayedTextRef.current;
        const target = targetTextRef.current;

        // Case 1: Caught up
        if (current.length >= target.length) {
          // If we are still generating, we wait for more data.
          if (isGeneratingRef.current) {
            return;
          }

          // If we are done generating, we are finished.
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
          setIsTypingAnimation(false);

          // Parse and show blocks
          try {
            const blocks = parseContent(target);
            setDisplayedBlocks(blocks);
            seenAnswersGlobal.add(cacheKey);
          } catch {
            setDisplayedBlocks([{ type: 'p', content: target } as any]);
            seenAnswersGlobal.add(cacheKey);
          }

          // Keep typedText empty as we switched to blocks
          setTypedText("");

          // Update lastAnswerRef to prevent re-triggering "non-streaming" logic if prop flips
          lastAnswerRef.current = target;
          return;
        }

        // Case 2: Need to append text (Animation)
        const remaining = target.slice(current.length);

        let nextChunk = "";
        // Multi-tier chunking for natural streaming (mimicking ChatGPT smoothness)
        if (remaining.length > 600) {
          nextChunk = remaining.slice(0, 40); // Fast initial progress
        } else if (remaining.length > 150) {
          nextChunk = remaining.slice(0, 20); // Steady flow
        } else {
          // Natural word streaming near the end
          const match = remaining.match(/^(\s*\S+\s*)/);
          nextChunk = match ? match[1] : remaining.charAt(0);

          // Clamp extremely long tokens
          if (nextChunk.length > 25) {
            nextChunk = nextChunk.slice(0, 15);
          }
        }

        displayedTextRef.current += nextChunk;
        setTypedText(displayedTextRef.current);

      }, 35); // 35ms update rate - optimal balance of premium feel and speed
    }

    return () => {
      if (typingTimerRef.current) {
        console.log('[AnswerCard] Timer Cleanup', { id });
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [answer, streaming, id, isGenerating]); // Dependencies: answer updates target. isGenerating tracked via Ref.

  // Debug state changes
  useEffect(() => {
    console.log('[AnswerCard] State Update', {
      id,
      streaming,
      isGenerating,
      isTyping: isTypingAnimation,
      displayedTextLen: displayedTextRef.current.length,
      answerLen: answer.length,
      hasBlocks: displayedBlocks.length > 0
    });
  }, [id, streaming, isGenerating, isTypingAnimation, answer, displayedBlocks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, []);

  // Real-time formatting function for streaming text
  const sanitizeIncoming = (raw: string) => {
    // Preserve inline emphasis tags; strip dangerous tags only
    // Remove script/style tags and their content
    let safe = raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
    // Disallow all tags except a safe allowlist (strong, b, em, i, code, pre, br, span)
    // Replace disallowed tags with their text content
    safe = safe.replace(/<\/?(?!strong\b|b\b|em\b|i\b|code\b|pre\b|br\b|span\b)[a-z0-9-]+(?:\s+[^>]*?)?>/gi, '');
    // Neutralize LaTeX-style math markers so they don't render as math
    // Convert $$...$$ and $...$ into inline code for safe display
    const neutralizeLatexMath = (input: string): string => {
      // Block-style: $$ ... $$ (across lines)
      let out = input.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => {
        const content = String(inner || '').trim();
        if (!content) return '';
        return '`' + content.replace(/`/g, '\\`') + '`';
      });
      // Inline: $ ... $ (single line, avoid greedy and stray $)
      out = out.replace(/\$(?!\s)([^$\n]{1,200}?)\$(?!\s)/g, (_m, inner) => {
        const content = String(inner || '').trim();
        if (!content) return '';
        return '`' + content.replace(/`/g, '\\`') + '`';
      });
      return out;
    };
    safe = neutralizeLatexMath(safe);
    // Replace common LaTeX commands with plain-text/unicode equivalents
    const normalizeLatexCommands = (input: string): string => {
      const replacements: Array<[RegExp, string]> = [
        [/\\rightarrow\b/g, '→'],
        [/\\to\b/g, '→'],
        [/\\leftarrow\b/g, '←'],
        [/\\Rightarrow\b/g, '⇒'],
        [/\\Leftarrow\b/g, '⇐'],
        [/\\leftrightarrow\b/g, '↔'],
        [/\\cdot\b/g, '·'],
        [/\\times\b/g, '×'],
        [/\\div\b/g, '÷'],
        [/\\pm\b/g, '±'],
        [/\\leq\b/g, '≤'],
        [/\\geq\b/g, '≥'],
        [/\\neq\b/g, '≠'],
        [/\\approx\b/g, '≈'],
        [/\\sim\b/g, '∼'],
        [/\\infty\b/g, '∞'],
        [/\\ldots\b/g, '…'],
        [/\\dots\b/g, '…'],
        [/\\subseteq\b/g, '⊆'],
        [/\\supseteq\b/g, '⊇'],
        [/\\subset\b/g, '⊂'],
        [/\\supset\b/g, '⊃'],
        [/\\cup\b/g, '∪'],
        [/\\cap\b/g, '∩'],
      ];
      let out = input;
      for (const [pattern, repl] of replacements) out = out.replace(pattern, repl);
      return out;
    };
    safe = normalizeLatexCommands(safe);
    return safe;
  };

  const formatStreamingText = (text: string) => {
    if (!text) return '';
    // Split by code fences to handle mixed content; sanitize only non-code parts
    const parts = text.split(/```/g);
    let result = '';

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // This is a code block section
        const codeContent = parts[i].trim();
        if (codeContent) {
          // Extract language if present
          const lines = codeContent.split('\n');
          let lang = '';
          let actualCode = '';

          if (lines.length > 0 && lines[0].trim().match(/^[a-zA-Z0-9+#._-]+$/)) {
            lang = lines[0].trim();
            actualCode = lines.slice(1).join('\n');
          } else {
            actualCode = codeContent;
          }

          // Only show code block if we have actual code content
          if (actualCode.trim()) {
            result += `<div class="code-block" data-lang="${lang}">`;
            result += `<div class="code-header">${lang ? lang.charAt(0).toUpperCase() + lang.slice(1) + ' Code' : 'Code'}</div>`;
            // Do NOT sanitize/normalize code content
            result += `<pre><code class="language-${lang}">${highlightCode(actualCode, lang)}</code></pre>`;
            result += `</div>`;
          }
        }
      } else {
        // This is regular text content
        const textContent = sanitizeIncoming(parts[i]);
        if (textContent.trim()) {
          result += formatTextContent(textContent);
        }
      }
    }

    return result;
  };

  // Handle incomplete code blocks during streaming
  const formatIncompleteCodeBlock = (text: string) => {
    // Find the last ``` to get the incomplete code section without altering code content
    const lastCodeStart = text.lastIndexOf('```');
    if (lastCodeStart === -1) return formatTextContent(sanitizeIncoming(text));

    const beforeCode = sanitizeIncoming(text.substring(0, lastCodeStart));
    const incompleteCodeSection = text.substring(lastCodeStart + 3);

    let result = '';

    // Format any text before the code block
    if (beforeCode.trim()) {
      result += formatStreamingText(beforeCode);
    }

    // Handle the incomplete code section
    if (incompleteCodeSection.trim()) {
      const lines = incompleteCodeSection.split('\n');
      let lang = '';
      let codeContent = '';

      if (lines.length > 0 && lines[0].trim().match(/^\w+$/)) {
        lang = lines[0].trim();
        codeContent = lines.slice(1).join('\n');
      } else {
        codeContent = incompleteCodeSection;
      }

      // Show the incomplete code block
      result += `<div class="code-block streaming" data-lang="${lang}">`;
      result += `<div class="code-header">${lang ? lang.charAt(0).toUpperCase() + lang.slice(1) + ' Code' : 'Code'} (streaming...)</div>`;
      // Do NOT sanitize/normalize code content
      result += `<pre><code class="language-${lang}">${highlightCode(codeContent, lang)}</code></pre>`;
      result += `</div>`;
    }

    return result;
  };

  // Format text content with real-time markdown-like formatting
  const formatTextContent = (text: string) => {
    if (!text.trim()) return '';

    // If a PARTIAL (streaming) table exists, render it immediately so users see a
    // formatted table as it grows during streaming.
    const partialTableRegion = findPartialMarkdownTable(text);
    if (partialTableRegion) {
      const lines = text.split('\n');
      const before = lines.slice(0, partialTableRegion.start).join('\n');
      const after = lines.slice(partialTableRegion.end + 1).join('\n');
      const tableHtml = `<div class="table-container">${renderTable({ headers: partialTableRegion.headers, rows: partialTableRegion.rows })}</div>`;
      return `${formatTextContent(before)}${tableHtml}${formatTextContent(after)}`;
    }

    // If a strict table exists within the text, render surrounding content as well
    const strictTableRegion = findStrictMarkdownTable(text);
    if (strictTableRegion) {
      const lines = text.split('\n');
      const before = lines.slice(0, strictTableRegion.start).join('\n');
      const after = lines.slice(strictTableRegion.end + 1).join('\n');
      const tableHtml = `<div class="table-container">${renderTable({ headers: strictTableRegion.headers, rows: strictTableRegion.rows })}</div>`;
      return `${formatTextContent(before)}${tableHtml}${formatTextContent(after)}`;
    }

    let formatted = text;

    // Handle bold text (**text**) - be careful with partial matches during streaming
    // 1) Temporarily hide unmatched opening '**' on a line until the closer arrives
    formatted = formatted.replace(/^(\*\*)(?![^\n]*\*\*)/gm, '');
    // 2) Replace complete bold patterns
    formatted = formatted.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');

    // Handle bullet points with dashes or asterisks (including indented ones)
    formatted = formatted.replace(/^(\s*)[-–]\s+(.+)$/gm, (match, indent, content) => {
      const indentLevel = indent.length;
      if (indentLevel > 0) {
        return `<li class="bullet-item" style="padding-left: ${indentLevel * 0.5}rem;">${content}</li>`;
      }
      return `<li class="bullet-item">${content}</li>`;
    });

    formatted = formatted.replace(/^(\s*)\*\s+(.+)$/gm, (match, indent, content) => {
      const indentLevel = indent.length;
      if (indentLevel > 0) {
        return `<li class="bullet-item" style="padding-left: ${indentLevel * 0.5}rem;">${content}</li>`;
      }
      return `<li class="bullet-item">${content}</li>`;
    });

    // Handle numbered lists (only at start of line)
    formatted = formatted.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="numbered-item">$2</li>');

    // Handle headings (only at start of line)
    formatted = formatted.replace(/^#{1,6}\s+(.+)$/gm, (match, content) => {
      const level = match.match(/^#+/)[0].length;
      return `<h${level} class="heading">${content}</h${level}>`;
    });

    // Wrap consecutive list items in proper lists
    formatted = formatted.replace(/(<li class="bullet-item">.*?<\/li>(\s*<li class="bullet-item">.*?<\/li>)*)/gs, '<ul class="bullet-list">$1</ul>');
    formatted = formatted.replace(/(<li class="numbered-item">.*?<\/li>(\s*<li class="numbered-item">.*?<\/li>)*)/gs, '<ol class="numbered-list">$1</ol>');

    // Handle line breaks and paragraphs - create more compact formatting
    const lines = formatted.split('\n');
    let result = '';
    let inList = false;
    let currentParagraph = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // Check if this line starts a list item
      if (line.includes('<li class="')) {
        // Close any open paragraph before starting a list
        if (currentParagraph.trim()) {
          result += `<p class="paragraph">${currentParagraph.trim()}</p>`;
          currentParagraph = '';
        }

        if (!inList) {
          inList = true;
          // Check if the previous element was a heading to apply closer spacing
          const isAfterHeading = result.trim().endsWith('</h1>') || result.trim().endsWith('</h2>') || result.trim().endsWith('</h3>') || result.trim().endsWith('</h4>') || result.trim().endsWith('</h5>') || result.trim().endsWith('</h6>');
          if (isAfterHeading) {
            result += '<ul class="bullet-list" style="margin-top: 0.125rem;">';
          } else {
            result += '<ul class="bullet-list">';
          }
        }
        result += line;
      } else if (!line.includes('<li class="') && inList) {
        // End of list
        inList = false;
        result += '</ul>';

        if (line.trim()) {
          result += `<p class="paragraph">${line.trim()}</p>`;
        }
      } else if (line.trim()) {
        // Regular paragraph content - accumulate lines for more compact formatting
        if (currentParagraph) {
          currentParagraph += ' ' + line.trim();
        } else {
          currentParagraph = line.trim();
        }

        // If next line is empty or starts a list, close the paragraph
        if (!nextLine || !nextLine.trim() || nextLine.includes('<li class="')) {
          if (currentParagraph.trim()) {
            result += `<p class="paragraph">${currentParagraph.trim()}</p>`;
            currentParagraph = '';
          }
        }
      }
    }

    // Close any remaining paragraph
    if (currentParagraph.trim()) {
      result += `<p class="paragraph">${currentParagraph.trim()}</p>`;
    }

    return result;
  };

  // Render table as HTML string (UI only; PDF transforms happen during export)
  const renderTable = (tableData: { headers: string[], rows: string[][] }): string => {
    const { headers, rows } = tableData;
    let tableHtml = '<div class="table-wrapper" style="overflow-x:auto;">';
    tableHtml += '<table class="data-table" style="width:100%; border-collapse:collapse;">';
    tableHtml += '<thead><tr>';
    headers.forEach(header => {
      tableHtml += `<th>${header}</th>`;
    });
    tableHtml += '</tr></thead>';
    tableHtml += '<tbody>';
    rows.forEach(row => {
      tableHtml += '<tr>';
      row.forEach((cell) => {
        tableHtml += `<td>${cell}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody>';
    tableHtml += '</table></div>';
    return tableHtml;
  };

  // Find a PARTIAL markdown table suitable for streaming rendering
  const findPartialMarkdownTable = (
    text: string
  ): { start: number, end: number, headers: string[], rows: string[][] } | null => {
    const lines = text.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length - 1; i++) {
      const header = lines[i];
      const sep = lines[i + 1];
      if (/^\s*\|.*\|\s*$/.test(header) && /^\s*\|\s*:?-{3,}.*\|\s*$/.test(sep)) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
    let end = start + 1;
    for (let i = start + 2; i < lines.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i])) {
        end = i;
      } else {
        break;
      }
    }
    const headerCells = lines[start]
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map(c => c.trim());
    const bodyLines = lines.slice(start + 2, end + 1);
    const rows = bodyLines.map(line =>
      line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map(c => c.trim())
    );
    return { start, end, headers: headerCells, rows };
  };

  // Find the first strict markdown table region and return its bounds and data
  const findStrictMarkdownTable = (text: string): { start: number, end: number, headers: string[], rows: string[][] } | null => {
    const lines = text.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|\s*:?-{3,}.*\|\s*$/.test(lines[i + 1])) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
    let end = start + 1;
    for (let i = start + 2; i < lines.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i])) {
        end = i;
      } else {
        break;
      }
    }
    const headerCells = lines[start].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const bodyLines = lines.slice(start + 2, end + 1);
    const rows = bodyLines.map(line => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
    return { start, end, headers: headerCells, rows };
  };

  // More tolerant: detect pipe-delimited tables even without a markdown separator row
  const findLoosePipeTable = (text: string): { start: number, end: number, headers: string[], rows: string[][] } | null => {
    const lines = text.split('\n');
    const isPipeRow = (s: string) => (s.match(/\|/g) || []).length >= 2; // at least 2 pipes
    const isSeparatorRow = (s: string) => /^\s*\|?\s*[:\-\s|]+\s*\|?\s*$/.test(s);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isPipeRow(lines[i])) { start = i; break; }
    }
    if (start === -1) return null;
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
      if (isPipeRow(lines[i])) end = i; else break;
    }
    // Need at least 2 pipe-rows to call it a table
    if (end - start + 1 < 2) return null;
    const slice = lines.slice(start, end + 1);
    let bodyStartIdx = 1;
    // Skip markdown-style separator row if present
    if (slice.length >= 2 && isSeparatorRow(slice[1])) bodyStartIdx = 2;
    const toCells = (line: string) => line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map(c => c.trim())
      .filter((c, i, arr) => !(i === arr.length - 1 && c === ''));
    const headers = toCells(slice[0]);
    const rows: string[][] = slice.slice(bodyStartIdx).map(toCells).filter(r => r.length > 0);
    if (headers.length < 2 || rows.length === 0) return null;
    return { start, end, headers, rows };
  };

  const parseContent = (text: string) => {
    const blocks: Array<{ type: string, content: string, lang?: string }> = [];

    // First, split by code fences to separate code from text; sanitize only non-code parts
    const parts = text.split(/```/g);

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // This is a code block - extract language and code
        const lines = parts[i].trim().split('\n');
        const lang = lines[0].match(/^\w+/) ? lines[0].trim() : '';
        const code = lines.slice(1).join('\n').trim();
        if (code) {
          blocks.push({ type: 'code', content: code, lang });
        }
      } else {
        // This is text content - parse for structure
        const textContent = sanitizeIncoming(parts[i]).trim();
        if (textContent) {
          // Heuristic: treat standalone Mermaid definitions as a diagram even without ``` fences
          const firstLine = textContent.split('\n')[0].trim();
          if (/^(flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram|stateDiagram-v2|gantt|journey|pie|mindmap|timeline)\b/.test(firstLine)) {
            console.log('Detected standalone Mermaid:', { firstLine, content: textContent.substring(0, 100) + '...' });
            blocks.push({ type: 'code', content: textContent, lang: 'mermaid' });
            continue;
          }
          // If a table exists, split around it to preserve surrounding text
          let region = findStrictMarkdownTable(textContent);
          // Fallback: accept loose pipe tables without separator rows
          if (!region) {
            region = findLoosePipeTable(textContent);
          }
          if (region) {
            const lines = textContent.split('\n');
            const before = lines.slice(0, region.start).join('\n');
            const after = lines.slice(region.end + 1).join('\n');
            if (before.trim()) {
              parseContent(before).forEach(b => blocks.push(b));
            }
            blocks.push({ type: 'table', content: JSON.stringify({ headers: region.headers, rows: region.rows }), lang: 'table' });
            if (after.trim()) {
              parseContent(after).forEach(b => blocks.push(b));
            }
            continue;
          }

          // Check for docstrings first - only if content starts with docstring markers
          const trimmedText = textContent.trim();
          if (trimmedText.startsWith('/**') && textContent.includes('*/')) {
            // Detect C++/Java/JavaScript docstrings and treat as code blocks
            blocks.push({ type: 'code', content: textContent, lang: 'cpp' });
            continue;
          } else if (trimmedText.startsWith('"""') && textContent.split('"""').length >= 3) {
            // Detect Python docstrings and treat as code blocks
            blocks.push({ type: 'code', content: textContent, lang: 'python' });
            continue;
          }

          // Split into lines and process each
          const lines = textContent.split('\n');
          let currentBlock: { type: string, content: string } | null = null;

          lines.forEach((line, idx) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // Normalize single-line pipe rows like "| a | b | c |" into a readable sentence when
            // they are not part of a multi-row table. This prevents leftover raw pipe content.
            if (/^\|.*\|$/.test(trimmedLine)) {
              const cells = trimmedLine
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map(c => c.trim())
                .filter(Boolean);
              if (cells.length >= 2) {
                const normalized = cells.join(' • ');
                if (currentBlock?.type !== 'p') {
                  if (currentBlock) blocks.push(currentBlock);
                  currentBlock = { type: 'p', content: '' };
                }
                currentBlock.content += (currentBlock.content ? '\n' : '') + normalized;
                return;
              }
            }

            // Check for headings first (##, ###, ####, etc.)
            const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
            if (headingMatch) {
              if (currentBlock) blocks.push(currentBlock);
              const level = headingMatch[1].length;
              // Process bold text within headings
              const processedContent = headingMatch[2].trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              blocks.push({
                type: 'heading',
                content: processedContent,
                lang: level.toString()
              });
              currentBlock = null;
              return;
            }

            // Check for bold-only headings (like **Complete Answer**, **Detailed Explanation**, etc.)
            const boldHeadingMatch = trimmedLine.match(/^\*\*(.*?)\*\*\s*$/);
            if (boldHeadingMatch) {
              if (currentBlock) blocks.push(currentBlock);
              const processedContent = `<strong>${boldHeadingMatch[1].trim()}</strong>`;
              blocks.push({ type: 'heading', content: processedContent, lang: '2' });
              currentBlock = null;
              return;
            }

            // Heuristic: treat short, title-like lines as headings
            const words = trimmedLine.split(/\s+/).filter(Boolean);
            const looksLikeTitle = (
              words.length > 0 && words.length <= 8 &&
              /[A-Za-z]/.test(trimmedLine) &&
              /[A-Za-z0-9)]$/.test(trimmedLine.replace(/[:*\-]+$/, '')) &&
              /^[A-Z]/.test(trimmedLine)
            );
            // Prefer heading only if next line exists and isn't another heading marker
            if (looksLikeTitle) {
              if (currentBlock) blocks.push(currentBlock);
              const processedContent = trimmedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              blocks.push({ type: 'heading', content: processedContent, lang: '2' });
              currentBlock = null;
              return;
            }

            // Check for numbered sections (1., 2., 3., etc.)
            const numberedSectionMatch = trimmedLine.match(/^(\d+)\.\s+(.+)/);
            if (numberedSectionMatch) {
              if (currentBlock) blocks.push(currentBlock);
              // Process bold text within numbered sections
              const processedContent = numberedSectionMatch[2].trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              blocks.push({
                type: 'heading',
                content: processedContent,
                lang: '2'
              });
              currentBlock = null;
              return;
            }

            // Check for bold sub-headings with descriptions (like **Structured Answering:** description)
            const boldSubHeadingMatch = trimmedLine.match(/^\*\*(.*?)\*\*[:\s]+(.+)/);
            if (boldSubHeadingMatch) {
              if (currentBlock) blocks.push(currentBlock);
              const subHeading = boldSubHeadingMatch[1].trim();
              const description = boldSubHeadingMatch[2].trim();
              // Create a heading block for the sub-heading
              blocks.push({
                type: 'heading',
                content: `<strong>${subHeading}:</strong>`,
                lang: '3'
              });
              // Create a paragraph block for the description
              blocks.push({
                type: 'p',
                content: description
              });
              currentBlock = null;
              return;
            }

            // Check for bold-only sub-headings (like **Structured Answering:** with no description on same line)
            const boldOnlySubHeadingMatch = trimmedLine.match(/^\*\*(.*?)\*\*[:\s]*$/);
            if (boldOnlySubHeadingMatch) {
              if (currentBlock) blocks.push(currentBlock);
              const subHeading = boldOnlySubHeadingMatch[1].trim();
              blocks.push({
                type: 'heading',
                content: `<strong>${subHeading}:</strong>`,
                lang: '3'
              });
              currentBlock = null;
              return;
            }

            // Check for bullet points with dashes
            const dashMatch = trimmedLine.match(/^[-–]\s+(.+)/);
            if (dashMatch) {
              if (currentBlock?.type !== 'ul') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = { type: 'ul', content: '' };
              }
              // Process bold text within bullet points
              const processedContent = dashMatch[1].trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              currentBlock.content += `<li>${processedContent}</li>`;
              return;
            }

            // Check for bullet points with asterisks
            const asteriskMatch = trimmedLine.match(/^\*\s+(.+)/);
            if (asteriskMatch) {
              if (currentBlock?.type !== 'ul') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = { type: 'ul', content: '' };
              }
              // Process bold text within bullet points
              const processedContent = asteriskMatch[1].trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              currentBlock.content += `<li>${processedContent}</li>`;
              return;
            }

            // Regular paragraph - process bold text within the line
            if (currentBlock?.type !== 'p') {
              if (currentBlock) blocks.push(currentBlock);
              currentBlock = { type: 'p', content: '' };
            }
            // Process bold text within the line
            const processedLine = trimmedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            currentBlock.content += (currentBlock.content ? '\n' : '') + processedLine;
          });

          if (currentBlock) blocks.push(currentBlock);
        }
      }
    }
    return blocks;
  };

  // Helper function to find comment index for different comment styles
  const findCommentIndex = (line: string, commentChars: string[]): number => {
    if (!commentChars || commentChars.length === 0) return -1;

    for (const char of commentChars) {
      if (!char) continue;
      const index = line.indexOf(char);
      if (index !== -1) {
        // For multi-character comments like /*, check if it's not part of a string
        if (char.length > 1) {
          // Simple check: if it's not inside quotes
          const beforeComment = line.substring(0, index);
          const singleQuotes = (beforeComment.match(/'/g) || []).length;
          const doubleQuotes = (beforeComment.match(/"/g) || []).length;
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
            return index;
          }
        } else {
          return index;
        }
      }
    }
    return -1;
  };

  // Helper function to determine token type based on language
  const getTokenType = (token: string, config: any, lang: string): string => {
    // Check for numbers (including decimals, hex, binary, etc.)
    if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token) ||
      /^0[xX][0-9a-fA-F]+$/.test(token) ||
      /^0[bB][01]+$/.test(token) ||
      /^0[0-7]+$/.test(token)) {
      return 'number';
    }

    // Check for strings
    if (config.stringChars.some((char: string) =>
      (token.startsWith(char) && token.endsWith(char)) ||
      (char === '`' && token.startsWith('`') && token.endsWith('`')))) {
      return 'string';
    }

    // Check for keywords
    if (config.keywords.includes(token)) {
      return 'keyword';
    }

    // Check for builtins
    if (config.builtins.includes(token)) {
      return 'builtin';
    }

    // Special cases for specific languages
    if (lang === 'python' && token === 'print') {
      return 'print';
    }

    // Check for function calls (tokens followed by parentheses)
    if (token.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      return 'function';
    }

    return 'text';
  };

  // Helper function to apply highlighting based on token type
  const applyHighlighting = (token: string, tokenType: string): string => {
    switch (tokenType) {
      case 'keyword':
        return `<span class="code-keyword">${token}</span>`;
      case 'number':
        return `<span class="code-number">${token}</span>`;
      case 'string':
        return `<span class="code-string">${token}</span>`;
      case 'builtin':
        return `<span class="code-builtin">${token}</span>`;
      case 'function':
        return `<span class="code-function">${token}</span>`;
      case 'print':
        return `<span class="code-print">${token}</span>`;
      default:
        // Escape HTML entities for plain text
        return token
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
    }
  };

  const highlightCode = (code: string, lang: string) => {
    // Enhanced multi-language syntax highlighting

    // Note: keep syntax highlighting enabled even when Python triple quotes exist.
    // Normalize duplicated Python docstring delimiters that sometimes arrive as
    // '""" """' or "'''
    // ''' on the same line during streaming/merging. We collapse them to a
    // single delimiter BEFORE tokenization so highlighting isn't affected.
    if ((lang || '').toLowerCase() === 'python') {
      code = code
        // Collapse:  """   """  ->  """
        .replace(/(^|\n)([\t ]*)(""")\s*(""")(\s*)(?=\n|$)/g, '$1$2$3$5')
        // Collapse:  '''   '''  ->  '''
        .replace(/(^|\n)([\t ]*)(''')\s*(''')(\s*)(?=\n|$)/g, '$1$2$3$5')
        // Overkill guard: six consecutive quotes on a line -> three
        .replace(/(^|\n)([\t ]*)"{6}(\s*)(?=\n|$)/g, '$1$2"""$3')
        .replace(/(^|\n)([\t ]*)'{6}(\s*)(?=\n|$)/g, "$1$2'''$3");
    }

    // Check if this is a pure docstring block (starts with /** and ends with */)
    const trimmedCode = code.trim();
    if (trimmedCode.startsWith('/**') && trimmedCode.endsWith('*/')) {
      // This is definitely a docstring - treat as plain text with orange color
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<span class="code-string">${escapedCode}</span>`;
    }

    // Check if this is a pure Python docstring block (starts with """ and ends with """)
    if (trimmedCode.startsWith('"""') && trimmedCode.endsWith('"""') && trimmedCode.split('"""').length >= 3) {
      // This is definitely a Python docstring - treat as plain text with orange color
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<span class="code-string">${escapedCode}</span>`;
    }

    const lines = code.split('\n');
    const highlightedLines: string[] = [];

    // Language-specific configurations
    const languageConfigs = {
      python: {
        keywords: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'lambda', 'yield', 'raise', 'assert', 'del', 'global', 'nonlocal', 'async', 'await', 'match', 'case'],
        builtins: ['print', 'len', 'range', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all', 'isinstance', 'type', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'input', 'open', 'round', 'divmod', 'pow', 'bin', 'hex', 'oct', 'chr', 'ord', 'hash', 'id', 'dir', 'vars', 'locals', 'globals', 'eval', 'exec'],
        commentChars: ['#'],
        stringChars: ['"', "'"],
        docstringChars: ['"""', "'''"],
        multilineCommentStart: ['"""', "'''"],
        multilineCommentEnd: ['"""', "'''"]
      },
      javascript: {
        keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'],
        builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent'],
        commentChars: ['//', '/*'],
        stringChars: ['"', "'", '`'],
        docstringChars: [],
        multilineCommentStart: ['/*', '/**'],
        multilineCommentEnd: ['*/', '*/']
      },
      typescript: {
        keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'any', 'void', 'never', 'unknown', 'string', 'number', 'boolean', 'object', 'array', 'tuple', 'union', 'intersection'],
        builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent'],
        commentChars: ['//', '/*'],
        stringChars: ['"', "'", '`'],
        docstringChars: [],
        multilineCommentStart: ['/*', '/**'],
        multilineCommentEnd: ['*/', '*/']
      },
      java: {
        keywords: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'extends', 'implements', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'import', 'package', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'assert', 'enum', 'boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double', 'void', 'true', 'false', 'null'],
        builtins: ['System', 'String', 'Object', 'Integer', 'Double', 'Float', 'Boolean', 'Character', 'Byte', 'Short', 'Long', 'Math', 'Arrays', 'Collections', 'List', 'ArrayList', 'HashMap', 'HashSet', 'Scanner', 'Random', 'Date', 'Calendar', 'SimpleDateFormat', 'File', 'FileReader', 'FileWriter', 'BufferedReader', 'BufferedWriter', 'PrintWriter', 'Exception', 'RuntimeException', 'IOException', 'NullPointerException', 'IllegalArgumentException'],
        commentChars: ['//', '/*'],
        stringChars: ['"'],
        docstringChars: [],
        multilineCommentStart: ['/*', '/**'],
        multilineCommentEnd: ['*/', '*/']
      },
      cpp: {
        keywords: ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', 'class', 'private', 'protected', 'public', 'virtual', 'friend', 'inline', 'operator', 'template', 'this', 'new', 'delete', 'namespace', 'using', 'try', 'catch', 'throw', 'bool', 'true', 'false', 'nullptr', 'constexpr', 'decltype', 'auto', 'nullptr'],
        builtins: ['cout', 'cin', 'endl', 'string', 'vector', 'map', 'set', 'list', 'queue', 'stack', 'deque', 'array', 'pair', 'make_pair', 'sort', 'find', 'count', 'size', 'empty', 'push_back', 'pop_back', 'insert', 'erase', 'begin', 'end', 'rbegin', 'rend', 'cbegin', 'cend', 'max', 'min', 'abs', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'log', 'exp', 'floor', 'ceil', 'round', 'rand', 'srand', 'time', 'clock', 'malloc', 'free', 'calloc', 'realloc', 'strlen', 'strcpy', 'strcat', 'strcmp', 'strstr', 'strchr', 'strtok', 'printf', 'scanf', 'fprintf', 'fscanf', 'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs', 'getchar', 'putchar', 'gets', 'puts'],
        commentChars: ['//', '/*'],
        stringChars: ['"'],
        docstringChars: [],
        multilineCommentStart: ['/*', '/**'],
        multilineCommentEnd: ['*/', '*/']
      },
      c: {
        keywords: ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while'],
        builtins: ['printf', 'scanf', 'fprintf', 'fscanf', 'fopen', 'fclose', 'fread', 'fwrite', 'fgets', 'fputs', 'getchar', 'putchar', 'gets', 'puts', 'malloc', 'free', 'calloc', 'realloc', 'strlen', 'strcpy', 'strcat', 'strcmp', 'strstr', 'strchr', 'strtok', 'atoi', 'atof', 'atol', 'itoa', 'sprintf', 'sscanf', 'strtol', 'strtoul', 'strtod', 'rand', 'srand', 'time', 'clock', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'log', 'exp', 'floor', 'ceil', 'abs', 'fabs', 'ceil', 'floor', 'round'],
        commentChars: ['//', '/*'],
        stringChars: ['"'],
        docstringChars: [],
        multilineCommentStart: ['/*'],
        multilineCommentEnd: ['*/']
      },
      sql: {
        keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'TRIGGER', 'PROCEDURE', 'FUNCTION', 'CURSOR', 'DECLARE', 'BEGIN', 'END', 'IF', 'ELSE', 'WHILE', 'FOR', 'LOOP', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'UNION', 'INTERSECT', 'EXCEPT', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'AS', 'WITH', 'RECURSIVE', 'WINDOW', 'PARTITION', 'OVER', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE', 'NTILE', 'PERCENT_RANK', 'CUME_DIST'],
        builtins: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VARIANCE', 'CONCAT', 'SUBSTRING', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM', 'REPLACE', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'GETDATE', 'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'DATEADD', 'DATEDIFF', 'DATEPART', 'ISNULL', 'ISNULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'],
        commentChars: ['--', '/*'],
        stringChars: ['"', "'"],
        docstringChars: [],
        multilineCommentStart: ['/*'],
        multilineCommentEnd: ['*/']
      }
    };

    // Get language configuration or default to Python
    const config = languageConfigs[lang as keyof typeof languageConfigs] || languageConfigs.python;

    // Ensure all required arrays exist
    if (!config.multilineCommentStart) config.multilineCommentStart = [];
    if (!config.multilineCommentEnd) config.multilineCommentEnd = [];
    if (!config.commentChars) config.commentChars = [];

    // Track multi-line comment state for all languages
    let inMultilineComment = false;
    let multilineCommentEnd = '';
    let isDocstringComment = false; // Track if we're in a docstring (/** or """)

    // Dedicated Python docstring state to avoid color bleed and simplify handling
    let pythonDocOpen = false;
    // Language-agnostic Javadoc/KDoc-style doc block guard: /** ... */ across lines
    let universalDocBlockOpen = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let highlightedLine = '';
      let i = 0;

      // Python-only: handle triple-quote docstrings first and bypass generic logic
      if ((lang || '').toLowerCase() === 'python') {
        const OPEN = '"""';
        const CLOSE = '"""';
        if (!pythonDocOpen) {
          const openIdx = line.indexOf(OPEN);
          if (openIdx !== -1) {
            const closeIdx = line.indexOf(CLOSE, openIdx + OPEN.length);
            if (closeIdx !== -1) {
              // Single-line docstring
              const before = line.substring(0, openIdx);
              const inner = line.substring(openIdx + OPEN.length, closeIdx);
              const after = line.substring(closeIdx + CLOSE.length);
              const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const escInner = inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              // Tokenize the after segment normally
              let tokenizedAfter = '';
              let k = 0;
              while (k < after.length) {
                if (/\s/.test(after[k])) { tokenizedAfter += after[k]; k++; continue; }
                let tok = '';
                let j = k;
                while (j < after.length && !/\s/.test(after[j])) { tok += after[j]; j++; }
                const ttype = getTokenType(tok, languageConfigs.python, 'python');
                tokenizedAfter += applyHighlighting(tok, ttype);
                k = j;
              }
              // Fix: Added space before span to prevent parser issues
              // Fix: Added space before span to prevent parser issues
              highlightedLine = `${escBefore}${OPEN} <span class="code-string">${escInner}</span>${CLOSE}` + tokenizedAfter;
              highlightedLines.push(highlightedLine);
              continue;
            } else {
              // Start of multi-line docstring
              pythonDocOpen = true;
              const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              highlightedLines.push(`<span class="code-string">${esc}</span>`);
              continue;
            }
          }
        } else {
          // Inside multi-line docstring
          const closeIdx = line.indexOf(CLOSE);
          if (closeIdx !== -1) {
            const before = line.substring(0, closeIdx + CLOSE.length);
            const after = line.substring(closeIdx + CLOSE.length);
            const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // Tokenize after normally
            let tokenizedAfter = '';
            let k = 0;
            while (k < after.length) {
              if (/\s/.test(after[k])) { tokenizedAfter += after[k]; k++; continue; }
              let tok = '';
              let j = k;
              while (j < after.length && !/\s/.test(after[j])) { tok += after[j]; j++; }
              const ttype = getTokenType(tok, languageConfigs.python, 'python');
              tokenizedAfter += applyHighlighting(tok, ttype);
              k = j;
            }
            highlightedLines.push(`<span class="code-string">${escBefore}</span>` + tokenizedAfter);
            pythonDocOpen = false;
            continue;
          } else {
            const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            highlightedLines.push(`<span class="code-string">${esc}</span>`);
            continue;
          }
        }
      }

      // Universal /** ... */ doc block handling (CPP/Java/TS/JS/C)
      const tLine = line.trim();
      if (!universalDocBlockOpen && tLine.startsWith('/**')) {
        universalDocBlockOpen = true;
        const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlightedLines.push(`<span class="code-string">${esc}</span>`);
        continue;
      }
      if (universalDocBlockOpen) {
        const endIdx = line.indexOf('*/');
        if (endIdx !== -1) {
          const before = line.substring(0, endIdx + 2)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const after = line.substring(endIdx + 2);
          // Tokenize the remainder normally
          let tokenizedAfter = '';
          let k = 0;
          while (k < after.length) {
            if (/\s/.test(after[k])) { tokenizedAfter += after[k]; k++; continue; }
            let tok = '';
            let j = k;
            while (j < after.length && !/\s/.test(after[j])) { tok += after[j]; j++; }
            const ttype = getTokenType(tok, config, lang);
            tokenizedAfter += applyHighlighting(tok, ttype);
            k = j;
          }
          highlightedLines.push(`<span class="code-string">${before}</span>` + tokenizedAfter);
          universalDocBlockOpen = false;
        } else {
          const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLines.push(`<span class="code-string">${esc}</span>`);
        }
        continue;
      }

      // Check if this line is a comment (full line comment)
      const trimmedLine = line.trim();
      const isFullLineComment = config.commentChars.some(char => trimmedLine.startsWith(char));

      if (isFullLineComment) {
        // For full line comments, wrap the entire line
        highlightedLine = `<span class="code-comment">${line}</span>`;
      } else if (inMultilineComment) {
        // We're inside a multi-line comment/docstring
        const endPos = line.indexOf(multilineCommentEnd);
        if (endPos !== -1) {
          // Split the line at the closing delimiter so only the docstring part is orange
          const before = line.substring(0, endPos + multilineCommentEnd.length);
          const after = line.substring(endPos + multilineCommentEnd.length);
          const className = isDocstringComment ? 'code-string' : 'code-comment';
          const escapedBefore = before
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          // Tokenize the remainder of the line normally
          let tokenizedAfter = '';
          let k = 0;
          while (k < after.length) {
            if (/\s/.test(after[k])) { tokenizedAfter += after[k]; k++; continue; }
            let tok = '';
            let j = k;
            while (j < after.length && !/\s/.test(after[j])) { tok += after[j]; j++; }
            const ttype = getTokenType(tok, config, lang);
            tokenizedAfter += applyHighlighting(tok, ttype);
            k = j;
          }

          highlightedLine = `<span class="${className}">${escapedBefore}</span>` + tokenizedAfter;
          inMultilineComment = false;
          multilineCommentEnd = '';
          isDocstringComment = false;
        } else {
          // Continue multi-line comment/docstring - treat as plain text, no tokenization
          const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          const className = isDocstringComment ? 'code-string' : 'code-comment';
          highlightedLine = `<span class="${className}">${escapedLine}</span>`;
        }
      } else {
        // Check for start of multi-line comment (prioritize longer matches first)
        let multilineStartFound = false;
        // Sort by length descending to prioritize longer matches like /** over /*
        const sortedStarts = config.multilineCommentStart.slice().sort((a, b) => b.length - a.length);

        for (const startChar of sortedStarts) {
          if (trimmedLine.startsWith(startChar)) {
            multilineStartFound = true;
            // Find the corresponding end character
            const startIndex = config.multilineCommentStart.indexOf(startChar);
            const endChar = config.multilineCommentEnd[startIndex];

            // Handle single-line multi-line comments (must start AND end on same line)
            if (trimmedLine.includes(endChar) && trimmedLine.indexOf(endChar) > trimmedLine.indexOf(startChar)) {
              // Single-line multi-line comment/docstring
              const isDocstring = startChar === '/**' || startChar === '"""' || startChar === "'''";
              // For Python docstrings, color only the inner text, not the delimiters
              if (isDocstring) {
                const firstPos = line.indexOf(startChar);
                const endPos = line.indexOf(endChar, firstPos + startChar.length);
                if (firstPos !== -1 && endPos !== -1) {
                  const before = line.substring(0, firstPos);
                  const open = startChar;
                  const inner = line.substring(firstPos + startChar.length, endPos);
                  const close = endChar;
                  const after = line.substring(endPos + endChar.length);
                  const escapedBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const escapedInner = inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const escapedAfter = after.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  // Color the entire docstring (including /** and */) in orange for C/CPP/Java
                  highlightedLine = `${escapedBefore}<span class="code-string">${open}${escapedInner}${close}</span>${escapedAfter}`;
                } else {
                  const escapedLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                  highlightedLine = `<span class="code-string">${escapedLine}</span>`;
                }
              } else {
                const escapedLine = line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
                highlightedLine = `<span class="code-comment">${escapedLine}</span>`;
              }
            } else {
              // Multi-line comment/docstring start - escape HTML entities first, then wrap
              const escapedLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              // Check if it's a docstring (/** or """) - use string color, otherwise comment color
              const isDocstring = startChar === '/**' || startChar === '"""' || startChar === "'''";
              const className = isDocstring ? 'code-string' : 'code-comment';
              highlightedLine = `<span class="${className}">${escapedLine}</span>`;
              inMultilineComment = true;
              multilineCommentEnd = endChar;
              isDocstringComment = isDocstring;


            }
            break;
          }
        }

        if (!multilineStartFound) {
          // Multi-language tokenization with inline comment detection
          const commentIndex = findCommentIndex(line, config.commentChars);
          if (commentIndex !== -1) {
            // Split line into code part and comment part
            const codePart = line.substring(0, commentIndex);
            const commentPart = line.substring(commentIndex);

            // Process the code part with tokenization
            let codeHighlighted = '';
            let codeIndex = 0;

            while (codeIndex < codePart.length) {
              let token = '';
              let tokenType = 'text';

              // Skip whitespace
              if (/\s/.test(codePart[codeIndex])) {
                codeHighlighted += codePart[codeIndex];
                codeIndex++;
                continue;
              }

              // Extract token
              let j = codeIndex;
              while (j < codePart.length && !/\s/.test(codePart[j])) {
                token += codePart[j];
                j++;
              }

              // Determine token type based on language
              tokenType = getTokenType(token, config, lang);

              // Apply highlighting
              codeHighlighted += applyHighlighting(token, tokenType);

              codeIndex = j;
            }

            // Combine code and comment parts
            highlightedLine = codeHighlighted + `<span class="code-comment">${commentPart}</span>`;
          } else {
            // No inline comment, process normally
            while (i < line.length) {
              let token = '';
              let tokenType = 'text';

              // Skip whitespace
              if (/\s/.test(line[i])) {
                highlightedLine += line[i];
                i++;
                continue;
              }

              // Extract token
              let j = i;
              while (j < line.length && !/\s/.test(line[j])) {
                token += line[j];
                j++;
              }

              // Determine token type based on language
              tokenType = getTokenType(token, config, lang);

              // Apply highlighting
              highlightedLine += applyHighlighting(token, tokenType);

              i = j;
            }
          }
        }
      }

      highlightedLines.push(highlightedLine);
    }

    let html = highlightedLines.join('\n');
    // Collapse accidental duplicated Python/Docstring delimiters that may appear
    // when tokens are split around triple quotes. This preserves highlighting
    // for the rest of the code while fixing lines that showed `""" """`.
    if ((lang || '').toLowerCase() === 'python') {
      html = html
        .replace(/("""\s*){2,}/g, '"""')
        .replace(/('''\s*){2,}/g, "'''");
    }
    return html;
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Content has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExecute = (code: string, lang?: string) => {
    localStorage.setItem('code-runner-source', code);
    if (lang) {
      localStorage.setItem('code-runner-language-suggest', lang);
    }
    navigate('/run');
  };

  const handleShare = async (text: string) => {
    const shareText = text;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Response", text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard", description: "Sharing not supported. Text copied instead." });
      }
    } catch {
      // No-op if user cancels share
    }
  };

  const generateShorterAnswer = (fullAnswer: string): string => {
    const sentences = fullAnswer.split('. ');
    const shorterSentences = sentences.slice(0, Math.max(1, Math.floor(sentences.length / 2)));
    return shorterSentences.join('. ') + (shorterSentences.length > 1 ? '.' : '');
  };

  // Strict Markdown table detection & parsing only (no auto-conversion)
  const detectStrictMarkdownTable = (text: string): boolean => {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const header = lines[i];
      const sep = lines[i + 1];
      if (/^\s*\|.*\|\s*$/.test(header) && /^\s*\|\s*:?-{3,}.*\|\s*$/.test(sep)) {
        return true;
      }
    }
    return false;
  };

  const parseStrictMarkdownTable = (text: string): { headers: string[], rows: string[][] } | null => {
    const lines = text.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|\s*:?-{3,}.*\|\s*$/.test(lines[i + 1])) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
    const tableLines: string[] = [];
    for (let i = start; i < lines.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i])) tableLines.push(lines[i]); else break;
    }
    if (tableLines.length < 2) return null;
    const headerCells = tableLines[0].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const bodyLines = tableLines.slice(2);
    const rows = bodyLines.map(line => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
    return { headers: headerCells, rows };
  };

  const displayAnswer = isDetailed ? answer : generateShorterAnswer(answer);

  const extractFirstCodeBlock = (text: string): { lang: string; code: string } | null => {
    if (!text) return null;
    const parts = text.split(/```/g);
    for (let i = 1; i < parts.length; i += 2) {
      const raw = parts[i].trim();
      const lines = raw.split('\n');
      const maybeLang = lines[0].match(/^[a-zA-Z0-9+#._-]+$/) ? lines[0] : '';
      const code = (maybeLang ? lines.slice(1) : lines).join('\n').trim();
      if (code) return { lang: (maybeLang || '').toLowerCase(), code };
    }
    return null;
  };


  // Debug useEffect to monitor streaming and evaluate button state
  useEffect(() => {
    // Preload html2pdf early to avoid fallback to print pipeline
    preloadHtml2Pdf().catch(() => { });
    console.log('AnswerCard State Debug:', {
      streaming,
      isGenerating,
      question: question?.substring(0, 50) + '...',
      shouldShowEvaluate: responseComplete,
      isTypingAnimation,
      answerLength: answer.length,
      isLoadingMessage: answer.includes("Analyzing your question"),
      responseComplete,
      typedTextLength: typedText.length
    });
  }, [streaming, isGenerating, question, answer, responseComplete, isTypingAnimation, typedText]);

  const handleEvaluate = async () => {
    const first = extractFirstCodeBlock(answer);
    const lang = (first?.lang || 'python');
    const code = first?.code || answer;
    const problem = question || 'Evaluate the provided response.';

    if (evaluationAllowed === false) {
      try {
        toast({ title: 'Evaluation unavailable', description: evaluationReason || 'This question cannot be evaluated.', variant: 'destructive' });
      } catch { }
      return;
    }

    try {
      await startEvaluationOverlay({ code, problem, language: lang, title: 'Evaluating' });
    } catch { }
  };

  const evaluateDisabled = !responseComplete || evaluationAllowed === false;
  const evaluateTitle = evaluationAllowed === false
    ? (evaluationReason || 'Evaluation not allowed for this question')
    : (!responseComplete ? 'Please wait for response to complete' : 'Evaluate response');

  const handleDownloadDiagram = async (mermaidCode: string) => {
    // Use the same pipeline as on-screen render to avoid mismatch
    let fixedCode = autoFixMermaidSyntax(stripMermaidFences(mermaidCode));
    fixedCode = crowFootToErDiagram(fixedCode);
    // For complex subgraph diagrams, skip strict validation and let backend render
    if (!containsSubgraph(fixedCode)) {
      const validation = validateAndFixMermaidSyntax(fixedCode);
      if (!validation.isValid) {
        toast({
          title: "Invalid Diagram Syntax",
          description: (validation.errors && validation.errors[0]) || "The diagram contains syntax errors that prevent rendering.",
          variant: "destructive",
        });
        return;
      }
      fixedCode = validation.fixedCode;
    }

    try {
      const response = await apiRenderMermaid({ code: fixedCode, theme: 'neutral', style: 'modern', size: 'medium' });
      if (response.trim().startsWith('<svg')) {
        const blob = new Blob([response], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'architecture-diagram.svg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast({
          title: "Download started",
          description: "Architecture diagram is being downloaded as SVG.",
        });
      } else {
        throw new Error('Failed to generate SVG');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Download failed",
        description: `Could not download the diagram: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const validateMermaidSyntax = (code: string): { isValid: boolean; error?: string } => {
    try {
      // Basic syntax validation - check for common issues
      const lines = code.split('\n');

      // Check for invalid comment syntax
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('%') && !line.startsWith('%%')) {
          // Check if % is in the middle of a line (invalid)
          if (line.indexOf('%') > 0) {
            return {
              isValid: false,
              error: `Invalid comment syntax on line ${i + 1}: "${line}". Use %% for comments instead of %.`
            };
          }
        }
      }

      // Check for reserved keyword usage in class definitions
      const reservedKeywords = ['graph', 'class', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram'];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('classDef') || line.includes(':::')) {
          for (const keyword of reservedKeywords) {
            if (line.includes(`:::${keyword}`) || line.includes(`classDef ${keyword}`)) {
              return {
                isValid: false,
                error: `Reserved keyword '${keyword}' used as class name on line ${i + 1}: "${line}". Use a different name like '${keyword}db' or '${keyword}def'.`
              };
            }
          }
        }
      }

      // Check for basic Mermaid structure
      if (!code.includes('graph') && !code.includes('flowchart') && !code.includes('sequenceDiagram') &&
        !code.includes('classDiagram') && !code.includes('stateDiagram') && !code.includes('erDiagram')) {
        return {
          isValid: false,
          error: 'Invalid Mermaid syntax: Missing diagram type declaration.'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Syntax validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };

  const autoFixMermaidSyntax = (code: string): string => {
    // Auto-fix common syntax errors
    let fixedCode = code;

    // Fix single % comments to double %%
    fixedCode = fixedCode.replace(/^(\s*)%(\s)/gm, '$1%%$2');

    // Fix comments in the middle of lines
    fixedCode = fixedCode.replace(/(\s)%(\s)/g, '$1%%$2');

    // Fix reserved keyword class names
    fixedCode = fixedCode.replace(/:::graph\b/g, ':::graphdb');
    fixedCode = fixedCode.replace(/classDef graph\b/g, 'classDef graphdb');

    // Fix other common reserved keywords
    fixedCode = fixedCode.replace(/:::class\b/g, ':::classdef');
    fixedCode = fixedCode.replace(/classDef class\b/g, 'classDef classdef');

    return fixedCode;
  };

  const handleExpandDiagram = async (mermaidCode: string) => {
    // Allow expand for ER as well (handled by ER-safe pipeline below)
    if (expandedDiagram === mermaidCode) {
      setExpandedDiagram(null);
      setExpandedSvgHtml(null);
      setExpandedLoading(false);
      return;
    }

    // Check if the normal view is already rendered successfully
    const normalMermaidElement = document.querySelector('.mermaid');
    if (normalMermaidElement && !normalMermaidElement.querySelector('svg')) {
      toast({
        title: "Diagram Not Ready",
        description: "The diagram is still rendering. Please wait a moment before expanding.",
        variant: "destructive",
      });
      return;
    }

    // Match normal-view pipeline
    let fixedCode = autoFixMermaidSyntax(stripMermaidFences(mermaidCode));
    fixedCode = crowFootToErDiagram(fixedCode);
    if (!containsSubgraph(fixedCode)) {
      const validation = validateAndFixMermaidSyntax(fixedCode);
      if (!validation.isValid) {
        toast({
          title: "Invalid Diagram Syntax",
          description: (validation.errors && validation.errors[0]) || "The diagram contains syntax errors that prevent rendering.",
          variant: "destructive",
        });
        return;
      }
      fixedCode = validation.fixedCode;
    }

    setExpandedDiagram(mermaidCode);
    setExpandedSvgHtml(null);
    setExpandedLoading(true);

    try {
      // Use the same parameters as the normal view for consistency
      const svg = await apiRenderMermaid({
        code: fixedCode,
        theme: 'neutral',
        style: 'modern',
        size: 'medium'
      });

      if (svg && svg.trim().startsWith('<svg')) {
        // Use the SVG exactly as returned by backend - no modifications
        // This ensures the same rendering as the normal view
        setExpandedSvgHtml(svg);
      } else {
        throw new Error('Backend returned non-SVG content');
      }
    } catch (error) {
      console.error('Backend rendering failed:', error);

      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Diagram Rendering Failed",
        description: `Unable to render the diagram: ${errorMessage}. Please try again.`,
        variant: "destructive",
      });

      // NEVER use client-side Mermaid - it causes version conflicts
      // Only use backend API for consistent rendering
      setExpandedSvgHtml(null);
    } finally {
      setExpandedLoading(false);
    }
  };

  return (
    <Card
      className="w-full border-0 bg-transparent shadow-none hover:shadow-none mx-0 md:mx-0 answer-card-mobile group transition-all duration-300 overflow-x-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="py-1 px-3 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 md:gap-3">
          <div className="flex items-start flex-1 min-w-0">
            <div className="min-w-0 flex-1">
              <div
                className="relative flex items-center gap-2 min-w-0 justify-end md:justify-between"
                onMouseDown={startLongPress}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={startLongPress}
                onTouchEnd={cancelLongPress}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      className="flex-1 bg-muted/80 dark:bg-muted/20 border border-border rounded-md px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                      value={editedQuestion}
                      onChange={(e) => setEditedQuestion(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditedQuestion(question);
                        setIsEditing(false);
                      }}
                      className="shrink-0 inline-flex items-center justify-center h-7 w-8 rounded-md border border-border hover:bg-muted/60"
                      title="Cancel editing"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!editedQuestion.trim() || isGenerating}
                      onClick={() => {
                        if (!editedQuestion.trim()) return;
                        onSubmitEdit && onSubmitEdit(editedQuestion.trim());
                        setIsEditing(false);
                      }}
                      className={`shrink-0 inline-flex items-center justify-center h-7 w-8 rounded-md border border-border ${(!editedQuestion.trim() || isGenerating) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/60'}`}
                      title="Send"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 ml-6 sm:ml-0">
                      {mode === "mirror" ? (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          Mirror Mode
                        </span>
                      ) : null}
                    </div>
                    {/* Mobile-only quick copy button to avoid right-side overlap */}
                    <button
                      type="button"
                      onClick={() => handleCopy(question)}
                      className={`hidden sm:hidden shrink-0 items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-muted/60`}
                      title="Copy"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>

                    {/* Long-press actions popover (mobile only) */}
                    {showQuickActions && (
                      <div
                        ref={actionsRef as any}
                        className="sm:hidden absolute top-full right-0 mt-2 z-50"
                      >
                        <div className="w-48 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => { handleCopy(question); setShowQuickActions(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60"
                          >
                            <Copy className="h-4 w-4" />
                            <span>Copy prompt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditedQuestion(question);
                              setIsEditing(true);
                              onEdit && onEdit();
                              setShowQuickActions(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>Edit Message</span>
                          </button>
                          <span title={evaluateTitle} className="inline-block w-full">
                            <button
                              type="button"
                              onClick={() => { handleEvaluate(); setShowQuickActions(false); }}
                              disabled={evaluateDisabled}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-sm ${evaluateDisabled
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-muted/60'
                                }`}
                            >
                              <Play className="h-4 w-4" />
                              <span>{!responseComplete ? 'Evaluate (waiting...)' : 'Evaluate'}</span>
                            </button>
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Removed generated response label for a cleaner minimal look */}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 sm:self-auto self-end">
            {(canPrev || canNext) ? (
              <div className="flex items-center gap-1 mr-1">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!canPrev}
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-md border border-border ${canPrev ? 'hover:bg-muted/60' : 'opacity-50 cursor-not-allowed'}`}
                  title="Previous response"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {(versionIndex && versionTotal) ? (
                  <span className="text-xs text-muted-foreground select-none w-10 text-center">
                    {versionIndex}/{versionTotal}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!canNext}
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-md border border-border ${canNext ? 'hover:bg-muted/60' : 'opacity-50 cursor-not-allowed'}`}
                  title="Next response"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {/* Removed Copy/Download from card - now at tab level */}

            <span title={evaluateTitle} className={`inline-block transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <Button
                variant="default"
                size="sm"
                onClick={handleEvaluate}
                className={`h-8 px-3 text-xs ${evaluateDisabled
                  ? 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                disabled={evaluateDisabled || !responseComplete}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Evaluate
              </Button>
            </span>
            {/* When evaluation is disallowed we rely on the Evaluate button's title/tooltip
                to show the reason on hover; avoid rendering the reason inline. */}
          </div>
        </div >
      </CardHeader >

      <CardContent className="pl-2 pr-3 md:px-6 py-2 overflow-x-hidden">
        {(!answer || answer.includes("Analyzing your question")) && isGenerating ? (
          <div className="space-y-3 py-2 animate-in fade-in duration-500">
            <div className="h-4 bg-muted/40 rounded-full w-3/4 animate-pulse" />
            <div className="h-4 bg-muted/40 rounded-full w-1/2 animate-pulse" />
            <div className="h-4 bg-muted/30 rounded-full w-2/3 animate-pulse" />
          </div>
        ) : (
          <div ref={contentRef} className="space-y-1 streaming-content answer-content overflow-x-hidden">
            {/* Display completed blocks */}
            {displayedBlocks.map((block, index) => (
              <div key={index} className="streaming-content">
                {block.type === 'code' ? (
                  <div className="my-1">
                    <div className="flex items-center justify-between bg-[#161b22] px-4 py-2 rounded-t-lg border border-b-0 border-border">
                      <span className="typography-caption">
                        {block.lang ? `${block.lang.charAt(0).toUpperCase() + block.lang.slice(1)} ${block.lang === 'mermaid' ? 'Diagram' : 'Code'}` : 'Code'}
                      </span>
                      <div className="flex items-center gap-2">
                        {block.lang !== 'mermaid' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExecute(block.content, block.lang)}
                            className="h-6 px-2 text-xs hover:bg-muted text-primary hover:text-primary/80"
                          >
                            <Play className="h-3 w-3 mr-1 fill-current" />
                            Execute
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(block.content)}
                          className="h-6 px-2 text-xs text-primary hover:text-primary/80 hover:bg-muted"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy {block.lang === 'mermaid' ? 'source' : 'code'}
                        </Button>
                      </div>
                    </div>
                    {block.lang === 'mermaid' ? (
                      <div className={`rounded-b-lg border border-t-0 border-border bg-card relative transition-all duration-300 ${expandedDiagram === block.content ? 'p-1' : 'p-3'
                        }`}>
                        <div
                          className={`diagram-container transition-all duration-300 ${expandedDiagram === block.content ? 'expanded-diagram' : ''}`}
                          data-mermaid-source={block.content}
                          style={{
                            ...(expandedDiagram === block.content ? {
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 9998,
                              background: 'rgba(0, 0, 0, 0.9)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '2rem'
                            } : {})
                          }}>
                          <div className="absolute top-2 right-2 z-[9999] flex gap-2">
                            {expandedDiagram === block.content ? (
                              <button
                                type="button"
                                className="diagram-action-btn fixed top-4 right-4 z-[10000] bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive shadow-lg w-10 h-10 rounded-lg flex items-center justify-center"
                                title="Close Expanded View"
                                onClick={() => setExpandedDiagram(null)}
                              >
                                <X className="h-5 w-5" />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="diagram-action-btn"
                                  title="Download Architecture"
                                  onClick={() => handleDownloadDiagram(block.content)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="diagram-action-btn"
                                  title="Expand Diagram"
                                  onClick={() => handleExpandDiagram(block.content)}
                                >
                                  <Expand className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                          {expandedDiagram === block.content ? (
                            <>
                              {/* Original inline placeholder while expanded */}
                              <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-lg border border-dashed border-border">
                                <Expand className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <span className="text-xs text-muted-foreground">Diagram expanded...</span>
                              </div>

                              {/* Portal the actual expanded view to body */}
                              {createPortal(
                                <div className="expanded-diagram">
                                  <button
                                    type="button"
                                    className="diagram-action-btn fixed"
                                    title="Close Expanded View"
                                    onClick={() => setExpandedDiagram(null)}
                                  >
                                    <X className="h-6 w-6" />
                                  </button>

                                  <div className="expanded-content-wrapper">
                                    {expandedLoading ? (
                                      <div className="flex flex-col items-center justify-center p-8 gap-4">
                                        <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                                        <div className="text-sm font-medium animate-pulse">Enhancing Architecture...</div>
                                      </div>
                                    ) : expandedSvgHtml ? (
                                      <div className="expanded-svg" dangerouslySetInnerHTML={{ __html: expandedSvgHtml }} />
                                    ) : (
                                      <div className="text-sm text-muted-foreground">Preparing diagram…</div>
                                    )}
                                  </div>
                                </div>,
                                document.body
                              )}
                            </>
                          ) : (
                            <div
                              className="mermaid mmd-grab"
                              data-mermaid-source={block.content}
                              style={{ overflowX: 'auto' }}
                              onMouseDown={(e) => {
                                const container = (e.currentTarget.closest('.diagram-container') as HTMLElement) || undefined;
                                if (!container) return;
                                // mark dragging state for cursor only; pan logic handled in MermaidEditor preview
                                container.classList.add('mmd-grabbing');
                              }}
                              onMouseUp={(e) => {
                                const container = (e.currentTarget.closest('.diagram-container') as HTMLElement) || undefined;
                                if (!container) return;
                                container.classList.remove('mmd-grabbing');
                              }}
                            >
                              {block.content}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <pre className="overflow-auto rounded-b-lg bg-[#0b1020] text-[#e6edf3] p-4 border border-t-0 border-border">
                        <code
                          className="font-mono"
                          dangerouslySetInnerHTML={{ __html: highlightCode(block.content, block.lang || '') }}
                        />
                      </pre>
                    )}
                  </div>
                ) : block.type === 'table' ? (
                  <div className="my-1">
                    <div className="flex items-center justify-between bg-muted/30 px-4 py-2 rounded-t-lg border border-b-0 border-border">
                      <span className="typography-caption">
                        Data Table
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(block.content)}
                        className="h-6 px-2 text-xs text-primary hover:text-primary/80 hover:bg-muted"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy table
                      </Button>
                    </div>
                    <div className="overflow-auto rounded-b-lg border border-t-0 border-border bg-card">
                      {(() => {
                        try {
                          const tableData = JSON.parse(block.content);
                          return (
                            <Table className="table-professional">
                              <TableHeader>
                                <TableRow>
                                  {tableData.headers.map((header: string, idx: number) => (
                                    <TableHead key={idx} className="typography-caption">
                                      <span dangerouslySetInnerHTML={{ __html: formatTextContent(header) }} />
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {tableData.rows.map((row: string[], rowIdx: number) => (
                                  <TableRow key={rowIdx} className="hover:bg-muted/50">
                                    {row.map((cell: string, cellIdx: number) => (
                                      <TableCell key={cellIdx} className={"typography-body"}>
                                        <span dangerouslySetInnerHTML={{ __html: formatTextContent(cell) }} />
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          );
                        } catch (error) {
                          return (
                            <div className="p-4 typography-body text-muted-foreground">
                              Error parsing table data
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>
                ) : block.type === 'heading' ? (
                  <div className="text-base mb-1 mt-1 font-semibold section-heading">
                    <span dangerouslySetInnerHTML={{ __html: block.content }} />
                  </div>
                ) : block.type === 'ul' ? (
                  <ul className="mb-2 space-y-0.5 -ml-2 md:ml-0" style={{ listStyle: 'none', paddingLeft: '0' }}>
                    {block.content.split('</li>').filter(item => item.trim()).map((item, idx) => (
                      <li key={idx} className="flex items-start mb-0.5">
                        <span className="text-primary font-bold mr-2 md:mr-3 mt-1">•</span>
                        <span className="text-sm leading-relaxed streaming-content" dangerouslySetInnerHTML={{ __html: item.replace('<li>', '') }} />
                      </li>
                    ))}
                  </ul>
                ) : block.type === 'ol' ? (
                  <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-4 text-sm leading-relaxed streaming-content" dangerouslySetInnerHTML={{ __html: block.content }} />
                ) : (
                  <div className="prose prose-neutral dark:prose-invert max-w-none">
                    <div
                      className="text-sm leading-relaxed streaming-content"
                      dangerouslySetInnerHTML={{ __html: formatTextContent(block.content) }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Current typing block with real-time formatting */}
            {typedText && (
              <div className="prose prose-neutral dark:prose-invert max-w-none streaming-content">
                <div
                  className="text-sm leading-relaxed streaming-content"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      // Check if we're in an incomplete code block
                      const codeBlockMatches = typedText.match(/```/g);
                      const isIncompleteCodeBlock = codeBlockMatches && codeBlockMatches.length % 2 === 1;

                      if (isIncompleteCodeBlock) {
                        return formatIncompleteCodeBlock(typedText) + '<span class="animate-pulse">|</span>';
                      } else {
                        return formatStreamingText(typedText) + '<span class="animate-pulse">|</span>';
                      }
                    })()
                  }}
                />
              </div>
            )}

          </div>
        )}

        {/* Mobile action bar for Copy/Share (icon-only, no blue active state) */}
        <div className="sm:hidden flex items-center gap-2 mt-3 ml-2">
          <button
            type="button"
            onClick={() => handleCopy(answer)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground bg-transparent hover:bg-muted/60 active:bg-muted/60 focus:outline-none focus:ring-0"
            title="Copy"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleShare(answer)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground bg-transparent hover:bg-muted/60 active:bg-muted/60 focus:outline-none focus:ring-0"
            title="Share"
          >
            <Share className="h-4 w-4" />
          </button>
        </div>


        {/* Prompt review section removed per requirement */}
        <MermaidEditor
          open={mermaidEditorOpen}
          onOpenChange={setMermaidEditorOpen}
          initialCode={mermaidEditorCode}
          title="Mermaid Live Editor"
        />
      </CardContent>
    </Card >
  );
};