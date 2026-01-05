import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Brain,
    Lock,
    Sparkles,
    ArrowRight,
    ShieldCheck,
    ExternalLink,
    X,
    CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface UnlockAnswerEngineProps {
    open: boolean;
    onClose: () => void;
    onUnlock: () => void;
}

export const UnlockAnswerEngine = ({ open, onClose, onUnlock }: UnlockAnswerEngineProps) => {
    const [geminiKey, setGeminiKey] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const { toast } = useToast();

    const handleUnlock = () => {
        if (!geminiKey.trim()) {
            toast({
                title: "Key Required",
                description: "Please enter your Gemini API key to unlock Answer Engine.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);
        setTimeout(() => {
            localStorage.setItem("gemini_api_key", geminiKey.trim());
            setIsSubmitting(false);
            toast({
                title: "🧠 Answer Engine Connected!",
                description: "Advanced Answer Card is now unlocked. Enjoy deep, structured explanations.",
            });
            onUnlock();
            onClose();
        }, 800);
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Gradient Bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500" />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition-colors z-10"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    {/* Header */}
                    <div className="px-8 pt-12 pb-6 text-center border-b border-white/5">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 mb-4">
                            <Brain className="w-8 h-8 text-blue-400" />
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
                            Unlock Advanced Answers
                        </h2>
                        <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
                            Connect your Answer Engine (Gemini) for deep, structured explanations
                        </p>
                    </div>

                    {/* Content */}
                    <div className="px-8 py-6 space-y-6">
                        {/* Benefits */}
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="p-1.5 rounded-lg bg-blue-500/20 mt-0.5">
                                    <Sparkles className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-white mb-1">Comprehensive Explanations</h4>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Get detailed, step-by-step breakdowns of complex topics
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="p-1.5 rounded-lg bg-purple-500/20 mt-0.5">
                                    <CheckCircle2 className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-white mb-1">Structured Learning</h4>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Perfectly formatted answers optimized for understanding
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="p-1.5 rounded-lg bg-green-500/20 mt-0.5">
                                    <ShieldCheck className="w-4 h-4 text-green-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-white mb-1">Free Forever</h4>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Your key, your control. No hidden costs or quotas
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Input */}
                        <div className="space-y-3">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-4 w-4 text-zinc-500" />
                                </div>
                                <Input
                                    type="password"
                                    placeholder="AIza..."
                                    className="pl-11 h-12 bg-black/40 border-zinc-800 text-white rounded-xl focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                                    maxLength={512}
                                />
                            </div>

                            <div className="flex items-center justify-center">
                                <button
                                    onClick={() => setShowHelp(!showHelp)}
                                    className="text-xs text-zinc-400 hover:text-white underline transition-colors"
                                >
                                    {showHelp ? "Hide guide" : "How to get a Gemini key?"}
                                </button>
                            </div>

                            <AnimatePresence>
                                {showHelp && (
                                    <motion.a
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-colors group overflow-hidden"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Brain className="w-4 h-4 text-blue-400" />
                                            <span className="text-sm font-semibold text-white">Get Free Gemini API Key</span>
                                        </div>
                                        <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                                    </motion.a>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 pb-8 pt-2 space-y-3">
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                className="flex-1 h-12 rounded-xl border-white/10 hover:bg-white/5"
                            >
                                Maybe Later
                            </Button>
                            <Button
                                disabled={isSubmitting}
                                onClick={handleUnlock}
                                className="flex-[2] h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-[0.98]"
                            >
                                {isSubmitting ? "Connecting..." : (
                                    <>
                                        Unlock Now
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-center text-[10px] text-zinc-600 uppercase tracking-widest font-black flex items-center justify-center gap-2">
                            <ShieldCheck className="w-3 h-3" />
                            Stored locally • Never transmitted
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
