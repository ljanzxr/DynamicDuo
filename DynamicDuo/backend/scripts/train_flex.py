"""Train baseline models on cleaned FLEX (PSI-69) data.

Usage: python train_flex.py <PSI-69_FLEX_clean.csv> <models_dir>
Targets:
  1. is_extinction  - did the droplet end in true extinction (vs. disruption/completion)?
  2. burn_rate_mm2_s - droplet burning-rate constant.
CV is grouped by test day, so tests from the same session never sit on both sides.
"""
import json
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUM = ["x_o2_pct", "pressure_atm", "x_he", "x_co2_probable", "d0_mm"]
CAT = ["fuel"]
FEATURES = NUM + CAT


def prep(path):
    df = pd.read_csv(path, parse_dates=["date"])
    df = df.dropna(subset=NUM + ["fuel"]).copy()
    return df


def pre():
    return ColumnTransformer([("n", StandardScaler(), NUM), ("c", OneHotEncoder(handle_unknown="ignore"), CAT)])


def main(path, outdir):
    os.makedirs(outdir, exist_ok=True)
    df = prep(path)
    groups = df["date"].dt.strftime("%Y-%m-%d")
    cv = GroupKFold(n_splits=5)
    X = df[FEATURES]
    metrics = {"n_rows": int(len(df)), "cv": "GroupKFold(5) by test day"}

    # ---- classifier
    y = df["is_extinction"].values
    models = {
        "baseline_majority": DummyClassifier(strategy="prior"),
        "logistic": Pipeline([("p", pre()), ("m", LogisticRegression(max_iter=1000))]),
        "random_forest": Pipeline([("p", pre()), ("m", RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=0))]),
    }
    metrics["classifier"] = {"positive_rate": float(y.mean())}
    for name, m in models.items():
        p = cross_val_predict(m, X, y, cv=cv, groups=groups, method="predict_proba")[:, 1]
        metrics["classifier"][name] = {"roc_auc": float(roc_auc_score(y, p)), "accuracy": float(((p > 0.5) == y).mean())}
    best_c = Pipeline([("p", pre()), ("m", RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=0))]).fit(X, y)

    # ---- regressor: burning rate
    r = df.dropna(subset=["burn_rate_mm2_s"])
    r = r[r["burn_rate_mm2_s"] > 0.1]  # drop the 0.05 outlier row
    Xr, yr, gr = r[FEATURES], r["burn_rate_mm2_s"].values, r["date"].dt.strftime("%Y-%m-%d")
    regs = {
        "baseline_mean": DummyRegressor(),
        "random_forest": Pipeline([("p", pre()), ("m", RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=0))]),
    }
    metrics["regressor_burn_rate"] = {"n_rows": int(len(r)), "target_std": float(yr.std())}
    for name, m in regs.items():
        p = cross_val_predict(m, Xr, yr, cv=cv, groups=gr)
        metrics["regressor_burn_rate"][name] = {"mae": float(mean_absolute_error(yr, p)), "r2": float(r2_score(yr, p))}
    best_r = Pipeline([("p", pre()), ("m", RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=0))]).fit(Xr, yr)

    imp = best_c.named_steps["m"].feature_importances_
    names = NUM + list(best_c.named_steps["p"].named_transformers_["c"].get_feature_names_out(CAT))
    metrics["classifier_feature_importance"] = {n: round(float(v), 3) for n, v in sorted(zip(names, imp), key=lambda t: -t[1])}

    joblib.dump({"classifier": best_c, "regressor": best_r, "features": FEATURES}, os.path.join(outdir, "flex_model.joblib"))
    json.dump(metrics, open(os.path.join(outdir, "flex_metrics.json"), "w"), indent=2)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
