// Small numeric helpers: descriptive statistics and ridge regression.
// Pure functions, no dependencies.

export function mean(values) {
  if (!values.length) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Value at quantile q (0–1) using linear interpolation. */
export function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function correlation(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Solve A·x = b with Gaussian elimination and partial pivoting. */
function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/**
 * Ridge regression on standardised features.
 * @param {number[][]} X  rows of feature values
 * @param {number[]} y    targets
 * @param {number} lambda ridge strength (on standardised scale)
 * @returns {{ predict(x: number[]): number, weights: number[], intercept: number, means: number[], sds: number[] }}
 */
export function ridgeFit(X, y, lambda = 2) {
  const k = X[0].length;
  const means = [];
  const sds = [];
  for (let j = 0; j < k; j++) {
    const col = X.map((row) => row[j]);
    means.push(mean(col));
    sds.push(stdDev(col) || 1);
  }
  const Z = X.map((row) => row.map((v, j) => (v - means[j]) / sds[j]));
  const intercept = mean(y);
  const A = [];
  const b = [];
  for (let i = 0; i < k; i++) {
    A.push([]);
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (const z of Z) s += z[i] * z[j];
      A[i].push(s + (i === j ? lambda : 0));
    }
    let s = 0;
    for (let r = 0; r < Z.length; r++) s += Z[r][i] * (y[r] - intercept);
    b.push(s);
  }
  const weights = solve(A, b);
  const predict = (x) => intercept + x.reduce((s, v, j) => s + (weights[j] * (v - means[j])) / sds[j], 0);
  return { predict, weights, intercept, means, sds };
}
