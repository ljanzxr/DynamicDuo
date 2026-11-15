"""AI features for Flame in Freefall.

1. predict_flex(): ML model trained on NASA PSI-69 (FLEX droplet-combustion tests).
2. generate_answer(): turns retrieved NTRS passages into a written, cited answer
   using the Claude API. Needs the ANTHROPIC_API_KEY environment variable; if it
   is missing or the call fails, the caller keeps the plain passage list.
"""
import json
import os

import joblib
import pandas as pd

_HERE = os.path.dirname(__file__)
_MODEL = None


def _load():
    global _MODEL
    if _MODEL is None:
        _MODEL = joblib.load(os.path.join(_HERE, "ml", "flex_model.joblib"))
    return _MODEL


def flex_metrics():
    with open(os.path.join(_HERE, "ml", "flex_metrics.json"), encoding="utf-8") as f:
        return json.load(f)


def predict_flex(fuel, o2_pct, pressure_atm, d0_mm, x_he=0.0, x_co2=0.0):
    m = _load()
    row = pd.DataFrame([{
        "x_o2_pct": o2_pct, "pressure_atm": pressure_atm, "x_he": x_he,
        "x_co2_probable": x_co2, "d0_mm": d0_mm, "fuel": fuel,
    }])[m["features"]]
    p_ext = float(m["classifier"].predict_proba(row)[0, 1])
    rate = float(m["regressor"].predict(row)[0])
    return {
        "extinction_probability": round(p_ext, 3),
        "predicted_burn_rate_mm2_s": round(rate, 3),
        "inputs": row.iloc[0].to_dict(),
        "note": "Trained on 260 FLEX tests (methanol/heptane droplets, 12-34% O2, 0.7-3 atm). "
                "Valid only inside that range; this is a statistical model, not a physical simulation.",
    }


SYSTEM = (
    "You answer questions about NASA microgravity combustion research. "
    "Use ONLY the numbered passages provided. Cite every claim as [n] using the passage number. "
    "If the passages do not contain the answer, say so plainly. Keep it under 150 words. "
    "Reply in the same language as the question."
)


def generate_answer(question, citations):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not citations:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key)
        passages = "\n\n".join(
            f"[{i}] ({c['source_file']}, p.{c['page_number']}) {c['excerpt']}"
            for i, c in enumerate(citations, 1)
        )
        msg = client.messages.create(
            model=os.environ.get("ANSWER_MODEL", "claude-sonnet-5-5"),
            max_tokens=500,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"Question: {question}\n\nPassages:\n{passages}"}],
        )
        return "".join(b.text for b in msg.content if b.type == "text").strip()
    except Exception as e:  # never break the endpoint because the LLM call failed
        print(f"LLM answer failed: {e}")
        return None
