// Resume-Based Interviewing — Shared Types

export interface ResumeProject {
  name: string;
  tech: string[];
  claims: string[];
}

export interface ResumeContext {
  skills: string[];
  projects: ResumeProject[];
  experience_summary: string;
  role_titles: string[];
  education: string;
  achievements: string[];
  years_of_experience: number;
  primary_domain: string;
}

export interface ResumeUploadResponse {
  status: "ok";
  resume_context: ResumeContext;
  summary?: {
    skills_count: number;
    projects_count: number;
    achievements_count: number;
    years_of_experience: number;
    primary_domain: string;
  };
  message: string;
}
