"""Clean NASA PSI experimental tables for Flame in Freefall.

Usage: python clean_psi.py <input_dir> <output_dir>
Looks for files by PSI number (PSI-69, PSI-10, PSI-25, PSI-39) in <input_dir>.
Every fix is recorded in a `qc_flags` column so nothing is silently changed.
"""
import glob
import io
import os
import sys

import numpy as np
import pandas as pd


def read_csv_any(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return pd.read_csv(io.StringIO(raw.decode(enc)), dtype=str, keep_default_na=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(path)


def num(series):
    """Strip '~' and text markers; return (float series, approx-flag series)."""
    s = series.astype(str).str.strip()
    approx = s.str.startswith("~")
    s = s.str.lstrip("~")
    return pd.to_numeric(s, errors="coerce"), approx


def add_flag(df, mask, text):
    df.loc[mask, "qc_flags"] = df.loc[mask, "qc_flags"].where(
        df.loc[mask, "qc_flags"] == "", df.loc[mask, "qc_flags"] + ";"
    ) + text


def find(indir, key):
    return sorted(glob.glob(os.path.join(indir, f"*{key}*.csv")))


def clean_flex(path):  # PSI-69
    df = read_csv_any(path)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={
        "FLEX Test #": "test_no", "FLEX Identifier": "identifier", "Test Date": "date",
        "Test GMT": "gmt", "Fuel": "fuel", "Ambient pressure; mmHg": "pressure_mmhg",
        "O initial ambient composition; mole fraction": "x_o2",
        "N initial ambient composition; mole fraction": "x_n2",
        "CO initial ambient composition; mole fraction": "x_co2_probable",
        "He initial ambient composition; mole fraction": "x_he",
        "Droplet initial diameter; mm": "d0_mm",
        "Visible flame extinction diameter; mm": "d_ext_mm",
        "Burning rate; mm": "burn_rate_mm2_s",
        "Burn time; s": "burn_time_s", "Test end": "test_end",
    })
    df["qc_flags"] = ""
    df = df[df["test_no"].str.strip() != ""].copy()
    for c in ["pressure_mmhg", "x_o2", "x_n2", "x_co2_probable", "x_he"]:
        df[c], _ = num(df[c])
    for c in ["d0_mm", "d_ext_mm", "burn_rate_mm2_s", "burn_time_s"]:
        df[c], approx = num(df[c])
        add_flag(df, approx, f"{c}_approx")
    miss = df["d0_mm"].isna()
    add_flag(df, miss, "d0_missing_in_source")
    # pressure of 0 is impossible
    bad_p = df["pressure_mmhg"] <= 0
    add_flag(df, bad_p, "pressure_0_invalid")
    df.loc[bad_p, "pressure_mmhg"] = np.nan
    df["pressure_atm"] = df["pressure_mmhg"] / 760.0
    df["date"] = pd.to_datetime(df["date"], format="mixed", errors="coerce")
    # duplicated rows (same id/date/gmt) -> keep first
    dup = df.duplicated(["identifier", "date", "gmt"], keep="first")
    print(f"  FLEX: dropped {int(dup.sum())} duplicate row(s): {df.loc[dup,'identifier'].tolist()}")
    df = df[~dup].copy()
    # a timestamp copied between two different identifiers
    same_ts = df.duplicated(["date", "gmt"], keep=False) & df["gmt"].ne("")
    add_flag(df, same_ts, "timestamp_shared_with_other_test")
    # composition sum
    comp = df[["x_o2", "x_n2", "x_co2_probable", "x_he"]].sum(axis=1)
    add_flag(df, (comp - 1).abs() > 0.03, "composition_sum_off")
    df["fuel"] = df["fuel"].str.strip()
    df["test_end"] = df["test_end"].str.strip()
    # true extinction vs. others (for ML target)
    df["is_extinction"] = (df["test_end"] == "Extinction").astype(int)
    df["x_o2_pct"] = df["x_o2"] * 100
    return df


def clean_flame_design(path, kind):  # PSI-10
    df = read_csv_any(path)
    df.columns = [c.strip() for c in df.columns]
    df["qc_flags"] = ""
    df["test"] = df["Test"].replace({"22042M1": "22024M1"})
    add_flag(df, df["Test"] == "22042M1", "test_id_typo_fixed(22042M1->22024M1)")
    text_cols = [c for c in df.columns if c not in ("Flame Type", "Day", "Fuel", "Test", "test", "qc_flags")]
    ramp = pd.Series(False, index=df.index)
    for c in text_cols:
        s = df[c].astype(str).str.strip()
        ramp |= s.str.upper().isin(["RAMP", "RAMPED", "LOW O2"])
        df[c] = pd.to_numeric(s, errors="coerce")
    df["is_ramp_or_special"] = ramp.astype(int)
    add_flag(df, ramp, "ramp_or_lowO2_values_blanked")
    df["Day"] = pd.to_numeric(df["Day"], errors="coerce")
    df["Test"] = df.pop("test")
    return df


def clean_bass2(path):  # PSI-25
    df = read_csv_any(path)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={
        "PI": "pi", "Test #": "test_id", "Date": "date", "GMT": "gmt", "Sample #": "sample_no",
        "Fuel Sample Material": "material", "Flow restrictor": "flow_restrictor",
        "Fan display": "fan_display_raw", "Air display": "air_display_raw",
        "Radiometer gain   (1000   250   50   10)": "radiometer_gain",
        "Total Frames Shot": "frames",
        "Calibrated  initial O2 % by vol": "o2_init_pct", "Calibrated final O2 % by vol": "o2_final_pct",
        "Initial CO2 % by vol": "co2_init_pct", "Final CO2 % by vol": "co2_final_pct",
        "Initial CO (ppm)": "co_init_ppm", "Final CO (ppm)": "co_final_ppm",
    })
    df.columns = [" ".join(c.split()) for c in df.columns]
    df["qc_flags"] = ""
    for c in ["o2_init_pct", "o2_final_pct", "co2_init_pct", "co2_final_pct", "co_init_ppm", "co_final_ppm"]:
        df[c], _ = num(df[c])
    df["frames"], _ = num(df["frames"])
    df["date"] = pd.to_datetime(df["date"], format="mixed", errors="coerce")
    # two tests have year 2018 but GMT day 175 matches 2014
    fix = df["date"].dt.year == 2018
    add_flag(df, fix, "year_2018_fixed_to_2014")
    df.loc[fix, "date"] = df.loc[fix, "date"].apply(lambda d: d.replace(year=2014))
    # implausible final O2 (a sample can't drop to ~1% or jump to 40%)
    bad = (df["o2_final_pct"] < 5) | (df["o2_final_pct"] > 30)
    add_flag(df, bad, "o2_final_implausible_blanked")
    df.loc[bad, "o2_final_pct"] = np.nan
    bad0 = (df["o2_init_pct"] < 5) | (df["o2_init_pct"] > 30)
    add_flag(df, bad0, "o2_init_implausible_blanked")
    df.loc[bad0, "o2_init_pct"] = np.nan
    df["o2_drop_pct"] = df["o2_init_pct"] - df["o2_final_pct"]
    df["co_rise_ppm"] = df["co_final_ppm"] - df["co_init_ppm"]
    return df


