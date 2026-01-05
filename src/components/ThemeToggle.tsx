import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export const ThemeToggle = ({ className = "", iconClassName = "h-5 w-5" }: { className?: string, iconClassName?: string }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`transition-all duration-200 hover:bg-secondary-hover ${className}`}
    >
      {theme === "dark" ? (
        <Sun className={`${iconClassName} text-foreground`} />
      ) : (
        <Moon className={`${iconClassName} text-foreground`} />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
};