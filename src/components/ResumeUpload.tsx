import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
  Briefcase,
  Code2,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResumeContext, ResumeUploadResponse } from "../types/resume";

interface ResumeUploadProps {
  /** Which mode this upload is for */
  mode: "practice" | "mock-interview";
  /** Called with parsed resume context after successful upload */
  onParsed: (context: ResumeContext) => void;
  /** Called when resume is cleared */
  onClear?: () => void;
  /** Existing resume context (for showing "already uploaded" state) */
  existing?: ResumeContext | null;
}

const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const MAX_SIZE_MB = 5;
const RESUME_STORAGE_KEY = "stratax_resume_context";

export default function ResumeUpload({
  mode,
  onParsed,
  onClear,
  existing,
}: ResumeUploadProps) {
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >(existing ? "success" : "idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ResumeUploadResponse["summary"] | null>(
    null
  );
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file type. Use: ${ALLOWED_EXTENSIONS.join(", ")}`);
        setStatus("error");
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File too large (max ${MAX_SIZE_MB} MB)`);
        setStatus("error");
        return;
      }

      setStatus("uploading");
      setError("");
      setFileName(file.name);

      try {
        // Lazy import to avoid circular deps and keep bundle-split
        const { uploadResumeForPractice } = await import(
          "../lib/practiceModeApi"
        );
        const { uploadResumeForMockInterview } = await import(
          "../lib/mockInterviewApi"
        );

        const uploadFn =
          mode === "practice"
            ? uploadResumeForPractice
            : uploadResumeForMockInterview;

        const result = await uploadFn(file);

        setSummary(result.summary ?? null);
        setStatus("success");
        onParsed(result.resume_context);

        // Persist to localStorage so user doesn't re-upload every session
        try {
          localStorage.setItem(
            RESUME_STORAGE_KEY,
            JSON.stringify(result.resume_context)
          );
        } catch {
          // Storage full — ignore
        }
      } catch (err: any) {
        const raw: string = err?.message ?? "";
        // Sanitize backend internals — never show pip/install/stack-trace details
        const isTechnical =
          /pip install|traceback|internal server|modulenotfound|importerror/i.test(raw);
        setError(
          isTechnical
            ? "Resume parsing failed. Try uploading a .txt or .md file instead."
            : raw || "Upload failed. Please try again."
        );
        setStatus("error");
      }
    },
    [mode, onParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleClear = () => {
    setStatus("idle");
    setSummary(null);
    setError("");
    setFileName("");
    onClear?.();
    if (inputRef.current) inputRef.current.value = "";
    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // ── Success state ─────────────────────────────────────────────────
  if (status === "success") {
    const ctx = existing;
    return (
      <div className="relative rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/5 to-emerald-500/5 p-3 sm:p-4 transition-all">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              Resume parsed
            </p>
            {summary ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge
                  variant="outline"
                  className="text-[10px] border-green-500/30 bg-green-500/5"
                >
                  <Code2 className="w-2.5 h-2.5 mr-1" />
                  {summary.skills_count} skills
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] border-green-500/30 bg-green-500/5"
                >
                  <Briefcase className="w-2.5 h-2.5 mr-1" />
                  {summary.projects_count} projects
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] border-green-500/30 bg-green-500/5"
                >
                  <Trophy className="w-2.5 h-2.5 mr-1" />
                  {summary.achievements_count} achievements
                </Badge>
                {summary.primary_domain && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-green-500/30 bg-green-500/5"
                  >
                    {summary.primary_domain}
                  </Badge>
                )}
              </div>
            ) : ctx ? (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {ctx.primary_domain}
                {ctx.skills.length > 0 &&
                  ` · ${ctx.skills.slice(0, 4).join(", ")}${ctx.skills.length > 4 ? "…" : ""}`}
              </p>
            ) : null}
            {fileName && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5" />
                {fileName}
              </p>
            )}
          </div>
          <button
            onClick={handleClear}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Remove resume"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Uploading state ───────────────────────────────────────────────
  if (status === "uploading") {
    return (
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Parsing resume with AI…
            </p>
            {fileName && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {fileName}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Idle / Error state (drop zone) ────────────────────────────────
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        group cursor-pointer rounded-xl border-2 border-dashed p-4 text-center
        transition-all duration-200 hover:border-primary/50 hover:bg-primary/[0.03]
        hover:shadow-sm active:scale-[0.995]
        ${
          status === "error"
            ? "border-red-500/40 bg-red-500/[0.03]"
            : "border-muted-foreground/20"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {status === "error" ? (
        <>
          <AlertCircle className="mx-auto h-7 w-7 text-red-500/80 mb-2" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Click or drop to try again
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-2.5 group-hover:bg-primary/15 transition-colors">
            <Upload className="h-4.5 w-4.5 text-primary/70 group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm font-medium">
            Upload Resume{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            .pdf, .docx, .txt, .md · Max 5 MB
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Enables claim-based probing from your actual experience
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Load persisted resume context from localStorage (if any).
 */
export function loadSavedResumeContext(): ResumeContext | null {
  try {
    const saved = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Basic shape check
    if (parsed && Array.isArray(parsed.skills) && typeof parsed.primary_domain === "string") {
      return parsed as ResumeContext;
    }
  } catch {
    // corrupt data — ignore
  }
  return null;
}
