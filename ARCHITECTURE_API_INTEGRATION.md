# 🏗️ Multi-View Architecture Generation - Integration Guide

## 📚 Overview

This guide provides complete documentation for integrating the Multi-View Architecture Generation API into your frontend application.

## 🗂️ Files Created

### 1. **API Client** (`src/lib/architectureApi.ts`)
Complete TypeScript API client with:
- ✅ Full type definitions for all request/response types
- ✅ All 5 API endpoints implemented
- ✅ Error handling and validation
- ✅ Utility functions for common tasks
- ✅ Comprehensive JSDoc documentation

### 2. **React Component** (`src/components/ArchitectureGenerator.tsx`)
Feature-complete UI component with:
- ✅ Form for system description input
- ✅ User level and style selection
- ✅ Custom view selection
- ✅ AI recommendations display
- ✅ Real-time diagram rendering
- ✅ View navigation
- ✅ Markdown export
- ✅ Error handling and loading states

---

## 🚀 Quick Start

### Basic Usage

```typescript
import { ArchitectureGenerator } from '@/components/ArchitectureGenerator';

function App() {
  return (
    <ArchitectureGenerator
      defaultUserLevel="mid"
      defaultStyle="modern"
      onGenerated={(pkg) => {
        console.log(`Generated ${pkg.total_views} views`);
      }}
    />
  );
}
```

### Using the API Directly

```typescript
import {
  generateArchitecture,
  renderMermaidDiagram,
  downloadArchitectureMarkdown,
} from '@/lib/architectureApi';

// Generate architecture
const package = await generateArchitecture({
  system_description: "Event management platform with real-time notifications",
  user_level: "mid",
  style: "modern",
  include_explanations: true,
});

// Render a specific view
const svg = await renderMermaidDiagram({
  code: package.views[0].mermaid_code,
  theme: "default",
  style: "modern",
});

// Download as markdown
await downloadArchitectureMarkdown(package);
```

---

## 📋 API Reference

### Core Functions

#### `generateArchitecture(request)`
Generate complete multi-view architecture package.

**Parameters:**
```typescript
{
  system_description: string;        // Required, min 10 chars
  user_level?: UserLevel;            // Optional: 'junior' | 'mid' | 'senior' | 'architect'
  specific_views?: ViewType[];       // Optional: specific views to generate
  style?: DiagramStyle;              // Optional: 'modern' | 'minimal' | 'detailed'
  include_explanations?: boolean;    // Optional: default true
  session_id?: string;               // Optional: for session tracking
}
```

**Returns:**
```typescript
{
  system_name: string;
  description: string;
  views: ArchitectureView[];
  view_order: ViewType[];
  total_views: number;
  generated_at: string;
  metadata: {...};
  how_to_use: string;
  interview_tips: string[];
}
```

**Example:**
```typescript
const result = await generateArchitecture({
  system_description: "E-commerce platform with payment processing",
  user_level: "senior",
  style: "modern",
});

console.log(`Generated ${result.total_views} views`);
result.views.forEach(view => {
  console.log(`${view.title}: ${view.key_question}`);
});
```

---

#### `getAvailableViews()`
Get metadata about all available view types.

**Returns:**
```typescript
{
  total_views: number;
  views: ViewMetadata[];
  recommendation: string;
}
```

**Example:**
```typescript
const { views, total_views } = await getAvailableViews();
console.log(`${total_views} view types available`);
```

---

#### `getRecommendedViews(request)`
Get AI-recommended views for a specific system.

**Parameters:**
```typescript
{
  system_description: string;
  user_level?: UserLevel;
}
```

**Returns:**
```typescript
{
  system_description: string;
  user_level: string;
  recommended_views: ViewRecommendation[];
  total_recommended: number;
  estimated_total_time: string;
}
```

**Example:**
```typescript
const recommendations = await getRecommendedViews({
  system_description: "URL shortener service",
  user_level: "junior",
});

console.log(`Recommended ${recommendations.total_recommended} views`);
console.log(`Estimated time: ${recommendations.estimated_total_time}`);
```

---

#### `renderMermaidDiagram(request)`
Render mermaid code to SVG.

**Parameters:**
```typescript
{
  code: string;                      // Required: Mermaid diagram code
  theme?: DiagramTheme;              // Optional: 'default' | 'dark' | 'forest' | 'neutral'
  style?: DiagramStyle;              // Optional: 'modern' | 'minimal' | 'detailed'
  addStepNumbers?: boolean | 'auto'; // Optional: default 'auto'
}
```

**Returns:** `string` (SVG content)

**Example:**
```typescript
const svg = await renderMermaidDiagram({
  code: 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]',
  theme: 'default',
  style: 'modern',
});

document.getElementById('diagram').innerHTML = svg;
```

---

#### `exportToMarkdown(architecturePackage)`
Export architecture package as markdown file.

**Parameters:** `ArchitecturePackage`

**Returns:** `Blob` (markdown file)

