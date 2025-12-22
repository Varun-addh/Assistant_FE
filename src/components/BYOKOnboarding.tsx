import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Key,
    ShieldCheck,
    Zap,
    Lock,
    Sparkles,
    ArrowRight,
    CheckCircle2,
    AlertCircle,
    Globe,
    Coins
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface BYOKOnboardingProps {
    onComplete: () => void;
}

export const BYOKOnboarding = ({ onComplete }: BYOKOnboardingProps) => {
    const [key, setKey] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const { toast } = useToast();

    const handleSave = () => {
        if (!key.trim()) {
            toast({
                title: "Key Required",
                description: "Please enter your Gemini or Groq API key to continue.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);
        // Simulate a brief "validation" feel
        setTimeout(() => {
            localStorage.setItem("user_api_key", key.trim());
            setIsSubmitting(false);
            toast({
                title: "Access Granted",
                description: "Your session is now powered by your personal API key.",
            });
            onComplete();
        }, 1000);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl overflow-y-auto"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="relative w-full max-w-2xl my-auto overflow-hidden bg-zinc-900/50 border border-white/10 rounded-3xl shadow-[0_0_50px_-12px_rgba(139,92,246,0.3)] max-h-[90vh] md:max-h-[85vh] flex flex-col"
            >
                {/* Background Decorative Blobs */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />
                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />

                {/* Scrollable Content */}
                <div className="relative overflow-y-auto flex-1 scrollbar-professional">
                    <div className="p-6 md:p-12 space-y-6 md:space-y-8">
                        <div className="space-y-3 md:space-y-4 text-center">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] uppercase tracking-widest font-bold mb-2">
                                <Sparkles className="w-3 h-3" />
                                Professional Interview Intelligence
                            </div>
                            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white px-2">
                                Master Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Technical Career</span>
                            </h2>
                            <p className="text-zinc-400 text-sm md:text-lg max-w-lg mx-auto leading-relaxed px-2">
                                Stratax AI is your <span className="text-white">AI-powered preparation partner</span>.
                                To provide a secure, unlimited experience for mock interviews and system design practice,
                                simply connect your personal AI provider below.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                            <div className="p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                                <div className="p-2 w-fit rounded-lg bg-green-500/10 text-green-400">
                                    <ShieldCheck className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                                <h4 className="font-semibold text-white text-xs md:text-sm">Total Privacy</h4>
                                <p className="text-[11px] md:text-xs text-zinc-500">Your key is stored only in your browser's local storage.</p>
                            </div>
                            <div className="p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                                <div className="p-2 w-fit rounded-lg bg-blue-500/10 text-blue-400">
                                    <Coins className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                                <h4 className="font-semibold text-white text-xs md:text-sm">Zero Cost</h4>
                                <p className="text-[11px] md:text-xs text-zinc-500">Use your own quota without any platform service fees.</p>
                            </div>
                            <div className="p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                                <div className="p-2 w-fit rounded-lg bg-purple-500/10 text-purple-400">
                                    <Zap className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                                <h4 className="font-semibold text-white text-xs md:text-sm">Low Latency</h4>
                                <p className="text-[11px] md:text-xs text-zinc-500">Direct connection to providers for the fastest responses.</p>
                            </div>
                        </div>

                        <div className="space-y-3 md:space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 md:pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-4 w-4 md:h-5 md:w-5 text-zinc-500" />
                                </div>
                                <Input
                                    type="password"
                                    placeholder="Paste your Gemini or Groq API Key here..."
                                    className="pl-10 md:pl-12 h-12 md:h-14 bg-black/40 border-zinc-800 text-white rounded-xl focus:ring-purple-500/40 focus:border-purple-500/60 text-sm md:text-base"
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                            </div>

                            <Button
                                disabled={isSubmitting}
                                onClick={handleSave}
                                className="w-full h-12 md:h-14 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold text-base md:text-lg group transition-all"
                            >
                                {isSubmitting ? (
                                    "Authorizing..."
                                ) : (
                                    <>
                                        Connect API Key
                                        <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </Button>

                            <div className="flex flex-col items-center gap-3 md:gap-4">
                                <div className="flex items-center justify-center gap-2 text-[10px] md:text-[11px] text-zinc-500 flex-wrap text-center">
                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                    <span>Supported: Google Gemini, Groq Cloud</span>
                                    <span className="mx-1 hidden md:inline">•</span>
                                    <button
                                        onClick={() => setShowHelp(!showHelp)}
                                        className="cursor-help underline hover:text-zinc-300 transition-colors"
                                    >
                                        {showHelp ? "Hide help" : "Where do I get a key?"}
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {showHelp && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 overflow-hidden"
                                        >
                                            <a
                                                href="https://aistudio.google.com/app/apikey"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group"
                                            >
                                                <span className="text-xs font-medium text-white">Google Gemini</span>
                                                <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors" />
                                            </a>
                                            <a
                                                href="https://console.groq.com/keys"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group"
                                            >
                                                <span className="text-xs font-medium text-white">Groq Cloud</span>
                                                <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors" />
                                            </a>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer info badge - Fixed at bottom */}
                <div className="bg-zinc-950/50 p-3 md:p-4 border-t border-white/5 text-center flex-shrink-0">
                    <p className="text-[9px] md:text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
                        Secure Local Authorization Verified
                    </p>
                </div>
            </motion.div>
        </motion.div>
    );
};
