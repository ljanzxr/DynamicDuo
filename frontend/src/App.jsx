import React, { useState, useEffect, useMemo } from 'react';
import { getEnvironments, getExperiments, getRanking, askQuestion } from './api';
import { mergeExperiments, SERIES_COLORS } from './utils';
import ExperimentCard from './components/ExperimentCard';
import CompareView from './components/CompareView';
import CoverageChart from './components/CoverageChart';
import GravityStrip from './components/GravityStrip';
import './App.css';
import './index.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('ranking');
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvId, setSelectedEnvId] = useState('lunar_base');
  const [rawExperiments, setRawExperiments] = useState([]);
  const [rankingResult, setRankingResult] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  
  // RAG State
  const [question, setQuestion] = useState('');
  const [ragData, setRagData] = useState(null);
  const [ragLoading, setRagLoading] = useState(false);

  useEffect(() => {
    getEnvironments().then(setEnvironments).catch(console.error);
    getExperiments().then(setRawExperiments).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedEnvId) {
      getRanking(selectedEnvId)
        .then((res) => {
          const mergedResults = mergeExperiments(res.results, rawExperiments);
          setRankingResult({ ...res, results: mergedResults });
        })
        .catch(console.error);
    }
  }, [selectedEnvId, rawExperiments]);

  const currentEnv = environments.find((e) => e.id === selectedEnvId) || environments[0];

  const colorMap = useMemo(() => {
    const map = {};
    rawExperiments.forEach((e, i) => {
      map[e.id] = SERIES_COLORS[i % SERIES_COLORS.length];
    });
    return map;
  }, [rawExperiments]);

  const handleToggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleRagSearch = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setRagLoading(true);
    try {
      const res = await askQuestion(question);
      setRagData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>🔥 Flame in Freefall</h1>
        <p>NASA Space Apps Challenge — Deterministic Combustion Safety & Habitat Engine</p>
      </header>

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} className={activeTab === 'ranking' ? 'tab-active' : ''}>
          1. Habitat Ranking & Gravity
        </button>
        <button role="tab" aria-selected={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')} className={activeTab === 'catalog' ? 'tab-active' : ''}>
          2. Experiment Catalog
        </button>
        <button role="tab" aria-selected={activeTab === 'compare'} onClick={() => setActiveTab('compare')} className={activeTab === 'compare' ? 'tab-active' : ''}>
          3. Side-by-Side Comparison {compareIds.length > 0 && `(${compareIds.length})`}
        </button>
        <button role="tab" aria-selected={activeTab === 'rag'} onClick={() => setActiveTab('rag')} className={activeTab === 'rag' ? 'tab-active' : ''}>
          4. NTRS RAG Assistant
        </button>
        <button role="tab" aria-selected={activeTab === 'earth'} onClick={() => setActiveTab('earth')} className={activeTab === 'earth' ? 'tab-active' : ''}>
          5. Earth Applications
        </button>
      </nav>

      <main className="main">
        {activeTab === 'ranking' && (
          <div className="space-y">
            <section className="panel">
              <h2>Select Target Habitat Environment</h2>
              <div className="env-btns">
                {environments.map((env) => (
                  <button
                    key={env.id}
                    type="button"
                    className={`env-btn ${selectedEnvId === env.id ? 'env-active' : ''}`}
                    onClick={() => setSelectedEnvId(env.id)}
                  >
                    <strong>{env.name}</strong>
                    <span>O₂: {env.target_o2}% | {env.target_psi} psi</span>
                  </button>
                ))}
              </div>
              {currentEnv && <GravityStrip gravity={currentEnv.gravity_g} />}
            </section>

            {rankingResult && (
              <section className="panel">
                <h2>Ignition & Flammability Coverage Chart</h2>
                <p className="muted">Comparing tested experiment conditions against your target habitat envelope.</p>
                <CoverageChart experiments={rankingResult.results} env={rankingResult.environment} colors={colorMap} />
              </section>
            )}

            <section>
              <h2>Ranked Experiments for {currentEnv?.name}</h2>
              <p className="muted">Transparent rule-based scoring calculated strictly from verified NASA parameters.</p>
              
              <div className="cards-grid">
                {rankingResult?.results.map((exp, idx) => (
                  <ExperimentCard
                    key={exp.id}
                    exp={exp}
                    rank={idx + 1}
                    env={rankingResult.environment}
                    color={colorMap[exp.id]}
                    inCompare={compareIds.includes(exp.id)}
                    compareFull={compareIds.length >= 3}
                    onToggleCompare={handleToggleCompare}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="space-y">
            <h2>Complete Experiment Catalog</h2>
            <p className="muted">All structured NASA microgravity combustion test campaigns mapped in the repository.</p>
            <div className="cards-grid">
              {rawExperiments.map((exp, idx) => (
                <ExperimentCard
                  key={exp.id}
                  exp={exp}
                  rank={idx + 1}
                  env={currentEnv}
                  color={colorMap[exp.id]}
                  inCompare={compareIds.includes(exp.id)}
                  compareFull={compareIds.length >= 3}
                  onToggleCompare={handleToggleCompare}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <CompareView
            experiments={rawExperiments}
            ids={compareIds}
            onChange={setCompareIds}
            envName={currentEnv?.name}
          />
        )}

        {activeTab === 'rag' && (
          <div className="panel">
            <h2>NTRS Technical Document RAG Assistant</h2>
            <p className="muted">Query local NASA technical reports indexed from <code>nasa_docs/</code> with exact page and file citations.</p>
            
            <form onSubmit={handleRagSearch} className="rag-form">
              <input
                type="text"
                placeholder="Ask about oxygen flammability, Saffire sensors, droplet extinction..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={ragLoading}>
                {ragLoading ? 'Searching PDFs...' : 'Search NTRS Docs'}
              </button>
            </form>

            {ragData && (
              <div className="rag-response">
                <h3>Query: "{ragData.question}"</h3>
                <p>{ragData.answer}</p>
                {ragData.citations?.map((c, i) => (
                  <div key={i} className="citation-box">
                    <strong>📄 {c.source_file} (Page {c.page_number})</strong>
                    <p>{c.excerpt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'earth' && (
          <div className="space-y">
            <h2>Terrestrial Spin-off Applications</h2>
            <p className="muted">Translating microgravity combustion physics into practical life-saving Earth technologies.</p>
            
            <div className="cards-grid">
              <article className="card">
                <h3>💧 Fine Water Mist Suppression</h3>
                <p>Derived from FLEX droplet combustion studies. Optimizes droplet atomization to suppress enclosed structural fires efficiently with minimal collateral water damage.</p>
              </article>
              <article className="card">
                <h3>🚨 Advanced Multi-Moment Smoke Detectors</h3>
                <p>Inspired by SAME aerosol experiments. Combines condensation nuclei counters and multi-angle optical scattering to eliminate nuisance dust and steam false alarms.</p>
              </article>
              <article className="card">
                <h3>🚒 High-Performance Firefighter Gear</h3>
                <p>Leverages flammability limit metrics from Saffire and BASS-II solid material tests to engineer superior thermal protective fabrics for extreme environments.</p>
              </article>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}