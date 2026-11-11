"""
============================================================
نموذج AI هجين للتنبؤ بانتشار اللهب وخطر اللهب البارد
Multi-Task Learning: Regression + Binary Classification
============================================================
المتطلبات:
    pip install torch numpy pandas scikit-learn xgboost

التشغيل:
    1. ضع بياناتك في: data/fire_data.csv
    2. python fire_model.py
============================================================
"""

import copy
import warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import RobustScaler, OneHotEncoder
from sklearn.model_selection import train_test_split
from sklearn.impute import IterativeImputer
from sklearn.metrics import (
    mean_squared_error, roc_auc_score, average_precision_score,
    classification_report, confusion_matrix, f1_score
)

warnings.filterwarnings("ignore")

# ============================================================
#الإعدادات المركزية
# ============================================================
class CFG:
    data_path       = "data/fire_data.csv"
    target_reg      = "Target_Flame_Spread_Rate"
    target_cls      = "Target_Cool_Flame_Risk"
    material_col    = "Material_Type"

    numeric_cols = [
        "Gravity_Level", "Oxygen_Concentration", "Ambient_Pressure",
        "Airflow_Velocity", "Material_Thickness"
    ]

    # التقسيم
    test_size     = 0.15
    val_size      = 0.15
    random_seed   = 42

    # النموذج
    hidden_dims   = [128, 64]
    dropout       = 0.3

    # التدريب
    batch_size    = 64
    epochs        = 150
    lr            = 1e-3
    weight_decay  = 1e-4
    patience      = 20

    # أوزان الخسارة
    lambda_reg    = 1.0
    lambda_cls    = 2.0

    # جهاز
    device = "cuda" if torch.cuda.is_available() else "cpu"


# ============================================================
#هندسة الميزات
# ============================================================
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """إضافة ميزات فيزيائية مبررة."""
    df = df.copy()
    df["is_microgravity"]      = (df["Gravity_Level"] < 0.1).astype(int)
    df["gravity_x_oxygen"]     = df["Gravity_Level"] * df["Oxygen_Concentration"]
    df["has_airflow"]          = (df["Airflow_Velocity"] > 0).astype(int)
    df["flammability_index"]   = df["Oxygen_Concentration"] * df["Airflow_Velocity"]
    df["oxygen_pressure_ratio"] = (
        df["Oxygen_Concentration"] / df["Ambient_Pressure"].replace(0, np.nan)
    )
    return df


# ============================================================
#المعالجة المسبقة والتقسيم
# ============================================================
def prepare_data(df: pd.DataFrame) -> dict:
    df = engineer_features(df)

    # الأهداف
    y_reg = np.log1p(df[CFG.target_reg].values.astype(np.float32))
    y_cls = df[CFG.target_cls].values.astype(np.float32)

    # الميزات الرقمية
    num_cols = CFG.numeric_cols + [
        "is_microgravity", "gravity_x_oxygen", "has_airflow",
        "flammability_index", "oxygen_pressure_ratio"
    ]

    # Imputation + Scaling
    imputer     = IterativeImputer(max_iter=10, random_state=CFG.random_seed)
    num_data    = imputer.fit_transform(df[num_cols])
    scaler      = RobustScaler()
    num_scaled  = scaler.fit_transform(num_data)

    # One-Hot للمادة
    encoder     = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    mat_encoded = encoder.fit_transform(df[[CFG.material_col]])

    X = np.hstack([num_scaled, mat_encoded]).astype(np.float32)
    feature_names = num_cols + list(encoder.get_feature_names_out([CFG.material_col]))

    # التقسيم الطبقي
    strat_key = (
        df[CFG.material_col].astype(str) + "_" +
        df["is_microgravity"].astype(str) + "_" +
        df[CFG.target_cls].astype(str)
    )

    X_tv, X_test, yr_tv, yr_test, yc_tv, yc_test, strat_tv, _ = train_test_split(
        X, y_reg, y_cls, strat_key,
        test_size=CFG.test_size, stratify=strat_key, random_state=CFG.random_seed
    )
    val_ratio = CFG.val_size / (1 - CFG.test_size)
    X_train, X_val, yr_train, yr_val, yc_train, yc_val = train_test_split(
        X_tv, yr_tv, yc_tv,
        test_size=val_ratio, stratify=strat_tv, random_state=CFG.random_seed
    )

    print(f"✅ Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")
    print(f"   Cool-Flame positives → Train: {int(yc_train.sum())}, "
          f"Val: {int(yc_val.sum())}, Test: {int(yc_test.sum())}")
    print(f"   Input dim: {X_train.shape[1]}")

    return {
        "X_train": X_train, "X_val": X_val, "X_test": X_test,
        "y_reg_train": yr_train, "y_reg_val": yr_val, "y_reg_test": yr_test,
        "y_cls_train": yc_train, "y_cls_val": yc_val, "y_cls_test": yc_test,
        "feature_names": feature_names,
        "imputer": imputer, "scaler": scaler, "encoder": encoder,
    }


