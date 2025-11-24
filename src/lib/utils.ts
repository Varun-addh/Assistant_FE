import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Minimal markdown-to-HTML formatter for the cinematic overlay stream
export function formatOverlayChunkHtml(text: string): string {
  if (!text) return "";
  let safe = text
    .replace(new RegExp("<script[\\s\\S]*?<\\/script>", "gi"), "")
    .replace(new RegExp("<style[\\s\\S]*?<\\/style>", "gi"), "");
  // Bold and italics
  safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*(?!\s)([^*\n]+)\*/g, '<em>$1</em>');
  // Headings
  safe = safe.replace(/^#{1,6}\s+(.+)$/gm, (_m, t) => `<h3 class="font-semibold text-white/90">${t}</h3>`);
  // Lists
  safe = safe.replace(/^(?:-\s+|\*\s+)(.+)$/gm, '<li class="text-white/80">$1</li>');
  // Paragraphs
  const lines = safe.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => l.startsWith('<h3') || l.startsWith('<ul') || l.startsWith('<li') ? l : `<p class="text-white/80">${l}</p>`).join('\n');
}

// Generate a world-class printable PDF via the browser's print-to-PDF pipeline.
// We avoid heavy client-side PDF libs to keep bundle small and quality high.
export async function downloadAnswerPdf(opts: { question: string; answerHtml: string; fileName?: string }) {
  const { question, answerHtml, fileName } = opts;
  const now = new Date();
  const title = 'InterviewMate – Answer';
  const safeFile = (fileName || `interviewmate-${now.toISOString().slice(0,10)}.pdf`).replace(/[^a-z0-9_.-]+/gi, '-');

  // 1) Try direct programmatic download using html2pdf (lazy-loaded from CDN)
  try {
    const html2pdf = await ensureHtml2Pdf();
    if (html2pdf) {
      const container = document.createElement('div');
      container.style.width = '700px'; // within A4 printable area
      // Add generous bottom padding so the last lines never get clipped at page boundaries
      container.style.padding = '24px 24px 48px 24px';
      // ensure padding is included in measured size
      (container.style as any).boxSizing = 'border-box';
      container.style.margin = '0';
      container.innerHTML = `
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          .header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; }
          .brand { font-weight: 700; font-size: 14px; letter-spacing: .02em; color:#0f172a; }
          .meta { font-size: 11px; color:#475569; }
          .title { font-size: 18px; font-weight: 700; line-height:1.35; margin: 8px 0 14px; color:#0f172a; }
          .answer { font-size: 12.5px; line-height: 1.55; color:#0f172a; }
          /* Give the last child a small bottom margin so the final line isn't flush against the page edge */
          .answer > *:last-child { margin-bottom: 12px !important; }
          .answer, .answer * { color:#0f172a !important; opacity:1 !important; }
          .answer strong, .answer b { font-weight:700; color:#0f172a !important; }
          .answer h1,.answer h2,.answer h3,.answer h4 { margin: 10px 0 6px; font-weight: 700; }
          .answer p { margin: 6px 0; }
          .answer ul { margin: 6px 0 6px 16px; padding:0; }
          .answer ol { margin: 6px 0 6px 18px; padding:0; }
          .answer li { margin: 3px 0; }
          /* Prevent last element on a page from being cut by encouraging early breaks */
          .answer > * { page-break-inside: auto; break-inside: auto; }
          .answer > * + * { page-break-before: auto; break-before: auto; }
          /* Keep wrappers together, allow long code to split across pages */
          pre, code, .hljs, .shiki { page-break-inside: auto !important; break-inside: auto !important; }
          .keep-together, .code-block { page-break-inside: avoid !important; break-inside: avoid !important; page-break-before: auto; page-break-after: auto; }
          .code-header { page-break-after: avoid; }
          .code { background:#0b1020 !important; color:#e6edf3 !important; border-radius:8px; border:1px solid #30363d; padding:12px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 11.5px; overflow: visible; page-break-inside: auto; break-inside: auto; white-space: pre-wrap; word-break: break-word; display: block; }
          .code *, pre.code, code.code { color:#e6edf3 !important; }
          .code-header { display:flex; align-items:center; justify-content:space-between; background:#161b22 !important; color:#8b949e !important; padding:8px 12px; font-size:12px; border-bottom:1px solid #30363d; border-top-left-radius:8px; border-top-right-radius:8px; }
          /* Ensure header and code body are not split */
          .code-header + * { page-break-before: avoid; break-before: avoid; }
          /* Robust table theming for export (matches various class names) */
          .table, table, .table-professional, .data-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:10px; overflow:hidden; border:1px solid #334155; opacity:1 !important; page-break-inside: avoid; break-inside: avoid; }
          .table th, table th, .table-professional th, .data-table th { text-align:left; background:#111827 !important; font-size:11px; letter-spacing:.02em; text-transform:uppercase; padding:10px 12px; color:#ffffff !important; opacity:1 !important; }
          .table td, table td, .table-professional td, .data-table td { padding:10px 12px; border-top:1px solid #334155; font-size:12px; background:#1f2937 !important; color:#ffffff !important; opacity:1 !important; }
          .table tr, table tr, .table-professional tr, .data-table tr { background:#1f2937 !important; opacity:1 !important; }
          /* Force descendants to inherit white color and full opacity */
          .table *, table *, .table-professional *, .data-table * { color:#ffffff !important; opacity:1 !important; mix-blend-mode: normal !important; filter: none !important; }
          /* Neutralize ancestor utilities that may dim content */
          .answer [class*="opacity-"], .answer [style*="opacity"], .answer .bg-card, .answer .bg-muted, .answer [class*="bg-"] { opacity:1 !important; mix-blend-mode: normal !important; filter: none !important; }
          /* Keep blocks together to avoid awkward gaps */
          h1, h2, h3, h4, p, ul, ol, table, pre { widows: 3; orphans: 3; }
        </style>
        <div class="header">
          <div class="brand">InterviewMate</div>
          <div class="meta">${now.toLocaleString()}</div>
        </div>
        <div class="title">${escapeHtml(question)}</div>
        <div class="answer">${normalizeAnswerHtml(answerHtml)}</div>
      `;
      document.body.appendChild(container);
      // Reset any SVG transforms (zoom/pan) so export is always default view
      for (const svg of container.querySelectorAll('.mermaid svg, .mermaid-rendered svg')) {
        (svg as SVGSVGElement).style.transform = '';
        (svg as SVGSVGElement).style.transformOrigin = '';
      }
      // Convert Mermaid SVGs to images to avoid foreignObject/html2canvas issues
      try {
        await inlineMermaidSvgs(container);
      } catch {}
      // Remove UI-only header bars (e.g., "Copy table", language headers) before export
      try {
        // Any header bar that has rounded top and no bottom border (our pattern)
        container.querySelectorAll('div[class*="rounded-t-lg"][class*="border-b-0"]').forEach((el) => {
          // Only remove if it precedes a table/code wrapper
          const next = (el as HTMLElement).nextElementSibling as HTMLElement | null;
          if (next && (next.querySelector('table, pre, code') || next.matches('div, pre, table'))) {
            el.remove();
          }
        });
        // Remove any explicit copy buttons that might remain
        Array.from(container.querySelectorAll('button')).forEach((btn) => {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || '';
          if (text.includes('copy table') || text.includes('copy code') || text.includes('copy')) {
            (btn as HTMLElement).remove();
          }
        });
        // Normalize wrappers that only provide rounded/border background around tables or code blocks
        container.querySelectorAll('div').forEach((el) => {
          const node = el as HTMLElement;
          const onlyChild = node.children.length === 1 ? (node.children[0] as HTMLElement) : null;
          if (onlyChild && (onlyChild.tagName.toLowerCase() === 'table' || onlyChild.tagName.toLowerCase() === 'pre')) {
            // Remove decorative styling that can create empty blocks at page breaks
            node.style.background = 'transparent';
            node.style.border = 'none';
            node.style.padding = '0';
            node.style.marginTop = node.style.marginTop || '0';
            node.style.marginBottom = node.style.marginBottom || '0';
          }
        });
      } catch {}
      // Add a larger spacer at the end to force html2pdf to account for final lines
      const sentinel = document.createElement('div');
      // larger spacer gives html2canvas some breathing room for rounding/scale differences
      sentinel.style.height = '48px';
      sentinel.style.pageBreakInside = 'avoid';
      sentinel.style.breakInside = 'avoid';
      container.appendChild(sentinel);

      await html2pdf()
        .set({
          // Increase bottom margin to avoid clipping on page boundaries
          // increase bottom margin slightly to avoid clipping at page boundaries
          margin:       [18, 18, 40, 18],
          filename:     safeFile,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF:        { unit: 'pt', format: 'a4', orientation: 'portrait' },
          // Use both css and legacy algorithms for more reliable breaking
          pagebreak:    { mode: ['css', 'legacy'] },
        })
        .from(container)
        .save();
      container.remove();
      return;
    }
  } catch {
    // fall back to print pipeline
  }

  const docHtml = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
     <style>
      @page { size: A4; margin: 22mm 18mm; }
      * { box-sizing: border-box; }
      /* Ensure there's explicit safe space at the bottom for footers/final lines */
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; padding-bottom: 20mm; }
      .header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; }
      .brand { font-weight: 700; font-size: 14px; letter-spacing: .02em; color:#0f172a; }
      .meta { font-size: 11px; color:#475569; }
      .title { font-size: 18px; font-weight: 700; line-height:1.35; margin: 8px 0 14px; }
      .section { margin: 10px 0; }
       .answer { font-size: 12.5px; line-height: 1.55; color:#0f172a; }
       /* Keep wrappers together, allow long code to split across pages in print pipeline */
       pre, code, .hljs, .shiki { page-break-inside: auto !important; break-inside: auto !important; }
       .keep-together, .code-block { page-break-inside: avoid !important; break-inside: avoid !important; page-break-before: auto; page-break-after: auto; }
       .code-header { page-break-after: avoid; }
       .code { background:#0b1020 !important; color:#e6edf3 !important; border-radius:8px; border:1px solid #30363d; padding:12px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 11.5px; overflow: visible; page-break-inside: auto; break-inside: auto; white-space: pre-wrap; word-break: break-word; display: block; }
       .code *, pre.code, code.code { color:#e6edf3 !important; }
       .code-header { display:flex; align-items:center; justify-content:space-between; background:#161b22 !important; color:#8b949e !important; padding:8px 12px; font-size:12px; border-bottom:1px solid #30363d; border-top-left-radius:8px; border-top-right-radius:8px; }
       .code-header + * { page-break-before: avoid; break-before: avoid; }
       .answer, .answer * { color:#0f172a !important; opacity:1 !important; }
       .answer strong, .answer b { font-weight:700; color:#0f172a !important; }
      .answer h1,.answer h2,.answer h3,.answer h4 { margin: 10px 0 6px; font-weight: 700; }
      .answer h1 { font-size: 18px; }
      .answer h2 { font-size: 16px; }
      .answer h3 { font-size: 14px; }
      .answer p { margin: 6px 0; }
      .answer ul { margin: 6px 0 6px 16px; padding:0; }
      .answer ol { margin: 6px 0 6px 18px; padding:0; }
      .answer li { margin: 3px 0; }
      .code { background:#0b1020; color:#e6edf3; border-radius:8px; border:1px solid #30363d; padding:10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 11.5px; overflow: hidden; }
       .table, table, .table-professional, .data-table { width:100%; border-collapse:separate; border-spacing:0; border-radius:10px; overflow:hidden; border:1px solid #334155; opacity:1 !important; page-break-inside: avoid; break-inside: avoid; }
       .table th, table th, .table-professional th, .data-table th { text-align:left; background:#111827 !important; font-size:11px; letter-spacing:.02em; text-transform:uppercase; padding:10px 12px; color:#ffffff !important; opacity:1 !important; }
       .table td, table td, .table-professional td, .data-table td { padding:10px 12px; border-top:1px solid #334155; font-size:12px; background:#1f2937 !important; color:#ffffff !important; opacity:1 !important; }
      .table td:first-child, table td:first-child, .table-professional td:first-child, .data-table td:first-child { color:#ffffff !important; opacity:1 !important; }
      .table th:first-child, table th:first-child, .table-professional th:first-child, .data-table th:first-child { color:#ffffff !important; opacity:1 !important; }
       .table *, table *, .table-professional *, .data-table * { color:#ffffff !important; opacity:1 !important; }
       h1, h2, h3, h4, p, ul, ol, table, pre { widows: 3; orphans: 3; }
       .table tr, table tr, .table-professional tr, .data-table tr { background:#1f2937 !important; opacity:1 !important; }
       .answer [class*="opacity-"], .answer [style*="opacity"], .answer .bg-card, .answer .bg-muted, .answer [class*="bg-"] { opacity:1 !important; mix-blend-mode: normal !important; filter: none !important; }
      /* Move footer slightly inward so it does not overlap page content */
      .footer { position: fixed; bottom: 12mm; left: 18mm; right: 18mm; font-size: 11px; color:#64748b; display:flex; justify-content:space-between; }
      @media print { .no-print { display:none; } }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="brand">InterviewMate</div>
      <div class="meta">${now.toLocaleString()}</div>
    </div>
    <div class="title">${escapeHtml(question)}</div>
    <div class="section answer">${normalizeAnswerHtml(answerHtml)}</div>
    <div class="footer"><span>InterviewMate</span><span>${now.toLocaleDateString()}</span></div>
    <script>
      window.onload = () => {
        document.title = ${JSON.stringify(safeFile)};
        window.print();
        setTimeout(() => window.close(), 300);
      };
    </script>
  </body>
  </html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(docHtml);
  win.document.close();
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Transform the in-app HTML into a print-optimized version
function normalizeAnswerHtml(src: string): string {
  if (!src) return '';
  let html = src;
  // Convert our code blocks to a simpler printable container
  html = html
    .replace(/class=\"[^\"]*code-block[^\"]*\"/gi, 'class="code"')
    .replace(/<pre[^>]*>/gi, '<pre class="code">')
    .replace(/<code[^>]*>/gi, '<code class="code">')
    .replace(/class=\"[^\"]*table[^\"]*\"/gi, 'class="table"');
  // Remove UI-only header bars like "Data Table" and code headers (rounded top + no bottom border)
  html = html.replace(/<div[^>]*class=\"[^\"]*rounded-t-lg[^\"]*border-b-0[^\"]*\"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Strip overflow utilities that cause clipping in html2canvas
  html = html.replace(/\boverflow-(?:x|y-)?(?:auto|hidden|clip|scroll)\b/gi, '');
  // Remove inline styles that force light text or opacity from the app theme
  html = html.replace(/style=\"[^\"]*opacity\s*:\s*0\.[0-9]+[^\"]*\"/gi, (m) => m.replace(/opacity\s*:\s*0\.[0-9]+/i, ''));
  html = html.replace(/style=\"[^\"]*color\s*:\s*rgba?\([^\)]*\)[^\"]*\"/gi, (m) => m.replace(/color\s*:\s*rgba?\([^\)]*\)/i, 'color:#0f172a'));
  html = html.replace(/style=\"[^\"]*color\s*:\s*#[0-9a-fA-F]{3,6}[^\"]*\"/gi, (m) => m.replace(/color\s*:\s*#[0-9a-fA-F]{3,6}/i, 'color:#0f172a'));
  // Replace HSL and var-based colors used by Tailwind-like tokens
  html = html.replace(/style=\"[^\"]*color\s*:\s*hsl\([^\)]*\)[^\"]*\"/gi, (m) => m.replace(/color\s*:\s*hsl\([^\)]*\)/i, 'color:#0f172a'));
  html = html.replace(/style=\"[^\"]*color\s*:\s*var\([^\)]*\)[^\"]*\"/gi, (m) => m.replace(/color\s*:\s*var\([^\)]*\)/i, 'color:#0f172a'));
  // If inline color contains !important, strip it so our overrides win
  html = html.replace(/color\s*:\s*[^;"!]+!\s*important/gi, (m) => m.replace(/!\s*important/i, ''));
  const tableCss = '<style>.table, table, .table-professional, .data-table, .table *, table *, .table-professional *, .data-table *{color:#ffffff !important; opacity:1 !important; mix-blend-mode:normal !important;} .table th, table th, .table-professional th, .data-table th{background:#111827 !important;} .table td, table td, .table-professional td, .data-table td{background:#1f2937 !important; border-color:#334155 !important;} .table, table, .table-professional, .data-table{border-color:#334155 !important; opacity:1 !important;} .table tr, table tr, .table-professional tr, .data-table tr{background:#1f2937 !important; opacity:1 !important;}</style>';
  // Neutralize decorative wrappers that can leave empty dark blocks
  const wrapperCss = '<style>.answer .bg-card{background:transparent !important;}.answer .border{border-color:transparent !important;}.answer .rounded-b-lg{border-radius:0 !important;}.answer .border-t-0{border-top-width:0 !important;}.answer .p-3, .answer .px-3, .answer .py-3{padding:0 !important;}</style>';
  return tableCss + wrapperCss + html;
}

let html2pdfPromise: Promise<any> | null = null;
async function ensureHtml2Pdf(): Promise<any | null> {
  if ((window as any).html2pdf) return (window as any).html2pdf;
  if (html2pdfPromise) return html2pdfPromise;

  const sources = [
    // Prefer pinned CDN with cache
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    // Secondary CDN
    'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
  ];

  const loadWithTimeout = (src: string, timeoutMs = 7000) => new Promise<any>((resolve) => {
    const script = document.createElement('script');
    let timer: number | null = null;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (timer) window.clearTimeout(timer);
      resolve((window as any).html2pdf || null);
    };
    script.onerror = () => {
      if (timer) window.clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(script);
    timer = window.setTimeout(() => {
      try { script.remove(); } catch {}
      resolve(null);
    }, timeoutMs);
  });

  html2pdfPromise = (async () => {
    for (let i = 0; i < sources.length; i++) {
      const lib = await loadWithTimeout(sources[i]);
      if (lib) return lib;
    }
    // One retry loop in case of transient failures
    for (let i = 0; i < sources.length; i++) {
      const lib = await loadWithTimeout(sources[i]);
      if (lib) return lib;
    }
    return null;
  })();

  return html2pdfPromise;
}

export async function preloadHtml2Pdf(): Promise<void> {
  try { await ensureHtml2Pdf(); } catch {}
}

// Convert Mermaid SVGs to images to make html2canvas capture them reliably
async function inlineMermaidSvgs(root: HTMLElement): Promise<void> {
  // Target .mermaid, .mermaid-rendered, and .diagram-container for diagrams
  const mermaids = Array.from(root.querySelectorAll('.mermaid, .mermaid-rendered, .diagram-container')) as HTMLElement[];
  for (const container of mermaids) {
    const svg = container.querySelector('svg');
    if (!svg) continue;
    const cloned = svg.cloneNode(true) as SVGElement;
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Ensure SVG has explicit width/height to avoid cropping
    if (!cloned.getAttribute('width') || !cloned.getAttribute('height')) {
      let width = 0;
      let height = 0;
      try {
        const g = cloned as unknown as SVGGraphicsElement;
        const bbox = g.getBBox();
        width = Math.ceil(bbox.width + bbox.x);
        height = Math.ceil(bbox.height + bbox.y);
      } catch {
        const vb = (cloned as any).viewBox?.baseVal;
        if (vb) { width = vb.width; height = vb.height; }
      }
      if (width > 0) cloned.setAttribute('width', String(width));
      if (height > 0) cloned.setAttribute('height', String(height));
    }
    const xml = new XMLSerializer().serializeToString(cloned);
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.background = getComputedStyle(container).backgroundColor || '#0b1020';
    const wrapper = document.createElement('div');
    wrapper.style.borderRadius = '8px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.pageBreakInside = 'avoid';
    wrapper.style.breakInside = 'avoid';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';
    wrapper.style.display = 'block';
    // Use responsive constraints rather than forcing explicit pixel sizes. This
    // lets the PDF pipeline scale diagrams to the container width while also
    // capping very tall diagrams to avoid them overflowing a single page.
    const MAX_PAGE_CONTENT_HEIGHT = 980; // px, approx available height with margins
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.maxHeight = `${MAX_PAGE_CONTENT_HEIGHT}px`;
    img.onload = () => {
      // Double-check natural size and apply a conservative max-height if needed.
      if (img.naturalHeight && img.naturalHeight > MAX_PAGE_CONTENT_HEIGHT) {
        img.style.maxHeight = `${MAX_PAGE_CONTENT_HEIGHT}px`;
        img.style.width = 'auto';
      }
    };
    wrapper.appendChild(img);
    container.replaceWith(wrapper);
  }
}

// Utility: Wait for diagram SVG to appear in the DOM before exporting to PDF
export async function waitForSvgInDiagram(timeout = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const selector = '.diagram-container svg, .mermaid svg, .mermaid-rendered svg';
    if (document.querySelector(selector)) return resolve();
    const start = Date.now();
    function check() {
      if (document.querySelector(selector)) return resolve();
      if (Date.now() - start > timeout) return reject('Diagram SVG not found in time');
      setTimeout(check, 100);
    }
    check();
  });
}

export async function replaceDiagramSvgWithImg(container: HTMLElement) {
  const svg = container.querySelector('.diagram-container svg');
  if (!svg) return;

  // Serialize SVG
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  // Make it a data URL
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const imageSrc = `data:image/svg+xml;base64,${svg64}`;

  // Create img element
  const img = document.createElement('img');
  img.src = imageSrc;
  img.style.maxWidth = '100%'; // (optional: style to your liking)

  // Replace SVG with IMG
  svg.parentNode?.replaceChild(img, svg);
  // Optionally return for cleanup/debugging
  return img;
}

export async function svgElementToPngImage(svg: SVGElement, width = 800, height = 400): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const imageSrc = `data:image/svg+xml;base64,${svg64}`;
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.width = width;
    img.height = height;
    img.src = imageSrc;
  });
}