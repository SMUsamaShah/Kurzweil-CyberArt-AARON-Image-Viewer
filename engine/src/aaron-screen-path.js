/**
 * Emit the measured point-to-writer part of SCREEN-AND-STORE.
 *
 * The first eight natural calls for each of seeds 1234 and 5678 forward every
 * supplied path point once: MOVE-TO for the first, DRAW-TO for the rest.
 * AARGB changes can occur
 * between any two points. Their placement and index are still supplied by
 * the caller until AARON's colour selection is recovered.
 */
export function emitAaronScreenPath(writer, points, {
  redraw = true,
  colorEvents = [],
} = {}) {
  if (!writer || typeof writer.moveTo !== 'function'
      || typeof writer.drawTo !== 'function' || typeof writer.color !== 'function') {
    throw new TypeError('screen path requires an AaronStrokeWriter-compatible writer');
  }
  if (!Array.isArray(points) || points.length === 0
      || !points.every(point => Array.isArray(point) && point.length === 2
        && point.every(Number.isSafeInteger))) {
    throw new TypeError('screen path requires nonempty integer [x,y] points');
  }
  if (typeof redraw !== 'boolean') throw new TypeError('redraw must be boolean');
  if (!Array.isArray(colorEvents) || !colorEvents.every(event => event
      && Number.isSafeInteger(event.beforePoint)
      && event.beforePoint >= 0 && event.beforePoint <= points.length
      && Number.isSafeInteger(event.index) && event.index >= 0)) {
    throw new TypeError('colorEvents must contain {beforePoint,index} entries');
  }
  for (let event = 1; event < colorEvents.length; event += 1) {
    if (colorEvents[event].beforePoint < colorEvents[event - 1].beforePoint) {
      throw new RangeError('colorEvents must be ordered by beforePoint');
    }
  }
  let nextEvent = 0;
  for (let index = 0; index <= points.length; index += 1) {
    while (nextEvent < colorEvents.length && colorEvents[nextEvent].beforePoint === index) {
      writer.color(colorEvents[nextEvent].index);
      nextEvent += 1;
    }
    if (index < points.length) {
      if (index === 0) writer.moveTo(points[index], { redraw });
      else writer.drawTo(points[index], { redraw });
    }
  }
  return writer;
}
