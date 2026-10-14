#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function scan(source) {
  const openings = [];
  let line = 1;
  let column = 1;
  let maxDepth = 0;
  let state = 'code';
  let blockCommentDepth = 0;
  let escaped = false;
  let error = null;

  for (let i = 0; i < source.length; i++) {
    const current = source[i];
    const next = source[i + 1];
    const atLine = line;
    const atColumn = column;

    if (state === 'line-comment') {
      if (current === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (current === '#' && next === '|') {
        blockCommentDepth++;
        i++;
        column++;
      } else if (current === '|' && next === '#') {
        blockCommentDepth--;
        i++;
        column++;
        if (blockCommentDepth === 0) state = 'code';
      }
    } else if (state === 'string') {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') state = 'code';
    } else if (state === 'escaped-symbol') {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '|') state = 'code';
    } else if (current === ';') {
      state = 'line-comment';
    } else if (current === '#' && next === '|') {
      state = 'block-comment';
      blockCommentDepth = 1;
      i++;
      column++;
    } else if (current === '"') {
      state = 'string';
    } else if (current === '|') {
      state = 'escaped-symbol';
    } else if (current === '#' && next === '\\') {
      // #\( and #\) are character literals, not list delimiters.
      i += 2;
      column += 2;
      if (i < source.length) {
        const literalStart = source[i];
        if (/[\s()"';`,]/u.test(literalStart)) {
          if (literalStart === '\n') {
            line++;
            column = 0;
          }
        } else {
          while (i + 1 < source.length && !/[\s()"';`,]/u.test(source[i + 1])) {
            i++;
            column++;
          }
        }
      }
    } else if (current === '\\') {
      // A single escape in a symbol quotes the following character.
      if (i + 1 < source.length) {
        i++;
        column++;
      }
    } else if (current === '(') {
      openings.push({ line: atLine, column: atColumn });
      maxDepth = Math.max(maxDepth, openings.length);
    } else if (current === ')') {
      if (openings.length === 0) {
        error = { kind: 'unexpected-close', line: atLine, column: atColumn };
        break;
      }
      openings.pop();
    }

    if (current === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  if (!error && state === 'string') error = { kind: 'unterminated-string', line, column };
  if (!error && state === 'escaped-symbol') error = { kind: 'unterminated-escaped-symbol', line, column };
  if (!error && state === 'block-comment') error = { kind: 'unterminated-block-comment', line, column };
  if (!error && openings.length > 0) {
    error = { kind: 'unclosed-list', openings: openings.slice(-8) };
  }

  return { error, maxDepth };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node research/tools/check-lisp-paren-balance.mjs <probe.cl> [...]');
  process.exit(2);
}

let failed = false;
for (const input of files) {
  const absolutePath = path.resolve(input);
  let source;
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    console.error(`ERROR file=${input} reason=${error.message}`);
    failed = true;
    continue;
  }

  const result = scan(source);
  if (result.error) {
    const detail = result.error.openings
      ? result.error.openings.map(({ line, column }) => `${line}:${column}`).join(',')
      : `${result.error.line}:${result.error.column}`;
    console.error(`UNBALANCED file=${input} kind=${result.error.kind} location=${detail}`);
    failed = true;
  } else {
    console.log(`BALANCED file=${input} max-depth=${result.maxDepth}`);
  }
}

if (failed) process.exit(1);
