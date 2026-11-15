# Flame in Freefall - AI + cleaned PSI data

## Where each file goes in the repo
| From this bundle | Put it in |
|---|---|
| backend/app.py (replaces yours; 2 new endpoints + LLM answer in /api/rag/query) | backend/app.py |
| backend/ai_features.py | backend/ai_features.py |
| backend/ml/flex_model.joblib, flex_metrics.json | backend/ml/ |
| backend/requirements.txt | backend/requirements.txt |
| data_clean/*.csv | backend/data/ |
| scripts/clean_psi.py, scripts/train_flex.py | backend/scripts/ |

## Run
    pip install -r backend/requirements.txt
    set ANTHROPIC_API_KEY=...        (PowerShell: $env:ANTHROPIC_API_KEY="...")
    uvicorn app:app --reload          (from backend/)

Without ANTHROPIC_API_KEY, /api/rag/query behaves as before (keyword passages).
With it, the answer is written by Claude from the retrieved passages and cites [n].

## New endpoints
- POST /api/predict/flex  {"fuel":"Methanol","o2_pct":21,"pressure_atm":1,"d0_mm":3}
- GET  /api/predict/flex/metrics

## Rebuild cleaned data / model
    python scripts/clean_psi.py <folder_with_raw_PSI_csvs> data_clean
    python scripts/train_flex.py data_clean/PSI-69_FLEX_clean.csv ml
Every fix is listed per row in the `qc_flags` column.

Model files were built with scikit-learn 1.9.1; reinstall the same version or rerun train_flex.py.
