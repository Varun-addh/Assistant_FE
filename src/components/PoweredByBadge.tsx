import { useEffect, useState } from 'react';
import { Zap, Brain } from 'lucide-react';
import { getActiveAIEngine } from './ApiKeySettings';

export const PoweredByBadge = () => {
    const [engine, setEngine] = useState<'groq' | 'gemini' | 'none'>('none');

    useEffect(() => {
        // Check on mount
        setEngine(getActiveAIEngine());

        // Listen for storage changes (when keys are added/removed)
        const handleStorageChange = () => {
            setEngine(getActiveAIEngine());
        };

        window.addEventListener('storage', handleStorageChange);

        // Also check periodically in case of same-tab changes
        const interval = setInterval(handleStorageChange, 1000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, []);

    if (engine === 'none') return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {engine === 'groq' ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-orange-500/90 to-red-500/90 backdrop-blur-md border border-orange-400/30 shadow-lg shadow-orange-500/20">
                    <Zap className="w-3.5 h-3.5 text-white" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                        Powered by Groq
                    </span>
                    <span className="text-[8px] text-white/80 font-medium px-1.5 py-0.5 rounded-full bg-white/20">
                        Fast
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-blue-500/90 to-purple-500/90 backdrop-blur-md border border-blue-400/30 shadow-lg shadow-blue-500/20">
                    <Brain className="w-3.5 h-3.5 text-white" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                        Powered by Gemini
                    </span>
                    <span className="text-[8px] text-white/80 font-medium px-1.5 py-0.5 rounded-full bg-white/20">
                        Analytical
                    </span>
                </div>
            )}
        </div>
    );
};
