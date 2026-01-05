import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, CheckCircle2, Info, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingOverlayProps {
    open: boolean;
    onComplete: () => void;
}

export const OnboardingOverlay = ({ open, onComplete }: OnboardingOverlayProps) => {
    const [currentStep, setCurrentStep] = useState(0);

    const steps = [
        {
            title: "Welcome to Stratax AI! 🎉",
            description: "Your AI-powered interview preparation platform",
            content: (
                <div className="space-y-6">
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                            Capabilities
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3 group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:scale-125 transition-transform" />
                                <span className="text-zinc-300 text-sm leading-relaxed"><strong>AI Assistant:</strong> Get comprehensive answers to interview questions</span>
                            </li>
                            <li className="flex items-start gap-3 group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:scale-125 transition-transform" />
                                <span className="text-zinc-300 text-sm leading-relaxed"><strong>Interview Intelligence:</strong> Access real questions from top companies</span>
                            </li>
                            <li className="flex items-start gap-3 group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:scale-125 transition-transform" />
                                <span className="text-zinc-300 text-sm leading-relaxed"><strong>Real-time Practice:</strong> Sharpen your skills with interactive sessions</span>
                            </li>
                            <li className="flex items-start gap-3 group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:scale-125 transition-transform" />
                                <span className="text-zinc-300 text-sm leading-relaxed"><strong>Mock Interviews:</strong> Practice with realistic interview scenarios</span>
                            </li>
                            <li className="flex items-start gap-3 group">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:scale-125 transition-transform" />
                                <span className="text-zinc-300 text-sm leading-relaxed"><strong>Code Studio:</strong> Execute and debug code in multiple languages</span>
                            </li>
                        </ul>
                    </div>
                </div>
            ),
            icon: CheckCircle2,
            iconColor: "text-green-500"
        },
        {
            title: "API Gateway Required 🔑",
            description: "Connect your provider to begin session",
            content: (
                <div className="space-y-6">
                    <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 space-y-3">
                        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                            <Key className="w-4 h-4" />
                            Bring Your Own Key
                        </div>
                        <p className="text-zinc-400 text-xs leading-relaxed">
                            Stratax AI utilizes your personal <span className="text-white">Gemini</span> or <span className="text-white">Groq</span> key to provide unlimited sessions and maximum privacy.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Next Steps</h3>
                        <ol className="space-y-2">
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-[10px] text-white">1</span>
                                <span>Generate key from Google or Groq</span>
                            </li>
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-[10px] text-white">2</span>
                                <span>Paste in the next setup screen</span>
                            </li>
                            <li className="flex items-center gap-3 text-sm text-zinc-300">
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-[10px] text-white">3</span>
                                <span>Start preparing immediately</span>
                            </li>
                        </ol>
                    </div>
                </div>
            ),
            icon: Key,
            iconColor: "text-blue-500"
        },
        {
            title: "Ready for Launch! 🚀",
            description: "Your environment is now configured",
            content: (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                            <Settings className="w-4 h-4 text-purple-400" />
                            <h4 className="text-xs font-bold text-white">Settings</h4>
                            <p className="text-[10px] text-zinc-500 leading-tight">Change keys anytime in settings.</p>
                        </div>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                            <Info className="w-4 h-4 text-blue-400" />
                            <h4 className="text-xs font-bold text-white">History</h4>
                            <p className="text-[10px] text-zinc-500 leading-tight">Searches are saved automatically.</p>
                        </div>
                    </div>

                    <div className="text-center py-2">
                        <p className="text-white font-medium text-sm">
                            Unlock your high-performance <br /> preparation engine today.
                        </p>
                    </div>
                </div>
            ),
            icon: CheckCircle2,
            iconColor: "text-green-500"
        }
    ];

    const currentStepData = steps[currentStep];
    const isLastStep = currentStep === steps.length - 1;
    const isFirstStep = currentStep === 0;

    const handleNext = () => {
        if (isLastStep) {
            onComplete();
        } else {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (!isFirstStep) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    const handleSkipTour = () => {
        onComplete();
    };

    // Prevent body scroll when overlay is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.height = '100%';
        } else {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
        }

        return () => {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
        };
    }, [open]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[100] bg-zinc-950 flex items-start justify-center md:items-center overflow-hidden"
            >
                <motion.div
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="relative w-full md:max-w-lg h-full md:h-auto md:max-h-[90vh] bg-zinc-950 md:border md:border-white/10 md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Top Aesthetic Bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />

                    {/* Close Trigger */}
                    <div className="absolute top-6 right-6 z-20">
                        <button
                            onClick={handleSkipTour}
                            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 border border-white/5 transition-colors"
                        >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5">
                                <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                            </svg>
                        </button>
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        {/* Header Section */}
                        <div className="px-6 pt-10 pb-6 md:p-10 text-center space-y-4">
                            <div className="flex justify-center">
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 px-3 py-1 text-[10px] uppercase tracking-widest font-bold">
                                    Step {currentStep + 1} of {steps.length}
                                </Badge>
                            </div>
                            <div className="flex flex-col items-center space-y-3">
                                <div className="space-y-2">
                                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-tight">{currentStepData.title}</h2>
                                    <p className="text-zinc-400 text-sm md:text-base max-w-[280px] md:max-w-md mx-auto leading-relaxed">
                                        {currentStepData.description}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Content Section */}
                        <div className="px-6 pb-6 md:px-10 md:pb-8">
                            <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-5 md:p-8 shadow-inner">
                                {currentStepData.content}
                            </div>
                        </div>
                    </div>

                    {/* Footer Section - Fixed at bottom */}
                    <div className="flex-shrink-0 p-6 md:p-10 pt-0 md:pt-0 flex flex-col gap-5 border-t border-white/5 bg-zinc-950">
                        <div className="flex gap-3">
                            {!isFirstStep && (
                                <button
                                    onClick={handleBack}
                                    className="flex-1 h-12 md:h-14 rounded-2xl border border-white/10 text-white font-bold hover:bg-white/5 transition-all active:scale-95"
                                >
                                    Back
                                </button>
                            )}
                            <button
                                onClick={handleNext}
                                className="flex-[2] h-12 md:h-14 rounded-2xl bg-white text-black font-bold text-lg hover:bg-zinc-200 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isLastStep ? "Get Started" : "Next Step"}
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Progress Indicator */}
                        <div className="flex justify-center gap-2">
                            {steps.map((_, index) => (
                                <div
                                    key={index}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${index === currentStep
                                        ? "w-8 bg-white"
                                        : "w-2 bg-white/20"
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
