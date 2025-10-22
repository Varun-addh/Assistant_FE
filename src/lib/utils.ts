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