def clean_cfi(path):  # PSI-39
    df = read_csv_any(path)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={
        "Flex Number": "flex_no", "Test Date": "date", "Local Time": "time_est", "CIR": "cir",
        "Pressure": "pressure_raw", "Oxygen": "x_o2", "Nitrogen": "x_n2", "Helium": "x_he",
        "Fiber": "fiber", "Fuel": "fuel",
    })
    df["qc_flags"] = ""
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].str.strip()
    n0 = len(df)
    df = df.drop_duplicates().copy()
    print(f"  CFI: dropped {n0-len(df)} exact duplicate row(s)")
    # 1301: '29-Jul-17' sits between 29-Jun-17 and 5-Jul-17 -> typo
    typo = (df["flex_no"] == "1301") & (df["date"] == "29-Jul-17")
    add_flag(df, typo, "date_typo_fixed(29-Jul->29-Jun)")
    df.loc[typo, "date"] = "29-Jun-17"
    df["date"] = pd.to_datetime(df["date"], format="%d-%b-%y", errors="coerce")
    df["pressure_atm"] = pd.to_numeric(df["pressure_raw"].str.replace("atm", "", regex=False).str.strip(), errors="coerce")
    for c in ["x_o2", "x_n2", "x_he"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    comp = df[["x_o2", "x_n2", "x_he"]].sum(axis=1)
    add_flag(df, (comp - 1).abs() > 0.01, "gas_fractions_sum_not_1")
    df["fiber"] = df["fiber"].replace({"": np.nan})
    add_flag(df, df["fiber"].isna(), "fiber_missing")
    # fuel: pure dodecane, or dodecane/iso-dodecane blend
    frac = df["fuel"].str.extract(r"\[\.(\d+)\]/\[\.(\d+)\]").astype(float) / 100
    df["dodecane_frac"] = np.where(frac[0].notna(), frac[0], 1.0)
    df["iso_dodecane_frac"] = np.where(frac[1].notna(), frac[1], 0.0)
    # run code letter d=60/40, e=75/25: flag contradictions
    letter = df["cir"].str.extract(r"f\d+([a-z])\d+")[0]
    mism = ((letter == "d") & (df["dodecane_frac"] == 0.75)) | ((letter == "e") & (df["dodecane_frac"] == 0.60))
    add_flag(df, mism, "fuel_blend_contradicts_run_code")
    return df


if __name__ == "__main__":
    indir, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    jobs = [
        ("PSI-69", lambda p: clean_flex(p[0]), "PSI-69_FLEX_clean.csv"),
        ("PSI-25", lambda p: clean_bass2(p[0]), "PSI-25_BASS-II_clean.csv"),
        ("PSI-39", lambda p: clean_cfi(p[0]), "PSI-39_CFI_clean.csv"),
    ]
    for key, fn, out in jobs:
        p = find(indir, key)
        if not p:
            print(f"{key}: not found, skipped"); continue
        df = fn(p)
        df.to_csv(os.path.join(outdir, out), index=False, encoding="utf-8")
        n_flag = int((df["qc_flags"] != "").sum())
        print(f"{key}: {len(df)} rows -> {out} ({n_flag} flagged)")
    for kind in ("Normal", "Inverse"):
        p = find(indir, f"Flame_Design_{kind}")
        if p:
            df = clean_flame_design(p[0], kind)
            out = f"PSI-10_FlameDesign_{kind}_clean.csv"
            df.to_csv(os.path.join(outdir, out), index=False, encoding="utf-8")
            print(f"PSI-10 {kind}: {len(df)} rows -> {out} ({int(df['is_ramp_or_special'].sum())} ramp/special)")
