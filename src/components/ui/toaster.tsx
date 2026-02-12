import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

const variantIcons = {
  destructive: <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />,
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />,
  default: <Info className="h-5 w-5 shrink-0 text-blue-400" />,
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={6000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon = variantIcons[variant ?? "default"];
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex gap-3 items-start w-full">
              <div className="mt-0.5">{icon}</div>
              <div className="grid gap-1 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