**Example:**
```typescript
const blob = await exportToMarkdown(architecturePackage);

// Download the file
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'architecture.md';
a.click();
```

---

### Utility Functions

#### `downloadArchitectureMarkdown(package, filename?)`
Download architecture package as markdown file (convenience function).

```typescript
await downloadArchitectureMarkdown(architecturePackage, 'my_system');
// Downloads as "my_system.md"
```

---

#### `renderAllViews(package, theme?)`
Render all views in an architecture package to SVG.

```typescript
const svgMap = await renderAllViews(architecturePackage, 'default');

// Access individual SVGs
const overviewSvg = svgMap.get('system_overview');
const flowSvg = svgMap.get('request_flow');
```

---

#### `validateSystemDescription(description)`
Validate system description before sending to API.

```typescript
const validation = validateSystemDescription(userInput);

if (!validation.valid) {
  console.error(validation.error);
  // "System description must be at least 10 characters"
}
```

---

#### `getEstimatedGenerationTime(userLevel)`
Get estimated generation time based on user level.

```typescript
const estimatedSeconds = getEstimatedGenerationTime('senior');
// Returns: 60
```

---

#### `formatViewOrder(views)`
Format view order for display.

```typescript
const formatted = formatViewOrder(architecturePackage.views);
// Returns: "1. System Overview → 2. Request Flow → 3. Data Model → ..."
```

---

## 🎨 Component Props

### `ArchitectureGenerator`

```typescript
interface ArchitectureGeneratorProps {
  className?: string;                                    // Optional CSS classes
  onGenerated?: (pkg: ArchitecturePackage) => void;     // Callback when generated
  defaultUserLevel?: UserLevel;                          // Default: 'mid'
  defaultStyle?: DiagramStyle;                           // Default: 'modern'
}
```

**Example:**
```typescript
<ArchitectureGenerator
  className="my-custom-class"
  defaultUserLevel="senior"
  defaultStyle="detailed"
  onGenerated={(pkg) => {
    console.log('Architecture generated!');
    console.log(`System: ${pkg.system_name}`);
    console.log(`Views: ${pkg.total_views}`);
    
    // Save to state, send to analytics, etc.
  }}
/>
```

---

## 🔧 Configuration

### Environment Variables

Add to your `.env` file:

```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:8000

# Optional: API Key (if required)
# Will be read from localStorage as 'user_api_key'
```

### API Key Setup

The API client automatically reads the API key from `localStorage`:

```typescript
// Set API key
localStorage.setItem('user_api_key', 'your-api-key-here');

// Remove API key
localStorage.removeItem('user_api_key');
```

---

## 📊 Type Definitions

### Core Types

```typescript
// User experience levels
type UserLevel = 'junior' | 'mid' | 'senior' | 'architect';

// Diagram styles
type DiagramStyle = 'modern' | 'minimal' | 'detailed';

// Diagram themes
type DiagramTheme = 'default' | 'dark' | 'forest' | 'neutral';

// Available view types
type ViewType = 
  | 'system_overview'
  | 'request_flow'
  | 'async_processing'
  | 'data_model'
  | 'deployment'
  | 'observability'
  | 'security';
```

### Architecture View

```typescript
interface ArchitectureView {
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
```

### Architecture Package

```typescript
interface ArchitecturePackage {
  system_name: string;
  description: string;
  views: ArchitectureView[];
  view_order: ViewType[];
  total_views: number;
  generated_at: string;
  metadata: {
    user_level: UserLevel;
    style: DiagramStyle;
    generation_method: string;
  };
  how_to_use: string;
  interview_tips: string[];
}
```

---

## 🎯 Complete Integration Example

### Full Workflow

