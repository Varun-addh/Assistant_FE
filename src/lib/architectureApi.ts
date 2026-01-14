/**
 * Multi-View Architecture Generation API Integration
 * Complete API client for generating system design architecture diagrams
 * 
 * @see API Documentation for complete reference
 */

import { STRATAX_API_BASE_URL, buildStrataxHeaders, strataxFetch } from "./strataxClient";

const BASE_URL = STRATAX_API_BASE_URL;

// ============================================================================
// TypeScript Types
// ============================================================================

export type UserLevel = 'junior' | 'mid' | 'senior' | 'architect';
export type DiagramStyle = 'modern' | 'minimal' | 'detailed';
export type DiagramTheme = 'default' | 'dark' | 'forest' | 'neutral';
export type ViewType =
    | 'system_overview'
    | 'request_flow'
    | 'async_processing'
    | 'data_model'
    | 'deployment'
    | 'observability'
    | 'security';

export type ComplexityLevel = 'junior' | 'mid' | 'senior';

// ============================================================================
// Request Types
// ============================================================================

export interface GenerateArchitectureRequest {
    system_description: string;              // Required, min 10 chars
    user_level?: UserLevel;                  // Optional, default: 'mid'
    specific_views?: ViewType[];             // Optional - specific views to generate
    style?: DiagramStyle;                    // Optional, default: 'modern'
    include_explanations?: boolean;          // Optional, default: true
    session_id?: string;                     // Optional - for session tracking
}

export interface RecommendViewsRequest {
    system_description: string;              // Required
    user_level?: UserLevel;                  // Optional, default: 'mid'
}

export interface RenderMermaidRequest {
    code: string;                            // Required - Mermaid diagram code
    theme?: DiagramTheme;                    // Optional, default: 'default'
    style?: DiagramStyle;                    // Optional
    addStepNumbers?: boolean | 'auto';       // Optional, default: 'auto'
}

// ============================================================================
// Response Types
// ============================================================================

export interface ArchitectureView {
    view_type: ViewType;
    title: string;
    description: string;
    mermaid_code: string;
    key_insights: string[];
    complexity_level: ComplexityLevel;
    estimated_explanation_time: string;
    audience: string;
    key_question: string;
}

export interface ArchitecturePackage {
    system_name: string;
    description: string;
    views: ArchitectureView[];
    view_order: ViewType[];
    total_views: number;
    generated_at: string;                    // ISO 8601 datetime
    metadata: {
        user_level: UserLevel;
        style: DiagramStyle;
        generation_method: string;
    };
    how_to_use: string;
    interview_tips: string[];
}

export interface ViewMetadata {
    view_type: ViewType;
    title: string;
    description: string;
    complexity_level: ComplexityLevel;
    audience: string;
    key_question: string;
    estimated_time: string;
}

export interface AvailableViewsResponse {
    total_views: number;
    views: ViewMetadata[];
    recommendation: string;
}

export interface ViewRecommendation {
    view_type: ViewType;
    title: string;
    description: string;
    why_recommended: string;
}

export interface RecommendedViewsResponse {
    system_description: string;
    user_level: UserLevel;
    recommended_views: ViewRecommendation[];
    total_recommended: number;
    estimated_total_time: string;
}

export interface ApiError {
    detail: string | Array<{
        loc: string[];
        msg: string;
        type: string;
    }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildHeaders(): HeadersInit {
    return buildStrataxHeaders({ json: true });
}

function handleApiError(error: ApiError): string {
    if (typeof error.detail === 'string') {
        return error.detail;
    }

    if (Array.isArray(error.detail)) {
        return error.detail
            .map(e => `${e.loc.join('.')}: ${e.msg}`)
            .join('; ');
    }

    return 'An unknown error occurred';
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Generate complete multi-view architecture package
 * 
 * @param request - Architecture generation request
 * @returns Complete architecture package with multiple views
 * 
 * @example
 * ```typescript
 * const package = await generateArchitecture({
 *   system_description: "Event management platform with real-time notifications",
 *   user_level: "mid",
 *   style: "modern",
 *   include_explanations: true
 * });
 * 
 * console.log(`Generated ${package.total_views} views`);
 * package.views.forEach(view => {
 *   console.log(`${view.title}: ${view.key_question}`);
 * });
 * ```
 */
export async function generateArchitecture(
    request: GenerateArchitectureRequest
): Promise<ArchitecturePackage> {
    console.log('[ArchitectureAPI] Generating architecture, request:', request);
    console.log('[ArchitectureAPI] URL:', `${BASE_URL}/api/diagrams/generate_architecture`);

    const response = await strataxFetch(`${BASE_URL}/api/diagrams/generate_architecture`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(request),
    });

    console.log('[ArchitectureAPI] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: Failed to generate architecture`
        }));
        console.error('[ArchitectureAPI] Error response:', error);
        throw new Error(handleApiError(error));
    }

    const data = await response.json();
    console.log('[ArchitectureAPI] Response data:', {
        system_name: data.system_name,
        total_views: data.total_views,
        view_types: data.views?.map((v: ArchitectureView) => v.view_type),
    });

    return data;
}

