import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { apiSubmitQuestion, apiCreateSession } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface OutputExplanationProps {
  output: string;
  code: string;
  language: string;
  isActive: boolean;
  sessionId?: string;
  explanation?: string;
  onExplanationChange?: (explanation: string) => void;
}

// Enhanced markdown renderer with table support, proper bold handling, and controlled spacing
const renderMarkdown = (text: string): JSX.Element => {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let inList = false;
  let listItems: JSX.Element[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let tableHeader: string[] = [];
  let tableKey = 0;
  
  // Helper to render inline formatting (bold, code)
  const renderInline = (content: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let currentIndex = 0;
    let partKey = 0;
    
    // Handle code blocks first (backticks)
    const codePattern = /`([^`]+)`/g;
    let match;
    let lastIndex = 0;
    
    while ((match = codePattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const beforeCode = content.substring(lastIndex, match.index);
        // Process bold in the text before code
        parts.push(...processBold(beforeCode, partKey));
        partKey += beforeCode.split('**').length;
      }
      parts.push(<code key={`code-${partKey++}`} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{match[1]}</code>);
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex);
      parts.push(...processBold(remaining, partKey));
    }
    
    return parts.length > 0 ? parts : [content];
  };
  
  // Helper to process bold text
  const processBold = (text: string, startKey: number): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    const boldParts = text.split('**');
    boldParts.forEach((part, i) => {
      if (part) {
        if (i % 2 === 1) {
          parts.push(<strong key={`bold-${startKey + i}`}>{part}</strong>);
        } else {
          parts.push(part);
        }
      }
    });
    return parts.length > 0 ? parts : [text];
  };
  
  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`list-${elements.length}`} className="list-disc ml-6 mb-2 space-y-1">{listItems}</ul>);
      listItems = [];
      inList = false;
    }
  };
  
  const flushTable = () => {
    if (tableRows.length > 0 || inTable) {
      elements.push(
        <div key={`table-${tableKey++}`} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse border border-border">
            <thead>
              <tr className="bg-muted">
                {tableHeader.map((header, i) => (
                  <th key={i} className="border border-border px-3 py-2 text-left font-semibold text-sm">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rowIdx) => (
                <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="border border-border px-3 py-2 text-sm">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      tableHeader = [];
      inTable = false;
    }
  };
  
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    
    // Skip table separator rows (| :--- | :--- |)
    if (/^\|(\s*:?-+:?\s*\|)+\s*$/.test(trimmed)) {
      return;
    }
    
    // Detect table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
      
      if (!inTable) {
        flushList();
        flushTable();
        // First row is header
        tableHeader = cells;
        inTable = true;
      } else {
        // Data rows
        if (cells.length === tableHeader.length) {
          tableRows.push(cells);
        }
      }
      return;
    }
    
    // Flush table if we encounter non-table content
    if (inTable && !trimmed.startsWith('|')) {
      flushTable();
    }
    
    // Headers (also handle bold in headers)
    if (trimmed.startsWith('### ')) {
      flushList();
      const headerText = trimmed.substring(4);
      elements.push(<h3 key={idx} className="text-base font-semibold mt-3 mb-1.5">{renderInline(headerText)}</h3>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      const headerText = trimmed.substring(3);
      elements.push(<h2 key={idx} className="text-lg font-bold mt-3 mb-1.5">{renderInline(headerText)}</h2>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      const headerText = trimmed.substring(2);
      elements.push(<h1 key={idx} className="text-xl font-bold mt-3 mb-2">{renderInline(headerText)}</h1>);
    }
    // Bullet points
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      const content = trimmed.substring(2);
      listItems.push(<li key={`li-${listItems.length}`} className="leading-relaxed">{renderInline(content)}</li>);
    }
    // Numbered lists
    else if (/^\d+\.\s/.test(trimmed)) {
      inList = true;
      const content = trimmed.replace(/^\d+\.\s/, '');
      listItems.push(<li key={`li-${listItems.length}`} className="leading-relaxed">{renderInline(content)}</li>);
    }
    // Code blocks
    else if (trimmed.startsWith('```')) {
      flushList();
      flushTable();
      // Skip code block markers for now, or implement code block rendering
    }
    // Regular paragraph (reduced spacing between sections)
    else if (trimmed) {
      flushList();
      flushTable();
      elements.push(<p key={idx} className="mb-1.5 leading-relaxed">{renderInline(trimmed)}</p>);
    }
    // Empty lines - skip them to reduce gaps between sections
  });
  
  flushList();
  flushTable();
  
  return <div className="max-w-none space-y-1">{elements}</div>;
};

