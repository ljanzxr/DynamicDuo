import { useState } from 'react';
import {
  PILLAR_STYLE,
  confidenceTone,
  fmt,
  fmtRange,
  nearestTestPoint,
  pointExtras,
  statusTone,
} from '../utils';

function Badge({ tone = 'muted', title, children }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

function List({ items, empty }) {
  if (!items || !items.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="list">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

const signed = (v) => `${v > 0 ? '+' : ''}${fmt(v)}`;

function Details({ exp }) {
  const c = exp.conditions || {};
  const tv = exp.test_variables;
  return (
    <div className="details">
      {exp.score_breakdown?.length > 0 && (
        <div>
          <h4>Score breakdown</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Criterion</th><th>Points</th><th>Why</th></tr>
              </thead>
              <tbody>
                {exp.score_breakdown.map((b, i) => (
                  <tr key={i}>
                    <td>{b.criterion}</td>
                    <td>{b.points}</td>
                    <td>{b.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h4>Conditions tested</h4>
        <dl className="kv">
          <dt>Oxygen</dt><dd>{fmtRange(c.o2_min, c.o2_max, '%')}</dd>
          <dt>Pressure</dt><dd>{fmtRange(c.pressure_psi_min, c.pressure_psi_max, ' psi')}</dd>
          <dt>Airflow</dt><dd>{fmtRange(c.airflow_cm_s_min, c.airflow_cm_s_max, ' cm/s')}</dd>
          {exp.pillars_basis && (<><dt>Pillar basis</dt><dd>{exp.pillars_basis}</dd></>)}
        </dl>
      </div>

      <div>
        <h4>Fuel and hardware</h4>
        <dl className="kv">
          <dt>Fuel type</dt><dd>{exp.fuel?.category || '—'}</dd>
          <dt>Materials</dt>
          <dd>{exp.fuel?.materials?.length ? exp.fuel.materials.join('; ') : '—'}</dd>
          <dt>Geometry</dt><dd>{exp.fuel?.geometry || '—'}</dd>
          <dt>Facility</dt><dd>{exp.hardware?.facility || '—'}</dd>
          <dt>Apparatus</dt><dd>{exp.hardware?.apparatus || '—'}</dd>
        </dl>
      </div>

      <div>
        <h4>Measurements</h4>
        <List items={exp.sensors} empty="Not listed in the sources read." />
      </div>

      {tv && (
        <div>
          <h4>Same vs different between tests</h4>
          <dl className="kv">
            <dt>Held constant</dt><dd>{tv.constant}</dd>
            <dt>Varied</dt><dd>{tv.varied}</dd>
          </dl>
        </div>
      )}

      {exp.key_findings?.length > 0 && (
        <div>
          <h4>Key findings</h4>
          <ul className="list">
            {exp.key_findings.map((f, i) => {
              const item = typeof f === 'string' ? { text: f } : f;
              return (
                <li key={i}>
                  {item.text}
                  {item.source && <span className="src"> — {item.source}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {exp.notes?.length > 0 && (
        <div>
          <h4>Notes and caveats</h4>
          <List items={exp.notes} />
        </div>
      )}

      {exp.data_quality?.length > 0 && (
        <div>
          <h4>Data quality</h4>
          <List items={exp.data_quality} />
        </div>
      )}

      <div>
        <h4>Sources</h4>
        {exp.sources?.length > 0 ? (
          <ul className="list">
            {exp.sources.map((s, i) => (
              <li key={i}>
                <code>{s.file}</code>
                {s.ntrs && s.ntrs !== '-' ? ` · NTRS ${s.ntrs}` : ''}
                {s.where ? ` · ${s.where}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{exp.ntrs_reference || 'No source listed.'}</p>
        )}
      </div>
    </div>
  );
}

export default function ExperimentCard({
  exp, rank, env, color, inCompare, compareFull, onToggleCompare,
}) {
  const [open, setOpen] = useState(false);
  const nearest = nearestTestPoint(exp, env);
  const pillars = exp.safety_pillars || [];

  return (
    <article className="card" style={{ borderLeftColor: color }}>
      <div className="card-top">
        <div className="rank" style={{ color }}>#{rank}</div>
        <div className="card-title">
          <h3>{exp.name}</h3>
          <p className="muted">{exp.full_name}</p>
        </div>
        <div className="score" title="Rule-based match against the selected environment">
          <span className="score-num">{exp.match_score}</span>
          <span className="score-of">/100</span>
          <div className="bar"><div className="bar-fill" style={{ width: `${exp.match_score}%` }} /></div>
        </div>
      </div>

      <div className="chips">
        {pillars.length === 0 && <Badge>No safety pillar assigned</Badge>}
        {pillars.map((p) => (
          <span key={p} className="chip">
            <span className="chip-dot" style={{ background: PILLAR_STYLE[p]?.color || '#888' }} />
            {p}
          </span>
        ))}
        {exp.relevance && (
          <Badge tone={exp.relevance === 'direct' ? 'ok' : 'muted'}>
            {exp.relevance === 'direct' ? 'Direct relevance' : 'Indirect relevance'}
          </Badge>
        )}
        {exp.confidence && (
          <Badge tone={confidenceTone(exp.confidence)} title="Confidence in the catalog entry">
            Confidence: {exp.confidence}
          </Badge>
        )}
        {exp.data_status && (
          <Badge tone={statusTone(exp.data_status)} title="How well the numbers are backed by sources">
            {exp.data_status}
          </Badge>
        )}
      </div>

      <p className="objective">{exp.objective}</p>

      {nearest ? (
        <p className="nearest">
          <strong>Nearest test actually run:</strong> {exp.name} {nearest.point.id} at{' '}
          {fmt(nearest.point.o2)}% O₂ and {fmt(nearest.point.p_psi)} psi
          {pointExtras(nearest.point) ? ` (${pointExtras(nearest.point)})` : ''}, which is{' '}
          {signed(nearest.dO2)} % O₂ and {signed(nearest.dP)} psi from your target.
        </p>
      ) : (
        <p className="nearest muted">
          No per-test table for this experiment, so the score compares ranges only.
        </p>
      )}

      <div className="card-actions">
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide details' : 'Score breakdown and details'}
        </button>
        <button type="button" className={`btn ${inCompare ? 'btn-on' : ''}`}
          onClick={() => onToggleCompare(exp.id)} disabled={!inCompare && compareFull}
          title={!inCompare && compareFull ? 'Compare up to 3 experiments' : undefined}>
          {inCompare ? '✓ In comparison' : 'Compare'}
        </button>
      </div>

      {open && <Details exp={exp} />}
    </article>
  );
}
