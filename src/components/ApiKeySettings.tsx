import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Save, Trash2, ShieldCheck, AlertCircle, Zap, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isDevelopmentMode } from "@/lib/devUtils";

// Utility function to check which AI engine is active
export const getActiveAIEngine = (): 'groq' | 'gemini' | 'none' => {
    // In dev mode, always return groq to show the badge
    if (isDevelopmentMode()) {
        return 'groq';
    }

    const hasGroq = !!localStorage.getItem("user_api_key");
    const hasGemini = !!localStorage.getItem("gemini_api_key");

    if (hasGroq) return 'groq';
    if (hasGemini) return 'gemini';
    return 'none';
};

export const ApiKeySettings = () => {
    const [groqKey, setGroqKey] = useState("");
    const [geminiKey, setGeminiKey] = useState("");
    const [hasGroqKey, setHasGroqKey] = useState(false);
    const [hasGeminiKey, setHasGeminiKey] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const storedGroqKey = localStorage.getItem("user_api_key");
        const storedGeminiKey = localStorage.getItem("gemini_api_key");

        if (storedGroqKey) {
            setHasGroqKey(true);
            setGroqKey("********************************");
        }

        if (storedGeminiKey) {
            setHasGeminiKey(true);
            setGeminiKey("********************************");
        }
    }, []);

    const handleSaveGroq = () => {
        if (!groqKey.trim()) {
            toast({
                title: "Error",
                description: "Please enter a valid Groq API key.",
                variant: "destructive",
            });
            return;
        }

        if (groqKey === "********************************") {
            toast({
                title: "No changes",
                description: "The Interview Engine key was not updated.",
            });
            return;
        }

        localStorage.setItem("user_api_key", groqKey.trim());
        setHasGroqKey(true);
        setGroqKey("********************************");
        toast({
            title: "⚡ Interview Engine Connected",
            description: "Questions, Mock, and Search are now unlocked.",
        });
    };

    const handleSaveGemini = () => {
        if (!geminiKey.trim()) {
            toast({
                title: "Error",
                description: "Please enter a valid Gemini API key.",
                variant: "destructive",
            });
            return;
        }

        if (geminiKey === "********************************") {
            toast({
                title: "No changes",
                description: "The Answer Engine key was not updated.",
            });
            return;
        }

        localStorage.setItem("gemini_api_key", geminiKey.trim());
        setHasGeminiKey(true);
        setGeminiKey("********************************");
        toast({
            title: "🧠 Answer Engine Connected",
            description: "Advanced Answer Card is now unlocked.",
        });
    };

    const handleClearGroq = () => {
        localStorage.removeItem("user_api_key");
        setHasGroqKey(false);
        setGroqKey("");
        toast({
            title: "Interview Engine Disconnected",
            description: "Your Groq API key has been removed.",
        });
    };

    const handleClearGemini = () => {
        localStorage.removeItem("gemini_api_key");
        setHasGeminiKey(false);
        setGeminiKey("");
        toast({
            title: "Answer Engine Disconnected",
            description: "Your Gemini API key has been removed.",
        });
    };

    return (
        <Card className="w-full bg-card border-border/40 shadow-xl overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Key className="w-3.5 h-3.5" />
                    </div>
                    <CardTitle className="text-base">AI Engine Configuration</CardTitle>
                </div>
                <CardDescription className="text-[10px] leading-tight">
                    Both keys are stored locally and never transmitted to our servers.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-1">
                {/* Interview Engine (Groq) */}
                <div className="space-y-2 p-3 rounded-xl bg-gradient-to-br from-orange-500/5 to-red-500/5 border border-orange-500/20">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            <div className="min-w-0">
                                <label className="text-[11px] font-bold text-foreground block">Interview Engine</label>
                                <p className="text-[9px] text-muted-foreground truncate">Groq • Fast & Unlimited</p>
                            </div>
                        </div>
                        {hasGroqKey && (
                            <span className="flex items-center gap-1 text-[9px] text-orange-500 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20 shrink-0">
                                ACTIVE
                            </span>
                        )}
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                        <Input
                            type="password"
                            placeholder="gsk_..."
                            value={groqKey}
                            onChange={(e) => setGroqKey(e.target.value)}
                            className="h-8 bg-background/40 border-border/40 focus:ring-orange-500/20 font-mono text-xs w-full"
                        />
                        <div className="flex gap-1.5 shrink-0">
                            <Button onClick={handleSaveGroq} size="icon" className="h-8 w-8 bg-orange-600 hover:bg-orange-700 shadow-md" title="Save Groq Key">
                                <Save className="h-3.5 h-3.5" />
                            </Button>
                            {hasGroqKey && (
                                <Button onClick={handleClearGroq} variant="outline" size="icon" className="h-8 w-8 border-destructive/20 text-destructive hover:bg-destructive/10" title="Remove Groq Key">
                                    <Trash2 className="h-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Answer Engine (Gemini) */}
                <div className="space-y-2 p-3 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <Brain className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <div className="min-w-0">
                                <label className="text-[11px] font-bold text-foreground block">Answer Engine</label>
                                <p className="text-[9px] text-muted-foreground truncate">Gemini • Advanced Logic</p>
                            </div>
                        </div>
                        {hasGeminiKey && (
                            <span className="flex items-center gap-1 text-[9px] text-blue-500 font-bold bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 shrink-0">
                                ACTIVE
                            </span>
                        )}
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                        <Input
                            type="password"
                            placeholder="AIza..."
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            className="h-8 bg-background/40 border-border/40 focus:ring-blue-500/20 font-mono text-xs w-full"
                        />
                        <div className="flex gap-1.5 shrink-0">
                            <Button onClick={handleSaveGemini} size="icon" className="h-8 w-8 bg-blue-600 hover:bg-blue-700 shadow-md" title="Save Gemini Key">
                                <Save className="h-3.5 h-3.5" />
                            </Button>
                            {hasGeminiKey && (
                                <Button onClick={handleClearGemini} variant="outline" size="icon" className="h-8 w-8 border-destructive/20 text-destructive hover:bg-destructive/10" title="Remove Gemini Key">
                                    <Trash2 className="h-3.5 h-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/20 border border-border/10">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                        <p className="text-[9px] text-primary font-bold uppercase tracking-widest">100% Private & Secure</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            Keys stay in your browser. They never touch our servers and are purged after each session.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