/**
 * Get metadata about all available view types
 * 
 * @returns List of all available view types with descriptions
 * 
 * @example
 * ```typescript
 * const { views, total_views } = await getAvailableViews();
 * console.log(`${total_views} view types available`);
 * views.forEach(view => {
 *   console.log(`${view.title}: ${view.key_question}`);
 * });
 * ```
 */
export async function getAvailableViews(): Promise<AvailableViewsResponse> {
    console.log('[ArchitectureAPI] Fetching available views');
    console.log('[ArchitectureAPI] URL:', `${BASE_URL}/api/diagrams/architecture/available_views`);

    const response = await strataxFetch(`${BASE_URL}/api/diagrams/architecture/available_views`, {
        method: 'GET',
        headers: buildHeaders(),
    });

    console.log('[ArchitectureAPI] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: Failed to fetch available views`
        }));
        console.error('[ArchitectureAPI] Error response:', error);
        throw new Error(handleApiError(error));
    }

    const data = await response.json();
    console.log('[ArchitectureAPI] Available views:', data.total_views);

    return data;
}

/**
 * Get AI-recommended views for a specific system description
 * 
 * @param request - System description and user level
 * @returns Recommended views with explanations
 * 
 * @example
 * ```typescript
 * const recommendations = await getRecommendedViews({
 *   system_description: "E-commerce platform with payment processing",
 *   user_level: "senior"
 * });
 * 
 * console.log(`Recommended ${recommendations.total_recommended} views`);
 * console.log(`Estimated time: ${recommendations.estimated_total_time}`);
 * ```
 */
export async function getRecommendedViews(
    request: RecommendViewsRequest
): Promise<RecommendedViewsResponse> {
    console.log('[ArchitectureAPI] Getting recommended views, request:', request);
    console.log('[ArchitectureAPI] URL:', `${BASE_URL}/api/diagrams/architecture/recommend_views`);

    const response = await strataxFetch(`${BASE_URL}/api/diagrams/architecture/recommend_views`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(request),
    });

    console.log('[ArchitectureAPI] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: Failed to get recommendations`
        }));
        console.error('[ArchitectureAPI] Error response:', error);
        throw new Error(handleApiError(error));
    }

    const data = await response.json();
    console.log('[ArchitectureAPI] Recommendations:', {
        total_recommended: data.total_recommended,
        estimated_time: data.estimated_total_time,
    });

    return data;
}

/**
 * Export architecture package as formatted markdown file
 * 
 * @param architecturePackage - Complete architecture package to export
 * @returns Markdown content as Blob
 * 
 * @example
 * ```typescript
 * const package = await generateArchitecture({...});
 * const blob = await exportToMarkdown(package);
 * 
 * // Download the file
 * const url = URL.createObjectURL(blob);
 * const a = document.createElement('a');
 * a.href = url;
 * a.download = 'architecture.md';
 * a.click();
 * ```
 */
export async function exportToMarkdown(
    architecturePackage: ArchitecturePackage
): Promise<Blob> {
    console.log('[ArchitectureAPI] Exporting to markdown');
    console.log('[ArchitectureAPI] URL:', `${BASE_URL}/api/diagrams/architecture/export_markdown`);

    const response = await strataxFetch(`${BASE_URL}/api/diagrams/architecture/export_markdown`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(architecturePackage),
    });

    console.log('[ArchitectureAPI] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: Failed to export markdown`
        }));
        console.error('[ArchitectureAPI] Error response:', error);
        throw new Error(handleApiError(error));
    }

    const blob = await response.blob();
    console.log('[ArchitectureAPI] Markdown exported, size:', blob.size);

    return blob;
}

