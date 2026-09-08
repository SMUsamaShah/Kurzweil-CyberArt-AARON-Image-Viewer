import { createHash } from 'node:crypto';

import { polygonBounds } from './geometry.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function copyBounds(bounds) {
  return bounds ? { ...bounds } : null;
}

function copyFrame(frame) {
  return frame ? { ...frame } : null;
}

function copyTransform(transform) {
  return transform ? { ...transform } : null;
}

function copyPolygon(polygon) {
  if (!Array.isArray(polygon)) throw new TypeError('shape polygon must be an array');
  return polygon.map((point) => {
    if (!Array.isArray(point) || point.length !== 2
      || !point.every(Number.isFinite)) {
      throw new TypeError('shape polygon points must be finite [x, y] pairs');
    }
    return [...point];
  });
}

function objectId(scene, objectIndex) {
  if (typeof scene.id === 'string' && scene.id) return scene.id;
  if (Number.isInteger(scene.index)) return `${scene.kind}:${scene.index}`;
  return `${scene.kind}:${objectIndex}`;
}

function objectBounds(shapes) {
  let result = null;
  for (const shape of shapes) {
    const bounds = polygonBounds(shape.polygon);
    if (!bounds) continue;
    result = result
      ? {
        minX: Math.min(result.minX, bounds.minX),
        minY: Math.min(result.minY, bounds.minY),
        maxX: Math.max(result.maxX, bounds.maxX),
        maxY: Math.max(result.maxY, bounds.maxY),
      }
      : { ...bounds };
  }
  return result;
}

function createShapeManifest(shape, objectIdValue, shapeIndex) {
  const polygon = copyPolygon(shape.polygon);
  return {
    id: `${objectIdValue}/${shape.kind}:${shapeIndex}`,
    kind: shape.kind,
    polygon,
    bounds: copyBounds(polygonBounds(polygon)),
    fill: shape.fill,
    brush: shape.brush,
    outline: Boolean(shape.outline),
    zPath: Boolean(shape.zPath),
    outlineRange: null,
    outlineMetrics: null,
    paintRange: null,
    paintMetrics: null,
  };
}

function assertUniqueIds(objects) {
  const objectIds = new Set();
  const shapeIds = new Set();
  for (const object of objects) {
    if (objectIds.has(object.id)) {
      throw new Error(`duplicate scene object id ${JSON.stringify(object.id)}`);
    }
    objectIds.add(object.id);
    for (const shape of object.shapes) {
      if (shapeIds.has(shape.id)) {
        throw new Error(`duplicate scene shape id ${JSON.stringify(shape.id)}`);
      }
      shapeIds.add(shape.id);
    }
  }
}

/**
 * Create a mutable scene trace before AA emission is recorded.
 *
 * The trace is intentionally marked provisional: it records the current
 * clean-room generator's geometry and stage boundaries, not recovered AARON
 * scene semantics. Call `finalizeSceneManifest` after emission to validate and
 * freeze it.
 */
export function createSceneManifest(scenes) {
  if (!Array.isArray(scenes)) throw new TypeError('scenes must be an array');
  const objects = scenes.map((scene, objectIndex) => {
    if (!scene || typeof scene.kind !== 'string' || !Array.isArray(scene.shapes)) {
      throw new TypeError('scene entries must contain kind and shapes');
    }
    const id = objectId(scene, objectIndex);
    const accepted = Boolean(scene.placement?.frame);
    return {
      id,
      kind: scene.kind,
      requestIndex: Number.isInteger(scene.index) ? scene.index : null,
      placementStatus: accepted ? 'accepted' : 'unplanned',
      frame: copyFrame(scene.placement?.frame),
      transform: scene.placement
        ? {
          scale: scene.placement.scale,
          offsetX: scene.placement.offsetX,
          offsetY: scene.placement.offsetY,
        }
        : null,
      sourceBounds: copyBounds(scene.placement?.sourceBounds),
      bounds: copyBounds(objectBounds(scene.shapes)),
      shapes: scene.shapes.map((shape, shapeIndex) => (
        createShapeManifest(shape, id, shapeIndex)
      )),
    };
  });
  const manifest = {
    schemaVersion: 1,
    evidence: 'provisional-clean-room',
    objects,
    stages: {
      outline: { operations: 0, range: { start: 0, end: 0 }, sha256: null },
      paint: { operations: 0, range: { start: 0, end: 0 }, sha256: null },
    },
  };
  assertUniqueIds(objects);
  return manifest;
}

function requireStage(stage) {
  if (!['outline', 'paint'].includes(stage)) {
    throw new RangeError(`unknown scene stage ${JSON.stringify(stage)}`);
  }
  return stage;
}

function requireRange(range) {
  if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)
      || range.start < 0 || range.end < range.start) {
    throw new RangeError('scene stage range must be a non-negative half-open range');
  }
  return { start: range.start, end: range.end };
}

/** Record one shape's half-open operation range for a generated stage. */
export function recordSceneStage(manifest, objectIndex, shapeIndex, stage, range, metrics = null) {
  requireStage(stage);
  const object = manifest?.objects?.[objectIndex];
  const shape = object?.shapes?.[shapeIndex];
  if (!shape) throw new RangeError('scene stage target does not exist');
  const normalizedRange = requireRange(range);
  const rangeKey = `${stage}Range`;
  if (shape[rangeKey] !== null) {
    throw new Error(`${stage} stage was already recorded for ${shape.id}`);
  }
  shape[rangeKey] = normalizedRange;
  shape[`${stage}Metrics`] = metrics ? { ...metrics } : null;
  return shape;
}

