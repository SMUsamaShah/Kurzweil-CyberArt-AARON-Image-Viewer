/**
 * Measured BRUSH-FILL selection and initial scan/boundary inputs. This data
 * adapter projects naturally returned SCRIPT/CFLIST values into JS arrays;
 * plan construction, live reader behavior and the scan schedule remain inputs.
 * Validation is adapter policy, not original-runtime error parity.
 */
function index(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative integer`);
}

/** Select SCRIPT[SDEX].cfList[CDEX], preserving the selected form identity. */
export function selectAaronBrushFillForm(script, cdex, sdex) {
  if (!Array.isArray(script)) throw new TypeError('script must be an array');
  index(cdex, 'cdex'); index(sdex, 'sdex');
  const record = script[sdex];
  if (!record || !Array.isArray(record.cfList)) throw new RangeError('Selected script record must provide cfList');
  if (cdex >= record.cfList.length) throw new RangeError('Selected form index is outside cfList');
  return record.cfList[cdex];
}

/** Derive the initial row bounds and walk budget from the selected form frame. */
export function prepareAaronBrushFillScan(frame, patchId) {
  if (!frame) throw new TypeError('A frame is required');
  for (const name of ['lx', 'rx', 'ly', 'ty']) {
    if (!Number.isSafeInteger(frame[name])) throw new TypeError(`frame.${name} must be an integer`);
  }
  index(patchId, 'patchId'); if (patchId > 65535) throw new RangeError('patchId must fit unsigned 16 bits');
  const maximum = 5 * ((frame.rx - frame.lx) + (frame.ty - frame.ly));
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new RangeError('Frame must provide a nonnegative safe walk budget');
  return { lx: frame.lx, rx: frame.rx, y: frame.ty, patchId, maximum };
}
