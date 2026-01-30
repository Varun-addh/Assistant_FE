import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { verifyEmailToken } from "@/lib/authApi";
import { useAuth } from "@/context/AuthContext";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();

  const token = useMemo(() => params.get("token") || "", [params]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }

      setStatus("loading");
      const res = await verifyEmailToken(token);
      if (res.ok) {
        setStatus("success");
        setMessage("Your email has been verified successfully.");
      } else {
        setStatus("error");
        setMessage(res.message || "Verification failed. The link may be expired or invalid.");
      }
    };

    void run();
  }, [token]);

  const goLogin = () => navigate("/login?mode=signin");
  const goDashboard = () => navigate("/app");

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl">Verify Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying…
            </div>
          ) : status === "success" ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Success</div>
                <div className="text-sm text-muted-foreground">{message}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Could not verify</div>
                <div className="text-sm text-muted-foreground">{message || "Verification failed."}</div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={goLogin} className="flex-1">
              Go to login
            </Button>
            <Button onClick={goDashboard} className="flex-1" disabled={!user && status !== "success"}>
              Go to dashboard
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            If you reached this page from an email link and it fails, request a new verification email from your profile.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
