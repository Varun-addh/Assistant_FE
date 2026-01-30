import { useEffect, useState } from "react";

export const useTheme = () => {
  // Dark-only product: we keep the hook API for compatibility,
  // but it always resolves to "dark".
  const [theme] = useState<"dark">("dark");

  useEffect(() => {
    // Force dark at the document level and prevent persisted light mode.
    document.documentElement.classList.add("dark");
    try {
      if (localStorage.getItem("theme") !== "dark") {
        localStorage.setItem("theme", "dark");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleTheme = () => {
    // no-op (dark-only)
  };

  return { theme, toggleTheme };
};