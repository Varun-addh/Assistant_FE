import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { resetPasswordWithToken } from "@/lib/authApi";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const token = useMemo(() => params.get("token") || "", [params]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing reset token.");
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetPasswordWithToken({ token, new_password: newPassword });
      if (!res.ok) {
        setError(res.message || "Failed to reset password.");
        return;
      }

      toast({
        title: "Password reset successful",
        description: "You can now sign in with your new password.",
      });
      navigate("/login?mode=signin");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(var(--app-height)-4rem)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl">Reset Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 bg-transparent border-white/10"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 bg-transparent border-white/10"
                disabled={submitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </span>
              ) : (
                "Set new password"
              )}
            </Button>

            <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/login?mode=signin")}>
              Back to login
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            If this link is expired, request a new password reset from the login screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
