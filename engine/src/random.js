/**
 * Clean-room MT19937 implementation.
 *
 * The archived AARON.pll image names MT19937 and exposes RANDOM-INT,
 * NEW-RANDOM-FLOAT, INIT-RANDOM, and ?RSEED?.  The exact Allegro Common Lisp
 * state layout and seed plumbing are still being calibrated against the
 * Windows oracle, so this module keeps the standard generator isolated behind
 * a small API that can be replaced without changing scene code.
 */

const WORD_MASK = 0xffffffff;
const TWIST_SIZE = 624;
const TWIST_OFFSET = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

function asUint32(value) {
  return Number(value) >>> 0;
}

function assertSeed(value) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError('MT19937 seed must be a finite integer');
  }
}

/** Standard MT19937-32 with the reference 32-bit integer sequence. */
export class Mt19937 {
  constructor(seed = 5489) {
    this.state = new Uint32Array(TWIST_SIZE);
    this.index = TWIST_SIZE;
    this.seed(seed);
  }

  seed(value) {
    assertSeed(value);
    this.state[0] = asUint32(value);
    for (let index = 1; index < TWIST_SIZE; index += 1) {
      const previous = this.state[index - 1];
      this.state[index] = asUint32(
        Math.imul(1812433253, previous ^ (previous >>> 30)) + index,
      );
    }
    this.index = TWIST_SIZE;
    return this;
  }

  clone() {
    const copy = Object.create(Mt19937.prototype);
    copy.state = new Uint32Array(this.state);
    copy.index = this.index;
    return copy;
  }

  twist() {
    for (let index = 0; index < TWIST_SIZE; index += 1) {
      const next = (index + 1) % TWIST_SIZE;
      const source = (index + TWIST_OFFSET) % TWIST_SIZE;
      const mixed = (this.state[index] & UPPER_MASK)
        | (this.state[next] & LOWER_MASK);
      let value = this.state[source] ^ (mixed >>> 1);
      if (mixed & 1) value ^= MATRIX_A;
      this.state[index] = asUint32(value);
    }
    this.index = 0;
  }

  nextUint32() {
    if (this.index >= TWIST_SIZE) this.twist();
    let value = this.state[this.index];
    this.index += 1;
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c5680;
    value ^= (value << 15) & 0xefc60000;
    value ^= value >>> 18;
    return asUint32(value);
  }

  /** Return a uniformly distributed float in [0, 1). */
  nextFloat() {
    return this.nextUint32() / 0x100000000;
  }

  /** Return a 53-bit precision float in [0, 1). */
  nextDouble() {
    const high = this.nextUint32() >>> 5;
    const low = this.nextUint32() >>> 6;
    return (high * 0x4000000 + low) / 0x20000000000000;
  }

  /** Return an integer in [0, limit), using rejection to avoid modulo bias. */
  nextInt(limit) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new RangeError('random integer limit must be a positive safe integer');
    }
    const domain = 0x100000000;
    const cutoff = domain - (domain % limit);
    let value;
    do {
      value = this.nextUint32();
    } while (value >= cutoff);
    return value % limit;
  }

  /** Return an integer in the inclusive range [minimum, maximum]. */
  integer(minimum, maximum) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new TypeError('integer bounds must be safe integers');
    }
    if (maximum < minimum) throw new RangeError('maximum must not be less than minimum');
    const span = maximum - minimum + 1;
    if (span > 0x100000000) {
      return Math.floor(this.nextDouble() * span) + minimum;
    }
    return this.nextInt(span) + minimum;
  }

  between(minimum, maximum) {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      throw new TypeError('random range bounds must be finite');
    }
    if (maximum < minimum) throw new RangeError('maximum must not be less than minimum');
    return minimum + this.nextDouble() * (maximum - minimum);
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

/** AARON-facing name; the implementation remains swappable for calibration. */
export class AaronRandom extends Mt19937 {}

export const mt19937Reference = Object.freeze([
  3499211612,
  581869302,
  3890346734,
  3586334585,
  545404204,
  4161255391,
  3922919429,
  949333985,
  2715962298,
]);