# ============================================================
#Dataset و DataLoader
# ============================================================
class FireDataset(Dataset):
    def __init__(self, X, y_reg, y_cls):
        self.X     = torch.from_numpy(X)
        self.y_reg = torch.from_numpy(y_reg).unsqueeze(1)
        self.y_cls = torch.from_numpy(y_cls).unsqueeze(1)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y_reg[idx], self.y_cls[idx]


def make_loaders(data, batch_size):
    train_ds = FireDataset(data["X_train"], data["y_reg_train"], data["y_cls_train"])
    val_ds   = FireDataset(data["X_val"],   data["y_reg_val"],   data["y_cls_val"])
    test_ds  = FireDataset(data["X_test"],  data["y_reg_test"],  data["y_cls_test"])
    return (
        DataLoader(train_ds, batch_size=batch_size, shuffle=True,  drop_last=True),
        DataLoader(val_ds,   batch_size=batch_size, shuffle=False),
        DataLoader(test_ds,  batch_size=batch_size, shuffle=False),
    )


# ============================================================
#هيكل النموذج
# ============================================================
class FireModel(nn.Module):
    def __init__(self, input_dim, hidden_dims=(128, 64), dropout=0.3):
        super().__init__()
        layers, prev = [], input_dim
        for h in hidden_dims:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h),
                       nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        self.encoder  = nn.Sequential(*layers)
        self.reg_head = nn.Linear(prev, 1)
        self.cls_head = nn.Linear(prev, 1)

    def forward(self, x):
        h = self.encoder(x)
        return self.reg_head(h), self.cls_head(h)


# ============================================================
#دوال التقييم
# ============================================================
def evaluate_epoch(model, loader, criterion_reg, criterion_cls, device):
    model.eval()
    reg_losses, cls_losses = [], []
    preds_reg, preds_cls, labels_reg, labels_cls = [], [], [], []

    with torch.no_grad():
        for X, y_r, y_c in loader:
            X, y_r, y_c = X.to(device), y_r.to(device), y_c.to(device)
            out_r, out_c = model(X)
            reg_losses.append(criterion_reg(out_r, y_r).item())
            cls_losses.append(criterion_cls(out_c, y_c).item())
            preds_reg.append(out_r.cpu().numpy())
            preds_cls.append(torch.sigmoid(out_c).cpu().numpy())
            labels_reg.append(y_r.cpu().numpy())
            labels_cls.append(y_c.cpu().numpy())

    preds_reg  = np.concatenate(preds_reg)
    preds_cls  = np.concatenate(preds_cls)
    labels_reg = np.concatenate(labels_reg)
    labels_cls = np.concatenate(labels_cls)

    rmse_log  = np.sqrt(np.mean((preds_reg - labels_reg) ** 2))
    rmse_real = np.sqrt(np.mean((np.expm1(preds_reg) - np.expm1(labels_reg)) ** 2))
    try:
        auc = roc_auc_score(labels_cls, preds_cls)
    except ValueError:
        auc = float("nan")
    f1 = f1_score(labels_cls, (preds_cls > 0.5).astype(int), zero_division=0)

    return {
        "reg_loss": float(np.mean(reg_losses)),
        "cls_loss": float(np.mean(cls_losses)),
        "rmse_log": float(rmse_log),
        "rmse_mm_s": float(rmse_real),
        "auc": float(auc),
        "f1": float(f1),
    }


