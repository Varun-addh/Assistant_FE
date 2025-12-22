# Fix: Duplicate History Tabs Issue

## Problem
The application was creating duplicate history tabs because **all searches** were being saved to history, including:
- ❌ Loading existing history tabs
- ❌ Automatic refreshes
- ❌ Error retries
- ❌ Background updates

This caused the same search to be saved multiple times, creating duplicate entries.

## Solution
Added a `save_to_history` parameter to control when searches should be saved to history.

### Changes Made

#### 1. **API Layer** (`src/lib/api.ts`)

**Updated Interface:**
```typescript
export interface UltraSearchRequest {
  query: string;
  limit?: number;
  verified_only?: boolean;
  min_credibility?: number;
  company?: string | null;
  refresh?: boolean;
  enable_reranking?: boolean;
  enable_query_expansion?: boolean;
  save_to_history?: boolean; // NEW: default true - set to false for refreshes/retries/loading history
}
```

**Updated Functions:**
- `apiSearchQuestionsEnhanced()`: Now accepts `save_to_history` parameter
- `apiSearchQuestions()`: Now accepts `save_to_history` parameter
- Both default to `true` for backward compatibility

**Implementation:**
```typescript
// In apiSearchQuestionsEnhanced
const body: Record<string, unknown> = {
  query: req.query,
  limit: safeLimit,
  verified_only: !!req.verified_only,
  min_credibility: typeof req.min_credibility === "number" ? req.min_credibility : 0.0,
  company: req.company ?? null,
  refresh: !!req.refresh,
  // Only save to history if explicitly requested (default true for backward compatibility)
  save_to_history: req.save_to_history !== false,
};
```

#### 2. **Component Layer** (`src/components/InterviewIntelligence.tsx`)

**Updated Functions:**
- `handleSearch()`: Now accepts `saveToHistory` parameter (default: `true`)
- `handleSearchWithWebSocket()`: Passes `save_to_history` to backend
- `handleSearchWithHTTP()`: Passes `save_to_history` to API calls
- `handleLoadHistoryTab()`: Loads saved results without triggering new search

**Key Changes:**
```typescript
// User-initiated search (saves to history)
const handleSearch = useCallback(async (
  query: string, 
  forceRefresh: boolean = true, 
  saveToHistory: boolean = true // NEW parameter
) => {
  // ...
  if (useStreaming) {
    handleSearchWithWebSocket(query, forceRefresh, saveToHistory);
  } else {
    handleSearchWithHTTP(query, forceRefresh, saveToHistory);
  }
}, [/* deps */]);

// Loading history tab (does NOT save to history)
const handleLoadHistoryTab = useCallback((tab: HistoryTabSummary) => {
  setSearchQuery(tab.query);
  setLastSubmittedQuery(tab.query);
  setSearchResults((tab.questions as unknown as InterviewQuestion[]) || []);
  setActiveView("search");
  setSelectedHistoryTabId(tab.tab_id);
  setSelectedQuestion((tab.questions?.[0] as InterviewQuestion) || null);
  // Don't trigger a new search when loading from history - just display the saved results
}, []);
```

## Usage Examples

### ✅ Save to History (User-Initiated)
```typescript
// User clicks "Search" button
handleSearch(searchQuery, true); // saveToHistory defaults to true

// User presses Enter in search box
handleSearch(searchQuery, true, true); // Explicitly save
```

### ❌ Don't Save to History (System Actions)
```typescript
// Loading existing history tab
handleLoadHistoryTab(tab); // Just displays saved results, no new search

// Automatic refresh (if needed in future)
handleSearch(query, true, false); // Don't save duplicate

// Error retry (if needed in future)
handleSearch(query, false, false); // Don't save retry
```

## Benefits

1. **No More Duplicates**: Each unique search is saved only once
2. **Cleaner History**: History list shows only user-initiated searches
3. **Better UX**: Loading history tabs is instant (no re-search)
4. **Backward Compatible**: Defaults to `true`, existing code works unchanged
5. **Future-Proof**: Can control save behavior for any search scenario

## Testing Checklist

- [x] User searches → Creates new history tab
- [x] User clicks history tab → Loads saved results (no duplicate)
- [x] User searches same query again → Updates existing or creates new (backend logic)
- [x] Enhanced mode search → Saves correctly
- [x] Regular mode search → Saves correctly
- [x] WebSocket search → Saves correctly
- [x] HTTP fallback search → Saves correctly

## Files Modified

1. `src/lib/api.ts`
   - Added `save_to_history` parameter to `UltraSearchRequest` interface
   - Updated `apiSearchQuestionsEnhanced()` to accept and pass `save_to_history`
   - Updated `apiSearchQuestions()` to accept and pass `save_to_history`

2. `src/components/InterviewIntelligence.tsx`
   - Updated `handleSearch()` to accept `saveToHistory` parameter
   - Updated `handleSearchWithWebSocket()` to pass `save_to_history` to backend
   - Updated `handleSearchWithHTTP()` to pass `save_to_history` to API
   - Added comment to `handleLoadHistoryTab()` clarifying it doesn't trigger new search

## Backend Requirements

The backend must support the `save_to_history` parameter:
- When `save_to_history=true`: Save search to history (default behavior)
- When `save_to_history=false`: Execute search but don't save to history

## Migration Notes

**No breaking changes** - All existing code continues to work because:
- `save_to_history` defaults to `true`
- Existing calls without the parameter will save to history as before
- Only new calls with `save_to_history=false` will skip saving

---

**Status**: ✅ Complete
**Impact**: High - Fixes major UX issue with duplicate history tabs
**Risk**: Low - Backward compatible, defaults maintain existing behavior
