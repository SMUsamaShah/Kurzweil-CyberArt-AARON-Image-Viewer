#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';

function scan(source) {
  let offset = 0;
  let line = 1;
  let column = 1;
  const opens = [];
  let inString = false;
  let stringStart = null;
  let blockDepth = 0;
  let blockStart = null;

  const peek = (distance = 0) => source[offset + distance];
  const here = () => ({ line, column });
  const consume = () => {
    const ch = source[offset++];
    if (ch === '\r') {
      if (source[offset] === '\n') offset++;
      line++;
      column = 1;
    } else if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  };
  const consumePair = () => {
    consume();
    consume();
  };
  const isWhitespace = (ch) => ch !== undefined && /\s/u.test(ch);
  const readerTerminators = new Set(['(', ')', '"', "'", ';', '`', ',', '#', '|', '\\']);
  const isReaderTerminator = (ch) =>
    ch === undefined || isWhitespace(ch) || readerTerminators.has(ch);

  while (offset < source.length) {
    const ch = peek();

    if (blockDepth > 0) {
      if (ch === '#' && peek(1) === '|') {
        blockDepth++;
        consumePair();
      } else if (ch === '|' && peek(1) === '#') {
        blockDepth--;
        consumePair();
      } else {
        consume();
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        consume();
        if (offset < source.length) consume();
      } else if (ch === '"') {
        consume();
        inString = false;
        stringStart = null;
      } else {
        consume();
      }
      continue;
    }

    if (ch === ';') {
      while (offset < source.length && peek() !== '\r' && peek() !== '\n') consume();
      continue;
    }

    if (ch === '#' && peek(1) === '|') {
      blockDepth = 1;
      blockStart = here();
      consumePair();
      continue;
    }

    if (ch === '#' && peek(1) === '\\') {
      const start = here();
      consumePair();
      if (offset >= source.length) {
        return { position: start, message: 'unterminated character literal' };
      }

      // A character literal may be a named token (e.g. #\\Newline) or a
      // single reader delimiter/whitespace character (e.g. #\\) or #\\ ).
      if (isReaderTerminator(peek()) || peek() === '\\') {
        consume();
      } else {
        while (offset < source.length && !isReaderTerminator(peek())) consume();
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringStart = here();
      consume();
      continue;
    }

    // Vertical-bar escaped symbols and backslash-escaped symbol characters
    // can contain reader delimiters that are not structural parentheses.
    if (ch === '|') {
      const start = here();
      consume();
      let closed = false;
      while (offset < source.length) {
        if (peek() === '\\') {
          consume();
          if (offset < source.length) consume();
        } else if (peek() === '|') {
          consume();
          closed = true;
          break;
        } else {
          consume();
        }
      }
      if (!closed) return { position: start, message: 'unterminated escaped symbol' };
      continue;
    }

    if (ch === '\\') {
      const start = here();
      consume();
      if (offset >= source.length) {
        return { position: start, message: 'unterminated escaped symbol character' };
      }
      consume();
      continue;
    }

    if (ch === '(') {
      opens.push(here());
      consume();
      continue;
    }

    if (ch === ')') {
      if (opens.length === 0) {
        return { position: here(), message: 'unmatched closing parenthesis' };
      }
      opens.pop();
      consume();
      continue;
    }

    consume();
  }

  if (inString) return { position: stringStart, message: 'unterminated string' };
  if (blockDepth > 0) return { position: blockStart, message: 'unterminated block comment' };
  if (opens.length > 0) {
    return { position: opens[opens.length - 1], message: 'unmatched opening parenthesis' };
  }
  return null;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write('Usage: node research/tools/check-lisp-delimiters.mjs <file.cl> [file.cl ...]\n');
  process.exitCode = 2;
} else {
  let failed = false;
  for (const filePath of paths) {
    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch (error) {
      process.stderr.write(`${filePath}: cannot read file: ${error.message}\n`);
      failed = true;
      continue;
    }

    const problem = scan(source);
    if (problem) {
      process.stderr.write(
        `${filePath}:${problem.position.line}:${problem.position.column}: ${problem.message}\n`,
      );
      failed = true;
    } else {
      process.stdout.write(`OK ${filePath}\n`);
    }
  }
  if (failed) process.exitCode = 1;
}