# ============================================================
#حلقة التدريب
# ============================================================
def train_model(data):
    device = torch.device(CFG.device)
    print(f"\n🖥️  الجهاز: {device}")
    train_loader, val_loader, test_loader = make_loaders(data, CFG.batch_size)

    input_dim = data["X_train"].shape[1]
    model = FireModel(input_dim, CFG.hidden_dims, CFG.dropout).to(device)

    # معالجة عدم التوازن
    pos = data["y_cls_train"].sum()
    neg = len(data["y_cls_train"]) - pos
    pos_weight = torch.tensor([neg / max(pos, 1)], dtype=torch.float32).to(device)
    print(f"⚖️  pos_weight = {pos_weight.item():.2f}")

    criterion_reg = nn.MSELoss()
    criterion_cls = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer     = torch.optim.AdamW(model.parameters(),
                                      lr=CFG.lr, weight_decay=CFG.weight_decay)
    scheduler     = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=8
    )

    best_val, best_state, patience_counter = float("inf"), None, 0

    for epoch in range(1, CFG.epochs + 1):
        model.train()
        train_reg_loss, train_cls_loss = [], []
        for X, y_r, y_c in train_loader:
            X, y_r, y_c = X.to(device), y_r.to(device), y_c.to(device)
            optimizer.zero_grad()
            out_r, out_c = model(X)
            loss = (CFG.lambda_reg * criterion_reg(out_r, y_r) +
                    CFG.lambda_cls * criterion_cls(out_c, y_c))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            train_reg_loss.append(criterion_reg(out_r, y_r).item())
            train_cls_loss.append(criterion_cls(out_c, y_c).item())

        val = evaluate_epoch(model, val_loader, criterion_reg, criterion_cls, device)
        val_total = CFG.lambda_reg * val["reg_loss"] + CFG.lambda_cls * val["cls_loss"]
        scheduler.step(val_total)

        if epoch % 10 == 0 or epoch == 1:
            print(f"Epoch {epoch:3d} | "
                  f"train_reg={np.mean(train_reg_loss):.4f} "
                  f"train_cls={np.mean(train_cls_loss):.4f} | "
                  f"val_rmse(log)={val['rmse_log']:.4f} "
                  f"val_AUC={val['auc']:.3f} val_F1={val['f1']:.3f}")

        if val_total < best_val - 1e-5:
            best_val, best_state, patience_counter = val_total, copy.deepcopy(model.state_dict()), 0
        else:
            patience_counter += 1
            if patience_counter >= CFG.patience:
                print(f"⏹️  Early stopping at epoch {epoch}")
                break

    model.load_state_dict(best_state)
    return model, test_loader


# ============================================================
#التقييم الكامل
# ============================================================
def full_evaluation(model, loader, device):
    model.eval()
    preds_reg, preds_cls, labels_reg, labels_cls = [], [], [], []

    with torch.no_grad():
        for X, y_r, y_c in loader:
            X = X.to(device)
            out_r, out_c = model(X)
            preds_reg.append(out_r.cpu().numpy())
            preds_cls.append(torch.sigmoid(out_c).cpu().numpy())
            labels_reg.append(y_r.numpy())
            labels_cls.append(y_c.numpy())

    preds_reg  = np.concatenate(preds_reg).ravel()
    preds_cls  = np.concatenate(preds_cls).ravel()
    labels_reg = np.concatenate(labels_reg).ravel()
    labels_cls = np.concatenate(labels_cls).ravel()

    real_pred = np.expm1(preds_reg)
    real_true = np.expm1(labels_reg)
    rmse_log   = np.sqrt(np.mean((preds_reg - labels_reg) ** 2))
    rmse_mm_s  = np.sqrt(np.mean((real_pred - real_true) ** 2))
    mae_mm_s   = np.mean(np.abs(real_pred - real_true))

    print("\n" + "="*55)
    print("📈 نتائج الانحدار (Flame Spread Rate)")
    print("="*55)
    print(f"  RMSE (log scale) : {rmse_log:.4f}")
    print(f"  RMSE (mm/s)      : {rmse_mm_s:.4f}")
    print(f"  MAE  (mm/s)      : {mae_mm_s:.4f}")

    print("\n" + "="*55)
    print("🚨 نتائج التصنيف (Cool Flame Risk)")
    print("="*55)
    auc = roc_auc_score(labels_cls, preds_cls)
    ap  = average_precision_score(labels_cls, preds_cls)
    print(f"  AUC               : {auc:.4f}")
    print(f"  Average Precision : {ap:.4f}")

    threshold = 0.35
    print(f"\n  Threshold = {threshold} (معدل لتفادي False Negatives):")
    print(classification_report(labels_cls, (preds_cls > threshold).astype(int),
                                target_names=["No Risk", "Cool Flame"]))
    print("  Confusion Matrix:")
    print(confusion_matrix(labels_cls, (preds_cls > threshold).astype(int)))

    print("\n  📊 تحليل العتبات:")
    print("  Threshold | Precision | Recall  | F1")
    print("  " + "-"*44)
    for t in [0.2, 0.3, 0.35, 0.4, 0.5, 0.6]:
        bp = (preds_cls > t).astype(int)
        tp = ((bp == 1) & (labels_cls == 1)).sum()
        fp = ((bp == 1) & (labels_cls == 0)).sum()
        fn = ((bp == 0) & (labels_cls == 1)).sum()
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0
        rec  = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1   = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
        print(f"     {t:.2f}   |   {prec:.3f}   |  {rec:.3f}  | {f1:.3f}")

    return {"rmse_mm_s": rmse_mm_s, "auc": auc}


