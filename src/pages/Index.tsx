import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  MessageSquare,
  Brain,
  Video,
  Code2,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronRight,
  Network
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isDevelopmentMode } from "@/lib/devUtils";
import { UserProfile } from "@/components/UserProfile";
import { useAuth } from "@/context/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [selectedFeature, setSelectedFeature] = useState<typeof features[0] | null>(null);
  const [showFeatureModal, setShowFeatureModal] = useState(false);

  // In dev mode, bypass and go straight to app
  useEffect(() => {
    if (isDevelopmentMode()) {
      console.log('🔧 [Dev Mode] Bypassing landing page and redirecting to app');
      navigate("/app");
      return;
    }
  }, [navigate]);

  // World-class futuristic design - no particle animations needed

  const features = [
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description: "Get comprehensive, interview-ready answers to both technical and behavioral questions. Our AI provides structured responses following industry best practices like the STAR method, with detailed explanations and practical examples tailored to your interview preparation needs.",
      gradient: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-400",
      accentColor: "bg-blue-500/15"
    },
    {
      icon: Sparkles,
      title: "Mirror Mode (Feedback)",
      description: "Turn a rough draft into an interview-ready response. Enter the question, paste your draft answer, and get structured critique (clarity, structure, missing points) plus an improved rewrite you can confidently deliver.",
      gradient: "from-pink-500/20 to-purple-500/20",
      iconColor: "text-pink-400",
      accentColor: "bg-pink-500/15"
    },
    {
      icon: Brain,
      title: "Interview Intelligence",
      description: "Access a curated database of real interview questions from top tech companies. Browse questions by topic, company, or difficulty level. Get verified answers and insights to prepare strategically for your target companies and roles.",
      gradient: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-400",
      accentColor: "bg-purple-500/15"
    },
    {
      icon: Zap,
      title: "Real-time Practice",
      description: "Sharpen your skills with our interactive practice mode. Engage in live, session-based practice where you can test your knowledge, receive immediate corrections, and refine your technique in a high-performance environment designed for rapid improvement.",
      gradient: "from-indigo-500/20 to-blue-500/20",
      iconColor: "text-indigo-400",
      accentColor: "bg-indigo-500/15"
    },
    {
      icon: Video,
      title: "Mock Interviews",
      description: "Practice with realistic mock interview sessions that simulate real interview scenarios. Receive instant feedback on your responses, track your progress over time, and identify areas for improvement with detailed performance analytics.",
      gradient: "from-green-500/20 to-emerald-500/20",
      iconColor: "text-green-400",
      accentColor: "bg-green-500/15"
    },
    {
      icon: Code2,
      title: "Advanced Code Studio",
      description: "Go beyond simple code execution with our intelligent code environment. Execute code in multiple languages, visualize execution flow with interactive diagrams, debug with step-by-step analysis, and get AI-powered explanations of how your code works. Perfect for understanding complex algorithms and debugging interview coding challenges.",
      gradient: "from-orange-500/20 to-red-500/20",
      iconColor: "text-orange-400",
      accentColor: "bg-orange-500/15"
    },
    {
      icon: Network,
      title: "System Architecture AI",
      description: "Generate complete multi-view architecture diagrams for any system description. Get junior-to-architect level diagrams with both single and multi-view perspectives, detailed explanations, and key insights automatically. Perfect for system design interviews and visualizing complex software architectures.",
      gradient: "from-cyan-500/20 to-blue-500/20",
      iconColor: "text-cyan-400",
      accentColor: "bg-cyan-500/15"
    }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground transition-colors duration-500">
      {/* Fixed Header with User Profile */}
      <div className="fixed top-0 right-0 z-50 p-4 flex items-center gap-3">
        {loading ? null : user ? <UserProfile /> : null}
      </div>

      {/* World-Class Futuristic Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 transition-colors duration-500" />
        
        {/* Sophisticated floating orbs - Dark mode - Always rendered with opacity */}
        <div className="absolute top-10 right-0 sm:top-20 sm:right-1/4 w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-gradient-to-br from-blue-500/[0.15] via-cyan-400/[0.08] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500 animate-float-slow" />
        <div className="absolute bottom-10 left-0 sm:bottom-20 sm:left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-violet-500/[0.15] via-purple-400/[0.08] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500 animate-float-slower" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[700px] sm:h-[700px] bg-gradient-to-r from-indigo-500/[0.06] via-transparent to-pink-500/[0.06] rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500" />
        
        {/* Light mode elegant orbs - Always rendered */}
        <div className="absolute top-10 right-0 sm:top-20 sm:right-1/4 w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-gradient-to-br from-blue-400/20 via-cyan-300/10 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-500 animate-float-slow" />
        <div className="absolute bottom-10 left-0 sm:bottom-20 sm:left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-violet-400/20 via-purple-300/10 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-500 animate-float-slower" />
        
        {/* Subtle dot matrix pattern */}
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.025] transition-opacity duration-500" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-white/60 dark:via-black/20 dark:to-black/40 transition-colors duration-500" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <div className="relative min-h-screen flex items-center">
          <div className="container mx-auto px-6 pt-24 pb-16">
            <div className="max-w-5xl mx-auto text-center space-y-8">
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border-purple-500/30 dark:border-purple-500/50 backdrop-blur-sm px-4 py-1">
                <Network className="w-3 h-3 mr-2" />
                Powered by Advanced AI
              </Badge>

              <h1 className="text-6xl md:text-8xl font-black leading-tight">
                <span className="bg-gradient-to-r from-foreground via-purple-600 to-blue-600 dark:from-white dark:via-purple-200 dark:to-blue-200 bg-clip-text text-transparent">
                  Master Your
                </span>
                <br />
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 bg-clip-text text-transparent animate-gradient">
                  Dream Interview
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                AI-powered interview preparation platform designed for the next generation of tech professionals
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
                <Button
                  size="lg"
                  onClick={() => {
                    if (loading) return;
                    navigate("/app");
                  }}
                  disabled={loading}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-xl shadow-purple-500/20 dark:shadow-purple-500/50 px-8 py-6 text-lg group border-none"
                >
                  {loading ? "Loading…" : "Get Started Free"}
                  <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/run")}
                  className="border-input hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:hover:bg-white/10 dark:text-white backdrop-blur-sm px-8 py-6 text-lg"
                >
                  <Code2 className="w-5 h-5 mr-2" />
                  Code Studio
                </Button>
              </div>
            </div>
          </div>

          {/* Scroll Hint */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 md:bottom-6 flex justify-center">
            <div className="text-muted-foreground/70">
              <ChevronDown className="h-6 w-6 animate-float" />
            </div>
          </div>
        </div>

        {/* Features Bento Grid */}
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Everything You Need
              </h2>
              <p className="text-muted-foreground text-lg">
                Comprehensive tools for interview excellence
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card
                  key={index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedFeature(feature);
                    setShowFeatureModal(true);
                  }}
                  className={`group relative overflow-hidden bg-gradient-to-br ${feature.gradient} border-border/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-500 cursor-pointer hover:scale-[1.02] shadow-sm hover:shadow-xl dark:border-white/10 dark:hover:border-white/30`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 dark:to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="relative p-8 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-14 h-14 rounded-2xl bg-white/50 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                        <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed text-sm dark:text-gray-300">
                        {feature.description}
                      </p>
                    </div>

                    <div className="flex items-center text-primary group-hover:translate-x-2 transition-transform pt-2">
                      <span className="text-sm font-medium">Explore</span>
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border/10 backdrop-blur-xl bg-background/50">
          <div className="container mx-auto px-6 py-8 text-center">
            <p className="text-muted-foreground">
              © 2025 Stratax AI. Elevating careers with AI-powered intelligence.
            </p>
          </div>
        </footer>
      </div>

      {/* Feature Info Modal */}
      <Dialog open={showFeatureModal} onOpenChange={setShowFeatureModal}>
        <DialogContent className="inset-x-2 sm:inset-x-4 max-w-[96vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 md:gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl md:text-2xl font-bold">{selectedFeature?.title}</DialogTitle>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Comprehensive feature overview and capabilities</p>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="text-sm md:text-base leading-relaxed space-y-4 md:space-y-6">
            <p className="text-foreground">{selectedFeature?.description}</p>
            
            <div className="pt-3 md:pt-4 border-t">
              <h4 className="font-semibold mb-3 md:mb-4 text-base md:text-lg text-foreground">Key Features & Benefits:</h4>
              <ul className="space-y-2 md:space-y-3">
                {selectedFeature?.title === "AI Assistant" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-blue-500 font-semibold">STAR Method Answers:</strong> Get perfectly structured responses following the Situation, Task, Action, Result framework that interviewers expect</li>
                    <li className="text-sm md:text-base"><strong className="text-blue-500 font-semibold">Personalized Responses:</strong> Tailored answers based on your role, experience level, and target company culture</li>
                    <li className="text-sm md:text-base"><strong className="text-blue-500 font-semibold">Comprehensive Coverage:</strong> Handles both technical questions and behavioral scenarios with equal expertise</li>
                    <li className="text-sm md:text-base"><strong className="text-blue-500 font-semibold">Real-Time Support:</strong> Get instant answers during preparation or even during live interviews with discreet overlay mode</li>
                    <li className="text-sm md:text-base"><strong className="text-blue-500 font-semibold">Context-Aware:</strong> Remembers your conversation history to provide consistent, coherent answers throughout your session</li>
                  </>
                )}
                {selectedFeature?.title === "Mirror Mode (Feedback)" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-pink-500 font-semibold">Draft → Polished:</strong> Paste your draft answer and get a stronger, interview-ready rewrite</li>
                    <li className="text-sm md:text-base"><strong className="text-pink-500 font-semibold">Structured Critique:</strong> Clear feedback on clarity, structure, relevance, and missing points</li>
                    <li className="text-sm md:text-base"><strong className="text-pink-500 font-semibold">Better Storytelling:</strong> Improves flow and adds crisp, high-signal phrasing interviewers expect</li>
                    <li className="text-sm md:text-base"><strong className="text-pink-500 font-semibold">Behavioral + Technical:</strong> Works for STAR answers, explanations, and problem-solving narratives</li>
                    <li className="text-sm md:text-base"><strong className="text-pink-500 font-semibold">Actionable Next Steps:</strong> Practical suggestions you can apply immediately in your next attempt</li>
                  </>
                )}
                {selectedFeature?.title === "Interview Intelligence" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-purple-500 font-semibold">Verified Question Bank:</strong> Access thousands of real interview questions from FAANG and top tech companies, verified by actual candidates</li>
                    <li className="text-sm md:text-base"><strong className="text-purple-500 font-semibold">Smart Filtering:</strong> Search and filter by company, role, topic, difficulty level, and question type to focus your preparation</li>
                    <li className="text-sm md:text-base"><strong className="text-purple-500 font-semibold">Detailed Solutions:</strong> Each question comes with comprehensive answers, multiple approaches, and interviewer insights</li>
                    <li className="text-sm md:text-base"><strong className="text-purple-500 font-semibold">Frequency Tracking:</strong> See which questions are asked most frequently at your target companies</li>
                    <li className="text-sm md:text-base"><strong className="text-purple-500 font-semibold">Pattern Recognition:</strong> Learn common question patterns and themes to prepare more effectively</li>
                  </>
                )}
                {selectedFeature?.title === "Real-time Practice" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-indigo-500 font-semibold">Live Practice Sessions:</strong> Engage in real-time practice with immediate feedback on your responses</li>
                    <li className="text-sm md:text-base"><strong className="text-indigo-500 font-semibold">Instant Corrections:</strong> Get immediate suggestions for improving your answers while you practice</li>
                    <li className="text-sm md:text-base"><strong className="text-indigo-500 font-semibold">Adaptive Difficulty:</strong> Questions automatically adjust to your skill level for optimal learning</li>
                    <li className="text-sm md:text-base"><strong className="text-indigo-500 font-semibold">Time Management:</strong> Practice under realistic time constraints to build your interview pace</li>
                    <li className="text-sm md:text-base"><strong className="text-indigo-500 font-semibold">Performance Metrics:</strong> Track your speed, accuracy, and improvement over time with detailed analytics</li>
                  </>
                )}
                {selectedFeature?.title === "Mock Interviews" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-green-500 font-semibold">Realistic Simulations:</strong> Practice with AI-powered mock interviews that feel like the real thing</li>
                    <li className="text-sm md:text-base"><strong className="text-green-500 font-semibold">Company-Specific Prep:</strong> Simulate interviews for specific companies with their unique question styles and culture</li>
                    <li className="text-sm md:text-base"><strong className="text-green-500 font-semibold">Multi-Round Practice:</strong> Experience full interview loops including phone screens, technical rounds, and behavioral interviews</li>
                    <li className="text-sm md:text-base"><strong className="text-green-500 font-semibold">Detailed Feedback:</strong> Receive comprehensive performance reports with strengths, weaknesses, and improvement suggestions</li>
                    <li className="text-sm md:text-base"><strong className="text-green-500 font-semibold">Progress Tracking:</strong> Monitor your improvement across multiple mock sessions with visual analytics</li>
                  </>
                )}
                {selectedFeature?.title === "Advanced Code Studio" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-orange-500 font-semibold">Multi-Language Support:</strong> Write and execute code in Python, JavaScript, Java, C++, and more with full syntax highlighting</li>
                    <li className="text-sm md:text-base"><strong className="text-orange-500 font-semibold">Visual Execution Flow:</strong> See your code come to life with interactive diagrams showing memory, stack, and execution steps</li>
                    <li className="text-sm md:text-base"><strong className="text-orange-500 font-semibold">Step-by-Step Debugging:</strong> Debug complex algorithms with variable tracking, breakpoints, and execution visualization</li>
                    <li className="text-sm md:text-base"><strong className="text-orange-500 font-semibold">AI Code Analysis:</strong> Get instant explanations of how your code works, time/space complexity analysis, and optimization suggestions</li>
                    <li className="text-sm md:text-base"><strong className="text-orange-500 font-semibold">Interview Timer:</strong> Practice with realistic time constraints and track your coding speed</li>
                  </>
                )}
                {selectedFeature?.title === "System Architecture AI" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-cyan-500 font-semibold">Multi-View Diagrams:</strong> Generate architecture diagrams from junior, mid-level, and senior architect perspectives automatically</li>
                    <li className="text-sm md:text-base"><strong className="text-cyan-500 font-semibold">Single & Split Views:</strong> View complete systems or focus on specific components with both unified and decomposed architecture views</li>
                    <li className="text-sm md:text-base"><strong className="text-cyan-500 font-semibold">Intelligent Insights:</strong> Get automatic explanations of design decisions, trade-offs, and scalability considerations</li>
                    <li className="text-sm md:text-base"><strong className="text-cyan-500 font-semibold">Industry Patterns:</strong> Learn recognized architecture patterns and best practices applied to your system design</li>
                    <li className="text-sm md:text-base"><strong className="text-cyan-500 font-semibold">Interactive Editing:</strong> Modify and refine diagrams in real-time with live Mermaid diagram support</li>
                  </>
                )}
              </ul>
            </div>
          </DialogDescription>
          <DialogFooter>
            <Button 
              onClick={() => setShowFeatureModal(false)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white w-full"
            >
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }

        .animate-float {
          animation: float 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Index;