```typescript
import React, { useState } from 'react';
import {
  generateArchitecture,
  getAvailableViews,
  getRecommendedViews,
  renderMermaidDiagram,
  downloadArchitectureMarkdown,
  type ArchitecturePackage,
} from '@/lib/architectureApi';

function ArchitectureDemo() {
  const [package, setPackage] = useState<ArchitecturePackage | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    
    try {
      // 1. Get available views (optional - for UI)
      const availableViews = await getAvailableViews();
      console.log(`${availableViews.total_views} view types available`);

      // 2. Get recommendations (optional - for smart defaults)
      const recommendations = await getRecommendedViews({
        system_description: 'Event management platform',
        user_level: 'mid',
      });
      console.log(`Recommended ${recommendations.total_recommended} views`);

      // 3. Generate architecture (main call)
      const result = await generateArchitecture({
        system_description: 'Event management platform with real-time notifications',
        user_level: 'mid',
        style: 'modern',
        include_explanations: true,
      });

      setPackage(result);

      // 4. Render all diagrams
      for (const view of result.views) {
        const svg = await renderMermaidDiagram({
          code: view.mermaid_code,
          theme: 'default',
          style: 'modern',
        });
        
        // Display SVG
        console.log(`Rendered ${view.title}`);
      }

      // 5. Export to markdown (optional)
      await downloadArchitectureMarkdown(result);

    } catch (error) {
      console.error('Failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Architecture'}
      </button>

      {package && (
        <div>
          <h2>{package.system_name}</h2>
          <p>{package.total_views} views generated</p>
          
          {package.views.map((view, index) => (
            <div key={view.view_type}>
              <h3>{view.title}</h3>
              <p>{view.description}</p>
              <p><strong>Key Question:</strong> {view.key_question}</p>
              
              {view.key_insights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## ⚡ Performance Tips

### Generation Times

| User Level | Views | Typical Time | Max Time |
|-----------|-------|--------------|----------|
| Junior    | 2     | ~20s         | 30s      |
| Mid       | 4     | ~40s         | 60s      |
| Senior    | 6-7   | ~60s         | 90s      |
| Architect | 7+    | ~90s         | 120s     |

### Optimization Strategies

1. **Show loading indicators** - Generation takes time, keep users informed
2. **Cache results** - Store generated packages to avoid re-generation
3. **Lazy render diagrams** - Only render visible diagrams
4. **Use recommendations** - Pre-fetch recommendations while user types
5. **Debounce input** - Wait for user to finish typing before fetching recommendations

---

## 🚨 Error Handling

### Common Errors

```typescript
try {
  const result = await generateArchitecture({...});
} catch (error) {
  if (error.message.includes('401')) {
    // Invalid API key
    console.error('Please check your API key');
  } else if (error.message.includes('400')) {
    // Validation error
    console.error('Invalid request parameters');
  } else if (error.message.includes('500')) {
    // Server error
    console.error('Server error, please try again');
  } else if (error.message.includes('502')) {
    // Service unavailable
    console.error('Service temporarily unavailable');
  } else {
    // Unknown error
    console.error('An unexpected error occurred');
  }
}
```

### Validation

```typescript
import { validateSystemDescription } from '@/lib/architectureApi';

const validation = validateSystemDescription(userInput);

if (!validation.valid) {
  // Show error to user
  alert(validation.error);
  return;
}

// Proceed with generation
await generateArchitecture({...});
```

---

## 🎨 Styling Guide

### Dark Mode Support

The component includes full dark mode support using Tailwind CSS:

```typescript
// Light mode
className="bg-white text-gray-900"

// Dark mode
className="dark:bg-gray-800 dark:text-white"
```

### Custom Styling

```typescript
<ArchitectureGenerator
  className="custom-architecture-generator"
/>
```

```css
.custom-architecture-generator {
  /* Your custom styles */
  max-width: 1200px;
  margin: 0 auto;
}
```

---

## 📱 Responsive Design

The component is fully responsive and works on:
- ✅ Desktop (1920px+)
- ✅ Laptop (1024px - 1920px)
- ✅ Tablet (768px - 1024px)
- ✅ Mobile (320px - 768px)

---

## 🧪 Testing

### Unit Tests

```typescript
import { validateSystemDescription, getEstimatedGenerationTime } from '@/lib/architectureApi';

describe('Architecture API Utils', () => {
  test('validates system description', () => {
    expect(validateSystemDescription('').valid).toBe(false);
    expect(validateSystemDescription('short').valid).toBe(false);
    expect(validateSystemDescription('Valid system description').valid).toBe(true);
  });

  test('estimates generation time', () => {
    expect(getEstimatedGenerationTime('junior')).toBe(20);
    expect(getEstimatedGenerationTime('mid')).toBe(40);
    expect(getEstimatedGenerationTime('senior')).toBe(60);
  });
});
```

### Integration Tests

```typescript
import { generateArchitecture } from '@/lib/architectureApi';

describe('Architecture Generation', () => {
  test('generates architecture package', async () => {
    const result = await generateArchitecture({
      system_description: 'Test system with multiple components',
      user_level: 'mid',
    });

    expect(result.total_views).toBeGreaterThan(0);
    expect(result.views).toHaveLength(result.total_views);
    expect(result.system_name).toBeTruthy();
  });
});
```

---

## 📚 Additional Resources

- **API Documentation**: See the complete API reference in your original request
- **Postman Collection**: Import the provided JSON collection for testing
- **TypeScript Types**: All types are exported from `architectureApi.ts`
- **Component Source**: See `ArchitectureGenerator.tsx` for implementation details

---

## 🎉 Summary

You now have:

1. ✅ **Complete API Client** (`architectureApi.ts`)
   - All 5 endpoints implemented
   - Full TypeScript types
   - Error handling
   - Utility functions

2. ✅ **Feature-Complete UI Component** (`ArchitectureGenerator.tsx`)
   - Form inputs
   - View selection
   - Diagram rendering
   - Export functionality

3. ✅ **Comprehensive Documentation** (this file)
   - API reference
   - Usage examples
   - Type definitions
   - Best practices

**Ready to use!** 🚀

Import the component and start generating architecture diagrams:

```typescript
import { ArchitectureGenerator } from '@/components/ArchitectureGenerator';

function App() {
  return <ArchitectureGenerator />;
}
```

---

**Need help?** Check the examples above or refer to the API documentation!
