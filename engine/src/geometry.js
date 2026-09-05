export function point(x, y) {
  return [Number(x), Number(y)];
}

export function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

export function lerpPoint(first, second, amount) {
  return [
    lerp(first[0], second[0], amount),
    lerp(first[1], second[1], amount),
  ];
}

export function rotatePoint([x, y], angle, origin = [0, 0]) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = x - origin[0];
  const dy = y - origin[1];
  return [
    origin[0] + dx * cosine - dy * sine,
    origin[1] + dx * sine + dy * cosine,
  ];
}

export function ellipsePoints(cx, cy, radiusX, radiusY, segments = 32, rotation = 0) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(rotatePoint([
      cx + Math.cos(angle) * radiusX,
      cy + Math.sin(angle) * radiusY,
    ], rotation, [cx, cy]));
  }
  return points;
}

export function regularPolygon(cx, cy, radius, sides = 6, rotation = 0, scaleY = 1) {
  return ellipsePoints(cx, cy, radius, radius * scaleY, sides, rotation);
}

export function roundedRect(x, y, width, height, radius, segments = 6) {
  const clamped = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const corners = [
    [x + width - clamped, y + height - clamped, 0],
    [x + clamped, y + height - clamped, Math.PI / 2],
    [x + clamped, y + clamped, Math.PI],
    [x + width - clamped, y + clamped, Math.PI * 1.5],
  ];
  const points = [];
  for (const [cx, cy, start] of corners) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = start + (index / segments) * Math.PI / 2;
      points.push([cx + Math.cos(angle) * clamped, cy + Math.sin(angle) * clamped]);
    }
  }
  return points;
}

export function polygonBounds(points) {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const crosses = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Return sorted horizontal intersections for a scanline through a polygon. */
export function scanlineIntersections(polygon, y) {
  const intersections = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const [x1, y1] = current;
    const [x2, y2] = next;
    if (y1 === y2) continue;
    const lower = Math.min(y1, y2);
    const upper = Math.max(y1, y2);
    if (y < lower || y >= upper) continue;
    intersections.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  return intersections.sort((a, b) => a - b);
}

/** Sample a cubic Bezier curve into a polyline. */
export function cubicBezier(first, controlA, controlB, last, segments = 16) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const inverse = 1 - t;
    points.push([
      inverse ** 3 * first[0]
        + 3 * inverse ** 2 * t * controlA[0]
        + 3 * inverse * t ** 2 * controlB[0]
        + t ** 3 * last[0],
      inverse ** 3 * first[1]
        + 3 * inverse ** 2 * t * controlA[1]
        + 3 * inverse * t ** 2 * controlB[1]
        + t ** 3 * last[1],
    ]);
  }
  return points;
}
