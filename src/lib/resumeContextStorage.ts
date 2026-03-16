import type { ResumeContext } from "../types/resume";

export const RESUME_STORAGE_KEY = "stratax_resume_context";

export function loadSavedResumeContext(): ResumeContext | null {
  try {
    const saved = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);

    if (parsed && Array.isArray(parsed.skills) && typeof parsed.primary_domain === "string") {
      return parsed as ResumeContext;
    }
  } catch {
    // Ignore corrupt or unavailable persisted data.
  }

  return null;
}