function stageRanges(manifest, stage) {
  const rangeKey = `${stage}Range`;
  const ranges = [];
  manifest.objects.forEach((object) => {
    object.shapes.forEach((shape) => {
      if (shape[rangeKey]) ranges.push({
        objectId: object.id,
        shapeId: shape.id,
        shape,
        range: shape[rangeKey],
      });
    });
  });
  return ranges.sort((left, right) => (
    left.range.start - right.range.start || left.range.end - right.range.end
  ));
}

function hashOperations(operations) {
  return createHash('sha256').update(JSON.stringify(operations)).digest('hex');
}

function documentBinding(document) {
  if (!document || !Number.isInteger(document.width) || document.width <= 0
      || !Number.isInteger(document.height) || document.height <= 0
      || !Array.isArray(document.palette)) {
    throw new TypeError('document must contain positive dimensions and a palette');
  }
  return {
    width: document.width,
    height: document.height,
    paletteSha256: createHash('sha256').update(JSON.stringify(document.palette)).digest('hex'),
  };
}

function sameBinding(left, right) {
  return left?.width === right.width
    && left?.height === right.height
    && left?.paletteSha256 === right.paletteSha256;
}

function validateStage(manifest, stage, operations, { recordShapeHashes = true } = {}) {
  const ranges = stageRanges(manifest, stage);
  let cursor = 0;
  for (const entry of ranges) {
    const range = requireRange(entry.range);
    if (range.end > operations.length || range.start !== cursor) {
      throw new Error(`${stage} scene ranges do not partition the emitted operations`);
    }
    const shapeHash = hashOperations(operations.slice(range.start, range.end));
    const shapeHashKey = `${stage}Sha256`;
    if (recordShapeHashes) {
      entry.shape[shapeHashKey] = shapeHash;
    } else if (entry.shape[shapeHashKey] !== shapeHash) {
      throw new Error(`${stage} scene shape hash does not match ${entry.shapeId}`);
    }
    cursor = range.end;
  }
  if (cursor !== operations.length) {
    throw new Error(`${stage} scene ranges do not cover the emitted operations`);
  }
  return {
    operations: operations.length,
    range: { start: 0, end: operations.length },
    sha256: hashOperations(operations),
  };
}

function validateManifestStructure(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.objects)
      || !manifest.stages || !manifest.document) {
    throw new TypeError('manifest is not a finalized scene manifest');
  }
  assertUniqueIds(manifest.objects);
}

/** Validate stage coverage and return an immutable scene manifest. */
export function finalizeSceneManifest(manifest, document) {
  if (!manifest || !Array.isArray(manifest.objects) || !manifest.stages) {
    throw new TypeError('manifest is incomplete');
  }
  if (!document || !Array.isArray(document.outline) || !Array.isArray(document.paint)) {
    throw new TypeError('document must contain outline and paint operations');
  }
  assertUniqueIds(manifest.objects);
  manifest.stages.outline = validateStage(manifest, 'outline', document.outline);
  manifest.stages.paint = validateStage(manifest, 'paint', document.paint);
  manifest.document = documentBinding(document);
  return deepFreeze(manifest);
}

function validateReplayDocument(document, manifest) {
  validateManifestStructure(manifest);
  const binding = documentBinding(document);
  if (!sameBinding(binding, manifest.document)) {
    throw new Error('document dimensions or palette do not match the scene manifest');
  }
  for (const stage of ['outline', 'paint']) {
    const operations = document[stage];
    const expected = validateStage(manifest, stage, operations, {
      recordShapeHashes: false,
    });
    const recorded = manifest.stages[stage];
    if (!recorded || recorded.operations !== expected.operations
        || recorded.range?.start !== expected.range.start
        || recorded.range?.end !== expected.range.end
        || recorded.sha256 !== expected.sha256) {
      throw new Error(`${stage} stage does not match the scene manifest`);
    }
  }
}

function copyOperations(operations, range) {
  return operations.slice(range.start, range.end).map((operation) => ({ ...operation }));
}

/**
 * Return an immutable operation-slice index for a finalized scene manifest.
 * This is replay/attribution infrastructure: it reuses captured operations and
 * never consumes random state or regenerates historical artwork.
 */
export function replaySceneManifest(document, manifest) {
  if (!document || !manifest?.objects) throw new TypeError('document and manifest are required');
  validateReplayDocument(document, manifest);
  const result = {
    schemaVersion: 1,
    evidence: manifest.evidence,
    document: { ...manifest.document },
    objects: [],
  };
  for (const object of manifest.objects) {
    for (const shape of object.shapes) {
      const entry = {
        objectId: object.id,
        shapeId: shape.id,
        outline: shape.outlineRange
          ? {
            range: { ...shape.outlineRange },
            operations: copyOperations(document.outline, shape.outlineRange),
          }
          : null,
        paint: shape.paintRange
          ? {
            range: { ...shape.paintRange },
            operations: copyOperations(document.paint, shape.paintRange),
          }
          : null,
      };
      result.objects.push(entry);
    }
  }
  return deepFreeze(result);
}
