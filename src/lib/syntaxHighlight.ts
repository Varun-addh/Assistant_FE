/**
 * Syntax highlighting for answer code blocks.
 *
 * Replaces a 437-line hand-rolled tokenizer in AnswerCard that supported five
 * languages (python, javascript, typescript, java, cpp) and mis-highlighted
 * everything else.
 *
 * Uses highlight.js/lib/core with an explicit language set rather than the
 * default bundle. The full bundle registers 190+ grammars and costs ~940 kB
 * (~312 kB gzipped) — unjustifiable for a chat UI. Registering only what an
 * interview-prep tool actually shows keeps the cost to a fraction of that.
 *
 * Synchronous by design: AnswerCard highlights during render while the answer
 * is still streaming. Shiki produces more accurate output (real VSCode
 * grammars) but initialises asynchronously by loading WASM, so it cannot drop
 * into a synchronous render path without restructuring that component.
 *
 * To add a language: import it from highlight.js/lib/languages/<name> and
 * register it below.
 */

import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash, c, cpp, csharp, css, go, java, javascript, json, kotlin, markdown,
  php, plaintext, python, ruby, rust, scala, sql, swift, typescript, xml, yaml,
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

/** Aliases the model commonly emits in fenced code blocks. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  py3: 'python',
  python3: 'python',
  'c++': 'cpp',
  cc: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  golang: 'go',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  html: 'xml',
  htm: 'xml',
  yml: 'yaml',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  text: 'plaintext',
  txt: 'plaintext',
  '': 'plaintext',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Highlight `code` as `lang`, returning HTML.
 *
 * Never throws: a highlighting failure returns escaped source rather than
 * blanking the code block.
 */
export function highlightCode(code: string, lang: string): string {
  const requested = (lang || '').toLowerCase().trim();
  const resolved = ALIASES[requested] ?? requested;

  try {
    if (resolved && hljs.getLanguage(resolved)) {
      return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
    }
    // Unknown language: guess among the registered set rather than rendering
    // unstyled text. Restricted to real languages so prose is not mangled.
    return hljs.highlightAuto(code, [
      'python', 'javascript', 'typescript', 'java', 'cpp', 'csharp', 'go',
      'rust', 'sql', 'bash', 'json', 'yaml', 'xml',
    ]).value;
  } catch {
    return escapeHtml(code);
  }
}

export default highlightCode;
