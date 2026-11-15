import { useState } from 'react';
import { predictFlex, getFlexMetrics } from '../api';

const FUELS = ['Methanol', 'Heptane'];

export default function PredictView() {
  const [form, setForm] = useState({
    fuel: 'Methanol',
    o2_pct: 21,
    pressure_atm: 1,
    d0_mm: 2.5,
    x_he: 0,
    x_co2: 0,
  });
  const [result, setResult] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showMetrics, setShowMetrics] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await predictFlex(form);
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    if (metrics) {
      setShowMetrics((v) => !v);
      return;
    }
    try {
      const m = await getFlexMetrics();
      setMetrics(m);
      setShowMetrics(true);
    } catch (err) {
      setError(err.message);
    }
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section>
      <h2 className="section-title">Predict droplet behavior (FLEX)</h2>
      <p className="muted">
        Statistical model trained on 260 real FLEX (PSI-69) tests with methanol and heptane droplets.
        Valid inside 12–34 % O₂ and 0.7–3 atm. Not a physical simulation — use for insight only.
      </p>

      <div className="panel" style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
        <label>
          Fuel
          <select value={form.fuel} onChange={(e) => update('fuel', e.target.value)}>
            {FUELS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>

        <label>
          Oxygen concentration (%)
          <input type="number" step="0.1" min="10" max="40" value={form.o2_pct}
            onChange={(e) => update('o2_pct', Number(e.target.value))} />
        </label>

        <label>
          Pressure (atm)
          <input type="number" step="0.1" min="0.5" max="3.5" value={form.pressure_atm}
            onChange={(e) => update('pressure_atm', Number(e.target.value))} />
        </label>

        <label>
          Initial droplet diameter (mm)
          <input type="number" step="0.1" min="0.5" max="5" value={form.d0_mm}
            onChange={(e) => update('d0_mm', Number(e.target.value))} />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Helium mole fraction
            <input type="number" step="0.01" min="0" max="1" value={form.x_he}
              onChange={(e) => update('x_he', Number(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            CO₂ mole fraction
            <input type="number" step="0.01" min="0" max="1" value={form.x_co2}
              onChange={(e) => update('x_co2', Number(e.target.value))} />
          </label>
        </div>

        <button type="button" onClick={run} disabled={loading} className="tab-on" style={{ padding: '10px 16px' }}>
          {loading ? 'Predicting…' : 'Run prediction'}
        </button>
      </div>

      {error && <div className="error-box" style={{ marginTop: 14 }}><p>{error}</p></div>}

      {result && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 8 }}>Result</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div className="muted">Extinction probability</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 600, color: result.extinction_probability > 0.5 ? 'var(--bad)' : 'var(--ok)' }}>
                {(result.extinction_probability * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="muted">Predicted burn rate</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>
                {result.predicted_burn_rate_mm2_s} mm²/s
              </div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>{result.note}</p>
        </div>
      )}

      <button type="button" onClick={loadMetrics} style={{ marginTop: 16, background: 'transparent', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: 8 }}>
        {showMetrics ? 'Hide' : 'Show'} model metrics
      </button>

      {showMetrics && metrics && (
        <div className="panel" style={{ marginTop: 10, fontSize: '0.9rem' }}>
          <p><strong>{metrics.n_rows}</strong> training rows · {metrics.cv}</p>
          <p>Classifier ROC-AUC: <strong>{metrics.classifier.logistic.roc_auc.toFixed(3)}</strong> (majority baseline {metrics.classifier.baseline_majority.roc_auc.toFixed(3)})</p>
          <p>Burn-rate R²: <strong>{metrics.regressor_burn_rate.random_forest.r2.toFixed(3)}</strong></p>
          <p className="muted">Top features: O₂ concentration, droplet diameter, pressure.</p>
        </div>
      )}
    </section>
  );
}
