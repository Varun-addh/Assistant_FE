import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonacoEditor } from './MonacoEditor';
import { apiExecuteCode } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Code2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Terminal,
  Send,
} from 'lucide-react';
import type {
  Question,
  TestCase,
  CodeTestResult,
  CodeEvaluationFeedback,
} from '@/lib/practiceModeApi';

interface InterviewCodeEditorProps {
  question: Question;
  onSubmit: (code: string, timeTaken: number) => Promise<void>;
  isSubmitting?: boolean;
  testResults?: CodeTestResult[];
  evaluation?: CodeEvaluationFeedback;
  timeRemaining: number;
  onTimeUp?: () => void;
}

export const InterviewCodeEditor = ({
  question,
  onSubmit,
  isSubmitting = false,
  testResults,
  evaluation,
  timeRemaining,
  onTimeUp,
}: InterviewCodeEditorProps) => {
  const { toast } = useToast();
  
  const defaultLang = question.programming_language || 'python';
  const [language, setLanguage] = useState(defaultLang);
  const [code, setCode] = useState(question.code_template || getDefaultTemplate(defaultLang));
  const [startTime] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('editor');
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);

  // Run code state
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeOutput, setCodeOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const testCases = question.test_cases || [];
  const hints = question.hints || [];
  const constraints = question.constraints || [];

  // Auto-switch to results tab when evaluation is available
  useEffect(() => {
    if (evaluation) {
      setActiveTab('results');
    }
  }, [evaluation]);

  // Handle time up
  useEffect(() => {
    if (timeRemaining <= 0 && onTimeUp) {
      onTimeUp();
    }
  }, [timeRemaining, onTimeUp]);

  // When language changes, update the template if user hasn't typed custom code
  const handleLanguageChange = useCallback((newLang: string) => {
    const prevTemplate = getDefaultTemplate(language);
    // If code is still the default template, swap to the new language template
    if (code.trim() === prevTemplate.trim() || !code.trim()) {
      setCode(getDefaultTemplate(newLang));
    }
    setLanguage(newLang);
  }, [code, language]);

  const handleRunCode = useCallback(async () => {
    if (!code.trim()) {
      toast({ title: 'No code to run', description: 'Please write some code first.', variant: 'destructive' });
      return;
    }
    setIsRunningCode(true);
    setCodeOutput('');
    setShowOutput(true);

    try {
      const execLanguage = language === 'typescript' ? 'javascript' : language;
      const exec = await apiExecuteCode({ language: execLanguage, code, stdin: '' });

      const stdout = (exec.stdout ?? '').trim();
      const stderr = (exec.stderr ?? '').trim();

      if (exec.success) {
        const output = stdout || '(no output)';
        setCodeOutput(stderr ? `${output}\n\n[stderr]\n${stderr}` : output);
      } else {
        setCodeOutput(stderr || stdout || exec.status || 'Execution failed');
      }
    } catch (error: any) {
      setCodeOutput(`Error: ${error.message || 'Failed to execute code'}`);
    } finally {
      setIsRunningCode(false);
    }
  }, [code, language, toast]);

  const handleSubmit = async () => {
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    await onSubmit(code, timeTaken);
  };

  const handleShowNextHint = () => {
    if (currentHintIndex < hints.length - 1) {
      setCurrentHintIndex(currentHintIndex + 1);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeColor = (): string => {
    if (timeRemaining > 300) return 'text-green-500';
    if (timeRemaining > 120) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-4">
      {/* Question Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Code2 className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-xl">Coding Challenge</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Badge variant={question.difficulty === 'easy' ? 'secondary' : question.difficulty === 'medium' ? 'default' : 'destructive'}>
                    {question.difficulty?.toUpperCase()}
                  </Badge>
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Language Selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Language:</Label>
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Clock className={`h-5 w-5 ${getTimeColor()}`} />
                <span className={`text-2xl font-mono font-bold ${getTimeColor()}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed whitespace-pre-wrap">
            {question.question_text || question.text || 'No question text available'}
          </p>
          
          {/* Constraints */}
          {constraints.length > 0 && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Constraints
              </h4>
              <ul className="space-y-1">
                {constraints.map((constraint, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground">
                    • {constraint}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Editor Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="tests">Test Cases ({testCases.length})</TabsTrigger>
          <TabsTrigger value="hints" disabled={hints.length === 0}>
            Hints ({hints.length})
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!evaluation}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* Editor Tab */}
        <TabsContent value="editor" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* File badge */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs font-mono">
                  solution.{language === 'python' ? 'py' : language === 'cpp' || language === 'c' ? language : language === 'java' ? 'java' : language === 'go' ? 'go' : 'js'}
                </Badge>
              </div>

              <MonacoEditor
                value={code}
                language={language}
                onChange={setCode}
                height="min(400px, 50vh)"
              />

              {/* Output Panel */}
              {showOutput && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">Output</span>
                    </div>
                    <button onClick={() => setShowOutput(false)} className="text-xs text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  </div>
                  <pre className="p-3 text-sm font-mono bg-black/90 text-green-400 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                    {isRunningCode ? 'Running...' : (codeOutput || '(no output)')}
                  </pre>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Write your solution above and click Submit when ready
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRunCode}
                    disabled={isRunningCode || !code.trim()}
                    className="gap-2"
                  >
                    {isRunningCode ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run Code
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !code.trim()}
                    className="min-w-32 gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Code
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Cases Tab */}
        <TabsContent value="tests" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Cases</CardTitle>
              <CardDescription>
                Your solution will be evaluated against these test cases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {testCases.map((testCase, idx) => (
                    <Card key={idx} className="border-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          Test Case {idx + 1}
                          {testCase.is_hidden && (
                            <Badge variant="secondary" className="text-xs">Hidden</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground mb-1">Input:</div>
                          <pre className="text-sm bg-muted p-2 rounded font-mono overflow-x-auto">
                            {testCase.input}
                          </pre>
                        </div>
                        {!testCase.is_hidden && (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground mb-1">Expected Output:</div>
                            <pre className="text-sm bg-muted p-2 rounded font-mono overflow-x-auto">
                              {testCase.expected_output}
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hints Tab */}
        <TabsContent value="hints" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Progressive Hints
              </CardTitle>
              <CardDescription>
                Use hints carefully - they may affect your evaluation score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hints.slice(0, currentHintIndex + 1).map((hint, idx) => (
                <Alert key={idx}>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Hint {idx + 1}:</strong> {hint}
                  </AlertDescription>
                </Alert>
              ))}
              {currentHintIndex < hints.length - 1 && (
                <Button
                  variant="outline"
                  onClick={handleShowNextHint}
                  className="w-full"
                >
                  Show Next Hint ({currentHintIndex + 1}/{hints.length})
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="mt-4">
          {evaluation && (
            <div className="space-y-4">
              {/* Overall Score Card */}
              <Card className={evaluation.is_correct ? 'border-green-500' : 'border-yellow-500'}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {evaluation.is_correct ? (
                        <>
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                          Solution Accepted!
                        </>
                      ) : (
                        <>
                          <XCircle className="h-6 w-6 text-yellow-500" />
                          Needs Improvement
                        </>
                      )}
                    </CardTitle>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">
                        {evaluation.overall_score}%
                      </div>
                      <div className="text-xs text-muted-foreground">Overall Score</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Score Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Correctness</div>
                      <div className="flex items-center gap-2">
                        <Progress value={evaluation.correctness_score} className="flex-1" />
                        <span className="text-sm font-semibold">{evaluation.correctness_score}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Code Quality</div>
                      <div className="flex items-center gap-2">
                        <Progress value={evaluation.code_quality_score} className="flex-1" />
                        <span className="text-sm font-semibold">{evaluation.code_quality_score}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Efficiency</div>
                      <div className="flex items-center gap-2">
                        <Progress value={evaluation.efficiency_score} className="flex-1" />
                        <span className="text-sm font-semibold">{evaluation.efficiency_score}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Test Results Summary */}
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Test Cases</span>
                      <span className="text-sm">
                        {evaluation.test_cases_passed} / {evaluation.test_cases_total} passed
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Test Results Details */}
              {testResults && testResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Test Case Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="space-y-3">
                        {testResults.map((result, idx) => (
                          <Card key={idx} className={result.passed ? 'border-green-500/50' : 'border-red-500/50'}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {result.passed ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  )}
                                  <span className="font-semibold text-sm">Test Case {result.test_case_number}</span>
                                </div>
                                {result.execution_time_ms && (
                                  <Badge variant="outline" className="text-xs">
                                    {result.execution_time_ms}ms
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <div className="text-xs text-muted-foreground">Input:</div>
                                  <pre className="bg-muted p-2 rounded font-mono text-xs overflow-x-auto">
                                    {result.input}
                                  </pre>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-xs text-muted-foreground">Expected:</div>
                                    <pre className="bg-muted p-2 rounded font-mono text-xs overflow-x-auto">
                                      {result.expected_output}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="text-xs text-muted-foreground">Your Output:</div>
                                    <pre className={`p-2 rounded font-mono text-xs overflow-x-auto ${
                                      result.passed ? 'bg-green-500/10' : 'bg-red-500/10'
                                    }`}>
                                      {result.actual_output}
                                    </pre>
                                  </div>
                                </div>
                                {result.error_message && (
                                  <Alert variant="destructive">
                                    <AlertDescription className="text-xs">
                                      {result.error_message}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* AI Feedback */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    AI Feedback & Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Approach Feedback */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Algorithm Approach</h4>
                    <p className="text-sm text-muted-foreground">{evaluation.approach_feedback}</p>
                  </div>

                  {/* Complexity Analysis */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Time Complexity</div>
                      <div className="font-mono font-semibold">{evaluation.time_complexity}</div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Space Complexity</div>
                      <div className="font-mono font-semibold">{evaluation.space_complexity}</div>
                    </div>
                  </div>

                  {/* Code Quality Notes */}
                  {evaluation.code_quality_notes.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Code Quality</h4>
                      <ul className="space-y-1">
                        {evaluation.code_quality_notes.map((note, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Edge Cases */}
                  <div className="grid grid-cols-2 gap-4">
                    {evaluation.edge_cases_handled.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-green-600">✓ Handled Well</h4>
                        <ul className="space-y-1">
                          {evaluation.edge_cases_handled.map((edge, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">• {edge}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evaluation.edge_cases_missed.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-yellow-600">⚠ Missed Cases</h4>
                        <ul className="space-y-1">
                          {evaluation.edge_cases_missed.map((edge, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">• {edge}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Optimization Suggestions */}
                  {evaluation.optimization_suggestions.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">💡 Optimization Suggestions</h4>
                      <ul className="space-y-1">
                        {evaluation.optimization_suggestions.map((suggestion, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Alternative Approaches */}
                  {evaluation.alternative_approaches.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">🔄 Alternative Approaches</h4>
                      <ul className="space-y-1">
                        {evaluation.alternative_approaches.map((approach, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground">• {approach}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Best Practices */}
                  {evaluation.best_practices_violated.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong className="text-sm">Best Practices to Consider:</strong>
                        <ul className="mt-2 space-y-1">
                          {evaluation.best_practices_violated.map((practice, idx) => (
                            <li key={idx} className="text-sm">• {practice}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Helper function to get default code template based on language
function getDefaultTemplate(language: string): string {
  const templates: Record<string, string> = {
    python: `def solution():
    # Write your code here
    pass

# Test your solution
if __name__ == "__main__":
    result = solution()
    print(result)`,
    
    javascript: `function solution() {
    // Write your code here
}

// Test your solution
console.log(solution());`,
    
    java: `public class Solution {
    public static void main(String[] args) {
        // Write your code here
    }
}`,
    
    cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    return 0;
}`,
    
    typescript: `function solution(): any {
    // Write your code here
}

// Test your solution
console.log(solution());`,
  };

  return templates[language.toLowerCase()] || templates.python;
}
