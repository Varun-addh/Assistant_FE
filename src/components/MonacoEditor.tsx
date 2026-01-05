import React, { useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';

interface MonacoEditorProps {
    value: string;
    language: string;
    onChange: (value: string) => void;
    height?: number | string;
    className?: string;
    onMount?: OnMount;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
    value,
    language,
    onChange,
    height = '100%',
    className = "",
    onMount
}) => {
    const editorRef = useRef<any>(null);

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            onChange(value);
        }
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;

        // Custom theme configuration for a world-class look
        monaco.editor.defineTheme('stratax-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'ff7b72' },
                { token: 'string', foreground: 'a5d6ff' },
                { token: 'number', foreground: '79c0ff' },
                { token: 'type', foreground: 'ffa657' },
                { token: 'class', foreground: 'ffa657' },
                { token: 'function', foreground: 'd2a8ff' },
            ],
            colors: {
                'editor.background': '#0d1117',
                'editor.foreground': '#e6edf3',
                'editorLineNumber.foreground': '#484f58',
                'editorLineNumber.activeForeground': '#8b949e',
                'editor.lineHighlightBackground': '#161b22',
                'editor.selectionBackground': '#264f78',
                'editorCursor.foreground': '#58a6ff',
            }
        });

        monaco.editor.setTheme('stratax-dark');

        if (onMount) {
            onMount(editor, monaco);
        }
    };

    return (
        <div className={`relative border rounded-lg overflow-hidden bg-[#0d1117] shadow-2xl ${className}`} style={{ height }}>
            <Editor
                height="100%"
                language={language}
                value={value}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                loading={
                    <div className="flex items-center justify-center h-full bg-[#0d1117] text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>Initializing World-Class Editor...</span>
                    </div>
                }
                options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                    fontLigatures: true,
                    minimap: { enabled: true, scale: 0.75, side: 'right' },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    smoothScrolling: true,
                    contextmenu: true,
                    folding: true,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        useShadows: false,
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                    },
                }}
            />
        </div>
    );
};

export default MonacoEditor;
