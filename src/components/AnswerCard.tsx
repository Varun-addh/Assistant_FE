import { useState, useEffect, useRef } from "react";
import { Copy, Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface AnswerCardProps {
  answer: string;
  question: string;
  // When false, render instantly without typewriter/streaming effect (used for history)
  streaming?: boolean;
}

export const AnswerCard = ({ answer, question, streaming = true }: AnswerCardProps) => {
  const [copied, setCopied] = useState(false);
  const [isDetailed, setIsDetailed] = useState(true);
  const [typedText, setTypedText] = useState("");
  const [displayedBlocks, setDisplayedBlocks] = useState<Array<{type: string, content: string, lang?: string}>>([]);
  const { toast } = useToast();
  const typingTimerRef = useRef<any>(null);
  const lastAnswerRef = useRef<string>("");

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
  const formatStreamingText = (text: string) => {
    if (!text) return '';
    
    // Split by code fences to handle mixed content
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
            result += `<pre><code class="language-${lang}">${highlightCode(actualCode, lang)}</code></pre>`;
            result += `</div>`;
          }
        }
      } else {
        // This is regular text content
        const textContent = parts[i];
        if (textContent.trim()) {
          result += formatTextContent(textContent);
        }
      }
    }
    
    return result;
  };

  // Handle incomplete code blocks during streaming
  const formatIncompleteCodeBlock = (text: string) => {
    // Find the last ``` to get the incomplete code section
    const lastCodeStart = text.lastIndexOf('```');
    if (lastCodeStart === -1) return formatTextContent(text);
    
    const beforeCode = text.substring(0, lastCodeStart);
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
    
    // First, split by code fences to separate code from text
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
        const textContent = parts[i].trim();
        if (textContent) {
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
          
          lines.forEach(line => {
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
            
            // Check for bold text patterns (**text**)
            const boldMatch = trimmedLine.match(/^\*\*(.*?)\*\*[:\s]*(.*)/);
            if (boldMatch) {
              if (currentBlock?.type !== 'ul') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = { type: 'ul', content: '' };
              }
              const description = boldMatch[2].trim();
              currentBlock.content += `<li><strong>${boldMatch[1].trim()}</strong>${description ? ' – ' + description : ''}</li>`;
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

  return (
    <Card className="w-full shadow-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:shadow-3xl">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-muted/50 backdrop-blur-sm rounded-lg p-0.5 border border-border/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDetailed(false)}
                className={`h-7 px-3 text-xs font-medium transition-all duration-300 rounded-md ${
                  !isDetailed 
                    ? "bg-background text-foreground shadow-md border border-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Concise
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDetailed(true)}
                className={`h-7 px-3 text-xs font-medium transition-all duration-300 rounded-md ${
                  isDetailed 
                    ? "bg-background text-foreground shadow-md border border-border/50" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Detailed
              </Button>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(displayAnswer)}
              className="h-7 px-3 text-xs bg-gradient-to-r from-primary/10 to-primary/5 text-primary hover:from-primary/20 hover:to-primary/10 border border-primary/20 shadow-md hover:shadow-lg transition-all duration-300 font-medium"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Answer
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-1 streaming-content">
          {/* Display completed blocks */}
          {displayedBlocks.map((block, index) => (
            <div key={index} className="streaming-content">
              {block.type === 'code' ? (
                <div className="my-1">
                  <div className="flex items-center justify-between bg-[#161b22] px-4 py-2 rounded-t-lg border border-b-0 border-border">
                    <span className="typography-caption">
                      {block.lang ? `${block.lang.charAt(0).toUpperCase() + block.lang.slice(1)} Code` : 'Code'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(block.content)}
                      className="h-6 px-2 text-xs hover:bg-muted"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy code
                    </Button>
                  </div>
                  <pre className="overflow-auto rounded-b-lg bg-[#0b1020] text-[#e6edf3] p-4 text-sm border border-t-0 border-border">
                    <code 
                      className="font-mono" 
                      dangerouslySetInnerHTML={{ __html: highlightCode(block.content, block.lang || '') }} 
                    />
                  </pre>
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
                <div className="text-base mb-1 mt-1 font-semibold">
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
        
        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between typography-caption">
            <span>
              {displayAnswer.split(' ').filter(Boolean).length} words • {Math.ceil(displayAnswer.split(' ').filter(Boolean).length / 150)} min read
            </span>
            <span className="flex items-center space-x-1">
              <span className={`w-2 h-2 rounded-full ${isDetailed ? 'bg-primary' : 'bg-muted-foreground'}`}></span>
              <span>{isDetailed ? 'Detailed' : 'Concise'} version</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};