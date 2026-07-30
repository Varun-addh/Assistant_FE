/**
 * Renders a generated answer's markdown to HTML, with syntax-highlighted code.
 *
 * Lifted verbatim out of `InterviewIntelligence.tsx`, where it was module-local.
 * Question cards now render inside the copilot transcript as well as in the old
 * Search Intelligence tab, and both need this, so it lives on its own rather
 * than being duplicated or exported from a component that is being retired.
 *
 * The backend already normalises fences and section headings, so this only has to
 * render what it is given.
 */

// Syntax highlighting helper functions
const applyHighlighting = (token: string, tokenType: string): string => {
  switch (tokenType) {
    case 'keyword':
      return `<span class="code-keyword">${token}</span>`;
    case 'number':
      return `<span class="code-number">${token}</span>`;
    case 'string':
      return `<span class="code-string">${token}</span>`;
    case 'builtin':
      return `<span class="code-builtin">${token}</span>`;
    case 'function':
      return `<span class="code-function">${token}</span>`;
    case 'print':
      return `<span class="code-print">${token}</span>`;
    default:
      return token
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  }
}

const getTokenType = (token: string, config: any, lang: string): string => {
  // Check for numbers
  if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token) ||
    /^0[xX][0-9a-fA-F]+$/.test(token) ||
    /^0[bB][01]+$/.test(token) ||
    /^0[0-7]+$/.test(token)) {
    return 'number';
  }

  // Check for strings
  if (config.stringChars?.some((char: string) =>
    (token.startsWith(char) && token.endsWith(char)) ||
    (char === '`' && token.startsWith('`') && token.endsWith('`')))) {
    return 'string';
  }

  // Check for keywords
  if (config.keywords?.includes(token)) {
    return 'keyword';
  }

  // Check for builtins
  if (config.builtins?.includes(token)) {
    return 'builtin';
  }

  // Special cases
  if (lang === 'python' && token === 'print') {
    return 'print';
  }

  if (token.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
    return 'function';
  }

  return 'text';
};

