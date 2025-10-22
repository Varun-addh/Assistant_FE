import { useState, useEffect, useRef } from "react";
import { apiRenderMermaid } from "@/lib/api";
import { Copy, Check, MessageSquare, Edit3, ChevronLeft, ChevronRight, Send, Share, X, Play, Brain, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startEvaluationOverlay } from "@/overlayHost";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CodeAnalysisOverlay } from "./CodeAnalysisOverlay";

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
  const mermaidRanRef = useRef<number>(0);
  const mermaidProcessingRef = useRef<boolean>(false);
  const currentScaleRef = useRef<number>(0.9);
  const [showCodeAnalysis, setShowCodeAnalysis] = useState(false);

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
    const svgElement = document.querySelector('.diagram-container svg') as HTMLElement;
    if (svgElement) {
      svgElement.style.transform = `scale(${currentScaleRef.current})`;
    }
  };

  // Add sequential connection numbers to Mermaid diagrams
  const addConnectionNumbers = (mermaidCode: string): string => {
    let code = mermaidCode;
    let connectionCounter = 1;
    
    // Find all arrow connections and add sequential numbers
    // Pattern: A --> B becomes A -- 1 --> B
    code = code.replace(/([A-Za-z0-9_\[\]()]+)\s*-->\s*([A-Za-z0-9_\[\]()]+)/g, (match, from, to) => {
      const numbered = `${from.trim()} -- ${connectionCounter} --> ${to.trim()}`;
      connectionCounter++;
      return numbered;
    });
    
    // Reset counter for bidirectional arrows
    connectionCounter = 1;
    // Pattern: A <--> B becomes A -- 1 --> B and B -- 2 --> A
    code = code.replace(/([A-Za-z0-9_\[\]()]+)\s*<-->\s*([A-Za-z0-9_\[\]()]+)/g, (match, from, to) => {
      const numbered = `${from.trim()} -- ${connectionCounter} --> ${to.trim()}\n${to.trim()} -- ${connectionCounter + 1} --> ${from.trim()}`;
      connectionCounter += 2;
      return numbered;
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
    
    // Validation 8: Check for proper indentation
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
    
    // COMPLETELY DISABLE MERMAID LIBRARY GLOBALLY
    const originalMermaid = (window as any).mermaid;
    const originalInitialize = (window as any).mermaid?.initialize;
    const originalRender = (window as any).mermaid?.render;
    const originalParse = (window as any).mermaid?.parse;
    
    // Disable ALL Mermaid functionality globally
    (window as any).mermaid = null;
    (window as any).mermaid = undefined;
    
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
        fixedSrc = addConnectionNumbers(fixedSrc);

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
      typingTimerRef.current = setInterval(() => {
        if (idx >= tokens.length) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
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
    // Disallow all tags except a safe allowlist (strong, b, em, i, code, pre, br)
    // Replace disallowed tags with their text content
    safe = safe.replace(/<\/?(?!strong\b|b\b|em\b|i\b|code\b|pre\b|br\b)[a-z0-9-]+(?:\s+[^>]*?)?>/gi, '');
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
          console.log('Parsed code block:', { lang, content: code.substring(0, 100) + '...' });
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

  const highlightCode = (code: string, lang: string) => {
    // First escape HTML entities
    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Use a more careful approach - only highlight text that's not already in HTML tags
    // This prevents the nested tag mess
    
    // 1. Comments first (most specific patterns)
    highlighted = highlighted.replace(/(#.*$)/gm, '<span class="code-comment">$1</span>');
    highlighted = highlighted.replace(/(\/\/.*$)/gm, '<span class="code-comment">$1</span>');
    
    // 2. Multi-line comments
    highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');
    
    // 3. Triple-quoted strings (docstrings)
    highlighted = highlighted.replace(/("""[\s\S]*?""")/g, '<span class="code-string">$1</span>');
    highlighted = highlighted.replace(/('''[\s\S]*?''')/g, '<span class="code-string">$1</span>');
    
    // 4. String literals (single and double quotes) - be very careful not to match already highlighted content
    highlighted = highlighted.replace(/(?<!<[^>]*)(["'])((?:\\.|(?!\1)[^\\])*?)\1(?!>)/g, '<span class="code-string">$1$2$1</span>');
    
    // 5. Numbers - only match if not already in HTML tags
    highlighted = highlighted.replace(/(?<!<[^>]*)\b(\d+(?:\.\d+)?)\b(?!>)/g, '<span class="code-number">$1</span>');
    
    // 6. Keywords - use negative lookbehind/lookahead to avoid HTML tags
    if (lang === 'python' || lang === 'py') {
      const keywords = ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'lambda', 'yield', 'raise', 'assert', 'del', 'global', 'nonlocal'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`(?<!<[^>]*)\\b${keyword}\\b(?!>)`, 'g');
        highlighted = highlighted.replace(regex, `<span class="code-keyword">${keyword}</span>`);
      });
    } else if (lang === 'javascript' || lang === 'js' || lang === 'ts' || lang === 'typescript') {
      const keywords = ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'class', 'extends', 'import', 'export', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'interface', 'type'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`(?<!<[^>]*)\\b${keyword}\\b(?!>)`, 'g');
        highlighted = highlighted.replace(regex, `<span class="code-keyword">${keyword}</span>`);
      });
    } else if (lang === 'sql' || lang === 'postgres' || lang === 'postgresql') {
      const keywords = ['select','from','where','group','by','order','having','join','left','right','inner','outer','on','with','as','case','when','then','else','end','count','sum','avg','min','max','distinct','insert','into','values','update','set','delete','create','table','view','materialized','index','and','or','not','in','is','null','like'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`(?<!<[^>]*)\\b${keyword}\\b(?!>)`, 'gi');
        highlighted = highlighted.replace(regex, (m) => `<span class=\"code-keyword\">${m}</span>`);
      });
    }
    
    // 7. Built-in functions and types - same careful approach
    const builtins = ['print', 'len', 'range', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all', 'isinstance', 'type', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple'];
    builtins.forEach(builtin => {
      const regex = new RegExp(`(?<!<[^>]*)\\b${builtin}\\b(?!>)`, 'g');
      highlighted = highlighted.replace(regex, `<span class="code-builtin">${builtin}</span>`);
    });
    
    // 8. Function definitions - careful with word boundaries
    highlighted = highlighted.replace(/(?<!<[^>]*)(\bdef\s+)(\w+)(?!>)/g, '$1<span class="code-function">$2</span>');
    highlighted = highlighted.replace(/(?<!<[^>]*)(\bfunction\s+)(\w+)(?!>)/g, '$1<span class="code-function">$2</span>');
    
    // 9. Class names - careful with word boundaries
    highlighted = highlighted.replace(/(?<!<[^>]*)(\bclass\s+)(\w+)(?!>)/g, '$1<span class="code-class">$2</span>');

    return highlighted;
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

  const handleEvaluate = async () => {
    const first = extractFirstCodeBlock(answer);
    const lang = (first?.lang || 'python');
    const code = first?.code || answer;
    const problem = question || 'Evaluate the provided code.';
    try {
      await startEvaluationOverlay({ code, problem, language: lang, title: 'Evaluating' });
    } catch {}
  };

  const handleCodeAnalysis = () => {
    const first = extractFirstCodeBlock(answer);
    const lang = (first?.lang || 'python');
    const code = first?.code || answer;
    const problem = question || 'Analyze the provided code.';
    
    console.log('🧠 Opening Revolutionary Code Analysis...');
    console.log('📊 Analysis Parameters:', { code, language: lang, problem });
    
    setShowCodeAnalysis(true);
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
                        <div className="w-44 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
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
              className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              title="Evaluate code"
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Evaluate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCodeAnalysis}
              className="h-8 px-3 text-xs bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-600 hover:from-purple-500/20 hover:to-blue-500/20 border-purple-200 hover:border-purple-300"
              title="Revolutionary Code Analysis"
            >
              <Brain className="h-3.5 w-3.5 mr-1" />
              Analyze
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
                    <div className="rounded-b-lg border border-t-0 border-border bg-card p-3 relative">
                      <div className="diagram-container">
                        <div className="diagram-controls">
                          <button className="zoom-btn" onClick={() => zoomIn()} title="Zoom In">+</button>
                          <button className="zoom-btn" onClick={() => zoomOut()} title="Zoom Out">-</button>
                          <button className="zoom-btn" onClick={() => resetZoom()} title="Reset Zoom">↺</button>
                        </div>
                        <div className="mermaid" style={{ overflowX: 'auto' }}>
                          {block.content}
                        </div>
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
        <div className="sm:hidden flex items-center gap-3 mt-3 ml-2">
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
      </CardContent>
      
      {/* Revolutionary Code Analysis Overlay */}
      {showCodeAnalysis && (() => {
        const codeBlock = extractFirstCodeBlock(answer);
        return (
          <CodeAnalysisOverlay
            code={codeBlock?.code || answer}
            language={codeBlock?.lang || 'python'}
            problem={question}
            onClose={() => setShowCodeAnalysis(false)}
          />
        );
      })()}
    </Card>
  );
};