# ============================================================
#XGBoost Baseline
# ============================================================
def run_xgb_baseline(data):
    try:
        from xgboost import XGBRegressor, XGBClassifier
    except ImportError:
        print("\n⚠️  xgboost غير مثبت، تخطي المقارنة. ثبته بـ: pip install xgboost")
        return {"rmse_mm_s": float("nan"), "auc": float("nan")}

    print("\n" + "="*55)
    print("🌲 XGBoost Baseline")
    print("="*55)

    reg = XGBRegressor(
        n_estimators=500, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=CFG.random_seed, n_jobs=-1,
        early_stopping_rounds=50
    )
    reg.fit(data["X_train"], data["y_reg_train"],
            eval_set=[(data["X_val"], data["y_reg_val"])], verbose=False)
    pred_reg = reg.predict(data["X_test"])
    rmse_log = np.sqrt(mean_squared_error(data["y_reg_test"], pred_reg))
    rmse_mm  = np.sqrt(mean_squared_error(
        np.expm1(data["y_reg_test"]), np.expm1(pred_reg)))
    print(f"  RMSE (log) : {rmse_log:.4f}")
    print(f"  RMSE (mm/s): {rmse_mm:.4f}")

    pos = data["y_cls_train"].sum()
    neg = len(data["y_cls_train"]) - pos
    clf = XGBClassifier(
        n_estimators=500, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=neg / max(pos, 1),
        random_state=CFG.random_seed, n_jobs=-1,
        eval_metric="auc", early_stopping_rounds=50
    )
    clf.fit(data["X_train"], data["y_cls_train"].astype(int),
            eval_set=[(data["X_val"], data["y_cls_val"].astype(int))],
            verbose=False)
    proba = clf.predict_proba(data["X_test"])[:, 1]
    auc = roc_auc_score(data["y_cls_test"], proba)
    print(f"  Cool-Flame AUC : {auc:.4f}")
    print(classification_report(data["y_cls_test"].astype(int),
                                (proba > 0.35).astype(int),
                                target_names=["No Risk", "Cool Flame"]))
    return {"rmse_mm_s": rmse_mm, "auc": auc}


# ============================================================
#نقطة الدخول
# ============================================================
def main():
    print("="*55)
    print("🔥 نموذج AI هجين لانتشار اللهب واللهب البارد")
    print("="*55)

    print(f"\n📂 تحميل: {CFG.data_path}")
    try:
        df = pd.read_csv(CFG.data_path)
    except FileNotFoundError:
        print(f"❌ لم يتم العثور على: {CFG.data_path}")
        print("   ضع ملف البيانات أو ولّد بيانات تجريبية للتجربة.")
        return

    print(f"   شكل البيانات: {df.shape}")

    data = prepare_data(df)

    print(f"\n🚀 تدريب النموذج الهجين...")
    model, test_loader = train_model(data)

    device = torch.device(CFG.device)
    nn_metrics = full_evaluation(model, test_loader, device)
    xgb_metrics = run_xgb_baseline(data)

    print("\n" + "="*55)
    print("🏁 ملخص المقارنة النهائي")
    print("="*55)
    print(f"{'Metric':<22} {'Neural Net':>12} {'XGBoost':>12}")
    print("-"*48)
    print(f"{'RMSE (mm/s)':<22} {nn_metrics['rmse_mm_s']:>12.4f} {xgb_metrics['rmse_mm_s']:>12.4f}")
    print(f"{'AUC (cool flame)':<22} {nn_metrics['auc']:>12.4f} {xgb_metrics['auc']:>12.4f}")

    torch.save(model.state_dict(), "fire_model.pth")
    print("\n💾 تم حفظ النموذج في: fire_model.pth")
    print("✅ انتهى التنفيذ بنجاح!")


if __name__ == "__main__":
    main()