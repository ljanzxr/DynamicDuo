import { useMemo, useState } from 'react';
import { fmt, niceTicks, pointExtras } from '../utils';

const W = 720;
const H = 400;
const PAD = { l: 56, r: 18, t: 16, b: 50 };

function pointTitle(name, p) {
  const extra = pointExtras(p);
  return `${name} ${p.id}: ${fmt(p.o2)}% O₂, ${fmt(p.p_psi)} psi${extra ? ` (${extra})` : ''}`;
}

export default function CoverageChart({ experiments, env, colors }) {
  const [hidden, setHidden] = useState(() => new Set());

  const { series, unplotted, dom } = useMemo(() => {
    const series = [];
    const unplotted = [];
    for (const e of experiments) {
      const pts = (e.test_points || []).filter(
        (p) => typeof p.o2 === 'number' && typeof p.p_psi === 'number'
      );
      const c = e.conditions || {};
      const hasBox = [c.o2_min, c.o2_max, c.pressure_psi_min, c.pressure_psi_max].every(
        (v) => typeof v === 'number'
      );
      if (pts.length) {
        series.push({ id: e.id, name: e.name, kind: 'points', pts });
      } else if (hasBox) {
        series.push({
          id: e.id,
          name: e.name,
          kind: 'box',
          box: { o2Min: c.o2_min, o2Max: c.o2_max, pMin: c.pressure_psi_min, pMax: c.pressure_psi_max },
        });
      } else {
        unplotted.push(e.name);
      }
    }
    const xs = [env.target_o2];
    const ys = [env.target_psi];
    for (const s of series) {
      if (s.kind === 'points') {
        for (const p of s.pts) {
          xs.push(p.o2);
          ys.push(p.p_psi);
        }
      } else {
        xs.push(s.box.o2Min, s.box.o2Max);
        ys.push(s.box.pMin, s.box.pMax);
      }
    }
    const dom = {
      x0: Math.floor(Math.min(...xs) - 2),
      x1: Math.ceil(Math.max(...xs) + 2),
      y0: Math.max(0, Math.floor(Math.min(...ys) - 2)),
      y1: Math.ceil(Math.max(...ys) + 3),
    };
    return { series, unplotted, dom };
  }, [experiments, env]);

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const sx = (v) => PAD.l + ((v - dom.x0) / (dom.x1 - dom.x0)) * iw;
  const sy = (v) => PAD.t + (1 - (v - dom.y0) / (dom.y1 - dom.y0)) * ih;
  const xTicks = niceTicks(dom.x0, dom.x1, 8);
  const yTicks = niceTicks(dom.y0, dom.y1, 6);

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tx = sx(env.target_o2);
  const ty = sy(env.target_psi);
  const anchor = tx > W * 0.7 ? 'end' : 'start';

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Oxygen concentration and pressure of tested conditions compared with the target">
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line className="chart-grid" x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} />
            <text className="chart-text" x={sx(t)} y={H - PAD.b + 16} textAnchor="middle">{t}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="chart-grid" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
            <text className="chart-text" x={PAD.l - 8} y={sy(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <line className="chart-axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        <line className="chart-axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} />
        <text className="chart-title" x={PAD.l + iw / 2} y={H - 8} textAnchor="middle">
          Oxygen concentration (%)
        </text>
        <text className="chart-title" transform={`translate(14 ${PAD.t + ih / 2}) rotate(-90)`} textAnchor="middle">
          Pressure (psi)
        </text>

        {series
          .filter((s) => s.kind === 'box' && !hidden.has(s.id))
          .map((s) => {
            const { o2Min, o2Max, pMin, pMax } = s.box;
            const color = colors[s.id];
            const rawW = sx(o2Max) - sx(o2Min);
            const rawH = sy(pMin) - sy(pMax);
            const w = Math.max(8, rawW);
            const h = Math.max(8, rawH);
            const x = sx(o2Min) - (w - rawW) / 2;
            const y = sy(pMax) - (h - rawH) / 2;
            return (
              <rect key={s.id} x={x} y={y} width={w} height={h} rx="3" fill={color} fillOpacity="0.14"
                stroke={color} strokeDasharray="4 3">
                <title>
                  {s.name}: range only (no individual test points). O₂ {fmt(o2Min)}–{fmt(o2Max)}%,
                  {' '}{fmt(pMin)}–{fmt(pMax)} psi
                </title>
              </rect>
            );
          })}

        {series
          .filter((s) => s.kind === 'points' && !hidden.has(s.id))
          .map((s) => (
            <g key={s.id} fill={colors[s.id]} fillOpacity="0.55" stroke={colors[s.id]} strokeOpacity="0.9">
              {s.pts.map((p, i) => (
                <circle key={`${p.id}-${i}`} cx={sx(p.o2)} cy={sy(p.p_psi)} r="3.2">
                  <title>{pointTitle(s.name, p)}</title>
                </circle>
              ))}
            </g>
          ))}

        <line className="target-line" x1={tx} x2={tx} y1={PAD.t} y2={H - PAD.b} />
        <line className="target-line" x1={PAD.l} x2={W - PAD.r} y1={ty} y2={ty} />
        <circle className="target-dot" cx={tx} cy={ty} r="8" />
        <text className="target-label" x={tx + (anchor === 'end' ? -12 : 12)} y={ty - 12} textAnchor={anchor}>
          Target: {fmt(env.target_o2)}% O₂, {fmt(env.target_psi)} psi
        </text>
      </svg>

      <div className="legend">
        {series.map((s) => (
          <button key={s.id} type="button" className={`legend-item ${hidden.has(s.id) ? 'off' : ''}`}
            onClick={() => toggle(s.id)} aria-pressed={!hidden.has(s.id)}>
            <span className="legend-dot" style={{ background: colors[s.id] }} />
            {s.name}
            <span className="legend-sub">
              {s.kind === 'points' ? `${s.pts.length} tests` : 'range only'}
            </span>
          </button>
        ))}
      </div>
      <p className="chart-note">
        Dots are individual tests. Dashed boxes are ranges from the papers (no per-test table); some of
        their pressures are assumed cabin values, see each experiment's notes.
        {unplotted.length > 0 && ` Not plotted (no O₂/pressure data): ${unplotted.join(', ')}.`}
      </p>
    </div>
  );
}
