export const PILLAR_STYLE = {
  Prevention: { color: '#ff9f5a' },
  Detection: { color: '#5ac8fa' },
  Suppression: { color: '#7bd88f' },
};

export const SERIES_COLORS = [
  '#ff9f5a', '#5ac8fa', '#7bd88f', '#f7d154', '#c792ea',
  '#ff6b8b', '#4dd0b8', '#9aa7ff', '#e0a96d',
];

// 7.85 -> "7.85", 21 -> "21", 14.50 -> "14.5", null -> "—"
export function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return String(parseFloat(Number(v).toFixed(2)));
}

// unit is appended as given: '%', ' psi', ' cm/s'
export function fmtRange(min, max, unit = '') {
  if (min == null && max == null) return 'not specified';
  if (min == null) return `up to ${fmt(max)}${unit}`;
  if (max == null) return `from ${fmt(min)}${unit}`;
  if (min === max) return `${fmt(min)}${unit}`;
  return `${fmt(min)}–${fmt(max)}${unit}`;
}

// The ranking engine compares condition RANGES. This finds the single test that was
// actually run closest to the target (distance in %-points of O2 and psi).
export function nearestTestPoint(exp, env) {
  const pts = (exp.test_points || []).filter(
    (p) => typeof p.o2 === 'number' && typeof p.p_psi === 'number'
  );
  if (!pts.length) return null;
  let best = null;
  for (const p of pts) {
    const dO2 = p.o2 - env.target_o2;
    const dP = p.p_psi - env.target_psi;
    const dist = Math.hypot(dO2, dP);
    if (!best || dist < best.dist) best = { point: p, dO2, dP, dist };
  }
  return best;
}

export function pointExtras(p) {
  return [
    p.material,
    p.fuel,
    p.diluent && p.diluent !== 'none' ? `${p.diluent} diluent` : null,
    p.direction,
  ]
    .filter(Boolean)
    .join(', ');
}

export function statusTone(status = '') {
  const s = status.toLowerCase();
  if (s.includes('assumed') || s.includes('partial') || s.includes('abstract') || s.includes('no test table')) {
    return 'warn';
  }
  if (s.includes('verified')) return 'ok';
  return 'muted';
}

export function confidenceTone(c = '') {
  const s = c.toLowerCase();
  if (s === 'high') return 'ok';
  if (s === 'medium') return 'warn';
  if (s === 'low') return 'bad';
  return 'muted';
}

// /api/rank returns scores but drops test_points, notes, sources, data_status...
// /api/experiments has everything. Merge them by id.
export function mergeExperiments(ranked, all) {
  const byId = new Map(all.map((e) => [e.id, e]));
  return ranked.map((r) => ({ ...(byId.get(r.id) || {}), ...r }));
}

export function niceTicks(min, max, count = 6) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}