/**
 * Render mermaid diagram code to SVG
 * 
 * @param request - Mermaid code and rendering options
 * @returns SVG content as string
 * 
 * @example
 * ```typescript
 * const svg = await renderMermaidDiagram({
 *   code: 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]',
 *   theme: 'default',
 *   style: 'modern'
 * });
 * 
 * document.getElementById('diagram').innerHTML = svg;
 * ```
 */
export async function renderMermaidDiagram(
    request: RenderMermaidRequest
): Promise<string> {
    console.log('[ArchitectureAPI] Rendering mermaid diagram');
    console.log('[ArchitectureAPI] URL:', `${BASE_URL}/api/diagrams/render_mermaid`);
    console.log('[ArchitectureAPI] Code length:', request.code.length);

    const response = await strataxFetch(`${BASE_URL}/api/diagrams/render_mermaid`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(request),
    });

    console.log('[ArchitectureAPI] Response status:', response.status, response.statusText);

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            detail: `HTTP ${response.status}: Failed to render diagram`
        }));
        console.error('[ArchitectureAPI] Error response:', error);
        throw new Error(handleApiError(error));
    }

    const svg = await response.text();
    console.log('[ArchitectureAPI] SVG rendered, length:', svg.length);

    return svg;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Download architecture package as markdown file
 * 
 * @param architecturePackage - Architecture package to download
 * @param filename - Optional custom filename (without extension)
 */
export async function downloadArchitectureMarkdown(
    architecturePackage: ArchitecturePackage,
    filename?: string
): Promise<void> {
    const blob = await exportToMarkdown(architecturePackage);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename
        ? `${filename}.md`
        : `${architecturePackage.system_name.replace(/\s+/g, '_')}_architecture.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[ArchitectureAPI] Markdown downloaded:', a.download);
}

/**
 * Render all views in an architecture package to SVG
 * 
 * @param architecturePackage - Architecture package with views
 * @param theme - Optional theme for rendering
 * @returns Map of view_type to SVG content
 */
export async function renderAllViews(
    architecturePackage: ArchitecturePackage,
    theme: DiagramTheme = 'default'
): Promise<Map<ViewType, string>> {
    console.log('[ArchitectureAPI] Rendering all views, count:', architecturePackage.views.length);

    const svgMap = new Map<ViewType, string>();

    for (const view of architecturePackage.views) {
        try {
            const svg = await renderMermaidDiagram({
                code: view.mermaid_code,
                theme,
                style: architecturePackage.metadata.style,
            });
            svgMap.set(view.view_type, svg);
            console.log('[ArchitectureAPI] Rendered view:', view.view_type);
        } catch (error) {
            console.error('[ArchitectureAPI] Failed to render view:', view.view_type, error);
            // Continue rendering other views even if one fails
        }
    }

    console.log('[ArchitectureAPI] Successfully rendered', svgMap.size, 'views');
    return svgMap;
}

/**
 * Validate system description before sending to API
 * 
 * @param description - System description to validate
 * @returns Validation result with error message if invalid
 */
export function validateSystemDescription(description: string): {
    valid: boolean;
    error?: string;
} {
    if (!description || description.trim().length === 0) {
        return {
            valid: false,
            error: 'System description is required',
        };
    }

    if (description.trim().length < 10) {
        return {
            valid: false,
            error: 'System description must be at least 10 characters',
        };
    }

    return { valid: true };
}

/**
 * Get estimated generation time based on user level
 * 
 * @param userLevel - User experience level
 * @returns Estimated time in seconds
 */
export function getEstimatedGenerationTime(userLevel: UserLevel): number {
    const timeMap: Record<UserLevel, number> = {
        junior: 20,      // ~2 views
        mid: 40,         // ~4 views
        senior: 60,      // ~6-7 views
        architect: 90,   // ~7+ views
    };

    return timeMap[userLevel] || 40;
}

/**
 * Format view order for display
 * 
 * @param views - Array of architecture views
 * @returns Formatted string like "1. System Overview → 2. Request Flow → ..."
 */
export function formatViewOrder(views: ArchitectureView[]): string {
    return views
        .map((view, index) => `${index + 1}. ${view.title}`)
        .join(' → ');
}

// ============================================================================
// Export all types and functions
// ============================================================================

export default {
    // API Functions
    generateArchitecture,
    getAvailableViews,
    getRecommendedViews,
    exportToMarkdown,
    renderMermaidDiagram,

    // Utility Functions
    downloadArchitectureMarkdown,
    renderAllViews,
    validateSystemDescription,
    getEstimatedGenerationTime,
    formatViewOrder,
};
