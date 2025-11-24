import React, { useState, useEffect } from 'react';
import { Search, Globe, Database, Sparkles, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// SearchStatus Component - Shows what the system is doing in real-time
const SearchStatus = ({ status, sources = [] }: { status: string; sources?: any[] }) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (status === 'searching' || status === 'generating' || status === 'analyzing' || status === 'ranking') {
      const interval = setInterval(() => {
        setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);
      return () => clearInterval(interval);
    }
    setDots('');
  }, [status]);

  const getStatusIcon = () => {
    switch (status) {
      case 'searching':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Search className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'analyzing':
        return `Analyzing your query${dots}`;
      case 'searching':
        return `Searching the web${dots}`;
      case 'generating':
        return `Generating answers${dots}`;
      case 'ranking':
        return `Ranking results${dots}`;
      case 'complete':
        return 'Search complete!';
      case 'error':
        return 'Search failed';
      default:
        return 'Ready to search';
    }
  };

  if (status === 'idle') return null;

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        {getStatusIcon()}
        <span className="text-sm font-medium text-gray-200">{getStatusMessage()}</span>
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((source, index) => (
            <SourceProgress key={index} {...source} />
          ))}
        </div>
      )}
    </div>
  );
};

const SourceProgress = ({ name, status, count = 0, icon: IconComponent }: any) => {
  const getStatusColor = () => {
    switch (status) {
      case 'searching':
        return 'text-blue-400 bg-blue-400/10';
      case 'complete':
        return 'text-green-400 bg-green-400/10';
      case 'error':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-2 rounded ${getStatusColor()}`}>
      {status === 'searching' ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : status === 'complete' ? (
        <CheckCircle className="w-3 h-3" />
      ) : (
        IconComponent ? <IconComponent className="w-3 h-3" /> : <Database className="w-3 h-3" />
      )}

      <span className="text-xs flex-1">{name}</span>

      {count > 0 && (
        <span className="text-xs font-mono">{count} results</span>
      )}
    </div>
  );
};

const InterviewSearchDemo: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<string>('idle');
  const [sources, setSources] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [enhanced, setEnhanced] = useState(true);

  const simulateSearch = async () => {
    if (!query.trim()) return;

    setResults([]);
    setSearchStatus('analyzing');

    await new Promise(resolve => setTimeout(resolve, 700));

    // If enhanced search is enabled, show web-search progress and sources
    if (enhanced) {
      setSearchStatus('searching');
      setSources([
        { name: 'LeetCode API', status: 'searching', icon: Database },
        { name: 'Web Search', status: 'searching', icon: Globe },
        { name: 'Vector DB', status: 'searching', icon: Database },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1200));

      setSources([
        { name: 'LeetCode API', status: 'complete', count: 5, icon: Database },
        { name: 'Web Search', status: 'searching', icon: Globe },
        { name: 'Vector DB', status: 'complete', count: 3, icon: Database },
      ]);

      await new Promise(resolve => setTimeout(resolve, 900));

      setSources([
        { name: 'LeetCode API', status: 'complete', count: 5, icon: Database },
        { name: 'Web Search', status: 'complete', count: 8, icon: Globe },
        { name: 'Vector DB', status: 'complete', count: 3, icon: Database },
      ]);

      setSearchStatus('generating');
      await new Promise(resolve => setTimeout(resolve, 1200));
    } else {
      // Non-enhanced: skip external sources and go straight to generation
      setSearchStatus('generating');
      setSources([]);
      await new Promise(resolve => setTimeout(resolve, 700));
    }

    setSearchStatus('ranking');
    await new Promise(resolve => setTimeout(resolve, 700));

    setSearchStatus('complete');
    setResults([
      { id: 1, question: 'What is SQL indexing?', verified: true },
      { id: 2, question: 'Explain JOIN types', verified: true },
      { id: 3, question: 'SQL vs NoSQL differences', verified: false },
    ]);

    // brief pause so user sees the complete state
    setTimeout(() => {
      setSearchStatus('idle');
      setSources([]);
    }, 2200);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Interview Intelligence</h1>
          <p className="text-gray-400 text-sm">Search interview questions with real-time web search</p>
        </div>

        <div className="mb-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && simulateSearch()}
                placeholder="Search interview questions..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={simulateSearch}
              disabled={!query.trim() || (searchStatus !== 'idle' && searchStatus !== 'complete')}
              className={`px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2`}
            >
              {searchStatus !== 'idle' && searchStatus !== 'complete' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Search
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setEnhanced(prev => !prev)}
              disabled={searchStatus !== 'idle' && searchStatus !== 'complete'}
              aria-pressed={enhanced}
              aria-label="Toggle enhanced web search"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enhanced ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enhanced ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
            <span className="text-sm text-gray-400">Enhanced Search (Web + AI)</span>
          </div>
        </div>

        <SearchStatus status={searchStatus} sources={sources} />

        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-3">{results.length} questions found</h2>
            {results.map((result) => (
              <div key={result.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1"><p className="text-sm">{result.question}</p></div>
                  {result.verified && (
                    <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                      <CheckCircle className="w-3 h-3" /> Verified
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {searchStatus === 'idle' && results.length === 0 && (
          <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4 text-center">
            <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <p className="text-sm text-gray-300 mb-1">Try: "SQL interview questions" or "Python coding questions"</p>
            <p className="text-xs text-gray-500">Enhanced search uses LLM + Web Search + Vector DB</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewSearchDemo;