export const OutputExplanation = ({ 
  output, 
  code, 
  language, 
  isActive, 
  sessionId,
  explanation: propExplanation = "",
  onExplanationChange
}: OutputExplanationProps) => {
  const [explanation, setExplanation] = useState<string>(propExplanation);
  const [displayText, setDisplayText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { toast } = useToast();

  // Sync with prop
  useEffect(() => {
    if (propExplanation) {
      setExplanation(propExplanation);
      setDisplayText(propExplanation);
    }
  }, [propExplanation]);

  // Streaming effect
  useEffect(() => {
    if (!explanation || !isStreaming) return;
    
    const words = explanation.split(' ');
    let currentIndex = 0;
    
    const streamWord = () => {
      if (currentIndex < words.length) {
        setDisplayText(words.slice(0, currentIndex + 1).join(' '));
        currentIndex++;
        streamTimeoutRef.current = setTimeout(streamWord, 50); // 50ms per word
      } else {
        setIsStreaming(false);
        if (onExplanationChange) {
          onExplanationChange(explanation);
        }
      }
    };
    
    setDisplayText('');
    streamWord();
    
    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
    };
  }, [explanation, isStreaming, onExplanationChange]);

  const generateExplanation = async () => {
    if (!output) {
      toast({ title: "Cannot explain", description: "No output to explain.", variant: "destructive" });
      return;
    }
    
    setIsGenerating(true);
    setExplanation("");
    setDisplayText("");
    setIsStreaming(false);
    
    try {
      let sid = sessionId;
      if (!sid) {
        try {
          const res = await apiCreateSession();
          sid = res.session_id;
        } catch (e) {
          throw new Error("Failed to create session. Please try again.");
        }
      }
      const prompt = `Explain what this ${language} code output means in simple terms. Focus on what the output represents and how it relates to the algorithm.

Code:
\`\`\`${language}
${code.substring(0, 500)}
\`\`\`

Output:
${output.substring(0, 1000)}

Provide a clear, concise explanation suitable for interview preparation. Use markdown formatting with bullet points for clarity.`;
      
      const ask = async (session_id: string) => apiSubmitQuestion({
        session_id,
        question: prompt,
        style: "short",
      });
      let response;
      try {
        response = await ask(sid);
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (/404/.test(msg) || /Session not found/i.test(msg)) {
          const res = await apiCreateSession();
          response = await ask(res.session_id);
        } else {
          throw err;
        }
      }
      
      setExplanation(response.answer);
      setIsStreaming(true);
      if (onExplanationChange) {
        onExplanationChange(response.answer);
      }
    } catch (error: any) {
      toast({
        title: "Explanation failed",
        description: error?.message || "Could not generate explanation.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const hasExplanation = explanation || propExplanation || displayText;
  const currentDisplay = displayText || explanation || propExplanation;

  if (!isActive || !output) return null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Output Explanation
          </h3>
          {!hasExplanation && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={generateExplanation}
              disabled={isGenerating || !sessionId}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Explaining...
                </>
              ) : (
                "Explain Output"
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasExplanation ? (
          <div className="text-sm text-foreground leading-relaxed">
            {renderMarkdown(currentDisplay)}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Click "Explain Output" to get an AI-powered explanation of what the output means and how it relates to your algorithm.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OutputExplanation;

