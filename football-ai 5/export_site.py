"""Exports the trained model + precomputed tables to docs/js/data.js for the static website. Run: python export_site.py"""
import json, joblib, numpy as np, pandas as pd

b = joblib.load("model.joblib"); pipe = b["model"]
pre, clf = pipe.named_steps["pre"], pipe.named_steps["clf"]
trees = []
for (t,) in clf._predictors:
    n = t.nodes
    trees.append([n["feature_idx"].tolist(), np.round(n["num_threshold"], 4).tolist(), n["left"].tolist(),
                  n["right"].tolist(), np.round(n["value"], 5).tolist()])

shots, matches = pd.read_csv("data/shots_scored.csv"), pd.read_csv("data/matches.csv")
def sim(h, a, n=2000, seed=0):
    r = np.random.default_rng(seed)
    hg, ag = (r.random((n, len(h))) < h).sum(1), (r.random((n, len(a))) < a).sum(1)
    return (hg > ag).mean(), (hg == ag).mean(), (hg < ag).mean()
tables = {}
for lg, m in matches.groupby("league"):
    if len(m) < 300: continue
    by = {k: v.xg_model.values for k, v in shots[shots.league == lg].groupby(["match_id", "team"])}
    t = {}
    for i, r in enumerate(m.itertuples()):
        hx, ax = by.get((r.match_id, r.home_team), np.array([])), by.get((r.match_id, r.away_team), np.array([]))
        w, d, l = sim(hx, ax, seed=i)
        for team, pts, xp, gf, ga in [(r.home_team, 3 * (r.home_score > r.away_score) + (r.home_score == r.away_score), 3 * w + d, r.home_score, r.away_score),
                                      (r.away_team, 3 * (r.home_score < r.away_score) + (r.home_score == r.away_score), 3 * l + d, r.away_score, r.home_score)]:
            x = t.setdefault(team, [0, 0, 0.0, 0, 0]); x[0] += 1; x[1] += int(pts); x[2] += xp; x[3] += int(gf); x[4] += int(ga)
    tables[lg] = [[k, v[0], v[1], round(v[2], 1), v[3], v[4]] for k, v in sorted(t.items(), key=lambda kv: -kv[1][1])]

def nm(n):
    p = n.split(); s = p[-2] if len(p) >= 4 else p[-1]
    return f"{p[0][0]}. {s}" if len(p) > 1 else n
f = shots[shots.shot_type != "Penalty"].groupby("player").agg(team=("team", lambda s: s.mode().iat[0]), shots=("is_goal", "size"),
        goals=("is_goal", "sum"), xg=("xg_model", "sum")).reset_index()
f = f[f.shots >= 30].assign(d=lambda d: d.goals - d.xg)
row = lambda d: [[nm(r.player), r.team, int(r.shots), int(r.goals), round(r.xg, 1)] for r in d.itertuples()]
M = b["metrics"]
D = dict(names=list(pre.get_feature_names_out()), base=float(clf._baseline_prediction.ravel()[0]), trees=trees,
         penalty=b["penalty_xg"], tables=tables, fin=dict(top=row(f.nlargest(10, "d")), bot=row(f.nsmallest(8, "d"))),
         imp=M["importance"], auc={k: v["ROC_AUC"] for k, v in M["table"].items()},
         n=dict(shots=int(len(shots)), matches=int(len(matches)), players=int(pd.read_csv("data/player_season.csv").shape[0])))

# ---- extras: fixtures snapshot, scouting vectors, match centre data
import requests, datetime as dt
CODES = {"Premier League": "en.1", "La Liga": "es.1", "Serie A": "it.1", "Bundesliga": "de.1", "Ligue 1": "fr.1"}
t = dt.date.today(); y = t.year if t.month >= 7 else t.year - 1; season = f"{y}-{str(y + 1)[2:]}"
def ft(m):
    sc = m.get("score")
    r = sc.get("ft") if isinstance(sc, dict) else sc
    return list(r)[:2] if isinstance(r, list) and len(r) >= 2 else []
fx = {}
for lg, c in CODES.items():
    try:
        j = requests.get(f"https://raw.githubusercontent.com/openfootball/football.json/master/{season}/{c}.json", timeout=30).json()
        fx[lg] = [[m["date"], m.get("time", ""), m["team1"], m["team2"], m.get("round", "")] + ft(m) for m in j["matches"]]
    except Exception as e:
        print("fixtures unavailable for", lg, e)
D["fx"] = fx

SIM = ["shots", "xg", "key_passes", "passes", "pass_pct", "progressive_passes", "progressive_carries", "dribbles_completed",
       "tackles", "interceptions", "clearances", "blocks", "recoveries", "pressures", "fouls_won", "dispossessed"]
RADAR = ["shots", "xg", "key_passes", "progressive_passes", "progressive_carries", "dribbles_completed", "pressures", "interceptions"]
ps = pd.read_csv("data/player_season.csv"); ps = ps[(ps.position != "GK") & (ps.minutes >= 600)].reset_index(drop=True)
X = pd.DataFrame({c: ps[c] / ps.minutes * 90 for c in SIM if c != "pass_pct"})
X["pass_pct"] = (ps.passes_completed / ps.passes.replace(0, np.nan) * 100).fillna(0)
X = X[SIM]; Z = (X - X.mean()) / X.std(ddof=0)
pct = [[round(float((X[c][ps.position == ps.position[i]] < X[c][i]).mean() * 100)) for c in RADAR] for i in range(len(ps))]
D["sc"] = dict(full=ps.player.tolist(), n=[nm(p) for p in ps.player], t=ps.team.tolist(), lg=ps.league.tolist(), pos=ps.position.tolist(),
               min=ps.minutes.astype(int).tolist(), z=Z.round(2).values.tolist(), pct=pct)

pn, sh, mi = {}, {}, matches.set_index("match_id")
for mid, g in shots.groupby("match_id"):
    home = mi.loc[mid, "home_team"]
    sh[int(mid)] = [[0 if r.team == home else 1, round(r.x, 1), round(r.y, 1), int(r.minute), round(r.xg_model, 3), int(r.is_goal),
                     pn.setdefault(nm(r.player), len(pn))] for r in g.itertuples()]
M2 = {"pn": list(pn), "s": sh, "m": {lg: [[int(r.match_id), r.date, r.home_team, r.away_team, int(r.home_score), int(r.away_score)]
                                          for r in g.sort_values("date").itertuples()] for lg, g in matches.groupby("league")}}
open("docs/js/matches.js", "w").write("window.M=" + json.dumps(M2, separators=(",", ":")) + ";")
open("docs/js/data.js", "w").write("window.D=" + json.dumps(D, separators=(",", ":")) + ";")
print("docs/js/data.js written")
