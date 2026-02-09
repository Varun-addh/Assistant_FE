import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

type PwaInstallContextValue = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  canPrompt: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  installHelpText: string;
  promptInstall: () => Promise<PromptOutcome>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectIOS(): boolean {
  const ua = window.navigator.userAgent || '';
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
  return isAppleMobile;
}

function detectStandalone(): boolean {
  // display-mode works for most modern browsers; navigator.standalone is iOS Safari.
  const standaloneByMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  const standaloneByIOS = (window.navigator as any).standalone === true;
  return standaloneByMedia || standaloneByIOS;
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    try {
      return detectStandalone();
    } catch {
      return false;
    }
  });

  const isIOS = useMemo(() => {
    try {
      return detectIOS();
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // Chrome/Edge fires this only when the app is installable.
      // Prevent the mini-infobar so we can show a custom UI.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // Also re-check standalone when visibility changes (some browsers update display-mode after install)
    const onVisibility = () => {
      try {
        setIsStandalone(detectStandalone());
      } catch {
        // ignore
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const installHelpText = useMemo(() => {
    if (isStandalone) return 'Already installed.';
    if (isIOS) return 'On iPhone/iPad: Share → Add to Home Screen.';
    return 'If Install isn\'t shown, open the browser menu → Install app / Add to Home screen.';
  }, [isIOS, isStandalone]);

  const promptInstall = async (): Promise<PromptOutcome> => {
    const prompt = deferredPrompt;
    if (!prompt) return 'unavailable';

    // The prompt can only be used once.
    setDeferredPrompt(null);

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted' || choice?.outcome === 'dismissed') return choice.outcome;
      return 'dismissed';
    } catch {
      return 'dismissed';
    }
  };

  const value: PwaInstallContextValue = {
    deferredPrompt,
    canPrompt: Boolean(deferredPrompt) && !isStandalone,
    isStandalone,
    isIOS,
    installHelpText,
    promptInstall,
  };

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error('usePwaInstall must be used within <PwaInstallProvider />');
  }
  return ctx;
}
