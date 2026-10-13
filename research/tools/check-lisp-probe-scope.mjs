#!/usr/bin/env node

// Lexically checks Common Lisp delimiters and verifies selected forms occur
// at an expected nesting depth. This catches balanced-but-nested probe forms.
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function maskCommentsAndStrings(source) {
  const chars = source.split('');
  let state = 'code';
  let escaped = false;
  let blockDepth = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      else chars[index] = ' ';
    } else if (state === 'block-comment') {
      if (char === '\n') chars[index] = '\n';
      else chars[index] = ' ';
      if (char === '#' && chars[index + 1] === '|') {
        chars[index + 1] = ' ';
        blockDepth += 1;
        index += 1;
      } else if (char === '|' && chars[index + 1] === '#') {
        chars[index + 1] = ' ';
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'code';
      }
    } else if (state === 'string') {
      if (char === '\n') chars[index] = '\n';
      else chars[index] = ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') state = 'code';
    } else if (char === ';') {
      chars[index] = ' ';
      state = 'line-comment';
    } else if (char === '#' && chars[index + 1] === '|') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      blockDepth = 1;
      state = 'block-comment';
    } else if (char === '#' && chars[index + 1] === '\\') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      if (index < chars.length) {
        const character = chars[index];
        chars[index] = character === '\n' ? '\n' : ' ';
        if (!/[\s()";]/.test(character)) {
          while (index + 1 < chars.length && !/[\s()";]/.test(chars[index + 1])) {
            index += 1;
            chars[index] = ' ';
          }
        }
      }
    } else if (char === '"') {
      chars[index] = ' ';
      state = 'string';
      escaped = false;
    }
  }
  assert(state !== 'string', 'Unterminated Lisp string');
  assert(state !== 'block-comment', 'Unterminated Lisp block comment');
  return chars.join('');
}

export function checkLispProbeScope(source, expectedDepth, formPatterns) {
  assert(Number.isSafeInteger(expectedDepth) && expectedDepth >= 0,
    'Expected depth must be a nonnegative integer');
  const masked = maskCommentsAndStrings(source);
  let depth = 0;
  let minimumDepth = 0;
  const openForms = [];
  const depthAt = new Map();
  for (let index = 0; index < masked.length; index += 1) {
    depthAt.set(index, depth);
    if (masked[index] === '(') { depth += 1; openForms.push(index); }
    else if (masked[index] === ')') {
      depth -= 1;
      openForms.pop();
      minimumDepth = Math.min(minimumDepth, depth);
    }
  }
  assert(minimumDepth === 0, `Unexpected close parenthesis at nesting depth ${minimumDepth}`);
  assert(depth === 0, `Unclosed Lisp forms remain at nesting depth ${depth}; open lines: ${openForms.map((index) =>
    source.slice(0, index).split('\n').length).join(', ')}`);
  const forms = formPatterns.map((pattern) => {
    const expression = new RegExp(pattern, 'im');
    const match = expression.exec(masked);
    assert(match, `Required Lisp form not found: ${pattern}`);
    const actualDepth = depthAt.get(match.index);
    assert(actualDepth === expectedDepth,
      `Form ${pattern} starts at depth ${actualDepth}; expected ${expectedDepth}`);
    return { pattern, depth: actualDepth, line: source.slice(0, match.index).split('\n').length };
  });
  return { finalDepth: depth, minimumDepth, forms };
}

async function main() {
  const [sourcePath, expectedDepthText, ...patterns] = process.argv.slice(2);
  if (!sourcePath || !expectedDepthText || patterns.length === 0 || process.argv.length < 5) {
    console.error('Usage: node research/tools/check-lisp-probe-scope.mjs <file.cl> <expected-depth> <form-regex> [form-regex ...]');
    process.exitCode = 2;
    return;
  }
  const result = checkLispProbeScope(await readFile(sourcePath, 'utf8'), Number(expectedDepthText), patterns);
  console.log(JSON.stringify({ sourcePath, ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
}
