Flame in Freefall
NASA Space Apps Challenge 2026
Challenge: Flame in Freefall — SI-Powered Fire Safety Insights from Microgravity Combustion Data

Interactive web dashboard that helps researchers and engineers quickly find, rank, compare, and interpret NASA’s microgravity combustion experiments for real crew environments (Lunar Base, Pressurized Rover, ISS, and deep-space capsules).

What the Website Does
The dashboard has four main sections:

1. Rank Experiments
Choose a target environment (Lunar Base, Pressurized Rover, ISS, or Orion).
The system scores NASA investigations (BASS-II, Saffire, FLEX, ACME, SAME, SPICE, DAFT, etc.) based on how well their tested conditions match the environment.
Scoring considers:
Oxygen concentration
Cabin pressure
Airflow
Safety pillars (Prevention, Detection, Suppression)
Fuel type (solid materials get extra relevance)
Each experiment shows a score, breakdown, key findings, sensors, and hardware.
2. Compare
Select up to 3 experiments.
View them side-by-side.
The table automatically marks what is the same and what differs (objectives, fuels, conditions, sensors, etc.).
3. Ask the Sources
Search the indexed NASA NTRS PDF reports.
Returns matching passages with file name and page number.
Builds a clear local summary from the excerpts (no external API required).
If an Anthropic API key is added later, it can optionally generate a cited answer.
4. Predict (FLEX)
Machine-learning model trained on 260 real FLEX (PSI-69) droplet tests.
Input: fuel type, oxygen %, pressure, droplet diameter, and optional diluents.
Output: extinction probability and predicted burn rate.
Includes model metrics and validity range.
Data Sources
Cleaned experimental tables from NASA Physical Science Informatics (PSI):
BASS-II (PSI-25)
FLEX (PSI-69)
Cool Flames Investigation (CFI)
Flame Design
Curated metadata in backend/data/experiments.json (objectives, conditions, findings, sensors, NTRS references).
Local NASA NTRS PDF reports in backend/nasa_docs/ used by the search feature.
All rankings, comparisons, and predictions are derived from these public NASA sources. Every result links back to the original data or document.

Technology
Part	Technology
Frontend	React + Vite
Backend	FastAPI
ML Model	scikit-learn (trained on FLEX data)
Data	NASA PSI + NTRS
How to Run Locally
Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
Frontend
cd frontend
npm install
npm run dev
Open http://localhost:5173

The frontend connects to http://localhost:8000 by default.
To point it to a deployed backend, set VITE_API_URL in a .env file or in your hosting environment variables.

Deployment Notes
Frontend can be deployed on Netlify, Vercel, or GitHub Pages.
Backend can be deployed on Railway, Render, or similar.
After deploying the backend, set VITE_API_URL in the frontend hosting settings to the backend URL.
Important Disclaimer
This is an independent project created for the NASA Space Apps Challenge 2026.
It is not affiliated with, endorsed by, or a product of NASA.

Rankings and predictions are decision-support tools only. They do not replace official testing, NASA-STD-6001 requirements, or flight certification.

Project Structure
backend/          FastAPI server, ranking engine, RAG search, ML model
frontend/         React dashboard
Made with 🔥 by DynamicDuo
