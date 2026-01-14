import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Login } from '../components/Login';
import { Register } from '../components/Register';
import { ThemeToggle } from '../components/ThemeToggle';
import { Badge } from '../components/ui/badge';
import { Sparkles, Shield, Zap, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode'); // 'signin' or 'signup'
  const [showLogin, setShowLogin] = useState(mode !== 'signup'); // Default to login unless mode=signup
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    for (let i = 0; i < 60; i++) {
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
    { icon: Sparkles, text: 'AI-Powered Intelligence', color: 'text-purple-400' },
    { icon: Shield, text: 'Secure & Private', color: 'text-blue-400' },
    { icon: Zap, text: 'Lightning Fast', color: 'text-yellow-400' },
    { icon: Crown, text: 'Premium Experience', color: 'text-pink-400' }
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-500">
      {/* Animated Background */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 opacity-20 dark:opacity-30"
      />

      {/* Gradient Overlays */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-500/5 via-background to-blue-500/5 dark:from-purple-900/20 dark:via-black dark:to-blue-900/20" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/30 rounded-full blur-[120px] animate-pulse" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      {/* Theme Toggle */}
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen lg:h-screen">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-20 lg:h-screen overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8 py-8"
          >
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border-purple-500/30 dark:border-purple-500/50 backdrop-blur-sm px-4 py-1.5 w-fit">
              <Sparkles className="w-3 h-3 mr-2" />
              Stratax AI Platform
            </Badge>

            <div className="space-y-4">
              <h1 className="text-5xl xl:text-6xl font-black leading-tight">
                <span className="bg-gradient-to-r from-foreground via-purple-600 to-blue-600 dark:from-white dark:via-purple-200 dark:to-blue-200 bg-clip-text text-transparent">
                  Master Your
                </span>
                <br />
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Dream Interview
                </span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                AI-powered interview preparation platform designed for tech professionals
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-white/5 dark:bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                  <span className="text-sm font-medium text-foreground">{feature.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="w-full lg:w-1/2 flex items-start justify-center px-6 py-12 lg:h-screen lg:overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md my-auto"
          >
            {/* Mobile Logo */}
            <div className="lg:hidden mb-8 text-center">
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border-purple-500/30 dark:border-purple-500/50 backdrop-blur-sm px-4 py-1.5">
                <Sparkles className="w-3 h-3 mr-2" />
                Stratax AI Platform
              </Badge>
              <h2 className="mt-4 text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 bg-clip-text text-transparent">
                Welcome Back
              </h2>
            </div>

            <AnimatePresence mode="wait">
              {showLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Login onSwitchToRegister={() => setShowLogin(false)} />
                </motion.div>
              ) : (
                <motion.div
                  key="register"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Register onSwitchToLogin={() => setShowLogin(true)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
