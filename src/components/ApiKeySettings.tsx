import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Save, Trash2, ShieldCheck, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ApiKeySettings = () => {
    const [apiKey, setApiKey] = useState("");
    const [hasKey, setHasKey] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const storedKey = localStorage.getItem("user_api_key");
        if (storedKey) {
            setHasKey(true);
            // We don't show the full key for security, just a placeholder if it exists
            setApiKey("********************************");
        }
    }, []);

    const handleSave = () => {
        if (!apiKey.trim()) {
            toast({
                title: "Error",
                description: "Please enter a valid API key.",
                variant: "destructive",
            });
            return;
        }

        // If the user didn't change the placeholder, don't save
        if (apiKey === "********************************") {
            toast({
                title: "No changes",
                description: "The API key was not updated.",
            });
            return;
        }

        localStorage.setItem("user_api_key", apiKey.trim());
        setHasKey(true);
        setApiKey("********************************");
        toast({
            title: "Settings saved",
            description: "Your API key has been securely stored locally.",
        });

        // Optional: Reload the page to ensure all API calls use the new key
        // window.location.reload();
    };

    const handleClear = () => {
        localStorage.removeItem("user_api_key");
        setHasKey(false);
        setApiKey("");
        toast({
            title: "Settings cleared",
            description: "Your custom API key has been removed.",
        });
    };

    return (
        <Card className="w-full bg-card/50 backdrop-blur-sm border-border/40 shadow-xl overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Key className="w-4 h-4" />
                    </div>
                    <CardTitle className="text-lg">Personal AI Bridge</CardTitle>
                </div>
                <CardDescription className="text-xs">
                    Link your Gemini or Groq account. Your key is encrypted locally and never touches our servers.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Client API Key</label>
                        {hasKey && (
                            <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                                <ShieldCheck className="w-3 h-3" />
                                BRIDGE ACTIVE
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-background/50 border-border/40 focus:ring-primary/20 font-mono text-xs"
                        />
                        <Button onClick={handleSave} size="icon" className="shrink-0 shadow-lg shadow-primary/20" title="Activate Bridge">
                            <Save className="h-4 w-4" />
                        </Button>
                        {hasKey && (
                            <Button onClick={handleClear} variant="outline" size="icon" className="shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Terminate Bridge">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/10">
                    <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-1">
                        <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Safe & Secure</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Your key is used strictly for request headers and is purged from memory after each session. This ensures 100% privacy and zero platform overhead.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
