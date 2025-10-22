import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, StepForward, RotateCcw, Code, Brain, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiAnalyzeCode, apiStepByStepAnalysis } from '@/lib/api';

interface CodeAnalysisOverlayProps {
  code: string;
  language: string;
  problem: string;
  onClose: () => void;
}

interface ExecutionStep {
  line: number;
  action: string;
  variables: Record<string, any>;
  memory: {
    stack: Array<{name: string, value: any, type: string}>;
    heap: Array<{address: string, value: any, type: string}>;
  };
  explanation: {
    beginner: string;
    professional: string;
  };
}

interface AnalysisResult {
  executionFlow: ExecutionStep[];
  executionFlowDiagram: string;
}

export const CodeAnalysisOverlay: React.FC<CodeAnalysisOverlayProps> = ({
  code,
  language,
  problem,
  onClose
}) => {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState('execution');
  const [stepByStepData, setStepByStepData] = useState<Record<number, { line_explanation: string; visual_flow: string }>>({});
  const [totalSteps, setTotalSteps] = useState<number>(0);
  const { toast } = useToast();
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const stepsScrollRef = useRef<HTMLDivElement | null>(null);
  const stepItemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const explanationScrollRef = useRef<HTMLDivElement | null>(null);

  const stopScrollPropagation = (e: React.UIEvent | React.WheelEvent | React.TouchEvent) => {
    // Prevent wheel/touch scroll from bubbling to document (which scrolls background)
    e.stopPropagation();
  };

  // Console logging for server responses
  const logServerResponse = (endpoint: string, data: any) => {
    console.group(`🚀 ${endpoint} Response`);
    console.log('📊 Full Response:', data);
    console.log('⏱️ Timestamp:', new Date().toISOString());
    console.log('🔍 Response Type:', typeof data);
    console.log('📏 Response Size:', JSON.stringify(data).length, 'characters');
    if (data.executionFlow) {
      console.log('📈 Execution Steps:', data.executionFlow.length);
    }
    if (data.variableTimeline) {
      console.log('🔢 Variables Tracked:', Object.keys(data.variableTimeline).length);
    }
    if (data.complexity) {
      console.log('⚡ Complexity:', data.complexity);
    }
    console.groupEnd();
  };

  const analyzeCode = async () => {
    setLoading(true);
    try {
      console.log('🔬 Starting Code Analysis...');
      console.log('📝 Code:', code);
      console.log('🌐 Language:', language);
      console.log('🎯 Problem:', problem);

      const result = await apiAnalyzeCode({
        code,
        language,
        include_diagrams: true,
        include_memory_analysis: true,
        include_complexity_analysis: true,
        problem
      });
      
      logServerResponse('Code Analysis', result);
      
      // Map backend response to frontend expected format
      const mappedResult: AnalysisResult = {
        executionFlow: result.execution_steps?.map((step: any) => ({
          line: step.line_number,
          action: step.description,
          variables: step.variables || {},
          memory: {
            stack: step.memory?.stack || [],
            heap: step.memory?.heap || []
          },
          explanation: {
            beginner: step.beginner_explanation || step.description,
            professional: step.professional_explanation || step.description
          }
        })) || [],
        executionFlowDiagram: result.execution_flow || ''
      };
      
      setAnalysis(mappedResult);
      setCurrentStep(0);
      
      // Load all per-step details in a single call for snappy UX
      try {
        const stepwise = await apiStepByStepAnalysis({ code, language });
        setTotalSteps(stepwise.total_steps || stepwise.step_by_step_analysis?.length || 0);
        const map: Record<number, { line_explanation: string; visual_flow: string }> = {};
        (stepwise.step_by_step_analysis || []).forEach((s) => {
          map[s.step_number - 1] = {
            line_explanation: s.line_explanation,
            visual_flow: s.visual_flow,
          };
        });
        setStepByStepData(map);
      } catch (e) {
        console.warn('Step-by-step bulk fetch failed, will fetch per step on demand.', e);
      }

      toast({
        title: "Analysis Complete!",
        description: `Analyzed ${mappedResult.executionFlow?.length || 0} execution steps`,
      });
    } catch (error) {
      console.error('❌ Analysis Error:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze the code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      if (analysis?.executionFlow) {
        playIntervalRef.current = setInterval(() => {
          setCurrentStep(prev => {
            if (prev >= analysis.executionFlow.length - 1) {
              setIsPlaying(false);
              return prev;
            }
            return prev + 1;
          });
        }, 1500);
        setIsPlaying(true);
      }
    }
  };

  const resetExecution = () => {
    setCurrentStep(0);
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  };

  const fetchStepByStepData = async (stepIndex: number) => {
    if (stepByStepData[stepIndex]) return; // Already fetched
    
    try {
      const bulk = await apiStepByStepAnalysis({ code, language });
      setTotalSteps(bulk.total_steps || bulk.step_by_step_analysis?.length || 0);
      const map: Record<number, { line_explanation: string; visual_flow: string }> = {};
      (bulk.step_by_step_analysis || []).forEach((s) => {
        map[s.step_number - 1] = {
          line_explanation: s.line_explanation,
          visual_flow: s.visual_flow,
        };
      });
      setStepByStepData(map);
    } catch (error) {
      console.error('❌ Step-by-step analysis error:', error);
    }
  };

  useEffect(() => {
    analyzeCode();
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // Prevent background scroll while overlay is open
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // Fetch step-by-step data when step changes
  useEffect(() => {
    if (analysis && currentStep >= 0) {
      fetchStepByStepData(currentStep);
    }
  }, [currentStep, analysis]);
  useEffect(() => {
    const lineNumber = analysis?.executionFlow?.[currentStep]?.line;
    const el = lineNumber ? lineRefs.current[lineNumber] : null;
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {}
    }
    const stepEl = stepItemRefs.current[currentStep];
    if (stepEl) {
      try {
        stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch {}
    }
  }, [currentStep, analysis]);

  const currentExecutionStep = analysis?.executionFlow?.[currentStep];

  return (
    <div
      ref={overlayContainerRef}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden"
      onWheelCapture={stopScrollPropagation}
      onTouchMoveCapture={stopScrollPropagation}
      onScrollCapture={stopScrollPropagation}
      style={{ overscrollBehavior: 'contain' }}
    >
      <div className="bg-background border border-border/20 rounded-xl shadow-lg w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-primary/5 rounded-md">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Code Analysis</h2>
              <p className="text-sm text-muted-foreground">Step-by-step execution tracking</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Main Content */}
        <div
          className="flex-1 overflow-hidden flex flex-col"
          onWheelCapture={stopScrollPropagation}
          onTouchMoveCapture={stopScrollPropagation}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Analyzing Code...</h3>
                <p className="text-muted-foreground">Deep analysis in progress</p>
              </div>
            </div>
          ) : analysis ? (
            <div
              className="flex-1 flex overflow-hidden"
              onWheelCapture={stopScrollPropagation}
              onTouchMoveCapture={stopScrollPropagation}
            >
              {/* Left Panel - Execution Control */}
              <div className="w-80 border-r border-border/50 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border/50">
                  <h3 className="font-medium mb-3 flex items-center gap-2 text-sm">
                    <Play className="h-4 w-4" />
                    Execution Control
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={togglePlayPause}
                      disabled={!analysis.executionFlow}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                      disabled={currentStep === 0}
                    >
                      <StepForward className="h-4 w-4 rotate-180" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep(Math.min(analysis.executionFlow.length - 1, currentStep + 1))}
                      disabled={currentStep >= analysis.executionFlow.length - 1}
                    >
                      <StepForward className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={resetExecution}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Step {currentStep + 1} of {analysis.executionFlow.length}</span>
                      <span>{Math.round(((currentStep + 1) / analysis.executionFlow.length) * 100)}%</span>
                    </div>
                    <Progress value={((currentStep + 1) / analysis.executionFlow.length) * 100} />
                  </div>
                </div>

                {/* Execution Steps List */}
                <div
                  className="flex-1 overflow-y-auto"
                  ref={stepsScrollRef}
                  onWheelCapture={stopScrollPropagation}
                  onTouchMoveCapture={stopScrollPropagation}
                  style={{ overscrollBehavior: 'contain', overflowAnchor: 'none' as any }}
                >
                  <div className="p-4 space-y-2">
                    {analysis.executionFlow.map((step, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          index === currentStep
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-border/80'
                        }`}
                        onClick={() => setCurrentStep(index)}
                        ref={(el) => { stepItemRefs.current[index] = el; }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={index === currentStep ? 'default' : 'secondary'} className="text-xs">
                            {index + 1}
                          </Badge>
                          <span className="text-sm font-medium">Line {step.line}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Panel - Analysis Details */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <TabsList className="grid w-full grid-cols-1 m-3 bg-muted/30">
                    <TabsTrigger value="execution" className="flex items-center gap-2 text-xs">
                      <Code className="h-3.5 w-3.5" />
                      Execution
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex-1 min-h-0 overflow-hidden">
                    <TabsContent value="execution" className="flex-1 min-h-0 m-0 overflow-hidden">
                      <div className="h-full flex overflow-hidden">
                        {/* Left Panel - Code with Line Highlighting */}
                        <div className="w-1/2 border-r border-border/50 flex flex-col overflow-hidden">
                          <div className="p-3 border-b border-border/50 bg-muted/20">
                            <h3 className="font-medium flex items-center gap-2 text-sm">
                              <Code className="h-4 w-4" />
                              Source Code
                            </h3>
                          </div>
                          <div
                            className="flex-1 overflow-y-auto"
                            ref={codeScrollRef}
                            onWheelCapture={stopScrollPropagation}
                            onTouchMoveCapture={stopScrollPropagation}
                            style={{ overscrollBehavior: 'contain', overflowAnchor: 'none' as any }}
                          >
                            <div className="p-3">
                              <div className="bg-[#0b1020] rounded-lg border border-border/20 overflow-hidden">
                                <div className="bg-[#161b22] px-3 py-2 border-b border-border/20">
                                  <span className="text-xs text-muted-foreground font-medium">{language}</span>
                                </div>
                                <div className="p-3">
                                  <pre className="text-sm font-mono leading-relaxed text-[#e6edf3]">
                                    {code.split('\n').map((line, index) => (
                                      <div
                                        key={index}
                                        className={`flex items-start gap-3 py-0.5 px-2 rounded transition-all duration-200 ${
                                          index + 1 === currentExecutionStep?.line
                                            ? 'bg-primary/20 border-l-2 border-primary shadow-sm'
                                            : 'hover:bg-white/5'
                                        }`}
                                        ref={(el) => { lineRefs.current[index + 1] = el; }}
                                      >
                                        <span className="text-muted-foreground text-xs w-6 flex-shrink-0 select-none">
                                          {index + 1}
                                        </span>
                                        <span className="flex-1 whitespace-pre-wrap">{line || ' '}</span>
                                        {index + 1 === currentExecutionStep?.line && (
                                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse mt-1.5"></div>
                                        )}
                                      </div>
                                    ))}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Panel - Step Explanation */}
                        <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">
                          <div className="p-3 border-b border-border/50 bg-muted/20">
                            <h3 className="font-medium flex items-center gap-2 text-sm">
                              <Zap className="h-4 w-4" />
                              Step {currentStep + 1}: Line {currentExecutionStep?.line || 'N/A'}
                            </h3>
                          </div>
                          <div
                            ref={explanationScrollRef}
                            className="flex-1 min-h-0 overflow-y-auto"
                            onWheelCapture={stopScrollPropagation}
                            onTouchMoveCapture={stopScrollPropagation}
                            style={{ overscrollBehavior: 'contain', overflowAnchor: 'none' as any }}
                          >
                            <div className="p-3">
                              {currentExecutionStep ? (
                                <div className="space-y-4">
                                  <div className="bg-gradient-to-r from-primary/5 to-blue-500/5 p-3 rounded-lg border border-primary/20">
                                    <h4 className="font-medium mb-2 text-sm text-primary">Action</h4>
                                    <p className="text-sm text-foreground">
                                      {currentExecutionStep.action}
                                    </p>
                                  </div>
                                  
                                  {stepByStepData[currentStep] ? (
                                    <div className="bg-muted/30 p-3 rounded-lg border">
                                      <h4 className="font-medium mb-2 text-sm">Line Explanation</h4>
                                      <p className="text-sm text-muted-foreground leading-relaxed">
                                        {stepByStepData[currentStep].line_explanation}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="bg-muted/30 p-3 rounded-lg border">
                                      <h4 className="font-medium mb-2 text-sm">Beginner Explanation</h4>
                                      <p className="text-sm text-muted-foreground leading-relaxed">
                                        {currentExecutionStep.explanation.beginner}
                                      </p>
                                    </div>
                                  )}
                                  
                          {stepByStepData[currentStep]?.visual_flow && (
                                    <div className="bg-muted/30 p-3 rounded-lg border">
                                      <h4 className="font-medium mb-2 text-sm">Visual Flow</h4>
                              <div className="text-xs diagram-container">
                                {/* Render backend-provided Mermaid as text; it can be picked by existing Mermaid renderer if any */}
                                <div className="mermaid">{stepByStepData[currentStep].visual_flow}</div>
                              </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-full">
                                  <div className="text-center text-muted-foreground">
                                    <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>Select a step to see the explanation</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Brain className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Analysis Available</h3>
                <p className="text-muted-foreground">Click analyze to start code analysis</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
