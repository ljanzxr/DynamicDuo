import { useMemo } from 'react';
import { fmtRange } from '../utils';

const joinList = (a) => (Array.isArray(a) && a.length ? a.join('; ') : '—');

// diff: false = long free text, "same / differs" tag would be noise
function buildRows(envName) {
  return [
    {
      label: envName ? `Match score (${envName})` : 'Match score',
      get: (e) => (e.match_score != null ? `${e.match_score}/100` : '—'),
      diff: false,
    },
    { label: 'Objective', get: (e) => e.objective || '—', diff: false },
    { label: 'Fuel type', get: (e) => e.fuel?.category || '—' },
    { label: 'Materials', get: (e) => joinList(e.fuel?.materials) },
    { label: 'Sample / burner geometry', get: (e) => e.fuel?.geometry || '—', diff: false },
    { label: 'Oxygen', get: (e) => fmtRange(e.conditions?.o2_min, e.conditions?.o2_max, '%') },
    {
      label: 'Pressure',
      get: (e) => fmtRange(e.conditions?.pressure_psi_min, e.conditions?.pressure_psi_max, ' psi'),
    },
    {
      label: 'Airflow',
      get: (e) => fmtRange(e.conditions?.airflow_cm_s_min, e.conditions?.airflow_cm_s_max, ' cm/s'),
    },
    { label: 'Facility', get: (e) => e.hardware?.facility || '—' },
    { label: 'Apparatus', get: (e) => e.hardware?.apparatus || '—', diff: false },
    { label: 'Measurements', get: (e) => joinList(e.sensors), diff: false },
    { label: 'Safety pillars', get: (e) => (e.safety_pillars?.length ? e.safety_pillars.join(', ') : 'none assigned') },
    { label: 'Held constant', get: (e) => e.test_variables?.constant || '—', diff: false },
    { label: 'Varied between tests', get: (e) => e.test_variables?.varied || '—', diff: false },
    { label: 'Tabulated test points', get: (e) => (e.test_points?.length ? String(e.test_points.length) : 'none') },
    { label: 'Data status', get: (e) => e.data_status || '—' },
    { label: 'Confidence', get: (e) => e.confidence || '—' },
    {
      label: 'Sources',
      get: (e) => (e.sources?.length ? e.sources.map((s) => s.file).join('; ') : e.ntrs_reference || '—'),
      diff: false,
    },
  ];
}

export default function CompareView({ experiments, ids, onChange, envName }) {
  const selected = useMemo(
    () => ids.map((id) => experiments.find((e) => e.id === id)).filter(Boolean),
    [ids, experiments]
  );
  const available = experiments.filter((e) => !ids.includes(e.id));
  const rows = useMemo(() => buildRows(envName), [envName]);
  const full = ids.length >= 3;

  return (
    <section>
      <h2 className="section-title">Compare experiments side by side</h2>
      <p className="muted">
        Pick two or three. Each row is tagged <span className="tag tag-same">same</span> or{' '}
        <span className="tag tag-diff">differs</span> so you can see at a glance what the experiments
        share and where they diverge.
      </p>

      <div className="pickers">
        {selected.map((e) => (
          <span key={e.id} className="pick">
            {e.name}
            <button type="button" onClick={() => onChange(ids.filter((x) => x !== e.id))}
              aria-label={`Remove ${e.name}`}>×</button>
          </span>
        ))}
        <select value="" disabled={full || available.length === 0} aria-label="Add an experiment"
          onChange={(ev) => ev.target.value && onChange([...ids, ev.target.value])}>
          <option value="">{full ? 'Maximum of 3 reached' : 'Add an experiment…'}</option>
          {available.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {selected.length < 2 ? (
        <p className="warn-box">
          Select at least two experiments here, or press “Compare” on the ranking cards.
        </p>
      ) : (
        <div className="table-wrap panel">
          <table className="compare">
            <thead>
              <tr>
                <th />
                {selected.map((e) => (
                  <th key={e.id}>{e.name}<div className="muted">{e.full_name}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = selected.map(row.get);
                const same = vals.every((v) => v === vals[0]);
                return (
                  <tr key={row.label}>
                    <td>
                      {row.label}
                      {row.diff !== false && (
                        <span className={`tag ${same ? 'tag-same' : 'tag-diff'}`}>
                          {same ? 'same' : 'differs'}
                        </span>
                      )}
                    </td>
                    {vals.map((v, i) => (
                      <td key={selected[i].id}>{v}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
