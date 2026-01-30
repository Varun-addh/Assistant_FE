import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Login } from '../components/Login';
import { Register } from '../components/Register';
import { Badge } from '../components/ui/badge';
import { Sparkles, Shield, Zap, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode'); // 'signin' or 'signup'
  const [showLogin, setShowLogin] = useState(mode !== 'signup'); // Default to login unless mode=signup

  // World-class futuristic design - no particle animations needed

  const features = [
    { icon: Sparkles, text: 'AI-Powered Intelligence', color: 'text-purple-400' },
    { icon: Shield, text: 'Secure & Private', color: 'text-blue-400' },
    { icon: Zap, text: 'Lightning Fast', color: 'text-yellow-400' },
    { icon: Crown, text: 'Premium Experience', color: 'text-pink-400' }
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-500">
      {/* World-Class Futuristic Background */}
      <div className="fixed inset-0 overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950 transition-colors duration-500" />
        
        {/* Sophisticated floating orbs - Always rendered with opacity transitions */}
        <div className="absolute top-1/4 right-0 sm:right-1/4 w-[300px] h-[300px] sm:w-[550px] sm:h-[550px] bg-gradient-to-br from-purple-500/[0.18] via-pink-400/[0.10] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500 animate-float-slow" />
        <div className="absolute bottom-1/4 left-0 sm:left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-blue-500/[0.18] via-cyan-400/[0.10] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500 animate-float-slower" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-gradient-to-r from-violet-500/[0.08] via-transparent to-blue-500/[0.08] rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-500" />
        
        {/* Light mode elegant orbs */}
        <div className="absolute top-1/4 right-0 sm:right-1/4 w-[300px] h-[300px] sm:w-[550px] sm:h-[550px] bg-gradient-to-br from-purple-400/25 via-pink-300/15 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-500 animate-float-slow" />
        <div className="absolute bottom-1/4 left-0 sm:left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-blue-400/25 via-cyan-300/15 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-500 animate-float-slower" />
        
        {/* Subtle dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] transition-opacity duration-500" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '36px 36px' }} />
        
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-white/70 dark:via-black/30 dark:to-black/50 transition-colors duration-500" />
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
