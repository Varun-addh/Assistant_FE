import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Save, Trash2, ShieldCheck, Zap, Brain, Globe } from "lucide-react";
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
    const [showGuide, setShowGuide] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const { toast } = useToast();

    const demoVideoUrl = useMemo(() => {
        const envUrl = (import.meta as any)?.env?.VITE_BYOK_DEMO_VIDEO_URL as string | undefined;
        return (envUrl && String(envUrl).trim()) || "/byok/byok-demo.mp4";
    }, []);

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
                                <Save className="h-3.5 w-3.5" />
                            </Button>
                            {hasGroqKey && (
                                <Button onClick={handleClearGroq} variant="outline" size="icon" className="h-8 w-8 border-destructive/20 text-destructive hover:bg-destructive/10" title="Remove Groq Key">
                                    <Trash2 className="h-3.5 w-3.5" />
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
                                <Save className="h-3.5 w-3.5" />
                            </Button>
                            {hasGeminiKey && (
                                <Button onClick={handleClearGemini} variant="outline" size="icon" className="h-8 w-8 border-destructive/20 text-destructive hover:bg-destructive/10" title="Remove Gemini Key">
                                    <Trash2 className="h-3.5 w-3.5" />
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

                <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Globe className="w-3.5 h-3.5" />
                        <span>
                            Groq/Gemini keys are typically free to create (free tiers) but may have rate limits/quotas.
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setShowGuide((v) => !v)}
                    >
                        {showGuide ? "Hide guide" : "View guide"}
                    </Button>
                </div>

                {showGuide && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <a
                            href="https://console.groq.com/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-red-500/5 hover:bg-orange-500/10 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-orange-400" />
                                    <p className="text-[11px] font-bold">Get Groq key</p>
                                </div>
                                <span className="text-[10px] font-semibold text-orange-400 underline">Open</span>
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
                                Create a key in Groq Console, then paste it in Interview Engine.
                            </p>
                        </a>

                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:bg-blue-500/10 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Brain className="w-4 h-4 text-blue-400" />
                                    <p className="text-[11px] font-bold">Get Gemini key</p>
                                </div>
                                <span className="text-[10px] font-semibold text-blue-400 underline">Open</span>
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
                                Create a key in Google AI Studio, then paste it in Answer Engine.
                            </p>
                        </a>

                        <div className="md:col-span-2 p-3 rounded-xl border border-border/30 bg-muted/10">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-[11px] font-bold">Quick demo video</p>
                            </div>

                            {!videoError ? (
                                <video
                                    className="w-full rounded-lg border border-white/5 bg-black"
                                    controls
                                    playsInline
                                    preload="metadata"
                                    src={demoVideoUrl}
                                    onError={() => setVideoError(true)}
                                />
                            ) : (
                                <p className="text-[10px] text-muted-foreground leading-snug">
                                    Demo video not found. To enable it, either add the file at
                                    <span className="font-mono"> /public/byok/byok-demo.mp4</span>
                                    , or set <span className="font-mono">VITE_BYOK_DEMO_VIDEO_URL</span> to a hosted mp4/gif URL.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
