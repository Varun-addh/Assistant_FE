import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, CheckCircle2, Info, ArrowRight } from "lucide-react";

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
                <div className="space-y-4">
                    <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            What You Can Do
                        </h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span><strong>AI Assistant:</strong> Get comprehensive answers to interview questions</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span><strong>Interview Intelligence:</strong> Access real questions from top companies</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span><strong>Real-time Practice:</strong> Sharpen your skills with interactive sessions</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span><strong>Mock Interviews:</strong> Practice with realistic interview scenarios</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">•</span>
                                <span><strong>Code Studio:</strong> Execute and debug code in multiple languages</span>
                            </li>
                        </ul>
                    </div>
                </div>
            ),
            icon: CheckCircle2,
            iconColor: "text-green-500"
        },
        {
            title: "Connect Your AI Provider 🔑",
            description: "An API key is required to power your interview preparation",
            content: (
                <div className="space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <Key className="h-5 w-5 text-blue-500" />
                            API Key Required
                        </h3>
                        <div className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                <strong className="text-foreground italic decoration-purple-500 underline decoration-2 underline-offset-4">Important:</strong> Stratax AI requires your own API key to provide personalized, unlimited, and secure AI-powered assistance.
                            </p>
                            <p>
                                We support <strong className="text-foreground">Google Gemini</strong> and <strong className="text-foreground">Groq Cloud</strong>. Both offer generous free tiers for developers.
                            </p>
                            <div className="mt-4 p-4 bg-muted/50 rounded-md border border-border">
                                <p className="font-medium text-foreground mb-2">How to get and add your key:</p>
                                <ol className="space-y-1 text-xs">
                                    <li className="flex items-start gap-2">
                                        <span className="text-purple-500 font-bold">1.</span>
                                        <span>Create a free account at Google AI Studio or Groq Cloud</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-purple-500 font-bold">2.</span>
                                        <span>Generate your API key and copy it</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-purple-500 font-bold">3.</span>
                                        <span>Paste it in the next step - your key is stored <strong>locally only</strong></span>
                                    </li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                        <Info className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        <span>
                            Your API key is never sent to our servers. It stays purely in your browser's local storage for maximum security and privacy.
                        </span>
                    </div>
                </div>
            ),
            icon: Key,
            iconColor: "text-blue-500"
        },
        {
            title: "You're All Set! 🚀",
            description: "Ready to ace your interviews",
            content: (
                <div className="space-y-4">
                    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            Quick Tips
                        </h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Use the <strong>tabs</strong> at the top to switch between different features</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Your <strong>search history</strong> is automatically saved for easy access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Click the <strong>Settings icon</strong> anytime to configure your API key</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Use <strong>Dark Mode</strong> toggle for comfortable viewing</span>
                            </li>
                        </ul>
                    </div>

                    <div className="text-center py-4">
                        <p className="text-lg font-semibold text-foreground mb-2">
                            Ready to start your interview preparation journey?
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Click "Get Started" below to begin!
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

    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border-purple-500/30">
                            Step {currentStep + 1} of {steps.length}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center`}>
                            <currentStepData.icon className={`h-6 w-6 ${currentStepData.iconColor}`} />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl">{currentStepData.title}</DialogTitle>
                            <DialogDescription className="text-base">
                                {currentStepData.description}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="py-4">
                    {currentStepData.content}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-2">
                        {!isFirstStep && (
                            <Button
                                variant="outline"
                                onClick={handleBack}
                                className="flex-1 sm:flex-none"
                            >
                                Back
                            </Button>
                        )}
                    </div>
                    <Button
                        onClick={handleNext}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white flex-1 sm:flex-none"
                    >
                        {isLastStep ? (
                            <>
                                Get Started
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        ) : (
                            <>
                                Next
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </DialogFooter>

                {/* Progress Dots */}
                <div className="flex justify-center gap-2 mt-4">
                    {steps.map((_, index) => (
                        <div
                            key={index}
                            className={`h-2 rounded-full transition-all ${index === currentStep
                                ? "w-8 bg-gradient-to-r from-purple-600 to-blue-600"
                                : "w-2 bg-muted"
                                }`}
                        />
                    ))}
                </div>
            </DialogContent>
        </Dialog >
    );
};
