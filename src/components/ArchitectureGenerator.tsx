/**
 * Architecture Generator Component
 * Complete UI for generating multi-view system architecture diagrams
 */

import React, { useState, useEffect } from 'react';
import {
    generateArchitecture,
    getAvailableViews,
    getRecommendedViews,
    renderMermaidDiagram,
    downloadArchitectureMarkdown,
    validateSystemDescription,
    getEstimatedGenerationTime,
    type GenerateArchitectureRequest,
    type ArchitecturePackage,
    type ArchitectureView,
    type AvailableViewsResponse,
    type RecommendedViewsResponse,
    type UserLevel,
    type DiagramStyle,
    type DiagramTheme,
    type ViewType,
} from '../lib/architectureApi';
import { Loader2, Download, Info, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

// ============================================================================
// Component Props
// ============================================================================

export interface ArchitectureGeneratorProps {
    className?: string;
    onGenerated?: (architecturePackage: ArchitecturePackage) => void;
    defaultUserLevel?: UserLevel;
    defaultStyle?: DiagramStyle;
}

// ============================================================================
// Main Component
// ============================================================================

export const ArchitectureGenerator: React.FC<ArchitectureGeneratorProps> = ({
    className = '',
    onGenerated,
    defaultUserLevel = 'mid',
    defaultStyle = 'modern',
}) => {
    // ============================================================================
    // State Management
    // ============================================================================

    // Form State
    const [systemDescription, setSystemDescription] = useState('');
    const [userLevel, setUserLevel] = useState<UserLevel>(defaultUserLevel);
    const [style, setStyle] = useState<DiagramStyle>(defaultStyle);
    const [includeExplanations, setIncludeExplanations] = useState(true);
    const [selectedViews, setSelectedViews] = useState<ViewType[]>([]);
    const [useCustomViews, setUseCustomViews] = useState(false);

    // API State
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingViews, setIsLoadingViews] = useState(false);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Results State
    const [architecturePackage, setArchitecturePackage] = useState<ArchitecturePackage | null>(null);
    const [availableViews, setAvailableViews] = useState<AvailableViewsResponse | null>(null);
    const [recommendations, setRecommendations] = useState<RecommendedViewsResponse | null>(null);
    const [renderedSvgs, setRenderedSvgs] = useState<Map<ViewType, string>>(new Map());
    const [currentViewIndex, setCurrentViewIndex] = useState(0);
    const [theme, setTheme] = useState<DiagramTheme>('default');

    // ============================================================================
    // Effects
    // ============================================================================

    // Load available views on mount
    useEffect(() => {
        loadAvailableViews();
    }, []);

    // Validate system description on change
    useEffect(() => {
        if (systemDescription) {
            const validation = validateSystemDescription(systemDescription);
            setValidationError(validation.valid ? null : validation.error);
        } else {
            setValidationError(null);
        }
    }, [systemDescription]);

    // Auto-load recommendations when description changes
    useEffect(() => {
        if (systemDescription && systemDescription.length >= 10) {
            const timer = setTimeout(() => {
                loadRecommendations();
            }, 1000); // Debounce 1 second

            return () => clearTimeout(timer);
        }
    }, [systemDescription, userLevel]);

    // ============================================================================
    // API Handlers
    // ============================================================================

    const loadAvailableViews = async () => {
        setIsLoadingViews(true);
        try {
            const views = await getAvailableViews();
            setAvailableViews(views);
            console.log('Loaded available views:', views);
        } catch (err) {
            console.error('Failed to load available views:', err);
            setError(err instanceof Error ? err.message : 'Failed to load available views');
        } finally {
            setIsLoadingViews(false);
        }
    };

    const loadRecommendations = async () => {
        if (!systemDescription || systemDescription.length < 10) return;

        setIsLoadingRecommendations(true);
        try {
            const recs = await getRecommendedViews({
                system_description: systemDescription,
                user_level: userLevel,
            });
            setRecommendations(recs);
            console.log('Loaded recommendations:', recs);
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            // Don't show error for recommendations - it's optional
        } finally {
            setIsLoadingRecommendations(false);
        }
    };

    const handleGenerate = async () => {
        // Validate
        const validation = validateSystemDescription(systemDescription);
        if (!validation.valid) {
            setValidationError(validation.error);
            return;
        }

        setIsGenerating(true);
        setError(null);
        setArchitecturePackage(null);
        setRenderedSvgs(new Map());
        setCurrentViewIndex(0);

        try {
            // Build request
            const request: GenerateArchitectureRequest = {
                system_description: systemDescription,
                user_level: userLevel,
                style,
                include_explanations: includeExplanations,
            };

            // Add custom views if selected
            if (useCustomViews && selectedViews.length > 0) {
                request.specific_views = selectedViews;
            }

            console.log('Generating architecture with request:', request);

            // Generate architecture
            const result = await generateArchitecture(request);
            setArchitecturePackage(result);
            console.log('Architecture generated:', result);

            // Render all diagrams
            await renderAllDiagrams(result);

            // Callback
            if (onGenerated) {
                onGenerated(result);
            }
        } catch (err) {
            console.error('Failed to generate architecture:', err);
            setError(err instanceof Error ? err.message : 'Failed to generate architecture');
        } finally {
            setIsGenerating(false);
        }
    };

    const renderAllDiagrams = async (pkg: ArchitecturePackage) => {
        const svgMap = new Map<ViewType, string>();

        for (const view of pkg.views) {
            try {
                const svg = await renderMermaidDiagram({
                    code: view.mermaid_code,
                    theme,
                    style: pkg.metadata.style,
                });
                svgMap.set(view.view_type, svg);
            } catch (err) {
                console.error('Failed to render view:', view.view_type, err);
            }
        }

        setRenderedSvgs(svgMap);
    };

    const handleDownloadMarkdown = async () => {
        if (!architecturePackage) return;

        try {
            await downloadArchitectureMarkdown(architecturePackage);
        } catch (err) {
            console.error('Failed to download markdown:', err);
            setError(err instanceof Error ? err.message : 'Failed to download markdown');
        }
    };

    const handleViewToggle = (viewType: ViewType) => {
        setSelectedViews(prev =>
            prev.includes(viewType)
                ? prev.filter(v => v !== viewType)
                : [...prev, viewType]
        );
    };

    // ============================================================================
    // Render Helpers
    // ============================================================================

    const renderFormSection = () => (
        <div className="space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Generate Architecture Diagrams
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Describe your system and get AI-generated multi-view architecture diagrams
                </p>
            </div>

            {/* System Description */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    System Description *
                </label>
                <textarea
                    value={systemDescription}
                    onChange={(e) => setSystemDescription(e.target.value)}
                    placeholder="E.g., Event management platform with real-time notifications, ticket sales, and analytics"
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 ${validationError ? 'border-red-500' : 'border-gray-300'
                        }`}
                    rows={4}
                    disabled={isGenerating}
                />
                {validationError && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {validationError}
                    </p>
                )}
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Minimum 10 characters. Be specific for better results.
                </p>
            </div>

            {/* User Level */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Experience Level
                </label>
                <select
                    value={userLevel}
                    onChange={(e) => setUserLevel(e.target.value as UserLevel)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    disabled={isGenerating}
                >
                    <option value="junior">Junior (2 views, ~20s)</option>
                    <option value="mid">Mid-Level (4 views, ~40s)</option>
                    <option value="senior">Senior (6-7 views, ~60s)</option>
                    <option value="architect">Architect (7+ views, ~90s)</option>
                </select>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Estimated time: ~{getEstimatedGenerationTime(userLevel)}s
                </p>
            </div>

            {/* Style */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Diagram Style
                </label>
                <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as DiagramStyle)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    disabled={isGenerating}
                >
                    <option value="modern">Modern</option>
                    <option value="minimal">Minimal</option>
                    <option value="detailed">Detailed</option>
                </select>
            </div>

            {/* Include Explanations */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="includeExplanations"
                    checked={includeExplanations}
                    onChange={(e) => setIncludeExplanations(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    disabled={isGenerating}
                />
                <label htmlFor="includeExplanations" className="text-sm text-gray-700 dark:text-gray-300">
                    Include detailed explanations and insights
                </label>
            </div>

            {/* Custom Views Toggle */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="useCustomViews"
                    checked={useCustomViews}
                    onChange={(e) => setUseCustomViews(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    disabled={isGenerating || isLoadingViews}
                />
                <label htmlFor="useCustomViews" className="text-sm text-gray-700 dark:text-gray-300">
                    Select specific views (otherwise AI will choose)
                </label>
            </div>

            {/* Custom Views Selection */}
            {useCustomViews && availableViews && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Select Views ({selectedViews.length} selected)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {availableViews.views.map((view) => (
                            <label
                                key={view.view_type}
                                className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedViews.includes(view.view_type)}
                                    onChange={() => handleViewToggle(view.view_type)}
                                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    disabled={isGenerating}
                                />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {view.title}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {view.description}
                                    </p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommendations */}
            {recommendations && !useCustomViews && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                                AI Recommendations ({recommendations.total_recommended} views, ~{recommendations.estimated_total_time})
                            </p>
                            <ul className="space-y-1">
                                {recommendations.recommended_views.slice(0, 3).map((rec) => (
                                    <li key={rec.view_type} className="text-xs text-blue-800 dark:text-blue-200">
                                        • {rec.title}: {rec.why_recommended}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <button
                onClick={handleGenerate}
                disabled={isGenerating || !!validationError || !systemDescription}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Architecture...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-5 h-5" />
                        Generate Architecture
                    </>
                )}
            </button>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-red-900 dark:text-red-100">Error</p>
                            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderResultsSection = () => {
        if (!architecturePackage) return null;

        const currentView = architecturePackage.views[currentViewIndex];
        const currentSvg = renderedSvgs.get(currentView.view_type);

        return (
            <div className="space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            {architecturePackage.system_name}
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            {architecturePackage.total_views} views generated • {architecturePackage.metadata.user_level} level
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadMarkdown}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export Markdown
                    </button>
                </div>

                {/* View Navigation */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {architecturePackage.views.map((view, index) => (
                        <button
                            key={view.view_type}
                            onClick={() => setCurrentViewIndex(index)}
                            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${index === currentViewIndex
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            {index + 1}. {view.title}
                        </button>
                    ))}
                </div>

                {/* Current View */}
                <div className="space-y-4">
                    {/* View Header */}
                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                            {currentView.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-3">
                            {currentView.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-full">
                                {currentView.complexity_level}
                            </span>
                            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs font-medium rounded-full">
                                {currentView.estimated_explanation_time}
                            </span>
                            <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-medium rounded-full">
                                {currentView.audience}
                            </span>
                        </div>
                    </div>

                    {/* Key Question */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                                    Key Question
                                </p>
                                <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                                    {currentView.key_question}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Diagram */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900">
                        {currentSvg ? (
                            <div
                                className="w-full overflow-auto"
                                dangerouslySetInnerHTML={{ __html: currentSvg }}
                            />
                        ) : (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                            </div>
                        )}
                    </div>

                    {/* Key Insights */}
                    {currentView.key_insights && currentView.key_insights.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                                        Key Insights
                                    </p>
                                    <ul className="space-y-1">
                                        {currentView.key_insights.map((insight, idx) => (
                                            <li key={idx} className="text-sm text-green-800 dark:text-green-200">
                                                • {insight}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Interview Tips */}
                {architecturePackage.interview_tips && architecturePackage.interview_tips.length > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                        <p className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">
                            💡 Interview Tips
                        </p>
                        <ul className="space-y-1">
                            {architecturePackage.interview_tips.map((tip, idx) => (
                                <li key={idx} className="text-sm text-purple-800 dark:text-purple-200">
                                    • {tip}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    // ============================================================================
    // Main Render
    // ============================================================================

    return (
        <div className={`max-w-7xl mx-auto px-3 py-4 sm:p-6 space-y-6 sm:space-y-8 ${className}`}>
            {renderFormSection()}
            {renderResultsSection()}
        </div>
    );
};

export default ArchitectureGenerator;
