import { useState } from "react";
import { Copy, Check, MoreHorizontal, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface AnswerCardProps {
  answer: string;
  question: string;
}

export const AnswerCard = ({ answer, question }: AnswerCardProps) => {
  const [copied, setCopied] = useState(false);
  const [isDetailed, setIsDetailed] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Answer has been copied to your clipboard.",
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
    // Create a shorter version by taking the first few sentences
    const sentences = fullAnswer.split('. ');
    const shorterSentences = sentences.slice(0, Math.max(1, Math.floor(sentences.length / 2)));
    return shorterSentences.join('. ') + (shorterSentences.length > 1 ? '.' : '');
  };

  const displayAnswer = isDetailed ? answer : generateShorterAnswer(answer);

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-answer transition-all duration-300 hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Generated Answer</h3>
              <p className="text-sm text-muted-foreground italic">
                "{question.length > 80 ? question.substring(0, 80) + "..." : question}"
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Shorter/Detailed Toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDetailed(false)}
                className={`h-8 px-3 text-xs transition-all duration-200 ${
                  !isDetailed 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Shorter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDetailed(true)}
                className={`h-8 px-3 text-xs transition-all duration-200 ${
                  isDetailed 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Detailed
              </Button>
            </div>
            
            {/* Copy Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 px-3 bg-secondary text-secondary-foreground hover:bg-secondary-hover border border-border shadow-sm hover:shadow-md transition-all duration-200"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="text-foreground leading-relaxed text-base">
            {displayAnswer}
          </p>
        </div>
        
        {/* Answer length indicator */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {displayAnswer.split(' ').length} words • {Math.ceil(displayAnswer.split(' ').length / 150)} min read
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