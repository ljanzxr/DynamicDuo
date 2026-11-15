# Flame in Freefall — DynamicDuo

**NASA Space Apps Challenge 2026**  
**Challenge:** Flame in Freefall — SI-Powered Fire Safety Insights from Microgravity Combustion Data

Interactive dashboard that ranks NASA microgravity combustion investigations (BASS-II, Saffire, FLEX, ACME, SAME, DAFT, SPICE…) against the fire-safety needs of real crew environments (Lunar Base, Pressurized Rover, ISS, Orion).

It also includes:
- Side-by-side comparison of experiments
- Source-grounded Q&A over NASA NTRS PDFs (keyword + optional Claude)
- Machine-learning prediction of droplet extinction and burn rate from cleaned FLEX (PSI-69) data

**Decision support only.** Does not replace NASA-STD-6001 testing or flight certification.

## Features

| Tab | What it does |
|-----|--------------|
| **Rank experiments** | Scores investigations against a chosen environment (O₂, pressure, airflow, safety pillars) |
| **Compare** | Side-by-side table of up to 3 experiments with same/diff highlighting |
| **Ask the sources** | Search + (optional) cited answers from indexed NASA PDFs |
| **Predict (FLEX)** | ML model trained on 260 real FLEX tests → extinction probability + burn rate |

## Quick start

### Backend
```bash
cd backend
pip install -r requirements.txt
# optional — enables Claude answers
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn app:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# optional
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

Open http://localhost:5173

## Data sources

- NASA Physical Science Informatics (PSI) cleaned tables: BASS-II (PSI-25), FLEX (PSI-69), CFI, Flame Design
- Curated experiment metadata in `backend/data/experiments.json` (objectives, conditions, sensors, findings, NTRS refs)
- Local NASA PDFs in `backend/nasa_docs/` (used by the RAG endpoint)

All ranking scores and predictions are derived from these public NASA sources. Every card and citation links back to the original document.

## Environment targets (configured in `backend/app.py`)

| Environment | Gravity | Target O₂ | Pressure | Airflow | Priority pillars |
|-------------|---------|-----------|----------|---------|------------------|
| Lunar Base | 0.16 g | 32% | 10.2 psi | 15 cm/s | Prevention, Detection |
| Pressurized Rover | 0.16 g | 34% | 8.2 psi | 20 cm/s | Prevention, Suppression |
| ISS | 0 g | 21% | 14.7 psi | 20 cm/s | Detection, Suppression |
| Orion Capsule | 0 g | 26.5% | 10.2 psi | 15 cm/s | Prevention, Detection |

## ML model (FLEX)

Trained on cleaned PSI-69 data (methanol & heptane droplets, 12–34 % O₂, 0.7–3 atm).  
Metrics are reported in `backend/ml/flex_metrics.json`.  
Valid only inside the training range — statistical model, not a physical simulator.

## Project structure

```
backend/          FastAPI + ranking + RAG + ML
frontend/         React + Vite dashboard
```

## Disclaimer

Independent student project for NASA Space Apps 2026.  
Not affiliated with, endorsed by, or a product of NASA.  
Rankings indicate relevance of existing research to a target environment; they are not fire-risk scores or safety certifications.

---

Made with 🔥 by DynamicDuo
