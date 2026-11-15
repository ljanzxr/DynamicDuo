import { useEffect, useMemo, useState } from 'react';
import { API_BASE, getEnvironments, getExperiments, getRanking } from './api';
import { PILLAR_STYLE, SERIES_COLORS, mergeExperiments } from './utils';
import GravityStrip from './components/GravityStrip';
import CoverageChart from './components/CoverageChart';
import ExperimentCard from './components/ExperimentCard';
import CompareView from './components/CompareView';
import AskView from './components/AskView';
import PredictView from './components/PredictView';

const TABS = [
  { id: 'rank', label: 'Rank experiments' },
  { id: 'compare', label: 'Compare' },
  { id: 'ask', label: 'Ask the sources' },
  { id: 'predict', label: 'Predict (FLEX)' },
];

function Header({ tab, onTab, compareCount }) {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="flame" aria-hidden="true">🔥</span>
          <div>
            <h1>Flame in Freefall</h1>
            <p>NASA microgravity combustion research, ranked for the spacecraft you are designing</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'tab-on' : ''}`}
              onClick={() => onTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}{t.id === 'compare' && compareCount > 0 ? ` (${compareCount})` : ''}
            </button>
          ))}
        </nav>
      </header>
      <p className="disclaimer">
        Decision support only. It does not replace flight-rated testing or NASA-STD-6001 requirements.
        Every number links back to a NASA source; check the source before relying on it.
      </p>
    </>
  );
}

function TargetPanel({ env }) {
  return (
    <div>
      <div className="targets">
        <span className="chip">Target O₂ <strong>{env.target_o2}%</strong></span>
        <span className="chip">Pressure <strong>{env.target_psi} psi</strong></span>
        <span className="chip">Airflow <strong>{env.target_airflow_cm_s} cm/s</strong></span>
        <span className="chip">Gravity <strong>{env.gravity_g} g</strong></span>
        {(env.priority_pillars || []).map((p) => (
          <span key={p} className="chip">
            <span className="chip-dot" style={{ background: PILLAR_STYLE[p]?.color || '#888' }} />
            Priority: {p}
          </span>
        ))}
      </div>
      <p className="targets-note">
        These targets are the ranking engine's configured assumptions for this environment (ENVIRONMENTS in app.py).
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('rank');
  const [environments, setEnvironments] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [envId, setEnvId] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [rankError, setRankError] = useState(null); // { envId, message }
  const [bootError, setBootError] = useState(null);
  const [compareIds, setCompareIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEnvironments(), getExperiments()])
      .then(([envs, exps]) => {
        if (cancelled) return;
        setEnvironments(envs);
        setExperiments(exps);
        setEnvId(envs.some((e) => e.id === 'lunar_base') ? 'lunar_base' : envs[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setBootError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!envId) return undefined;
    let cancelled = false;
    getRanking(envId)
      .then((data) => {
        if (!cancelled) setRanking(data);
      })
      .catch((err) => {
        if (!cancelled) setRankError({ envId, message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [envId]);

  const env = useMemo(() => environments.find((e) => e.id === envId) || null, [environments, envId]);
  const ready = !!ranking && ranking.environment?.id === envId;
  const currentError = rankError && rankError.envId === envId ? rankError.message : null;
  const loading = !!envId && !ready && !currentError;

  const merged = useMemo(
    () => (ready ? mergeExperiments(ranking.results, experiments) : []),
    [ready, ranking, experiments]
  );
  const colors = useMemo(
    () => Object.fromEntries(experiments.map((e, i) => [e.id, SERIES_COLORS[i % SERIES_COLORS.length]])),
    [experiments]
  );
  const comparable = merged.length ? merged : experiments;

  const toggleCompare = (id) =>
    setCompareIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 3 ? ids : [...ids, id]
    );

  if (bootError) {
    return (
      <div className="app">
        <Header tab={tab} onTab={setTab} compareCount={0} />
        <div className="error-box">
          <h2>Cannot load data from the backend</h2>
          <p>{bootError}</p>
          <p>
            Start it with <code>cd backend</code> then <code>uvicorn app:app --reload</code>. The frontend
            is calling <code>{API_BASE}</code> (change it with <code>VITE_API_URL</code> in frontend/.env).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header tab={tab} onTab={setTab} compareCount={compareIds.length} />

      {tab === 'rank' && (
        <section>
          {environments.length === 0 ? (
            <p className="loading">Loading environments…</p>
          ) : (
            <>
              <h2 className="section-title">1. Choose the environment you are designing for</h2>
              <div className="env-grid" role="group" aria-label="Environment">
                {environments.map((e) => (
                  <button key={e.id} type="button" className={`env ${e.id === envId ? 'env-on' : ''}`}
                    onClick={() => setEnvId(e.id)} aria-pressed={e.id === envId}>
                    <strong>{e.name}</strong>
                    <span>{e.target_o2}% O₂ · {e.target_psi} psi · {e.gravity_g} g</span>
                  </button>
                ))}
              </div>

              {env && <TargetPanel env={env} />}
              {env && <GravityStrip gravity={env.gravity_g} />}

              {currentError && (
                <div className="error-box" style={{ marginTop: 16 }}>
                  <p>{currentError}</p>
                </div>
              )}
              {loading && <p className="loading">Ranking experiments…</p>}

              {ready && env && (
                <>
                  <h2 className="section-title">2. Where the tested conditions sit relative to your target</h2>
                  <div className="panel">
                    <CoverageChart experiments={merged} env={env} colors={colors} />
                  </div>

                  <h2 className="section-title">3. Experiments ranked for {env.name}</h2>
                  <div className="cards">
                    {merged.map((exp, i) => (
                      <ExperimentCard key={exp.id} exp={exp} rank={i + 1} env={env} color={colors[exp.id]}
                        inCompare={compareIds.includes(exp.id)} compareFull={compareIds.length >= 3}
                        onToggleCompare={toggleCompare} />
                    ))}
                  </div>

                  <details className="how">
                    <summary>How the score works</summary>
                    <p>
                      Each experiment gets up to 100 points: oxygen match up to 35, pressure up to 30,
                      airflow up to 15, safety pillars up to 15 and solid-fuel relevance 5. The score
                      compares condition ranges, so a high score does not mean a single test ran at your
                      target. Use “Nearest test actually run” on each card, and the chart, to see what was
                      really tested.
                    </p>
                  </details>
                </>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'compare' && (
        <CompareView experiments={comparable} ids={compareIds} onChange={setCompareIds} envName={env?.name} />
      )}

      {tab === 'ask' && <AskView />}

      {tab === 'predict' && <PredictView />}

      <p className="footer">
        Sources: NASA NTRS reports and PSI tables listed on each experiment. All experiments ran in
        microgravity; no partial-gravity combustion data exists in PSI yet.
      </p>
    </div>
  );
}
