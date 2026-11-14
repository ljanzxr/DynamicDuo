from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import pypdf

app = FastAPI(
    title="Flame in Freefall - NASA Space Apps Engine",
    version="2.5",
    description="Deterministic ranking engine and NASA NTRS RAG search system."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "data", "experiments.json")
DOCS_PATH = os.path.join(BASE_DIR, "nasa_docs")

def load_experiments():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

ENVIRONMENTS = {
    "lunar_base": {
        "id": "lunar_base",
        "name": "Lunar Base Habitat",
        "gravity_g": 0.16,
        "target_o2": 32.0,
        "target_psi": 10.2,
        "target_airflow_cm_s": 15.0,
        "priority_pillars": ["Prevention", "Detection"]
    },
    "pressurized_rover": {
        "id": "pressurized_rover",
        "name": "Pressurized Exploration Rover",
        "gravity_g": 0.16,
        "target_o2": 34.0,
        "target_psi": 8.2,
        "target_airflow_cm_s": 20.0,
        "priority_pillars": ["Prevention", "Suppression"]
    },
    "iss": {
        "id": "iss",
        "name": "International Space Station (ISS)",
        "gravity_g": 0.0,
        "target_o2": 21.0,
        "target_psi": 14.7,
        "target_airflow_cm_s": 20.0,
        "priority_pillars": ["Detection", "Suppression"]
    },
    "orion_capsule": {
        "id": "orion_capsule",
        "name": "Deep Space Transit Capsule (Orion)",
        "gravity_g": 0.0,
        "target_o2": 26.5,
        "target_psi": 10.2,
        "target_airflow_cm_s": 15.0,
        "priority_pillars": ["Prevention", "Detection"]
    }
}

PDF_CHUNKS = []

def index_nasa_pdfs():
    global PDF_CHUNKS
    if PDF_CHUNKS or not os.path.exists(DOCS_PATH):
        return
    for filename in os.listdir(DOCS_PATH):
        if filename.lower().endswith(".pdf"):
            filepath = os.path.join(DOCS_PATH, filename)
            try:
                reader = pypdf.PdfReader(filepath)
                for page_num, page in enumerate(reader.pages, start=1):
                    text = page.extract_text() or ""
                    if text.strip():
                        PDF_CHUNKS.append({
                            "source": filename,
                            "page": page_num,
                            "text": text
                        })
            except Exception as e:
                print(f"Error reading {filename}: {e}")

@app.on_event("startup")
def startup_event():
    index_nasa_pdfs()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Flame in Freefall API Active",
        "experiments_loaded": len(load_experiments())
    }

@app.get("/api/environments")
def get_environments():
    return list(ENVIRONMENTS.values())

@app.get("/api/experiments")
def get_experiments():
    return load_experiments()

