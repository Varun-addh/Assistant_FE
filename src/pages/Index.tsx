import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Brain,
  Video,
  Code2,
  Sparkles,
  ArrowRight,
  Zap,
  BookOpen,
  ChevronRight,
  Network
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { BYOKOnboarding } from "@/components/BYOKOnboarding";

const Index = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showApiKeyOverlay, setShowApiKeyOverlay] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // Check if user has seen onboarding before
  useEffect(() => {
    const seen = localStorage.getItem("onboarding_completed");
    const hasKey = localStorage.getItem("user_api_key");
    setHasSeenOnboarding(!!seen && !!hasKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
    }> = [];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
      });
    }

    const animate = () => {
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.5)';
        ctx.fill();

        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.2 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const features = [
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description: "Get comprehensive, interview-ready answers to both technical and behavioral questions. Our AI provides structured responses following industry best practices like the STAR method, with detailed explanations and practical examples tailored to your interview preparation needs.",
      gradient: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-400"
    },
    {
      icon: Brain,
      title: "Interview Intelligence",
      description: "Access a curated database of real interview questions from top tech companies. Browse questions by topic, company, or difficulty level. Get verified answers and insights to prepare strategically for your target companies and roles.",
      gradient: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-400"
    },
    {
      icon: Zap,
      title: "Real-time Practice",
      description: "Sharpen your skills with our interactive practice mode. Engage in live, session-based practice where you can test your knowledge, receive immediate corrections, and refine your technique in a high-performance environment designed for rapid improvement.",
      gradient: "from-indigo-500/20 to-blue-500/20",
      iconColor: "text-indigo-400"
    },
    {
      icon: Video,
      title: "Mock Interviews",
      description: "Practice with realistic mock interview sessions that simulate real interview scenarios. Receive instant feedback on your responses, track your progress over time, and identify areas for improvement with detailed performance analytics.",
      gradient: "from-green-500/20 to-emerald-500/20",
      iconColor: "text-green-400"
    },
    {
      icon: Code2,
      title: "Advanced Code Studio",
      description: "Go beyond simple code execution with our intelligent code environment. Execute code in multiple languages, visualize execution flow with interactive diagrams, debug with step-by-step analysis, and get AI-powered explanations of how your code works. Perfect for understanding complex algorithms and debugging interview coding challenges.",
      gradient: "from-orange-500/20 to-red-500/20",
      iconColor: "text-orange-400"
    }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground transition-colors duration-500">
      {/* Animated Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-20 dark:opacity-30"
      />

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-background to-blue-500/5 dark:from-purple-900/20 dark:via-black dark:to-blue-900/20" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/30 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/30 rounded-full blur-[120px] animate-pulse delay-1000" />

      {/* Content */}
      <div className="relative z-10">
        {/* Hero Section */}
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
                  if (hasSeenOnboarding) {
                    navigate("/app");
                  } else {
                    setShowOnboarding(true);
                  }
                }}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-xl shadow-purple-500/20 dark:shadow-purple-500/50 px-8 py-6 text-lg group border-none"
              >
                Start Preparing
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

      {/* Onboarding Overlay */}
      <OnboardingOverlay
        open={showOnboarding}
        onComplete={() => {
          localStorage.setItem("onboarding_completed", "true");
          setShowOnboarding(false);
          setShowApiKeyOverlay(true); // Show API Key setup after the tour
        }}
      />

      {/* API Key Collection Overlay */}
      {showApiKeyOverlay && (
        <BYOKOnboarding
          onComplete={() => {
            setShowApiKeyOverlay(false);
            setHasSeenOnboarding(true);
            navigate("/app");
          }}
        />
      )}

      <style>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
};

export default Index;
