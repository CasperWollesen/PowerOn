// Minimal test harness – no dependencies, runs in the browser.
//
//   test('ANA-01 ANA-02', 'what it does', () => { expect(x).toBe(1); });
//
// The first argument lists the requirement IDs the test verifies; dev/spec-check.py
// reads them to build the traceability matrix.

const tests = [];

export function test(reqIds, name, fn) {
  tests.push({ reqIds: String(reqIds).split(/[\s,]+/).filter(Boolean), name, fn });
}

class Assertion {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    if (!Object.is(this.actual, expected)) throw new Error(`expected ${format(expected)}, got ${format(this.actual)}`);
  }

  toEqual(expected) {
    const a = JSON.stringify(this.actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`expected ${b}, got ${a}`);
  }

  toBeCloseTo(expected, decimals = 3) {
    const tolerance = 0.5 * 10 ** -decimals;
    if (!(Math.abs(this.actual - expected) <= tolerance)) {
      throw new Error(`expected ${format(expected)} ±${tolerance}, got ${format(this.actual)}`);
    }
  }

  toBeLessThan(expected) {
    if (!(this.actual < expected)) throw new Error(`expected ${format(this.actual)} < ${format(expected)}`);
  }

  toBeGreaterThan(expected) {
    if (!(this.actual > expected)) throw new Error(`expected ${format(this.actual)} > ${format(expected)}`);
  }

  toBeTruthy() {
    if (!this.actual) throw new Error(`expected a truthy value, got ${format(this.actual)}`);
  }

  toBeFalsy() {
    if (this.actual) throw new Error(`expected a falsy value, got ${format(this.actual)}`);
  }

  toBeNull() {
    if (this.actual !== null) throw new Error(`expected null, got ${format(this.actual)}`);
  }

  toContain(needle) {
    if (!String(this.actual).includes(needle)) throw new Error(`expected ${format(this.actual)} to contain ${format(needle)}`);
  }

  toThrow() {
    let threw = false;
    try {
      this.actual();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected the function to throw');
  }
}

function format(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

export function expect(actual) {
  return new Assertion(actual);
}

export async function run(container) {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ ...t, ok: true });
    } catch (err) {
      results.push({ ...t, ok: false, error: err.message });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const summary = {
    total: results.length,
    passed,
    failed,
    requirements: [...new Set(results.flatMap((r) => r.reqIds))].sort(),
    failures: results.filter((r) => !r.ok).map((r) => ({ name: r.name, reqIds: r.reqIds, error: r.error })),
  };

  document.title = `PowerOn tests: ${passed}/${results.length} passed`;
  if (container) {
    container.innerHTML = `
      <p class="summary ${failed ? 'fail' : 'pass'}">${failed ? `${failed} failed` : 'All passed'} · ${passed}/${results.length} · ${summary.requirements.length} requirements covered</p>
      <ul class="results">
        ${results
          .map(
            (r) => `<li class="${r.ok ? 'ok' : 'bad'}">
              <span class="mark">${r.ok ? '✓' : '✗'}</span>
              <span class="req">${r.reqIds.join(' ')}</span>
              <span class="name">${r.name}</span>
              ${r.ok ? '' : `<span class="err">${r.error}</span>`}
            </li>`,
          )
          .join('')}
      </ul>
      <pre id="results-json">${JSON.stringify(summary)}</pre>`;
  }
  return summary;
}