@app.get("/api/rank/{env_id}")
def rank_experiments(env_id: str):
    env = ENVIRONMENTS.get(env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment configuration not found")

    experiments = load_experiments()
    ranked_results = []

    for exp in experiments:
        score = 0
        breakdown = []
        cond = exp.get("conditions", {})

        # 1. Oxygen Concentration Match (Max 35 pts)
        o2_min = cond.get("o2_min")
        o2_max = cond.get("o2_max")
        if o2_min is not None and o2_max is not None:
            if o2_min <= env["target_o2"] <= o2_max:
                score += 35
                breakdown.append({
                    "criterion": "Oxygen Concentration",
                    "points": "+35",
                    "reason": f"Directly covers target {env['target_o2']}% O2 (Range: {o2_min}% - {o2_max}%)."
                })
            elif min(abs(o2_min - env["target_o2"]), abs(o2_max - env["target_o2"])) <= 6.0:
                score += 20
                breakdown.append({
                    "criterion": "Oxygen Concentration",
                    "points": "+20",
                    "reason": f"Within 6% of target {env['target_o2']}% O2 (Range: {o2_min}% - {o2_max}%)."
                })
            else:
                breakdown.append({
                    "criterion": "Oxygen Concentration",
                    "points": "+0",
                    "reason": f"Tested outside target {env['target_o2']}% O2 (Range: {o2_min}% - {o2_max}%)."
                })

        # 2. Cabin Pressure Match (Max 30 pts)
        p_min = cond.get("pressure_psi_min")
        p_max = cond.get("pressure_psi_max")
        if p_min is not None and p_max is not None:
            if p_min <= env["target_psi"] <= p_max:
                score += 30
                breakdown.append({
                    "criterion": "Cabin Pressure",
                    "points": "+30",
                    "reason": f"Matches target {env['target_psi']} psi (Range: {p_min} - {p_max} psi)."
                })
            elif min(abs(p_min - env["target_psi"]), abs(p_max - env["target_psi"])) <= 3.0:
                score += 15
                breakdown.append({
                    "criterion": "Cabin Pressure",
                    "points": "+15",
                    "reason": f"Close to target {env['target_psi']} psi (Tested: {p_min} - {p_max} psi)."
                })
            else:
                score += 5
                breakdown.append({
                    "criterion": "Cabin Pressure",
                    "points": "+5",
                    "reason": f"Tested at {p_max} psi; requires pressure scaling for {env['target_psi']} psi."
                })

        # 3. Airflow Match (Max 15 pts)
        flow_min = cond.get("airflow_cm_s_min")
        flow_max = cond.get("airflow_cm_s_max")
        if flow_min is not None and flow_max is not None:
            if flow_min <= env["target_airflow_cm_s"] <= flow_max:
                score += 15
                breakdown.append({
                    "criterion": "Ventilation Airflow",
                    "points": "+15",
                    "reason": f"Includes target {env['target_airflow_cm_s']} cm/s flow."
                })
            else:
                score += 5
                breakdown.append({
                    "criterion": "Ventilation Airflow",
                    "points": "+5",
                    "reason": f"Tested at {flow_min} - {flow_max} cm/s flow."
                })
        else:
            score += 5
            breakdown.append({
                "criterion": "Ventilation Airflow",
                "points": "+5",
                "reason": "Quiescent / no forced flow specified."
            })

        # 4. Safety Pillars & Fuel (Max 20 pts)
        exp_pillars = exp.get("safety_pillars", [])
        matched_pillars = set(exp_pillars).intersection(set(env["priority_pillars"]))
        if matched_pillars:
            score += 15
            breakdown.append({
                "criterion": "Safety Pillars",
                "points": "+15",
                "reason": f"Addresses environment priority pillars: {', '.join(matched_pillars)}."
            })

        fuel_cat = exp.get("fuel", {}).get("category", "")
        if "Solid" in fuel_cat:
            score += 5
            breakdown.append({
                "criterion": "Fuel Relevance",
                "points": "+5",
                "reason": "Evaluates solid cabin materials."
            })

        ranked_results.append({
            "id": exp.get("id"),
            "name": exp.get("name"),
            "full_name": exp.get("full_name"),
            "objective": exp.get("objective"),
            "fuel": exp.get("fuel"),
            "conditions": cond,
            "sensors": exp.get("sensors", []),
            "hardware": exp.get("hardware", {}),
            "safety_pillars": exp_pillars,
            "ntrs_reference": exp.get("ntrs_reference"),
            "key_findings": exp.get("key_findings", []),
            "confidence": exp.get("confidence", "high"),
            "match_score": min(score, 100),
            "score_breakdown": breakdown
        })

    ranked_results.sort(key=lambda x: x["match_score"], reverse=True)
    return {
        "environment": env,
        "results": ranked_results
    }

@app.post("/api/rag/query")
def rag_query(payload: dict):
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    if not PDF_CHUNKS:
        index_nasa_pdfs()

    keywords = [w.lower() for w in question.split() if len(w) > 3]
    scored_chunks = []

    for chunk in PDF_CHUNKS:
        text_lower = chunk["text"].lower()
        hits = sum(1 for kw in keywords if kw in text_lower)
        if hits > 0:
            idx = text_lower.find(next(kw for kw in keywords if kw in text_lower))
            start = max(0, idx - 150)
            end = min(len(chunk["text"]), idx + 350)
            snippet = chunk["text"][start:end].replace("\n", " ").strip()
            
            scored_chunks.append({
                "score": hits,
                "source_file": chunk["source"],
                "page_number": chunk["page"],
                "excerpt": f"...{snippet}..."
            })

    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    top_matches = scored_chunks[:4]

    if not top_matches:
        return {
            "question": question,
            "answer": "No direct match found across the indexed NASA NTRS documents for those specific terms.",
            "citations": []
        }

    return {
        "question": question,
        "answer": f"Found {len(top_matches)} relevant passages across NASA NTRS technical reports:",
        "citations": top_matches
    }