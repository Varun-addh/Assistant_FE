import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 🛡️ Debounce utility function
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay (default: 1000ms)
 * @param immediate - If true, trigger the function on the leading edge instead of trailing (default: true)
 * @returns A debounced version of the function
 * 
 * @example
 * ```typescript
 * // Debounce on leading edge (executes immediately, then prevents duplicates)
 * const handleClick = debounce(async () => {
 *   await createSession();
 * }, 1000, true);
 * 
 * // Debounce on trailing edge (waits for quiet period before executing)
 * const handleSearch = debounce((query: string) => {
 *   searchAPI(query);
 * }, 500, false);
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 1000,
  immediate: boolean = true
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = function () {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func(...args);
  };
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

// Convert foreignObject elements to native SVG text for reliable PDF rendering
// Convert foreignObject HTML to native SVG text for PDF compatibility
function convertForeignObjectToSvgText(svgElement: SVGSVGElement): void {
  const foreignObjects = Array.from(svgElement.querySelectorAll('foreignObject'));
  const processedPositions = new Set<string>();
  
  console.log(`[PDF] Converting ${foreignObjects.length} foreignObject elements to SVG text`);
  
  foreignObjects.forEach((fo, index) => {
    const x = parseFloat(fo.getAttribute('x') || '0');
    const y = parseFloat(fo.getAttribute('y') || '0');
    const width = parseFloat(fo.getAttribute('width') || '100');
    const height = parseFloat(fo.getAttribute('height') || '30');
    
    // Extract ALL text from inner HTML elements - Mermaid nests divs/spans deeply
    let textContent = '';
    
    // Method 1: Try to get text from specific Mermaid label classes
    const labelEl = fo.querySelector('.nodeLabel, .label, .edgeLabel, .labelText');
    if (labelEl) {
      textContent = labelEl.textContent?.trim() || '';
    }
    
    // Method 2: Try innermost div/span
    if (!textContent) {
      const innerEl = fo.querySelector('div > div, div > span, span > span, p');
      if (innerEl) {
        textContent = innerEl.textContent?.trim() || '';
      }
    }
    
    // Method 3: Try direct children
    if (!textContent) {
      const directChild = fo.querySelector('div, span, p');
      if (directChild) {
        textContent = directChild.textContent?.trim() || '';
      }
    }
    
    // Method 4: Fallback to direct textContent
    if (!textContent) {
      textContent = fo.textContent?.trim() || '';
    }
    
    // Clean up the text - remove extra whitespace and HTML entities
    textContent = textContent
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    
    console.log(`[PDF] ForeignObject ${index}: position=(${x}, ${y}), size=(${width}x${height}), text="${textContent.substring(0, 30)}..."`);
    
    if (!textContent) {
      fo.remove();
      return;
    }
    
    // Avoid duplicates at same position
    const posKey = `${Math.round(x)}-${Math.round(y)}`;
    if (processedPositions.has(posKey)) {
      console.log(`[PDF] Skipping duplicate at position ${posKey}`);
      fo.remove();
      return;
    }
    processedPositions.add(posKey);
    
    // Create native SVG text element
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', String(x + width / 2));
    textEl.setAttribute('y', String(y + height / 2));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'central');
    textEl.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    textEl.setAttribute('font-size', '12');
    textEl.setAttribute('fill', '#1e293b');
    textEl.setAttribute('font-weight', '500');
    
    // Handle multiline text
    const lines = textContent.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 1) {
      textEl.textContent = textContent;
    } else {
      const lineHeight = 16;
      const totalHeight = (lines.length - 1) * lineHeight;
      lines.forEach((line, i) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', String(x + width / 2));
        if (i === 0) {
          tspan.setAttribute('y', String(y + height / 2 - totalHeight / 2));
        } else {
          tspan.setAttribute('dy', String(lineHeight));
        }
        tspan.textContent = line;
        textEl.appendChild(tspan);
      });
    }
    
    // Insert text BEFORE the foreignObject's parent (usually a g element)
    const parent = fo.parentElement;
    if (parent) {
      parent.insertBefore(textEl, fo);
    }
    fo.remove();
  });
}

// Render SVG to PNG data URL for reliable PDF embedding
async function svgToPngDataUrl(svgElement: SVGSVGElement): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // Clone the SVG to avoid modifying the original
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      
      // Remove style tags that might cause issues
      clonedSvg.querySelectorAll('style').forEach(s => s.remove());
      
      // Store foreignObject text data before conversion for canvas fallback
      const textData: Array<{x: number, y: number, text: string, width: number, height: number}> = [];
      clonedSvg.querySelectorAll('foreignObject').forEach(fo => {
        const x = parseFloat(fo.getAttribute('x') || '0');
        const y = parseFloat(fo.getAttribute('y') || '0');
        const width = parseFloat(fo.getAttribute('width') || '100');
        const height = parseFloat(fo.getAttribute('height') || '30');
        let text = '';
        const labelEl = fo.querySelector('.nodeLabel, .label, .edgeLabel, div, span');
        if (labelEl) text = labelEl.textContent?.trim() || '';
        if (!text) text = fo.textContent?.trim() || '';
        text = text.replace(/\s+/g, ' ').trim();
        if (text) {
          textData.push({ x, y, text, width, height });
        }
      });
      
      // CRITICAL: Convert foreignObject to native SVG text elements
      convertForeignObjectToSvgText(clonedSvg);
      
      // Also remove any remaining foreignObject elements
      clonedSvg.querySelectorAll('foreignObject').forEach(fo => fo.remove());
      
      // Get dimensions
      let width = 800, height = 600;
      const viewBox = clonedSvg.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length >= 4) {
          width = parts[2] || 800;
          height = parts[3] || 600;
        }
      } else {
        width = parseFloat(clonedSvg.getAttribute('width') || '800');
        height = parseFloat(clonedSvg.getAttribute('height') || '600');
      }
      
      // Scale for PDF quality while keeping reasonable size
      const maxW = 650, maxH = 500;
      const scale = Math.min(maxW / width, maxH / height, 2);
      const finalW = Math.round(width * scale);
      const finalH = Math.round(height * scale);
      
      // Set explicit dimensions
      clonedSvg.setAttribute('width', String(finalW));
      clonedSvg.setAttribute('height', String(finalH));
      if (!clonedSvg.getAttribute('xmlns')) {
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      
      // Add a white background rect as first child
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', '#ffffff');
      if (clonedSvg.firstChild) {
        clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
      } else {
        clonedSvg.appendChild(bgRect);
      }
      
      // CRITICAL: Embed a web-safe font definition in the SVG
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = `
        text, tspan { 
          font-family: Arial, Helvetica, sans-serif !important;
          font-weight: 500;
        }
      `;
      defs.appendChild(styleEl);
      clonedSvg.insertBefore(defs, clonedSvg.firstChild);
      
      // Serialize SVG
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(clonedSvg);
      
      // Use base64 data URL
      const base64 = btoa(unescape(encodeURIComponent(svgStr)));
      const dataUrl = 'data:image/svg+xml;base64,' + base64;
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const dpr = 2; // High DPI for crisp text
        canvas.width = finalW * dpr;
        canvas.height = finalH * dpr;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(dpr, dpr);
          ctx.drawImage(img, 0, 0, finalW, finalH);
          
          // FALLBACK: Draw text directly on canvas if SVG text didn't render
          // This ensures text is always visible even if SVG text fails
          ctx.font = '500 12px Arial, Helvetica, sans-serif';
          ctx.fillStyle = '#1e293b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          textData.forEach(({ x, y, text, width: w, height: h }) => {
            const scaledX = (x + w / 2) * scale;
            const scaledY = (y + h / 2) * scale;
            // Truncate long text
            const displayText = text.length > 30 ? text.substring(0, 27) + '...' : text;
            ctx.fillText(displayText, scaledX, scaledY);
          });
          
          resolve(canvas.toDataURL('image/png', 1.0));
        } else {
          resolve(null);
        }
      };
      img.onerror = (e) => {
        console.error('[PDF] Image load error:', e);
        
        // ULTIMATE FALLBACK: Draw just the shapes and text using canvas
        const canvas = document.createElement('canvas');
        const dpr = 2;
        canvas.width = finalW * dpr;
        canvas.height = finalH * dpr;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, finalW, finalH);
          
          // Draw text for each node
          ctx.font = '500 12px Arial, Helvetica, sans-serif';
          ctx.fillStyle = '#1e293b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          textData.forEach(({ x, y, text, width: w, height: h }) => {
            const scaledX = (x + w / 2) * scale;
            const scaledY = (y + h / 2) * scale;
            const scaledW = w * scale;
            const scaledH = h * scale;
            
            // Draw box
            ctx.strokeStyle = '#a5b4fc';
            ctx.lineWidth = 1;
            ctx.strokeRect(scaledX - scaledW/2, scaledY - scaledH/2, scaledW, scaledH);
            ctx.fillStyle = '#f0f4ff';
            ctx.fillRect(scaledX - scaledW/2, scaledY - scaledH/2, scaledW, scaledH);
            
            // Draw text
            ctx.fillStyle = '#1e293b';
            const displayText = text.length > 25 ? text.substring(0, 22) + '...' : text;
            ctx.fillText(displayText, scaledX, scaledY);
          });
          
          resolve(canvas.toDataURL('image/png', 1.0));
        } else {
          resolve(null);
        }
      };
      img.src = dataUrl;
      
    } catch (e) {
      console.error('[PDF] svgToPngDataUrl error:', e);
      resolve(null);
    }
  });
}

// Render Mermaid code to PNG using Kroki API (most reliable for PDF)
async function renderMermaidToPng(mermaidCode: string): Promise<string | null> {
  try {
    // Clean up the code
    let code = mermaidCode.trim();
    if (!code) return null;
    
    // Add init directive for better rendering if not present
    if (!code.includes('%%{init:')) {
      code = `%%{init: {'theme': 'neutral', 'flowchart': {'htmlLabels': false}}}%%\n${code}`;
    }
    
    console.log('[PDF] Rendering mermaid to PNG via Kroki...');
    
    // Use Kroki PNG endpoint
    const response = await fetch('https://kroki.io/mermaid/png', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: code
    });
    
    if (!response.ok) {
      console.error('[PDF] Kroki PNG request failed:', response.status);
      return null;
    }
    
    // Convert response to base64 data URL
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        console.log('[PDF] Successfully got PNG from Kroki');
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[PDF] Kroki PNG error:', e);
    return null;
  }
}

// Process Mermaid diagrams for PDF - convert SVG to PNG for reliable text rendering
async function processMermaidDiagrams(pdfContent: HTMLElement, mermaidSources: string[] = []): Promise<void> {
  // Remove ALL <style> tags - they render as text in html2canvas
  pdfContent.querySelectorAll('style').forEach(style => style.remove());
  
  // Find ALL mermaid/diagram containers
  const mermaidContainers = Array.from(pdfContent.querySelectorAll('.mermaid, .mermaid-rendered, .diagram-container, [data-lang="mermaid"]')) as HTMLElement[];
  
  console.log(`[PDF] Processing ${mermaidContainers.length} mermaid containers with ${mermaidSources.length} pre-extracted sources`);
  
  let sourceIndex = 0;
  
  for (const container of mermaidContainers) {
    // If it already has an <img> tag with data URL, it's already converted - good!
    if (container.querySelector('img[src^="data:image"]')) {
      console.log('[PDF] Container already has PNG image, skipping');
      sourceIndex++;
      continue;
    }
    
    // FIRST: Try to get original Mermaid source from attribute OR from pre-extracted sources
    let mermaidSource = container.getAttribute('data-mermaid-source') || 
                        container.querySelector('[data-mermaid-source]')?.getAttribute('data-mermaid-source');
    
    // If not found in attributes, use pre-extracted source
    if (!mermaidSource && sourceIndex < mermaidSources.length) {
      mermaidSource = mermaidSources[sourceIndex];
      console.log(`[PDF] Using pre-extracted source ${sourceIndex}`);
    }
    
    if (mermaidSource) {
      console.log('[PDF] Found mermaid source, rendering via Kroki PNG...');
      console.log('[PDF] Source preview:', mermaidSource.substring(0, 100) + '...');
      
      const pngDataUrl = await renderMermaidToPng(mermaidSource);
      
      if (pngDataUrl) {
        console.log('[PDF] Successfully rendered via Kroki PNG');
        const img = document.createElement('img');
        img.src = pngDataUrl;
        img.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 16px auto;';
        img.alt = 'Architecture Diagram';
        
        container.innerHTML = '';
        container.appendChild(img);
        container.style.cssText = 'text-align: center; margin: 16px 0; page-break-inside: avoid;';
        sourceIndex++;
        continue;
      }
    }
    
    // FALLBACK: Find SVG element and try to convert
    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (svg) {
      console.log('[PDF] Found SVG, converting to PNG...');
      
      // Convert SVG to PNG for reliable text rendering in PDF
      const pngDataUrl = await svgToPngDataUrl(svg);
      
      if (pngDataUrl) {
        console.log('[PDF] Successfully converted SVG to PNG');
        const img = document.createElement('img');
        img.src = pngDataUrl;
        img.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 16px auto;';
        img.alt = 'Architecture Diagram';
        
        container.innerHTML = '';
        container.appendChild(img);
        container.style.cssText = 'text-align: center; margin: 16px 0; page-break-inside: avoid;';
      } else {
        console.log('[PDF] PNG conversion failed, showing placeholder...');
        // Show a placeholder instead of broken diagram
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 16px 0; color: #0369a1; font-size: 13px; text-align: center;';
        placeholder.innerHTML = '<strong>📊 Architecture Diagram</strong><br><span style="font-size: 11px; color: #64748b;">View the interactive diagram in the web application</span>';
        container.innerHTML = '';
        container.appendChild(placeholder);
      }
      continue;
    }
    
    // Check for raw CSS text content that leaked through
    const text = container.textContent || '';
    if (text.includes('{fill:') || text.includes('!important') || text.includes('#mermaid-svg')) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 16px; margin: 16px 0; color: #0369a1; font-size: 12px;';
      placeholder.innerHTML = '<strong>📊 Architecture Diagram</strong><br>Visual diagram available in the web view.';
      container.replaceWith(placeholder);
    }
  }
  
  // Hide any text elements with CSS content that leaked outside containers
  pdfContent.querySelectorAll('p, span, div').forEach(el => {
    const text = el.textContent || '';
    if (text.includes('{fill:') || text.includes('!important}') || text.includes('#mermaid-svg')) {
      (el as HTMLElement).style.display = 'none';
    }
  });
}

// Generate a world-class printable PDF via the browser's print-to-PDF pipeline.
// We avoid heavy client-side PDF libs to keep bundle small and quality high.
/**
 * 📄 Professional PDF Export Function
 * - Non-blocking: Uses async chunks to keep UI responsive
 * - Proper text wrapping: Fixed container width with word-wrap
 * - No UI flash: Renders completely off-screen
 * - Progress callback: For showing export progress
 */
export async function downloadAnswerPdf(opts: { 
  question: string; 
  answerHtml: string; 
  fileName?: string;
  onProgress?: (stage: string) => void;
  mermaidSources?: string[]; // Pre-extracted mermaid source codes
}) {
  const { question, answerHtml, fileName, onProgress, mermaidSources = [] } = opts;
  const now = new Date();
  const safeFile = (fileName || `stratax-ai-${now.toISOString().slice(0, 10)}.pdf`).replace(/[^a-z0-9_.-]+/gi, '-');

  console.log(`[PDF] Starting export with ${mermaidSources.length} mermaid sources`);

  // Helper to yield to main thread (prevents UI freeze)
  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  try {
    onProgress?.('Loading PDF library...');
    await yieldToMain();
    
    const html2pdf = await ensureHtml2Pdf();
    if (!html2pdf) throw new Error('PDF export failed: html2pdf library could not be loaded.');
    
    onProgress?.('Preparing document...');
    await yieldToMain();
    
    // Create a hidden container in the MAIN document (not iframe - iframe causes capture issues)
    // Position it far off-screen but with actual dimensions
    const container = document.createElement('div');
    container.id = 'pdf-export-container-' + Date.now();
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 750px;
      background: #ffffff;
      z-index: -9999;
      visibility: hidden;
    `;
    
    // Build the PDF content with inline styles (most reliable for html2canvas)
    container.innerHTML = `
      <div style="
        width: 750px;
        padding: 40px;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1e293b;
        box-sizing: border-box;
        overflow: visible;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e2e8f0;
        ">
          <div style="font-weight: 700; font-size: 16px; color: #0f172a;">Stratax AI</div>
          <div style="font-size: 12px; color: #64748b;">${now.toLocaleString()}</div>
        </div>
        
        <!-- Title -->
        <div style="
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 24px;
          line-height: 1.4;
          word-wrap: break-word;
        ">${escapeHtml(question)}</div>
        
        <!-- Content -->
        <div class="pdf-answer-content" style="
          font-size: 13px;
          line-height: 1.8;
          color: #1e293b;
          max-width: 670px;
          overflow: visible;
        ">${answerHtml}</div>
        
        <!-- Footer spacer -->
        <div style="height: 40px;"></div>
      </div>
    `;
    
    document.body.appendChild(container);
    await yieldToMain();
    
    // Apply inline styles to ALL content elements for reliable capture
    const contentDiv = container.querySelector('.pdf-answer-content') as HTMLElement;
    if (contentDiv) {
      // Style all paragraphs - JUSTIFIED text for even right edge
      contentDiv.querySelectorAll('p').forEach(el => {
        (el as HTMLElement).style.cssText = 'margin: 12px 0; line-height: 1.8; word-wrap: break-word; text-align: justify;';
      });
      
      // Style all headings
      contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
        (el as HTMLElement).style.cssText = 'font-weight: 700; color: #0f172a; margin: 20px 0 12px 0;';
      });
      
      // Style all lists
      contentDiv.querySelectorAll('ul, ol').forEach(el => {
        (el as HTMLElement).style.cssText = 'margin: 12px 0; padding-left: 24px;';
      });
      contentDiv.querySelectorAll('li').forEach(el => {
        (el as HTMLElement).style.cssText = 'margin: 6px 0; line-height: 1.7; text-align: justify;';
      });
      
      // Style code blocks - CRITICAL for proper rendering
      contentDiv.querySelectorAll('pre, .code-block').forEach(el => {
        (el as HTMLElement).style.cssText = `
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 16px;
          border-radius: 8px;
          margin: 16px 0;
          font-family: Consolas, Monaco, monospace;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-all;
          overflow: hidden;
          max-width: 720px;
        `;
      });
      
      contentDiv.querySelectorAll('code').forEach(el => {
        const parent = el.parentElement;
        if (parent?.tagName === 'PRE' || parent?.classList.contains('code-block')) {
          // Code inside pre - transparent background
          (el as HTMLElement).style.cssText = 'background: transparent; padding: 0; font-family: inherit; font-size: inherit; color: inherit; white-space: pre-wrap; word-break: break-all;';
        } else {
          // Inline code
          (el as HTMLElement).style.cssText = 'background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 12px; color: #0f172a;';
        }
      });
      
      // Style tables
      contentDiv.querySelectorAll('table').forEach(el => {
        (el as HTMLElement).style.cssText = `
          width: 100%;
          max-width: 600px;
          border-collapse: collapse;
          margin: 16px 0;
          font-size: 12px;
          table-layout: fixed;
        `;
      });
      contentDiv.querySelectorAll('th').forEach(el => {
        (el as HTMLElement).style.cssText = 'background: #1f2937; color: #ffffff; padding: 10px; text-align: left; font-weight: 600; border: 1px solid #374151;';
      });
      contentDiv.querySelectorAll('td').forEach(el => {
        (el as HTMLElement).style.cssText = 'background: #374151; color: #ffffff; padding: 10px; border: 1px solid #4b5563; word-wrap: break-word;';
      });
      
      // Style ALL images to fit within content area
      contentDiv.querySelectorAll('img').forEach(el => {
        (el as HTMLElement).style.cssText = 'max-width: 580px !important; width: auto !important; height: auto !important; display: block !important;';
      });
      
      // Style mermaid containers
      contentDiv.querySelectorAll('.mermaid-rendered').forEach(el => {
        (el as HTMLElement).style.cssText = 'max-width: 600px; overflow: visible; margin: 12px 0;';
      });
      
      // Process Mermaid diagrams FIRST - convert SVGs to PNGs for reliable text rendering
      // This must happen BEFORE other styling since it replaces SVGs with images
      console.log('[PDF] Starting Mermaid diagram processing...');
      await processMermaidDiagrams(contentDiv, mermaidSources);
      console.log('[PDF] Mermaid diagram processing complete');
      
      // Style session blocks (for multi-QA exports)
      contentDiv.querySelectorAll('.session-block').forEach(el => {
        (el as HTMLElement).style.cssText = 'margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0;';
      });
      
      // Style strong/bold - default dark color for normal text
      contentDiv.querySelectorAll('strong, b').forEach(el => {
        (el as HTMLElement).style.cssText = 'font-weight: 700; color: #0f172a;';
      });
      
      // Style strong/bold INSIDE tables - must be WHITE
      contentDiv.querySelectorAll('th strong, th b, td strong, td b').forEach(el => {
        (el as HTMLElement).style.cssText = 'font-weight: 700; color: #ffffff !important;';
      });
      
      // Hide buttons and interactive elements
      contentDiv.querySelectorAll('button, .lucide, svg.lucide, [class*="copy-"]').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      
      // Hide thinking process
      contentDiv.querySelectorAll('details, .thinking-process').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    }
    
    onProgress?.('Rendering document...');
    await yieldToMain();
    
    // Give browser time to apply styles
    await new Promise(resolve => setTimeout(resolve, 100));
    
    onProgress?.('Generating PDF...');
    await yieldToMain();
    
    // Generate PDF - balanced quality and speed
    await html2pdf()
      .set({
        margin: [5, 5, 5, 5], // top, right, bottom, left in mm
        filename: safeFile,
        image: { type: 'jpeg', quality: 0.90 }, // JPEG for smaller file size
        html2canvas: { 
          scale: 2, // Good quality without huge file size
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true, // Compress for faster download
        },
        pagebreak: { 
          mode: ['css', 'legacy'],
          avoid: ['h1', 'h2', 'h3', 'h4', 'tr', '.session-block', '.mermaid-rendered']
        },
      })
      .from(container.firstElementChild)
      .save();
    
    // Cleanup
    document.body.removeChild(container);
    
    onProgress?.('Complete!');
    return;
    
  } catch (err) {
    console.error('[PDF Export] Error:', err);
    // Try to cleanup on error
    const leftover = document.querySelector('[id^="pdf-export-container-"]');
    if (leftover) leftover.remove();
    throw err;
  }
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

  // DON'T modify the HTML at all - just add PDF-optimized CSS
  // This preserves all tables, code blocks, and diagrams exactly as they are
  const pdfStyles = `<style>
    /* Hide Thinking Process if it uses details/summary */
    details, .thinking-process, [data-testid="thinking-process"] { display: none !important; }
    
    @page { margin: 20mm 15mm 25mm 15mm; }
    
    /* Reset all layout flow to prevent overlapping */
    * { position: static !important; float: none !important; height: auto !important; overflow: visible !important; }
    
    /* Strict block layout for main content with better line height */
    .answer p, .answer h1, .answer h2, .answer h3, .answer h4, .answer li, .answer div {
      display: block !important;
      position: relative !important;
      width: auto !important;
      margin-bottom: 12px !important;
      line-height: 1.8 !important;
    }
    
    /* Session blocks styling */
    .session-block {
      margin-bottom: 28px !important;
      page-break-inside: avoid !important;
    }
    
    .code-block {
      background: #0d1117 !important;
      color: #e6edf3 !important;
      padding: 12px !important;
      border-radius: 6px !important;
      border: 1px solid #30363d !important;
      margin: 12px 0 !important;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
      font-size: 10px !important;
      line-height: 1.5 !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }

    /* Inner pre/code should be transparent and inherit */
    .code-block pre, .code-block code {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      color: inherit !important;
      font-family: inherit !important;
      font-size: inherit !important;
      white-space: pre-wrap !important;
      word-break: break-all !important; /* Ensure long strings like tokens wrap */
    }
    
    /* Legacy pre blocks (if any exist without wrapper) */
    pre:not(.code-block pre) {
      background: #0d1117 !important;
      color: #e6edf3 !important;
      padding: 12px !important;
      border-radius: 6px !important;
      border: 1px solid #30363d !important;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
      font-size: 11px !important;
      white-space: pre-wrap !important;
    }
    
    /* Preserve syntax highlighting colors */
    .answer .code-block .hljs-keyword, .hljs-keyword, .code-keyword { color: #ff7b72 !important; }
    .answer .code-block .hljs-string, .hljs-string, .code-string { color: #a5d6ff !important; }
    .answer .code-block .hljs-number, .hljs-number, .code-number { color: #79c0ff !important; }
    .answer .code-block .hljs-comment, .hljs-comment, .code-comment { color: #8b949e !important; }
    .answer .code-block .hljs-function, .hljs-function, .code-function { color: #d2a8ff !important; }
    .answer .code-block .hljs-variable, .hljs-variable, .code-variable { color: #ffa657 !important; }
    .answer .code-block .hljs-built_in, .hljs-built_in, .code-builtin { color: #ff7b72 !important; }
    .answer .code-block .code-print { color: #79c0ff !important; }
    
    /* Code headers */
    .code-header {
      background: #161b22 !important;
      color: #8b949e !important;
      padding: 8px 12px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      border-bottom: 1px solid #30363d !important;
    }
    
    /* Tables - preserve exact structure */
    table, .table, .table-professional, .data-table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      border-spacing: 0 !important;
      border-radius: 0 !important;
      border: 1px solid #334155 !important;
      margin: 12px 0 !important;
      page-break-inside: auto !important;
      background: #1f2937 !important;
    }
    
    table th, .table th {
      background: #111827 !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      text-align: left !important;
      padding: 8px 10px !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      border: 1px solid #334155 !important;
      border-left: none !important;
      border-top: none !important;
      overflow-wrap: break-word !important;
    }
    
    table td, .table td {
      background: #1f2937 !important;
      color: #ffffff !important;
      padding: 8px 10px !important;
      font-size: 11px !important;
      border: 1px solid #334155 !important;
      border-left: none !important;
      border-top: none !important;
      vertical-align: top !important;
      overflow-wrap: break-word !important;
    }

    table th:last-child, .table th:last-child, table td:last-child, .table td:last-child {
      border-right: none !important;
    }
    
    table tr:last-child td, .table tr:last-child td {
      border-bottom: none !important;
    }
    
    table tr, .table tr {
      background: transparent !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
      border: none !important;
    }
    
    /* Force white text and straight corners in tables */
    table *, .table * {
      color: #ffffff !important;
      border-radius: 0 !important;
    }
    /* Explicitly force bold text in tables to be white to override .answer strong */
    .answer table strong, .answer table b, table strong, table b {
      color: #ffffff !important;
    }
    /* Explicitly force bold text in tables to be white to override .answer strong */
    .answer table strong, .answer table b, table strong, table b {
      color: #ffffff !important;
    }
    
    /* Diagrams */
    .mermaid, .mermaid-rendered, .diagram-container {
      margin: 16px 0 !important;
      page-break-inside: avoid !important;
    }
    
    /* Regular content */
    .answer p {
      color: #0f172a !important;
      line-height: 1.6 !important;
      margin: 8px 0 !important;
    }
    
    .answer h1, .answer h2, .answer h3, .answer h4 {
      color: #0f172a !important;
      font-weight: 700 !important;
      margin: 14px 0 8px !important;
    }
    
    .answer ul, .answer ol {
      color: #0f172a !important;
      margin: 8px 0 !important;
      padding-left: 24px !important;
    }
    
    .answer li {
      color: #0f172a !important;
      margin: 4px 0 !important;
    }
    
    /* Hide buttons in PDF */
    button, .lucide { display: none !important; }
  </style>`;

  // Robust cleanup for the PDF content to remove artifacts and unwanted sections
  const cleanedSrc = src
    // 1. Remove "Thinking Process" block
    .replace(/(?:Thinking Process|Thinking process)[\s\S]*?(?=(?:Complete Answer|Detailed Answer|Here is|Sure|Okay|###|##|\*\*))/i, '')
    .trim();

  return pdfStyles + cleanedSrc;
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
      try { script.remove(); } catch { }
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
  try { await ensureHtml2Pdf(); } catch { }
}

// Utility: Wait for all diagrams in an element to have an SVG child
export async function waitForSvgInDiagram(timeout = 3000, root: HTMLElement | Document = document): Promise<void> {
  const query = '.mermaid, .mermaid-rendered, .diagram-container, [data-lang="mermaid"]';
  const nodes = Array.from(root.querySelectorAll(query)) as HTMLElement[];
  if (nodes.length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const allReady = nodes.every(node => {
        // If the node itself is .mermaid, check if it has SVG. 
        // If it's a wrapper, check its .mermaid child.
        const target = node.classList.contains('mermaid') ? node : (node.querySelector('.mermaid') as HTMLElement || node);
        return target.querySelector('svg') || (target as any).dataset.mermaidFailed === 'true';
      });

      if (allReady) return resolve();
      if (Date.now() - start > timeout) return reject('Diagram(s) did not render in time');
      setTimeout(check, 100);
    };
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