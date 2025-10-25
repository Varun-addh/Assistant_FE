import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRenderMermaid } from "@/lib/api";
import { Copy, Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface MermaidEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode: string;
  title?: string;
}

export function MermaidEditor({ open, onOpenChange, initialCode, title = "Mermaid Live Editor" }: MermaidEditorProps) {
  const [code, setCode] = useState<string>(initialCode || "");
  const [svg, setSvg] = useState<string>("");
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const scaleRef = useRef<number>(1.0);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanningRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setCode(initialCode || "");
      // render after small delay to ensure dialog mounted
      const t = setTimeout(() => void renderPreview(initialCode || code), 50);
      return () => clearTimeout(t);
    } else {
      setSvg("");
      setError("");
      scaleRef.current = 1.0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cleanSvg = (s: string) => {
    return s
      .replace(/aria-roledescription="[^"]*"/g, "")
      .replace(/role="graphics-document[^"]*"/g, "");
  };

  const renderPreview = async (src: string) => {
    const content = (src || "").trim();
    if (!content) {
      setSvg("");
      return;
    }
    setIsRendering(true);
    setError("");
    try {
      const response = await apiRenderMermaid({ code: content, theme: "neutral", style: "modern", size: "medium" });
      if (response.trim().startsWith("<svg")) {
        setSvg(cleanSvg(response));
        return;
      }
    } catch {}
    // Fallback to client mermaid if available
    try {
      const mm: any = (window as any).mermaid;
      if (mm && typeof mm.render === "function") {
        const out = await mm.render(`mmd-${Date.now()}`, content);
        if (out?.svg) {
          setSvg(cleanSvg(out.svg as string));
          return;
        }
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setIsRendering(false);
    }
  };

  const onInputChange = (v: string) => {
    setCode(v);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (open) renderPreview(code);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleCopyCode = async () => {
    try { await navigator.clipboard.writeText(code); } catch {}
  };

  const handleCopySvg = async () => {
    if (!svg) return;
    try { await navigator.clipboard.writeText(svg); } catch {}
  };

  const handleDownloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const zoomIn = () => {
    scaleRef.current = Math.min(2, scaleRef.current + 0.1);
    applyScale();
  };
  const zoomOut = () => {
    scaleRef.current = Math.max(0.5, scaleRef.current - 0.1);
    applyScale();
  };
  const resetZoom = () => {
    scaleRef.current = 1.0;
    applyScale();
  };

  const applyScale = () => {
    const el = containerRef.current?.querySelector("svg") as (SVGSVGElement | null);
    if (!el) return;
    (el as unknown as HTMLElement).style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scaleRef.current})`;
    ((el as unknown as HTMLElement).style as any).transformOrigin = "0 0";
  };

  useEffect(() => { applyScale(); }, [svg]);

  const preview = useMemo(() => ({ __html: svg || "" }), [svg]);

  const onMouseDown = (e: React.MouseEvent) => {
    // Enable drag-to-pan with any mouse button
    isPanningRef.current = true;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    containerRef.current?.classList.add("mmd-grabbing");
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current || !lastPointRef.current) return;
    const dx = e.clientX - lastPointRef.current.x;
    const dy = e.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
    applyScale();
  };

  const endPan = () => {
    isPanningRef.current = false;
    lastPointRef.current = null;
    containerRef.current?.classList.remove("mmd-grabbing");
  };

  const onWheel = (e: React.WheelEvent) => {
    // Ctrl/Cmd + wheel to zoom around pointer
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const el = containerRef.current?.querySelector("svg") as (SVGSVGElement | null);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prevScale = scaleRef.current;
    const nextScale = Math.max(0.3, Math.min(3, prevScale * (e.deltaY < 0 ? 1.1 : 0.9)));
    if (nextScale === prevScale) return;

    // Adjust pan so the point under cursor stays stable
    const k = nextScale / prevScale;
    panRef.current = {
      x: mouseX - k * (mouseX - panRef.current.x),
      y: mouseY - k * (mouseY - panRef.current.y)
    };
    scaleRef.current = nextScale;
    applyScale();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-3 h-[70vh]">
          <div className="w-1/2 h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Source (Mermaid)</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={handleCopyCode}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => onInputChange(e.target.value)}
              className="flex-1 w-full resize-none rounded-md border border-border bg-background p-3 font-mono text-sm leading-5"
              spellCheck={false}
            />
          </div>
          <div className="w-1/2 h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Preview</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={zoomIn} title="Zoom In"><ZoomIn className="h-4 w-4"/></Button>
                <Button variant="outline" size="icon" onClick={zoomOut} title="Zoom Out"><ZoomOut className="h-4 w-4"/></Button>
                <Button variant="outline" size="icon" onClick={resetZoom} title="Reset Zoom"><RotateCcw className="h-4 w-4"/></Button>
                <Button variant="outline" size="sm" onClick={handleCopySvg} disabled={!svg}>
                  <Copy className="h-3.5 w-3.5 mr-1"/> Copy SVG
                </Button>
                <Button variant="default" size="sm" onClick={handleDownloadSvg} disabled={!svg}>
                  <Download className="h-3.5 w-3.5 mr-1"/> Download SVG
                </Button>
              </div>
            </div>
            <div
              ref={containerRef}
              className="flex-1 border border-border rounded-md bg-card overflow-auto p-3 mmd-grab"
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={endPan}
              onMouseLeave={endPan}
            >
              {isRendering && !svg ? (
                <div className="text-xs text-muted-foreground">Rendering...</div>
              ) : svg ? (
                <div className="mermaid-rendered" dangerouslySetInnerHTML={preview} />
              ) : error ? (
                <div className="text-xs text-destructive">{error}</div>
              ) : (
                <div className="text-xs text-muted-foreground">No preview</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


