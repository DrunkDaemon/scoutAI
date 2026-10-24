"""
Trains an expected-goals (xG) model on ~38k real shots and benchmarks it against StatsBomb's own xG.
Run:  python train_xg.py
Outputs: model.joblib, data/shots_scored.csv, metrics.json, calibration.png, feature_importance.png
"""
import json
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss
from sklearn.model_selection import GroupShuffleSplit, GroupKFold, RandomizedSearchCV, cross_val_predict
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xg_utils import add_geometry, FEATURES, CAT

SEED = 42
df = add_geometry(pd.read_csv("data/shots.csv"))
pen = df["shot_type"] == "Penalty"
penalty_xg = float(df.loc[pen, "is_goal"].mean())          # penalties are modelled as a flat conversion rate
data = df[~pen].reset_index(drop=True)
X, y, groups = data[FEATURES], data["is_goal"], data["match_id"]
print(f"{len(data):,} non-penalty shots | goal rate {y.mean():.3f} | penalty conversion {penalty_xg:.3f}")


def make_model(**params):
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CAT)],
                            remainder="passthrough")
    return Pipeline([("pre", pre), ("clf", HistGradientBoostingClassifier(random_state=SEED, **params))])


# Split BY MATCH so shots from the same game never appear in both train and test (avoids leakage)
tr, te = next(GroupShuffleSplit(test_size=0.2, random_state=SEED).split(X, y, groups))
Xtr, Xte, ytr, yte, gtr = X.iloc[tr], X.iloc[te], y.iloc[tr], y.iloc[te], groups.iloc[tr]

# 1) Baseline: logistic regression using only distance + angle (classic xG)
base = make_pipeline(StandardScaler(), LogisticRegression())
base.fit(Xtr[["dist", "angle"]], ytr)
p_base = base.predict_proba(Xte[["dist", "angle"]])[:, 1]

# 2) Full model: gradient boosting with defender / goalkeeper / context features, tuned with grouped CV
search = RandomizedSearchCV(
    make_model(),
    {"clf__learning_rate": [0.03, 0.05, 0.1], "clf__max_iter": [150, 300, 500],
     "clf__max_leaf_nodes": [8, 15, 31], "clf__min_samples_leaf": [20, 50, 100],
     "clf__l2_regularization": [0.0, 1.0, 5.0]},
    n_iter=10, cv=GroupKFold(3), scoring="neg_log_loss", random_state=SEED, n_jobs=-1)
search.fit(Xtr, ytr, groups=gtr)
best = search.best_estimator_
best_params = {k.split("__")[1]: v for k, v in search.best_params_.items()}
print("Best params:", best_params)
p_model = best.predict_proba(Xte)[:, 1]
p_sb = np.clip(data["sb_xg"].iloc[te].values, 1e-6, 1 - 1e-6)

rows = {}
for name, p in {"Baseline (distance+angle)": p_base, "Our model": p_model, "StatsBomb xG (benchmark)": p_sb}.items():
    rows[name] = {"ROC_AUC": round(roc_auc_score(yte, p), 4), "LogLoss": round(log_loss(yte, p), 4),
                  "Brier": round(brier_score_loss(yte, p), 4)}
res = pd.DataFrame(rows).T
print("\nHELD-OUT TEST RESULTS (higher AUC / lower loss is better)\n", res.to_string())

# 3) Plots
plt.figure(figsize=(5, 5))
calib = {}
for name, p in {"Our model": p_model, "StatsBomb xG": p_sb}.items():
    frac, mean = calibration_curve(yte, p, n_bins=10, strategy="quantile")
    calib[name] = {"pred": mean.round(4).tolist(), "actual": frac.round(4).tolist()}
    plt.plot(mean, frac, marker="o", label=name)
plt.plot([0, 0.6], [0, 0.6], "k--", label="Perfect")
plt.xlabel("Predicted xG"); plt.ylabel("Actual goal rate"); plt.title("Calibration (test set)")
plt.legend(); plt.tight_layout(); plt.savefig("calibration.png", dpi=120); plt.close()

imp = permutation_importance(best, Xte, yte, scoring="neg_log_loss", n_repeats=5, random_state=SEED, n_jobs=-1)
importance = dict(zip(FEATURES, imp.importances_mean.round(5).tolist()))
order = imp.importances_mean.argsort()
plt.figure(figsize=(6, 4.5))
plt.barh(np.array(FEATURES)[order], imp.importances_mean[order])
plt.title("What drives xG? (permutation importance)"); plt.xlabel("Increase in log loss when shuffled")
plt.tight_layout(); plt.savefig("feature_importance.png", dpi=120); plt.close()

# 4) Out-of-fold xG for every shot (each prediction comes from a model that never saw that match)
oof = cross_val_predict(make_model(**best_params), X, y, groups=groups, cv=GroupKFold(5), method="predict_proba")[:, 1]
df["xg_model"] = np.nan
df.loc[~pen, "xg_model"] = oof
df.loc[pen, "xg_model"] = penalty_xg
keep = ["match_id", "league", "team", "opponent", "player", "minute", "x", "y", "shot_type",
        "outcome", "is_goal", "sb_xg", "xg_model"]
df[keep].round(4).to_csv("data/shots_scored.csv", index=False)

# 5) Final model on all data
best.set_params(**{f"clf__{k}": v for k, v in best_params.items()}).fit(X, y)
metrics = {"table": res.to_dict(orient="index"), "best_params": {k: float(v) for k, v in best_params.items()},
           "calibration": calib, "importance": importance, "n_shots": int(len(df)), "n_train_shots": int(len(Xtr)), "n_test_shots": int(len(Xte))}
joblib.dump({"model": best, "penalty_xg": penalty_xg, "metrics": metrics}, "model.joblib")
json.dump(metrics, open("metrics.json", "w"), indent=2)
print("\nGoals vs xG by league:")
print(df.groupby("league").agg(goals=("is_goal", "sum"), xG=("xg_model", "sum")).round(0).to_string())
print("\nSaved model.joblib, metrics.json, calibration.png, feature_importance.png, data/shots_scored.csv")
