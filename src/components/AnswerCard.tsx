import { useState, useEffect, useRef } from "react";
import { apiRenderMermaid } from "@/lib/api";
import { Copy, Check, MessageSquare, Edit3, ChevronLeft, ChevronRight, Send, Share, X, Play, Edit, Download, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startEvaluationOverlay } from "@/overlayHost";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MermaidEditor } from "@/components/MermaidEditor";

interface AnswerCardProps {
  answer: string;
  question: string;
  // When false, render instantly without typewriter/streaming effect (used for history)
  streaming?: boolean;
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
}

export const AnswerCard = ({ answer, question, streaming = true, onEdit, onSubmitEdit, canPrev, canNext, onPrev, onNext, versionLabel, isGenerating, versionIndex, versionTotal }: AnswerCardProps) => {
  const [copied, setCopied] = useState(false);
  const [isDetailed] = useState(true);
  const [typedText, setTypedText] = useState("");
  const [displayedBlocks, setDisplayedBlocks] = useState<Array<{type: string, content: string, lang?: string}>>([]);
  const { toast } = useToast();
  const typingTimerRef = useRef<any>(null);
  const lastAnswerRef = useRef<string>("");
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
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.expanded-diagram') && !target.closest('.diagram-action-btn')) {
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
    if (!expandedDiagram) {
      const timer = setTimeout(() => {
        // Force re-render of all normal Mermaid diagrams using backend API only
        const normalMermaidElements = document.querySelectorAll('.mermaid:not(.expanded-content-wrapper .mermaid)');
        normalMermaidElements.forEach(async (element) => {
          const content = element.textContent || '';
          if (content && !element.querySelector('svg')) {
            // Use backend API to re-render instead of client-side Mermaid
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
              // Keep original content as fallback
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
      } catch {}
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

  // Utility function to clean SVG content and remove attributes that might cause false positive error detection
  const cleanSvgContent = (svgContent: string): string => {
    let cleaned = svgContent
      .replace(/aria-roledescription="[^"]*"/g, '') // Remove aria-roledescription attributes
      .replace(/role="graphics-document[^"]*"/g, '') // Remove problematic role attributes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\s*=\s*/g, '=') // Remove spaces around equals signs
      .trim();
    
    // Additional cleanup for any remaining problematic attributes
    cleaned = cleaned.replace(/aria-roledescription\s*=\s*"[^"]*"/g, '');
    cleaned = cleaned.replace(/role\s*=\s*"graphics-document[^"]*"/g, '');
    
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

  // PROACTIVE APPROACH: Comprehensive Mermaid syntax validation and correction
  const validateAndFixMermaidSyntax = (mermaidCode: string): { isValid: boolean; fixedCode: string; errors: string[] } => {
    const errors: string[] = [];
    let fixed = mermaidCode.trim();
    
    // Validation 1: Check for diagram type declaration
    if (!fixed.startsWith('flowchart') && !fixed.startsWith('graph') && !fixed.startsWith('sequenceDiagram') && !fixed.startsWith('classDiagram')) {
      if (fixed.includes('-->') || fixed.includes('--') || fixed.includes('subgraph')) {
        errors.push('Missing diagram type declaration');
        fixed = 'flowchart TD\n' + fixed;
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
      // Check for missing spaces or formatting issues in classDef
      if (!line.includes('fill:') || !line.includes('stroke:')) {
        errors.push(`classDef line ${index + 1} might have formatting issues`);
      }
    });
    
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

  // NUCLEAR OPTION: Completely bypass Mermaid library for SVG rendering
  const setSvgContentSafely = (element: HTMLElement, svgContent: string) => {
    console.log('NUCLEAR OPTION: Bypassing Mermaid library entirely');
    
    // Remove mermaid class and add rendered class
    element.classList.remove('mermaid');
    element.classList.add('mermaid-rendered');
    
    // Mark as processed with multiple flags to prevent re-processing
    (element as any).dataset.processed = '1';
    (element as any).dataset.mermaidProcessed = 'true';
    (element as any).dataset.mermaidRendered = 'true';
    (element as any).dataset.mermaidBypassed = 'true';
    
    // COMPLETELY DISABLE MERMAID LIBRARY GLOBALLY TO PREVENT CONFLICTS
    const originalMermaid = (window as any).mermaid;
    const originalInitialize = (window as any).mermaid?.initialize;
    const originalRender = (window as any).mermaid?.render;
    const originalParse = (window as any).mermaid?.parse;
    const originalInit = (window as any).mermaid?.init;
    
    // Disable ALL Mermaid functionality globally
    (window as any).mermaid = null;
    (window as any).mermaid = undefined;
    
    // Override any Mermaid methods that might be called
    if (originalMermaid) {
      (window as any).mermaid = {
        init: () => { throw new Error('Mermaid client-side rendering disabled'); },
        render: () => { throw new Error('Mermaid client-side rendering disabled'); },
        initialize: () => { throw new Error('Mermaid client-side rendering disabled'); },
        parse: () => { throw new Error('Mermaid client-side rendering disabled'); }
      };
    }
    
    // Disable any Mermaid event listeners
    const mermaidElements = document.querySelectorAll('.mermaid');
    mermaidElements.forEach(el => {
      if (el !== element) {
        el.classList.remove('mermaid');
        el.classList.add('mermaid-disabled');
      }
    });
    
    // Set the cleaned SVG content DIRECTLY without any Mermaid processing
    element.innerHTML = svgContent;
    // Ensure consistent sizing regardless of diagram complexity
    try {
      const container = element.closest('.diagram-container') as HTMLElement | null;
      if (container) {
        // Reset user zoom to default when new svg is set
        currentScaleRef.current = 1.0;
        adjustSvgScale(container);
      }
    } catch {}
    
    // NEVER restore Mermaid library for this element
    // This element is now completely independent of Mermaid library
    console.log('NUCLEAR OPTION: SVG set directly, Mermaid library bypassed permanently');
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

  // Re-run Mermaid on block updates (frontend render of diagrams)
  useEffect(() => {
    // Add a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      try {
        // Prevent multiple simultaneous processing
        if (mermaidProcessingRef.current) {
          console.log('Mermaid processing already in progress, skipping');
          return;
        }
        
        const mm: any = (window as any)?.mermaid;
        const now = Date.now();
        if (now - mermaidRanRef.current < 200) return; // Increased throttle time
        mermaidRanRef.current = now;
        
        // More specific selector to avoid re-processing - EXCLUDE bypassed elements
        const nodes = Array.from(document.querySelectorAll('.mermaid:not(.mermaid-rendered):not(.mermaid-disabled):not([data-mermaid-processed="true"]):not([data-mermaid-rendered="true"]):not([data-mermaid-bypassed="true"])')) as HTMLElement[];
        console.log('Mermaid processing: found', nodes.length, 'unprocessed nodes');
        if (!nodes.length) return;
      
      // Set processing flag
      mermaidProcessingRef.current = true;
      const normalizeMermaid = (src: string): string => {
        let t = (src || '').trim();
        
        // For complex diagrams with subgraphs, classDef, etc., return as-is
        if (t.includes('subgraph') || t.includes('classDef') || t.includes('class ') || t.includes(':::')) {
          console.log('Complex diagram detected, using original syntax');
          return t;
        }
        
        const newlineCount = (t.match(/\n/g) || []).length;
        if (newlineCount >= 3) return t;
        
        // Only apply normalization to simple diagrams
        console.log('Simple diagram detected, applying normalization');
        const lines: string[] = [];
        let currentLine = '';
        
        // Split by major delimiters first
        const parts = t.split(/(\s+subgraph\s+|\s+end\s+|\s+classDef\s+|\s+-->\s+)/);
        
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim();
          if (!part) continue;
          
          if (part.startsWith('flowchart')) {
            lines.push(part);
          } else if (part.startsWith('subgraph')) {
            lines.push(`  ${part}`);
          } else if (part === 'end') {
            lines.push('  end');
          } else if (part.startsWith('classDef')) {
            lines.push(`    ${part}`);
          } else if (part.includes('-->')) {
            lines.push(`    ${part}`);
          } else if (part.includes('[') && part.includes(']')) {
            // Node definition
            lines.push(`    ${part}`);
          } else if (part.includes(':::')) {
            // Node with class
            lines.push(`    ${part}`);
          } else {
            // Regular content
            if (currentLine) {
              currentLine += ' ' + part;
            } else {
              currentLine = part;
            }
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines.join('\n');
      };
      const tryRender = async (el: HTMLElement, i: number) => {
        if ((el as any).dataset.processed === '1' || (el as any).dataset.mermaidProcessed === 'true') return;
        
        // Mark as being processed to prevent race conditions
        (el as any).dataset.mermaidProcessed = 'true';
        
        const srcRaw = el.textContent || '';
        console.log('Processing Mermaid node', i, ':', srcRaw.substring(0, 100) + '...');
        
        // If the diagram contains subgraphs, send the RAW source verbatim to the backend.
        // This avoids any normalization/validation that could collapse whitespace or
        // move lines and accidentally convert layer subgraphs into plain nodes.
        const containsSubgraph = /\bsubgraph\b/.test(srcRaw);
        let fixedSrc = srcRaw;
        if (!containsSubgraph) {
          // For simple diagrams (no subgraphs), keep lightweight normalization/validation.
          const src = normalizeMermaid(srcRaw);
          const validation = validateAndFixMermaidSyntax(src);
          fixedSrc = validation.fixedCode;
          if (!validation.isValid) {
            console.warn('Mermaid syntax errors detected and fixed:', validation.errors);
            // If too many errors, use template as fallback
            if (validation.errors.length > 3) {
              console.warn('PROACTIVE: Too many syntax errors, using template fallback');
              const template = getMermaidTemplate('architecture');
              el.textContent = template;
              fixedSrc = template;
            }
          }
          if (fixedSrc !== srcRaw) {
            el.textContent = fixedSrc;
          }
        }

        // Harmonize subgraph titles: ensure they end with " Layer" for clarity
        if (containsSubgraph) {
          // Case 1: subgraph ID with bracketed label: subgraph X[Label]
          fixedSrc = fixedSrc.replace(/(^|\n)\s*subgraph\s+([A-Za-z0-9_-]+)\s*\[(.*?)\]/g, (_m, lead, id, label) => {
            const needsLayer = !/layer$/i.test(String(label).trim());
            const newLabel = needsLayer ? `${label} Layer` : label;
            return `${lead}subgraph ${id}[${newLabel}]`;
          });
          // Case 2: subgraph with plain title: subgraph Client
          fixedSrc = fixedSrc.replace(/(^|\n)\s*subgraph\s+([A-Za-z0-9_-]+)\s*$/gm, (_m, lead, id) => {
            const title = id.replace(/_/g, ' ');
            const needsLayer = !/layer$/i.test(title);
            const label = needsLayer ? `${title} Layer` : title;
            return `${lead}subgraph ${id}[${label}]`;
          });
        }

        // Fix common edge syntax errors before adding init directive
        fixedSrc = fixCommonMermaidEdgeSyntax(fixedSrc);
        
        // Add sequential connection numbers to show workflow steps
        const originalSrc = fixedSrc;
        fixedSrc = addConnectionNumbers(fixedSrc);
        
        // Debug logging to help troubleshoot
        if (originalSrc !== fixedSrc) {
          console.log('Connection numbering applied:', {
            original: originalSrc.substring(0, 200) + '...',
            modified: fixedSrc.substring(0, 200) + '...'
          });
        }

        // Always enforce a modern, balanced layout via Mermaid init directive unless the source already defines one
        const hasInitDirective = /^%%\{\s*init:/m.test(fixedSrc);
        if (!hasInitDirective) {
          const initDirective =
            "%%{init: {" +
            " 'theme': 'neutral'," +
            " 'flowchart': { 'useMaxWidth': true, 'htmlLabels': true, 'nodeSpacing': 80, 'rankSpacing': 120, 'padding': 16, 'curve': 'basis' }," +
            " 'themeVariables': {" +
            "   'fontFamily': 'Inter, ui-sans-serif, system-ui, -apple-system'," +
            "   'fontSize': '16px'," +
            "   'primaryColor': '#eef2ff'," +
            "   'primaryBorderColor': '#a5b4fc'," +
            "   'lineColor': '#94a3b8'," +
            "   'clusterBkg': '#f8fafc'," +
            "   'clusterBorder': '#cbd5e1'" +
            " }" +
            "}}%%\n";
          fixedSrc = initDirective + fixedSrc;
        }
        
        // Primary: your backend renderer
        try {
          const responseText = await apiRenderMermaid({ code: fixedSrc, theme: 'neutral', style: 'modern', size: 'medium' });
          console.log('Backend response:', responseText.substring(0, 200) + '...');
          
          // Check if response is SVG (starts with <svg) or raw Mermaid
          if (responseText.trim().startsWith('<svg')) {
            // Clean the SVG to remove attributes that might cause false positive error detection
            const cleanedSvg = cleanSvgContent(responseText);
            console.log('Original SVG contains aria-roledescription:', responseText.includes('aria-roledescription'));
            console.log('Cleaned SVG contains aria-roledescription:', cleanedSvg.includes('aria-roledescription'));
            console.log('Cleaned SVG preview:', cleanedSvg.substring(0, 300) + '...');
            
            // Use the safe SVG setting function
            setSvgContentSafely(el, cleanedSvg);
            
            return;
          } else {
            console.warn('Backend returned Mermaid code instead of SVG, using client fallback');
          }
        } catch (error) {
          console.warn('Backend render failed for complex diagram, using client fallback:', error);
          // For complex diagrams, the backend might fail, so we'll try client-side rendering
        }
        
        // Fallback: in-browser Mermaid
        if (mm && typeof mm.render === 'function') {
          try {
            const id = `mmd-${Date.now()}-${i}`;
            console.log('Attempting client-side Mermaid render for complex diagram');
            const out = await mm.render(id, fixedSrc);
            if (out && out.svg) {
              // Clean the SVG to remove attributes that might cause false positive error detection
              const cleanedSvg = cleanSvgContent(out.svg as string);
              console.log('Client-side Mermaid SVG cleaned, contains aria-roledescription:', cleanedSvg.includes('aria-roledescription'));
              
              // Use the safe SVG setting function
              setSvgContentSafely(el, cleanedSvg);
              
              return;
            } else {
              console.warn('Client-side Mermaid render returned no SVG');
            }
          } catch (error) {
            console.warn('Client-side Mermaid render failed for complex diagram:', error);
            // If client-side also fails, we'll try Kroki as final fallback
          }
        }
        
        // Final fallback: direct Kroki
        try {
          console.log('Attempting Kroki fallback for complex diagram');
          const resp = await fetch('https://kroki.io/mermaid/svg', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: fixedSrc });
          if (resp.ok) { 
            const svg = await resp.text(); 
            // Clean the SVG to remove attributes that might cause false positive error detection
            const cleanedSvg = cleanSvgContent(svg);
            console.log('Kroki SVG cleaned, contains aria-roledescription:', cleanedSvg.includes('aria-roledescription'));
            
            // Use the safe SVG setting function
            setSvgContentSafely(el, cleanedSvg);
          } else {
            console.warn('Kroki fallback failed with status:', resp.status);
          }
        } catch (error) {
          console.warn('Kroki fallback failed:', error);
        }
        
        // NUCLEAR OPTION: NEVER restore Mermaid library for processed elements
        // This ensures that the Mermaid library cannot interfere with our cleaned SVG
        console.log('NUCLEAR OPTION: Mermaid library permanently disabled for processed elements');
        mermaidProcessingRef.current = false;
      };
      
      // Process nodes sequentially to prevent race conditions
      const processNodes = async () => {
        for (let i = 0; i < nodes.length; i++) {
          try {
            await tryRender(nodes[i], i);
            // Small delay between nodes to prevent race conditions
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Error processing Mermaid node ${i}:`, error);
          }
        }
      };
      
      processNodes();
      } catch (error) {
        console.error('Mermaid processing error:', error);
        mermaidProcessingRef.current = false;
      }
    }, 50); // Small delay to ensure DOM is ready
    
    // Cleanup timeout on unmount
    return () => clearTimeout(timeoutId);
  }, [displayedBlocks]);

  // Typewriter effect for progressive reveal with real-time formatting
  useEffect(() => {
    if (lastAnswerRef.current !== answer || !streaming) {
      lastAnswerRef.current = answer;
      if (!streaming) {
        // Render immediately without typewriter when streaming is disabled
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setTypedText("");
        setIsTypingAnimation(false); // No typing animation for non-streaming content
        try {
          const blocks = parseContent(answer);
          setDisplayedBlocks(blocks);
          
          // Force Mermaid processing for history view after a short delay
          setTimeout(() => {
            console.log('Force processing Mermaid for history view');
            // Trigger Mermaid processing by updating the dependency
            setDisplayedBlocks([...blocks]);
          }, 100);
        } catch {
          setDisplayedBlocks([{ type: 'p', content: answer } as any]);
        }
        return;
      }

      setTypedText("");
      setDisplayedBlocks([]);
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);

      // Stream word-by-word to avoid flashing of partial markdown tokens like '**'
      const tokens = answer.match(/\S+\s*/g) || [answer];
      let idx = 0;
      const intervalMs = 24; // word cadence
      setIsTypingAnimation(true); // Start typing animation
      typingTimerRef.current = setInterval(() => {
        if (idx >= tokens.length) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
          setIsTypingAnimation(false); // End typing animation
          // When typing completes, render full content blocks and hide the streaming cursor
          try {
            const blocks = parseContent(answer);
            setDisplayedBlocks(blocks);
          } catch {
            // Fallback: show raw text if parsing fails
            setDisplayedBlocks([{ type: 'p', content: answer } as any]);
          }
          setTypedText("");
          return;
        }
        const next = tokens[idx];
        setTypedText(prev => prev + next);
        idx++;
      }, intervalMs);
    }
    
    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, [answer, streaming]);

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

  // Render table as HTML string
  const renderTable = (tableData: { headers: string[], rows: string[][] }): string => {
    const { headers, rows } = tableData;
    
    let tableHtml = '<div class="table-wrapper" style="overflow-x:auto;">';
    tableHtml += '<table class="data-table" style="width:100%; border-collapse:collapse;">';
    
    // Table header
    tableHtml += '<thead><tr>';
    headers.forEach(header => {
      tableHtml += `<th>${header}</th>`;
    });
    tableHtml += '</tr></thead>';
    
    // Table body
    tableHtml += '<tbody>';
    rows.forEach(row => {
      tableHtml += '<tr>';
      row.forEach(cell => {
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

  const parseContent = (text: string) => {
    const blocks: Array<{type: string, content: string, lang?: string}> = [];
    
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
          const region = findStrictMarkdownTable(textContent);
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
          let currentBlock: {type: string, content: string} | null = null;
          
          lines.forEach((line, idx) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
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
              /[A-Za-z0-9)]$/.test(trimmedLine.replace(/[:*\-]+$/,'')) &&
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
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let highlightedLine = '';
      let i = 0;
      
      // Check if this line is a comment (full line comment)
      const trimmedLine = line.trim();
      const isFullLineComment = config.commentChars.some(char => trimmedLine.startsWith(char));
      
      if (isFullLineComment) {
        // For full line comments, wrap the entire line
        highlightedLine = `<span class="code-comment">${line}</span>`;
      } else if (inMultilineComment) {
        // We're inside a multi-line comment/docstring - treat as plain text
        if (trimmedLine.includes(multilineCommentEnd)) {
          // End of multi-line comment/docstring - escape HTML entities first, then wrap
          const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          // Use the docstring flag to determine color
          const className = isDocstringComment ? 'code-string' : 'code-comment';
          highlightedLine = `<span class="${className}">${escapedLine}</span>`;
          inMultilineComment = false;
          multilineCommentEnd = '';
          isDocstringComment = false;
        } else {
          // Continue multi-line comment/docstring - treat as plain text, no tokenization
          const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          // Use the docstring flag to determine color
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
              // Single-line multi-line comment/docstring - escape HTML entities first, then wrap
              const escapedLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              // Check if it's a docstring (/** or """) - use string color, otherwise comment color
              const isDocstring = startChar === '/**' || startChar === '"""' || startChar === "'''";
              const className = isDocstring ? 'code-string' : 'code-comment';
              highlightedLine = `<span class="${className}">${escapedLine}</span>`;
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
        
        // For non-Python languages, use multi-language tokenization
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
      
      highlightedLines.push(highlightedLine);
    }
    
    return highlightedLines.join('\n');
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
    
    try {
      await startEvaluationOverlay({ code, problem, language: lang, title: 'Evaluating' });
    } catch {}
  };

  const handleDownloadDiagram = async (mermaidCode: string) => {
    // Auto-fix common syntax errors
    const fixedCode = autoFixMermaidSyntax(mermaidCode);
    
    // Validate syntax after auto-fix
    const validation = validateMermaidSyntax(fixedCode);
    if (!validation.isValid) {
      toast({
        title: "Invalid Diagram Syntax",
        description: validation.error || "The diagram contains syntax errors that prevent rendering.",
        variant: "destructive",
      });
      return;
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
    
    // Auto-fix common syntax errors
    const fixedCode = autoFixMermaidSyntax(mermaidCode);
    
    // Validate syntax after auto-fix
    const validation = validateMermaidSyntax(fixedCode);
    if (!validation.isValid) {
      toast({
        title: "Invalid Diagram Syntax",
        description: validation.error || "The diagram contains syntax errors that prevent rendering.",
        variant: "destructive",
      });
      return;
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
      <Card className="w-full border-0 bg-transparent shadow-none hover:shadow-none mx-0 md:mx-0 answer-card-mobile">
      <CardHeader className="pb-1 md:pb-3 px-3 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 md:gap-3">
          <div className="flex items-start space-x-2 md:space-x-3 flex-1 min-w-0">
            <div className="hidden md:flex p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-lg flex-shrink-0">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
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
                      className="flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
                      <div className="flex-1 text-sm font-medium md:text-base text-foreground text-left select-none bg-muted/70 dark:bg-muted/40 md:bg-transparent md:border-0 md:shadow-none md:rounded-none md:px-0 md:py-0 rounded-xl px-3 py-2 shadow-sm border border-border/60 whitespace-pre-wrap break-words" title={question}>
                        {question}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditedQuestion(question);
                          setIsEditing(true);
                          onEdit && onEdit();
                        }}
                        className="hidden md:inline-flex shrink-0 items-center justify-center h-6 w-6 rounded-md border border-border text-foreground bg-transparent hover:bg-muted/60 active:bg-muted/60 focus:outline-none focus:ring-0"
                        title="Edit prompt"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
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
                          <button
                            type="button"
                            onClick={() => { handleEvaluate(); setShowQuickActions(false); }}
                            disabled={!responseComplete}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm ${
                              !responseComplete 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'hover:bg-muted/60'
                            }`}
                          >
                            <Play className="h-4 w-4" />
                            <span>{!responseComplete ? 'Evaluate (waiting...)' : 'Evaluate'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 hidden sm:flex items-center gap-2">
                <span>AI generated response</span>
                {versionLabel ? <span className="px-1.5 py-0.5 rounded bg-muted text-foreground/80">{versionLabel}</span> : null}
              </div>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(displayAnswer)}
              className="hidden sm:inline-flex h-8 px-3 text-xs bg-gradient-to-r from-primary/10 to-primary/5 text-primary hover:from-primary/20 hover:to-primary/10 border border-primary/20 shadow-md hover:shadow-lg transition-all duration-300 font-medium touch-manipulation"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Copied!</span>
                  <span className="sm:hidden">✓</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleEvaluate}
              className={`h-8 px-3 text-xs ${
                responseComplete
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
              }`}
              title={
                !responseComplete
                  ? "Please wait for response to complete" 
                  : "Evaluate response"
              }
              disabled={!responseComplete}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Evaluate
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="px-3 md:px-6 pt-2 md:pt-0">
        <div className="space-y-1 streaming-content answer-content">
          {/* Display completed blocks */}
          {displayedBlocks.map((block, index) => (
            <div key={index} className="streaming-content">
              {block.type === 'code' ? (
                <div className="my-1">
                  <div className="flex items-center justify-between bg-[#161b22] px-4 py-2 rounded-t-lg border border-b-0 border-border">
                    <span className="typography-caption">
                      {block.lang ? `${block.lang.charAt(0).toUpperCase() + block.lang.slice(1)} ${block.lang === 'mermaid' ? 'Diagram' : 'Code'}` : 'Code'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(block.content)}
                      className="h-6 px-2 text-xs hover:bg-muted"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy {block.lang === 'mermaid' ? 'source' : 'code'}
                    </Button>
                  </div>
                  {block.lang === 'mermaid' ? (
                    <div className={`rounded-b-lg border border-t-0 border-border bg-card relative transition-all duration-300 ${
                      expandedDiagram === block.content ? 'p-1' : 'p-3'
                    }`}>
                      <div className={`diagram-container transition-all duration-300 ${
                        expandedDiagram === block.content ? 'expanded-diagram' : ''
                      }`} style={{
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
                           <div className="expanded-content-wrapper">
                             {expandedLoading ? (
                               <div className="flex items-center justify-center p-8">
                                 <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-label="Loading" />
                               </div>
                             ) : expandedSvgHtml ? (
                               <div className="expanded-svg" dangerouslySetInnerHTML={{ __html: expandedSvgHtml }} />
                             ) : (
                               <div className="text-sm text-muted-foreground">Preparing diagram…</div>
                             )}
                           </div>
                         ) : (
                           <div
                             className="mermaid mmd-grab"
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
                      className="h-6 px-2 text-xs hover:bg-muted"
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
                                    <TableCell key={cellIdx} className="typography-body">
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
                <ul className="mb-2 space-y-0.5" style={{ listStyle: 'none', paddingLeft: '0' }}>
                  {block.content.split('</li>').filter(item => item.trim()).map((item, idx) => (
                    <li key={idx} className="flex items-start mb-0.5">
                      <span className="text-primary font-bold mr-3 mt-1">•</span>
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

        {/* Footer - only show when streaming is complete */}
        {!streaming && (
          <div className="hidden md:block mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-center typography-caption text-muted-foreground">
              <span>
                {displayAnswer.split(' ').filter(Boolean).length} words • {Math.ceil(displayAnswer.split(' ').filter(Boolean).length / 150)} min read
              </span>
            </div>
          </div>
        )}
        <MermaidEditor
          open={mermaidEditorOpen}
          onOpenChange={setMermaidEditorOpen}
          initialCode={mermaidEditorCode}
          title="Mermaid Live Editor"
        />
      </CardContent>
    </Card>
  );
};