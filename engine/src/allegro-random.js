import { Mt19937 } from './random.js';

const UINT32_SIZE = 0x100000000;
const FIXNUM_MAX = 0x1fffffff;

class LegacyMtCore extends Mt19937 {
  twist() {
    const state = this.state;
    for (let i = 0; i < 624; i += 1) {
      const mixed = (state[i] & 0x80000000) | (state[(i + 1) % 624] & 0x7fffffff);
      // The delivered runtime uses the previous last word for this final
      // recurrence. Standard MT instead uses state[396]. Short vectors do
      // not reveal the difference; the original 1,300-value runs do.
      const source = i === 623 ? state[i] : state[(i + 397) % 624];
      state[i] = (source ^ (mixed >>> 1) ^ ((mixed & 1) ? 0x9908b0df : 0)) >>> 0;
    }
    this.index = 0;
  }

  clone() {
    const result = Object.create(LegacyMtCore.prototype);
    result.state = new Uint32Array(this.state);
    result.index = this.index;
    return result;
  }
}

/**
 * Numeric RNG behavior recovered from the shipped Allegro CL 5.0.1 image.
 * See research/random-findings.md for original-engine reference vectors.
 * This does not recover AARON's time-based startup seed or painting draw order.
 * The provisional scene generator continues to use its existing random API.
 */
export class Allegro501Random {
  constructor(seed) {
    if (!Number.isInteger(seed) || seed < -0x80000000 || seed >= UINT32_SIZE) {
      throw new RangeError('seed must fit a signed or unsigned 32-bit integer');
    }
    this.core = new LegacyMtCore(0);
    this.core.state[0] = seed >>> 0;
    // The 2001 image uses the older MT initializer, not the 2002 reference
    // initializer (1812433253) used by the existing Mt19937 class.
    for (let i = 1; i < this.core.state.length; i += 1) {
      this.core.state[i] = Math.imul(69069, this.core.state[i - 1]) >>> 0;
    }
  }

  clone() {
    const result = Object.create(Allegro501Random.prototype);
    result.core = this.core.clone();
    return result;
  }

  nextUint32() {
    return this.core.nextUint32();
  }

  /** Original RANDOM for positive integers through 2^32. */
  nextInt(limit) {
    if (!Number.isInteger(limit) || limit <= 0 || limit > UINT32_SIZE) {
      throw new RangeError('integer limit must be in [1, 2^32]');
    }
    if (limit <= FIXNUM_MAX) return (this.nextUint32() >>> 1) % limit;
    // The original bignum path caps the highest 16-bit limb. It is biased;
    // modulo or rejection sampling would change the historical behavior.
    const word = this.nextUint32();
    if (limit === UINT32_SIZE) {
      this.nextUint32(); // Third 16-bit limb is capped to zero, consuming a word.
      return word;
    }
    const upper = Math.min(word >>> 16, Math.floor(limit / 0x10000) - 1);
    return upper * 0x10000 + (word & 0xffff);
  }

  /** Original RANDOM for a positive single-float limit. */
  nextFloat(limit = 1) {
    const singleLimit = Math.fround(limit);
    if (!Number.isFinite(singleLimit) || singleLimit <= 0) {
      throw new RangeError('single-float limit must be positive and finite');
    }
    const fraction = ((this.nextUint32() >>> 1) & 0xffffff) / 0x1000000;
    return Math.fround(fraction * singleLimit);
  }

  /** Original RANDOM for a positive double-float limit. */
  nextDouble(limit = 1) {
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new RangeError('double-float limit must be positive and finite');
    }
    const low = (this.nextUint32() >>> 1) & 0x7ffffff;
    const high = (this.nextUint32() >>> 1) & 0x3ffffff;
    return ((low + high * 0x8000000) / 0x20000000000000) * limit;
  }

  /** Observed RAN method for fixnum endpoints: inclusive upper bound. */
  integer(minimum, maximum) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum)
      || minimum < -0x20000000 || minimum > FIXNUM_MAX
      || maximum < -0x20000000 || maximum > FIXNUM_MAX) {
      throw new RangeError('RAN integer endpoints must fit Allegro fixnums');
    }
    if (maximum < minimum) throw new RangeError('maximum must not be less than minimum');
    return minimum + this.nextInt(maximum - minimum + 1);
  }

  between(minimum, maximum) {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      throw new TypeError('random range bounds must be finite');
    }
    if (maximum < minimum) throw new RangeError('maximum must not be less than minimum');
    return minimum + this.nextDouble(maximum - minimum);
  }

  pick(items) {
    if (!items?.length) throw new RangeError('cannot pick from an empty collection');
    return items[this.nextInt(items.length)];
  }

  shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.nextInt(index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }
}
