import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

import {parseAaFile} from '../../engine/src/aa-format.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function logicalLine(bytes, offset, label) {
  const newline = bytes.indexOf(0x0a, offset);
  if (newline < 0) throw new Error(`${label} has no terminating LF`);
  const end = newline + 1;
  const raw = bytes.subarray(offset, end);
  let content = raw.subarray(0, raw.length - 1);
  if (content.at(-1) === 0x0d) content = content.subarray(0, content.length - 1);
  if (content.some((byte) => byte > 0x7f)) throw new Error(`${label} is not ASCII`);
  return {
    start: offset,
    end,
    raw,
    text: content.toString('ascii'),
    ending: raw.length > 1 && raw.at(-2) === 0x0d ? 'CRLF' : 'LF',
  };
}

function lineEndingCounts(lines) {
  return lines.reduce((counts, line) => {
    counts[line.ending] = (counts[line.ending] ?? 0) + 1;
    return counts;
  }, {});
}

function semanticPaletteHash(palette) {
  const canonical = palette.map((rgb) => rgb.map(String).join(' ')).join('\n');
  return sha256(Buffer.from(canonical, 'ascii'));
}

function inspectPrelude(bytes, document, label) {
  const headerLine = logicalLine(bytes, 0, `${label} header`);
  const headerValues = headerLine.text.trim().split(/\s+/).map(Number);
  if (headerValues.length !== 3 || headerValues.some((value) => !Number.isInteger(value))) {
    throw new Error(`${label} header does not contain integer width, height, and palette size`);
  }
  const [width, height, paletteCount] = headerValues;
  if (paletteCount !== document.palette.length) {
    throw new Error(`${label} header palette size does not match parsed palette`);
  }

  const paletteLines = [];
  let cursor = headerLine.end;
  for (let index = 0; index < paletteCount; index += 1) {
    const line = logicalLine(bytes, cursor, `${label} palette line ${index + 1}`);
    paletteLines.push(line);
    cursor = line.end;
  }
  const paletteBytes = bytes.subarray(headerLine.end, cursor);
  const paletteTextRecords = paletteLines.map((line) => line.text.trim().split(/\s+/));
  const decimalPlaces = {};
  for (const record of paletteTextRecords) {
    if (record.length !== 3) throw new Error(`${label} palette line must have three channels`);
    for (const token of record) {
      const fraction = /\.(\d+)$/.exec(token)?.[1] ?? '';
      const places = String(fraction.length);
      decimalPlaces[places] = (decimalPlaces[places] ?? 0) + 1;
    }
  }

  return {
    width,
    height,
    paletteCount,
    preludeEnd: cursor,
    header: {
      offset: 0,
      length: headerLine.raw.length,
      sha256: sha256(headerLine.raw),
      lineEnding: headerLine.ending,
    },
    palette: {
      offset: headerLine.end,
      length: paletteBytes.length,
      count: paletteCount,
      sha256: sha256(paletteBytes),
      semanticSha256: semanticPaletteHash(document.palette),
      lineEndingCounts: lineEndingCounts(paletteLines),
      lineLengthCounts: paletteLines.reduce((counts, line) => {
        const key = String(line.raw.length);
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      channelDecimalPlaceCounts: decimalPlaces,
      distinctRgbTripletCount: new Set(document.palette.map((rgb) => rgb.join(','))).size,
    },
  };
}

function firstByteMismatch(expected, candidate, headerEnd, paletteEnd) {
  const sharedLength = Math.min(expected.length, candidate.length);
  let offset = 0;
  while (offset < sharedLength && expected[offset] === candidate[offset]) offset += 1;
  if (offset === sharedLength && expected.length === candidate.length) return null;

  const section = offset < headerEnd ? 'header'
    : offset < paletteEnd ? 'palette'
      : 'prelude-tail';
  return {
    offset,
    section,
    expectedByte: offset < expected.length ? expected[offset].toString(16).padStart(2, '0') : null,
    candidateByte: offset < candidate.length ? candidate[offset].toString(16).padStart(2, '0') : null,
    expectedLength: expected.length,
    candidateLength: candidate.length,
  };
}

function firstSemanticMismatch(expected, candidate) {
  if (expected.width !== candidate.width) {
    return {section: 'header', field: 'width', expected: expected.width, candidate: candidate.width};
  }
  if (expected.height !== candidate.height) {
    return {section: 'header', field: 'height', expected: expected.height, candidate: candidate.height};
  }
  if (expected.palette.length !== candidate.palette.length) {
    return {
      section: 'header',
      field: 'paletteCount',
      expected: expected.palette.length,
      candidate: candidate.palette.length,
    };
  }
  for (let index = 0; index < expected.palette.length; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      if (expected.palette[index][channel] !== candidate.palette[index][channel]) {
        return {
          section: 'palette',
          paletteIndex: index,
          channel: ['red', 'green', 'blue'][channel],
          expected: expected.palette[index][channel],
          candidate: candidate.palette[index][channel],
        };
      }
    }
  }
  return null;
}

/** Inspect the AA0 header/palette prelude and verify that IMAGE is its exact suffix. */
export function compareAaPrelude(aaBytes, imageBytes, candidateBytes = null) {
  const aaDocument = parseAaFile(aaBytes.toString('utf8'));
  const aaPrelude = inspectPrelude(aaBytes, aaDocument, 'AA0');
  const suffixOffset = aaBytes.length - imageBytes.length;
  if (suffixOffset < 0 || !aaBytes.subarray(suffixOffset).equals(imageBytes)) {
    throw new Error('image bytes do not match the AA0 suffix');
  }
  if (aaPrelude.preludeEnd > suffixOffset) {
    throw new Error('the parsed header and palette extend into the image suffix');
  }

  const result = {
    schemaVersion: 1,
    source: {
      aa0Length: aaBytes.length,
      aa0Sha256: sha256(aaBytes),
      imageLength: imageBytes.length,
      imageSha256: sha256(imageBytes),
    },
    suffix: {
      verified: true,
      offset: suffixOffset,
      length: imageBytes.length,
    },
    prefix: {
      length: suffixOffset,
      sha256: sha256(aaBytes.subarray(0, suffixOffset)),
      dimensions: {width: aaPrelude.width, height: aaPrelude.height},
      paletteCount: aaPrelude.paletteCount,
      sections: {
        header: aaPrelude.header,
        palette: aaPrelude.palette,
        unclassifiedLength: suffixOffset - aaPrelude.preludeEnd,
      },
    },
  };

  if (candidateBytes !== null) {
    const candidateDocument = parseAaFile(candidateBytes.toString('utf8'));
    const candidatePrelude = inspectPrelude(candidateBytes, candidateDocument, 'candidate');
    const candidatePrefix = candidateBytes.subarray(0, candidatePrelude.preludeEnd);
    const expectedPrefix = aaBytes.subarray(0, suffixOffset);
    result.candidate = {
      prefixLength: candidatePrefix.length,
      prefixSha256: sha256(candidatePrefix),
      sections: {
        header: candidatePrelude.header,
        palette: candidatePrelude.palette,
      },
      byteIdentical: expectedPrefix.equals(candidatePrefix),
      firstByteMismatch: firstByteMismatch(
        expectedPrefix,
        candidatePrefix,
        aaPrelude.header.length,
        aaPrelude.preludeEnd,
      ),
      firstSemanticMismatch: firstSemanticMismatch(aaDocument, candidateDocument),
    };
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [aaPath, imagePath, candidatePath, ...extra] = process.argv.slice(2);
    if (!aaPath || !imagePath || extra.length) {
      throw new Error('Usage: node compare-aa-prelude.mjs AA0 IMAGE [JS_CANDIDATE]');
    }
    const result = compareAaPrelude(
      readFileSync(aaPath),
      readFileSync(imagePath),
      candidatePath ? readFileSync(candidatePath) : null,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
