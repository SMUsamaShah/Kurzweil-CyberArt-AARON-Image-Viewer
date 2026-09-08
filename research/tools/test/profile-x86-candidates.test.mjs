import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseObjdumpInstructions,
  profileInstructionStream,
} from '../profile-x86-candidates.mjs';

function objdumpText(rows) {
  return rows.map(({ offset, bytes, asm }) => (
    `${offset.toString(16).padStart(7, ' ')}:\t${bytes}\t${asm}`
  )).join('\n');
}

test('parses bounded objdump rows and preserves byte lengths', () => {
  const instructions = parseObjdumpInstructions(objdumpText([
    { offset: 4, bytes: '55', asm: 'push   %ebp' },
    { offset: 5, bytes: '74 03', asm: 'je     0xa' },
    { offset: 7, bytes: 'e8 00 00 00 00', asm: 'call   0xc' },
    { offset: 12, bytes: 'c3', asm: 'ret' },
  ]));
  assert.deepEqual(instructions.map(({ offset, length, asm }) => ({ offset, length, asm })), [
    { offset: 4, length: 1, asm: 'push   %ebp' },
    { offset: 5, length: 2, asm: 'je     0xa' },
    { offset: 7, length: 5, asm: 'call   0xc' },
    { offset: 12, length: 1, asm: 'ret' },
  ]);
});

test('classifies conditional targets inside instructions and follows both paths', () => {
  const instructions = parseObjdumpInstructions(objdumpText([
    { offset: 4, bytes: '55', asm: 'push   %ebp' },
    { offset: 5, bytes: '74 03', asm: 'je     0xa' },
    { offset: 7, bytes: 'e8 00 00 00 00', asm: 'call   0xc' },
    { offset: 12, bytes: 'c3', asm: 'ret' },
    { offset: 13, bytes: '90', asm: 'nop' },
  ]));
  const profile = profileInstructionStream(instructions, { offset: 0, rawEnd: 14 });
  assert.equal(profile.linear.directCallCount, 1);
  assert.equal(profile.linear.conditionalJumpCount, 1);
  assert.deepEqual(profile.linear.targetClassCounts, {
    'origin-instruction-interior': 1,
    'origin-instruction-start': 1,
  });
  assert.equal(profile.recursive.instructionCount, 4);
  assert.equal(profile.recursive.stopReasonCounts['target-inside-linear-instruction'], 1);
});

test('distinguishes indirect calls, terminal instructions, and shifted origins', () => {
  const instructions = parseObjdumpInstructions(objdumpText([
    { offset: 4, bytes: 'ff d7', asm: 'call   *%edi' },
    { offset: 6, bytes: 'eb 02', asm: 'jmp    0xa' },
    { offset: 8, bytes: '90', asm: 'nop' },
    { offset: 9, bytes: '90', asm: 'nop' },
    { offset: 10, bytes: 'c3', asm: 'ret' },
  ]));
  const profile = profileInstructionStream(instructions, { offset: 0, rawEnd: 11 });
  assert.equal(profile.linear.indirectCallCount, 1);
  assert.equal(profile.linear.directJumpCount, 1);
  assert.equal(profile.recursive.instructionCount, 1);
  assert.equal(profile.recursive.stopReasonCounts['indirect-transfer'], 1);
  assert.equal(profile.assumedReturn.instructionCount, 3);
  assert.equal(profile.assumedReturn.assumedReturnCallCount, 1);
  assert.equal(profile.assumedReturn.stopReasonCounts['indirect-call-assumed-return'], 1);
  assert.equal(profile.assumedReturn.stopReasonCounts['terminal-instruction'], 1);

  const shifted = profileInstructionStream(
    instructions.filter(({ offset }) => offset >= 5),
    { offset: 1, rawEnd: 11 },
  );
  assert.equal(shifted.recursive.instructionCount, 0);
  assert.equal(shifted.linear.instructionCount, 4);
});

test('retains the checked-in DXL profile as an anonymous structural fixture', () => {
  const profile = JSON.parse(readFileSync(
    new URL('../../introspection/static-code-profile.json', import.meta.url),
    'utf8',
  ));
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.image.sha256, '4a6ad5379d84e0ea4e475064211cca6fa9d4d44b9e84bba89f102a069206bc74');
  assert.equal(profile.candidateSet.count, 190);
  assert.equal(profile.aggregate.candidateCount, 190);
  assert.equal(profile.aggregate.directTransferCount, 4271);
  assert.equal(profile.aggregate.linearInvalidCount, 200);
  assert.equal(profile.aggregate.indirectCallCount, 2986);
  assert.equal(profile.aggregate.recursiveInstructionCount, 5638);
  assert.equal(profile.aggregate.recursiveReachableBytes, 15158);
  assert.equal(profile.aggregate.assumedReturnInstructionCount, 22694);
  assert.equal(profile.aggregate.assumedReturnReachableBytes, 64470);
  assert.equal(profile.aggregate.assumedReturnCallCount, 2555);
  assert.equal(profile.aggregate.targetClassCounts['origin-instruction-interior'], 33);
  assert.equal('transfers' in profile.candidates[0].recursive, false);
  assert.equal(profile.controls.exactPayloadAnchors.profiles[0].profile.recursive.transfers.length, 3);
  assert.equal(profile.controls.exactPayloadAnchors.profiles.length, 3);
  assert.equal(profile.controls.shiftedStarts.profiles.length, 28);
  assert.equal(profile.controls.pllPrefixReferences.sampledWindowCount, 24);

  const anchorSignatures = profile.controls.exactPayloadAnchors.profiles.map(({ profile: anchor }) => ({
    linear: {
      instructionCount: anchor.linear.instructionCount,
      decodedBytes: anchor.linear.decodedBytes,
      invalidCount: anchor.linear.invalidCount,
      directTransferCount: anchor.linear.directTransferCount,
      indirectCallCount: anchor.linear.indirectCallCount,
      indirectJumpCount: anchor.linear.indirectJumpCount,
      targetClassCounts: anchor.linear.targetClassCounts,
    },
    recursive: {
      instructionCount: anchor.recursive.instructionCount,
      reachableBytes: anchor.recursive.reachableBytes,
      stopReasonCounts: anchor.recursive.stopReasonCounts,
      transfers: anchor.recursive.transfers.map(({ offset, target, ...transfer }) => ({
        ...transfer,
        offset: offset - anchor.offset,
        target: target - anchor.offset,
      })),
    },
  }));
  assert.ok(anchorSignatures.every((signature) => (
    JSON.stringify(signature) === JSON.stringify(anchorSignatures[0])
  )));
});
