import { parseLispRecord } from './parse-natural-free-path-report.mjs';
import { sha256 } from './index-allegro-image.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const list = v => { assert(v === null || Array.isArray(v), 'Expected list'); return v ?? []; };
const int = (v, lo = Number.MIN_SAFE_INTEGER, hi = Number.MAX_SAFE_INTEGER) => {
  assert(v?.kind === 'number' && /^[+-]?\d+$/.test(v.raw) && Number.isSafeInteger(v.value)
    && v.value >= lo && v.value <= hi, 'Expected raw integer'); return v.value;
};
const str = v => { assert(v?.kind === 'string', 'Expected string'); return v.value; };
const bool = v => { assert(v === true || v === null, 'Expected T/NIL'); return v === true; };
function keys(p, names) { assert(Object.keys(p).length === names.length && names.every(k => Object.hasOwn(p, k)), 'Record keys differ'); return p; }
const fields = (line, name, names) => keys(parseLispRecord(line, name), names);
function plist(v, names) {
  const p = list(v), result = {}; assert(p.length % 2 === 0, 'Malformed plist');
  for (let i = 0; i < p.length; i += 2) {
    const key = p[i]; assert(key?.kind === 'keyword' && !Object.hasOwn(result, key.name), 'Invalid plist key'); result[key.name] = p[i + 1];
  } return keys(result, names);
}
export function parseBrushFillPreparation(text) {
  assert(Buffer.byteLength(text) <= 64 * 1024 * 1024, 'Preparation report cap exceeded');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  assert(lines.shift() === 'BEGIN brush-fill-preparation v2' && lines.pop() === 'END brush-fill-preparation v2', 'Incomplete preparation framing');
  assert(lines.shift() === 'CAPS parents=250 calls=60000 objects=10000 members=1000', 'Caps differ');
  const names = ['SCRIPT', 'CFLIST', 'CFRAME', 'SCAN-ROW', 'PATCH-EDGE'], installs = [];
  for (const name of names) {
    const p = fields(lines.shift(), 'INSTALL', ['name', 'type']); assert(str(p.name) === name, 'Installation order differs'); installs.push({ name, type: str(p.type) });
  }
  for (const name of ['MY-FILL', 'BRUSH-FILL-SUBPART']) {
    const p = fields(lines.shift(), 'EXCLUDE', ['name', 'type']); assert(str(p.name) === name, 'Exclusion order differs'); installs.push({ name, type: str(p.type) });
  }
  assert(lines.shift() === 'READY', 'Missing ready');
  const objects = [], parents = [], calls = [], stack = []; let parent = null, complete = null, event = 0;
  const id = v => { const n = int(v, 0, objects.length); return n; };
  const frame = v => {
    const a = list(v); assert(a.length === 5, 'Incomplete frame'); return { id: id(a[0]), lx: int(a[1]), rx: int(a[2]), ly: int(a[3]), ty: int(a[4]) };
  };
  const point = v => {
    if (v === null) return null; const a = list(v); assert(a.length === 4, 'Incomplete point'); return { id: id(a[0]), x: int(a[1]), y: int(a[2]), z: int(a[3]) };
  };
  function before(name, v) {
    if (['SCRIPT', 'CFLIST', 'CFRAME'].includes(name)) {
      const p = plist(v, ['OBJECT', 'MPLAN-EQ']); return { object: id(p.OBJECT), mplanEqualsArgument: bool(p['MPLAN-EQ']) };
    }
    if (name === 'SCAN-ROW') {
      const p = plist(v, ['ARGS', 'FORM', 'FRAME', 'PATCH-READ']), a = list(p.ARGS).map(v => int(v)), read = list(p['PATCH-READ']);
      assert(a.length === 4 && read.length === 2, 'Scan/natural reader arity differs');
      return { args: a, form: id(p.FORM), frame: frame(p.FRAME), patchRead: { object: id(read[0]), value: int(read[1], 0, 65535) } };
    }
    const p = plist(v, ['START', 'MAX', 'P', 'FORM', 'FRAME', 'SCAN-EQ']);
    return { start: point(p.START), maximum: int(p.MAX, 0), patchId: int(p.P, 0, 65535), form: id(p.FORM), frame: frame(p.FRAME), scanResultIdentity: bool(p['SCAN-EQ']) };
  }
  function after(name, v) {
    if (['SCRIPT', 'CFLIST'].includes(name)) {
      const p = plist(v, ['OBJECT', 'MEMBERS']), members = list(p.MEMBERS).map(id);
      assert(members.length <= 1000, 'Members cap'); return { object: id(p.OBJECT), members };
    }
    if (name === 'CFRAME') { const p = plist(v, ['FORM', 'FRAME']); return { form: id(p.FORM), frame: frame(p.FRAME) }; }
    if (name === 'SCAN-ROW') { const p = plist(v, ['POINT']); return { point: point(p.POINT) }; }
    const p = plist(v, ['START', 'NIL']); return { start: point(p.START), nil: bool(p.NIL) };
  }
  for (const line of lines) {
    assert(!complete, 'Records after completion');
    if (line.startsWith('OBJECT ')) {
      const p = fields(line, 'OBJECT', ['id', 'type']), n = int(p.id, 1, 10000); assert(n === objects.length + 1, 'Object sequence differs'); objects.push({ id: n, type: str(p.type) });
    } else if (line.startsWith('PARENT ')) {
      const p = fields(line, 'PARENT', ['id', 'args', 'mplan']); assert(!parent && !stack.length, 'Parent nesting');
      parent = { id: int(p.id, 1, 250), args: list(p.args).map(v => int(v, 0)), mplan: id(p.mplan), callIds: [] };
      assert(parent.id === parents.length + 1 && parent.args.length === 2, 'Parent sequence/arity'); parents.push(parent);
    } else if (line.startsWith('END-PARENT ')) {
      const p = fields(line, 'END-PARENT', ['id']); assert(parent && int(p.id) === parent.id && !stack.length, 'Parent end differs'); parent = null;
    } else if (line.startsWith('CALL ')) {
      const p = fields(line, 'CALL', ['id', 'parent', 'name', 'before']), name = str(p.name);
      const call = { id: int(p.id, 1, 60000), parent: int(p.parent, 1, 250), name };
      assert(parent && call.id === calls.length + 1 && call.parent === parent.id && names.includes(name), 'Call sequence/enclosure differs');
      call.entryEvent = ++event; call.before = before(name, p.before); calls.push(call); stack.push(call); parent.callIds.push(call.id);
    } else if (line.startsWith('RETURN ')) {
      const p = fields(line, 'RETURN', ['id', 'after']), call = stack.pop(); assert(call && int(p.id) === call.id, 'Unpaired return'); call.returnEvent = ++event; call.after = after(call.name, p.after);
    } else if (line.startsWith('COMPLETE ')) {
      const p = fields(line, 'COMPLETE', ['main', 'parents', 'calls', 'objects', 'checks', 'errors', 'aborts', 'overflow', 'active', 'busy']);
      assert(!parent && !stack.length && p.main?.kind === 'keyword' && p.main.name === 'NORMAL' && int(p.parents) === parents.length
        && int(p.calls) === calls.length && int(p.objects) === objects.length && int(p.checks) >= calls.length * 2
        && int(p.errors) === 0 && int(p.aborts) === 0 && p.overflow === null && p.active === null && int(p.busy) === 0, 'Incomplete/erroneous preparation capture');
      complete = { parents: parents.length, calls: calls.length, objects: objects.length, checks: int(p.checks) };
    } else throw new Error(`Unsupported preparation record: ${line.slice(0, 100)}`);
  }
  assert(complete && calls.every(c => c.after), 'Missing complete capture');
  return { schemaVersion: 1, rawSha256: sha256(Buffer.from(text)), installs, objects, parents, calls, complete };
}
