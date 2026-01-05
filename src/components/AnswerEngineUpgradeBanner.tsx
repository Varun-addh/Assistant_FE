import { Brain, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface UpgradeBannerProps {
    onUpgrade: () => void;
}

export const AnswerEngineUpgradeBanner = ({ onUpgrade }: UpgradeBannerProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-sm"
        >
            <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                    <Brain className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">Answer Truncated</h4>
                        <div className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Upgrade Available</span>
                        </div>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        This answer was cut short due to Interview Engine limitations. Unlock <strong className="text-white">Answer Engine (Gemini)</strong> for complete, untruncated responses on complex topics.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <Sparkles className="w-3 h-3 text-blue-400" />
                            <span>Unlimited length</span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-zinc-700" />
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            <span>Better for code & system design</span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-zinc-700" />
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <Sparkles className="w-3 h-3 text-green-400" />
                            <span>Free forever</span>
                        </div>
                    </div>
                    <Button
                        onClick={onUpgrade}
                        className="mt-3 h-9 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-lg transition-all active:scale-[0.98]"
                    >
                        Unlock Answer Engine
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                </div>
            </div>
        </motion.div>
    );
};
