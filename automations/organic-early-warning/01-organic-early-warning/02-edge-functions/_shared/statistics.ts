export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mad(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = median(arr);
  const deviations = arr.map((v) => Math.abs(v - m));
  return median(deviations);
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let acc = 0;
  for (const v of arr) {
    const d = v - m;
    acc += d * d;
  }
  return Math.sqrt(acc / (arr.length - 1));
}

export function robustZScore(value: number, medianValue: number, madValue: number): number {
  if (!Number.isFinite(madValue) || madValue === 0) return 0;
  return (value - medianValue) / (1.4826 * madValue);
}

export function mannKendallSlope(arr: number[]): number {
  const n = arr.length;
  if (n < 3) return 0;
  let pos = 0;
  let neg = 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = arr[j] - arr[i];
      if (d > 0) pos++;
      else if (d < 0) neg++;
      total++;
    }
  }
  if (total === 0) return 0;
  return (pos - neg) / total;
}

export function expDecay(arr: number[], lambda = 0.1): number[] {
  if (arr.length === 0) return [];
  const n = arr.length;
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const w = Math.exp(-lambda * age);
    weights.push(w);
    sum += w;
  }
  if (sum === 0) return arr.slice();
  return arr.map((v, i) => v * (weights[i] / sum) * n);
}