const findCommentIndex = (line: string, commentChars: string[]): number => {
  if (!commentChars || commentChars.length === 0) return -1;

  for (const char of commentChars) {
    if (!char) continue;
    const index = line.indexOf(char);
    if (index !== -1) {
      if (char.length > 1) {
        const beforeComment = line.substring(0, index);
        const singleQuotes = (beforeComment.match(/'/g) || []).length;
        const doubleQuotes = (beforeComment.match(/"/g) || []).length;
        if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
          return index;
        }
      } else {
        return index;
      }
    }
  }
  return -1;
};

const highlightCode = (code: string, lang: string): string => {
  if (!code) return '';

  const languageConfigs: Record<string, any> = {
    python: {
      keywords: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'lambda', 'yield', 'raise', 'assert', 'del', 'global', 'nonlocal', 'async', 'await', 'match', 'case'],
      builtins: ['print', 'len', 'range', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all', 'isinstance', 'type', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'input', 'open', 'round', 'divmod', 'pow', 'bin', 'hex', 'oct', 'chr', 'ord', 'hash', 'id', 'dir', 'vars', 'locals', 'globals', 'eval', 'exec', 'pandas', 'pd', 'numpy', 'np'],
      commentChars: ['#'],
      stringChars: ['"', "'"],
    },
    javascript: {
      keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'],
      builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error'],
      commentChars: ['//', '/*'],
      stringChars: ['"', "'", '`'],
    },
    typescript: {
      keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'any', 'void', 'never', 'unknown', 'string', 'number', 'boolean', 'object'],
      builtins: ['console', 'document', 'window', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Set', 'Map', 'RegExp', 'Error'],
      commentChars: ['//', '/*'],
      stringChars: ['"', "'", '`'],
    },
    java: {
      keywords: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'extends', 'implements', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'import', 'package'],
      builtins: ['System', 'String', 'Object', 'Integer', 'Double', 'Float', 'Boolean', 'Math', 'Arrays', 'Collections', 'List', 'ArrayList', 'HashMap'],
      commentChars: ['//', '/*'],
      stringChars: ['"'],
    },
    sql: {
      keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT'],
      builtins: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CONCAT', 'SUBSTRING', 'LENGTH', 'UPPER', 'LOWER'],
      commentChars: ['--', '/*'],
      stringChars: ['"', "'"],
    },
  };

  const config = languageConfigs[lang?.toLowerCase()] || languageConfigs.python;
  const lines = code.split('\n');
  const highlightedLines: string[] = [];
  let inMultilineComment = false;
  let multilineCommentEnd = '';

  for (const line of lines) {
    let highlightedLine = '';

    // Check for full line comments
    const trimmedLine = line.trim();
    const isFullLineComment = config.commentChars?.some((char: string) => trimmedLine.startsWith(char));

    if (isFullLineComment) {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      highlightedLine = `<span class="code-comment">${escaped}</span>`;
    } else if (inMultilineComment) {
      const endPos = line.indexOf(multilineCommentEnd);
      if (endPos !== -1) {
        const before = line.substring(0, endPos + multilineCommentEnd.length);
        const after = line.substring(endPos + multilineCommentEnd.length);
        const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlightedLine = `<span class="code-comment">${escBefore}</span>`;
        // Process after part
        let i = 0;
        while (i < after.length) {
          if (/\s/.test(after[i])) {
            highlightedLine += after[i];
            i++;
            continue;
          }
          let token = '';
          let j = i;
          while (j < after.length && !/\s/.test(after[j])) {
            token += after[j];
            j++;
          }
          const ttype = getTokenType(token, config, lang);
          highlightedLine += applyHighlighting(token, ttype);
          i = j;
        }
        inMultilineComment = false;
        multilineCommentEnd = '';
      } else {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlightedLine = `<span class="code-comment">${escaped}</span>`;
      }
    } else {
      // Check for multiline comment start
      if (trimmedLine.startsWith('/*')) {
        const endPos = line.indexOf('*/');
        if (endPos !== -1) {
          const before = line.substring(0, endPos + 2);
          const after = line.substring(endPos + 2);
          const escBefore = before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine = `<span class="code-comment">${escBefore}</span>`;
          // Process after part
          let i = 0;
          while (i < after.length) {
            if (/\s/.test(after[i])) {
              highlightedLine += after[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < after.length && !/\s/.test(after[j])) {
              token += after[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }
        } else {
          inMultilineComment = true;
          multilineCommentEnd = '*/';
          const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine = `<span class="code-comment">${escaped}</span>`;
        }
      } else {
        // Process line with tokenization
        const commentIndex = findCommentIndex(line, config.commentChars || []);
        if (commentIndex !== -1) {
          const codePart = line.substring(0, commentIndex);
          const commentPart = line.substring(commentIndex);

          let i = 0;
          while (i < codePart.length) {
            if (/\s/.test(codePart[i])) {
              highlightedLine += codePart[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < codePart.length && !/\s/.test(codePart[j])) {
              token += codePart[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }

          const escComment = commentPart.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          highlightedLine += `<span class="code-comment">${escComment}</span>`;
        } else {
          let i = 0;
          while (i < line.length) {
            if (/\s/.test(line[i])) {
              highlightedLine += line[i];
              i++;
              continue;
            }
            let token = '';
            let j = i;
            while (j < line.length && !/\s/.test(line[j])) {
              token += line[j];
              j++;
            }
            const ttype = getTokenType(token, config, lang);
            highlightedLine += applyHighlighting(token, ttype);
            i = j;
          }
        }
      }

    }

    highlightedLines.push(highlightedLine);
  }

  return highlightedLines.join('\n');
}

// Enhanced markdown formatter for answer display with syntax highlighting
export const formatAnswerMarkdown = (text: string): string => {
  if (!text) return "";

  // Backend now handles code block detection and formatting
  // Frontend only needs to render the properly formatted markdown

  // Extract code blocks first and replace them with placeholders
  const codeBlockPlaceholders: string[] = [];
  let processedText = text;

  // Handle triple-backtick code blocks (already formatted by backend)
  processedText = processedText.replace(/```(\w+)?\s*\n?([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlockPlaceholders.length}__`;
    const cleanedCode = (code || '').replace(/^\n+/, '').replace(/\n+$/, '');
    const highlightedCode = highlightCode(cleanedCode, (lang || '').toString());
    codeBlockPlaceholders.push(
      `<div class="code-block-wrapper my-3"><pre class="bg-[#0b1020] border border-[#30363d] rounded-lg overflow-x-auto p-4" style="background-color: #0b1020; border: 1px solid #30363d; border-radius: 0.5rem; overflow-x: auto; padding: 1rem; margin: 0.75rem 0;"><code class="language-${lang || 'text'}" style="font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.875rem; line-height: 1.5; color: #d4d4d4; display: block; white-space: pre;">${highlightedCode}</code></pre></div>`
    );
    return placeholder;
  });

  // Escape the remaining text as HTML
  const escaped = processedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Parse the escaped text line-by-line, keeping placeholders intact
  const linesRaw = processedText.split('\n');
  const linesEscaped = escaped.split('\n');

  const outParts: string[] = [];
  let currList: 'ul' | 'ol' | null = null;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const inner = paragraphLines.join('<br>');
    outParts.push(`<p class="my-2 text-sm leading-relaxed">${inner}</p>`);
    paragraphLines = [];
  };

  const closeList = () => {
    if (!currList) return;
    outParts.push(`</${currList}>`);
    currList = null;
  };

  const openList = (type: 'ul' | 'ol') => {
    if (currList === type) return;
    closeList();
    if (type === 'ul') outParts.push('<ul class="list-disc my-2 space-y-1 pl-5">');
    else outParts.push('<ol class="list-decimal my-2 space-y-1 pl-7">');
    currList = type;
  };

  const processInline = (s: string) => {
    // Inline code with backticks (backend should handle most code formatting)
    s = s.replace(/`([^`]+)`/g, (_m, code) => {
      const decoded = (code || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return `<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">${decoded}</code>`;
    });

    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
    // Italic
    s = s.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
    return s;
  };

  for (let i = 0; i < linesRaw.length; i++) {
    const raw = (linesRaw[i] || '').trim();
    const esc = linesEscaped[i] || '';

    // Code block placeholder line
    const placeholderMatch = raw.match(/^__CODE_BLOCK_(\d+)__$/);
    if (placeholderMatch) {
      flushParagraph();
      closeList();
      outParts.push(`__CODE_BLOCK_${placeholderMatch[1]}__`); // replace later
      continue;
    }

    // Headers
    if (raw.startsWith('### ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(4).trim());
      outParts.push(`<h3 class="text-base font-semibold mt-3 mb-1">${content}</h3>`);
      continue;
    }
    if (raw.startsWith('## ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(3).trim());
      outParts.push(`<h2 class="text-lg font-semibold mt-3 mb-1">${content}</h2>`);
      continue;
    }
    if (raw.startsWith('# ')) {
      flushParagraph();
      closeList();
      const content = processInline(esc.substring(2).trim());
      outParts.push(`<h1 class="text-xl font-semibold mt-3 mb-1">${content}</h1>`);
      continue;
    }

    // Unordered list
    const ulMatch = raw.match(/^[-*] (.*)$/);
    if (ulMatch) {
      flushParagraph();
      openList('ul');
      const content = processInline(linesEscaped[i].replace(/^[-*] /, '').trim());
      outParts.push(`<li class="ml-0">${content}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = raw.match(/^\d+\. (.*)$/);
    if (olMatch) {
      flushParagraph();
      openList('ol');
      const content = processInline(linesEscaped[i].replace(/^\d+\. /, '').trim());
      outParts.push(`<li class="ml-0">${content}</li>`);
      continue;
    }

    // Empty line -> paragraph boundary
    if (raw === '') {
      flushParagraph();
      closeList();
      continue;
    }

    // Regular paragraph line -> accumulate (preserve single-line breaks with <br>)
    paragraphLines.push(processInline(esc));
  }

  flushParagraph();
  closeList();

  // Join result and replace placeholders with actual code-block HTML
  let finalHtml = outParts.join('\n');
  codeBlockPlaceholders.forEach((htmlBlock, idx) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, htmlBlock);
  });

  return finalHtml;
};
