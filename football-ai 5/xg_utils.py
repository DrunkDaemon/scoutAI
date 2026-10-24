"""Shared helpers: shot geometry, feature lists and xG prediction (used by data_prep, train_xg and app)."""
import numpy as np
import pandas as pd

GOAL_X, POST_L, POST_R = 120.0, 36.0, 44.0  # StatsBomb pitch is 120 x 80 yards, goal at x=120
NUM = ["x", "y_off", "dist", "angle", "def_in_triangle", "nearest_def",
       "gk_dist_to_goal", "gk_dist_to_shot", "first_time", "under_pressure"]
CAT = ["body_part", "shot_type", "technique", "play_pattern"]
FEATURES = NUM + CAT


def add_geometry(df: pd.DataFrame) -> pd.DataFrame:
    """Adds distance to goal, goal-mouth angle and lateral offset from the centre line."""
    df = df.copy()
    dx = GOAL_X - df["x"]
    df["y_off"] = (df["y"] - 40).abs()
    df["dist"] = np.hypot(dx, df["y"] - 40)
    a = np.hypot(dx, POST_L - df["y"])
    b = np.hypot(dx, POST_R - df["y"])
    cos = (a ** 2 + b ** 2 - 64) / (2 * a * b)  # law of cosines, goal width = 8 yards
    df["angle"] = np.arccos(np.clip(cos, -1, 1))
    return df


def predict_xg(bundle: dict, df: pd.DataFrame) -> np.ndarray:
    """Model xG for each shot. Penalties get the average penalty conversion rate."""
    df = add_geometry(df)
    xg = bundle["model"].predict_proba(df[FEATURES])[:, 1]
    return np.where(df["shot_type"] == "Penalty", bundle["penalty_xg"], xg)
