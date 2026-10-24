"""
Downloads StatsBomb open data (2015/16 season of the top-5 European leagues) and builds:
  data/matches.csv, data/shots.csv, data/player_season.csv
Run:  python data_prep.py          (all ~1,800 matches, a few minutes, ~5 GB download)
      python data_prep.py 20       (quick test: 20 matches per league)
Data: StatsBomb Open Data (https://github.com/statsbomb/open-data)
"""
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import requests

BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
LEAGUES = {"Premier League": (2, 27), "La Liga": (11, 27), "Serie A": (12, 27),
           "Bundesliga": (9, 27), "Ligue 1": (7, 27)}
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else None


def get(url, tries=5):
    for i in range(tries):
        try:
            r = requests.get(url, timeout=90)
            r.raise_for_status()
            return r.json()
        except Exception:
            time.sleep(1 + 2 * i)
    raise RuntimeError(f"Failed to download {url}")


def in_triangle(p, a, b, c):
    def s(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def freeze_features(x, y, ff):
    """Features from the 'freeze frame': where defenders and the goalkeeper stood at the moment of the shot."""
    nan = dict(def_in_triangle=np.nan, nearest_def=np.nan, gk_dist_to_goal=np.nan, gk_dist_to_shot=np.nan)
    if not ff:
        return nan
    opp = [p for p in ff if not p["teammate"]]
    gk = [p for p in opp if p["position"]["name"] == "Goalkeeper"]
    de = [p for p in opp if p["position"]["name"] != "Goalkeeper"]
    out = dict(nan)
    out["def_in_triangle"] = sum(in_triangle(p["location"], (x, y), (120, 36), (120, 44)) for p in de)
    out["nearest_def"] = min([np.hypot(p["location"][0] - x, p["location"][1] - y) for p in de], default=30.0)
    if gk:
        gx, gy = gk[0]["location"]
        out["gk_dist_to_goal"] = np.hypot(120 - gx, 40 - gy)
        out["gk_dist_to_shot"] = np.hypot(gx - x, gy - y)
    return out


def position_group(name):
    if "Goalkeeper" in name:
        return "GK"
    if "Back" in name:
        return "DEF"
    if "Midfield" in name:
        return "MID"
    return "FWD"


def process_match(m, league):
    ev = get(f"{BASE}/events/{m['match_id']}.json")
    home, away = m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]
    end_min = max(e["minute"] for e in ev)

    names, on, off = {}, {}, {}
    for e in ev:
        t = e["type"]["name"]
        if "player" in e:
            names[e["player"]["id"]] = (e["player"]["name"], e["team"]["name"])
        if t == "Starting XI":
            for p in e["tactics"]["lineup"]:
                on[p["player"]["id"]] = 0
                names[p["player"]["id"]] = (p["player"]["name"], e["team"]["name"])
        elif t == "Substitution":
            off[e["player"]["id"]] = e["minute"]
            rep = e["substitution"]["replacement"]
            on[rep["id"]] = e["minute"]
            names[rep["id"]] = (rep["name"], e["team"]["name"])
        elif t == "Foul Committed" and e.get("foul_committed", {}).get("card", {}).get("name") in ("Red Card", "Second Yellow Card"):
            off.setdefault(e["player"]["id"], e["minute"])

    stats, pos, shots = defaultdict(Counter), defaultdict(Counter), []
    for e in ev:
        if "player" not in e:
            continue
        pid, t, s = e["player"]["id"], e["type"]["name"], stats[e["player"]["id"]]
        if "position" in e:
            pos[pid][e["position"]["name"]] += 1
        if t == "Pass":
            p = e["pass"]
            s["passes"] += 1
            done = "outcome" not in p
            s["passes_completed"] += done
            s["key_passes"] += bool(p.get("shot_assist"))
            s["assists"] += bool(p.get("goal_assist"))
            if done and p["end_location"][0] - e["location"][0] >= 10:
                s["progressive_passes"] += 1
        elif t == "Carry":
            if e["carry"]["end_location"][0] - e["location"][0] >= 5:
                s["progressive_carries"] += 1
        elif t == "Dribble":
            s["dribbles"] += 1
            s["dribbles_completed"] += e["dribble"]["outcome"]["name"] == "Complete"
        elif t == "Duel":
            if e.get("duel", {}).get("type", {}).get("name") == "Tackle":
                s["tackles"] += 1
        elif t == "Interception":
            s["interceptions"] += 1
        elif t == "Clearance":
            s["clearances"] += 1
        elif t == "Block":
            s["blocks"] += 1
        elif t == "Ball Recovery":
            s["recoveries"] += 1
        elif t == "Pressure":
            s["pressures"] += 1
        elif t == "Foul Won":
            s["fouls_won"] += 1
        elif t == "Foul Committed":
            s["fouls_committed"] += 1
        elif t == "Dispossessed":
            s["dispossessed"] += 1
        elif t == "Shot" and e["period"] < 5:
            sh = e["shot"]
            x, y = e["location"]
            s["shots"] += 1
            s["goals"] += sh["outcome"]["name"] == "Goal"
            s["xg"] += sh.get("statsbomb_xg", 0)
            team = e["team"]["name"]
            body = sh["body_part"]["name"]
            shots.append(dict(
                match_id=m["match_id"], league=league, team=team, opponent=away if team == home else home,
                player=e["player"]["name"], minute=e["minute"], x=x, y=y,
                body_part="Head" if body == "Head" else ("Other" if body == "Other" else "Foot"),
                shot_type=sh["type"]["name"], technique=sh["technique"]["name"],
                play_pattern=e["play_pattern"]["name"], first_time=int(bool(sh.get("first_time"))),
                under_pressure=int(bool(e.get("under_pressure"))), outcome=sh["outcome"]["name"],
                is_goal=int(sh["outcome"]["name"] == "Goal"), sb_xg=sh.get("statsbomb_xg", np.nan),
                **freeze_features(x, y, sh.get("freeze_frame"))))

    players = []
    for pid, start in on.items():
        minutes = off.get(pid, end_min) - start
        if minutes <= 0 or pid not in names:
            continue
        row = dict(match_id=m["match_id"], player_id=pid, player=names[pid][0], team=names[pid][1],
                   league=league, minutes=minutes,
                   position_detail=(pos[pid].most_common(1)[0][0] if pos[pid] else "Unknown"))
        row.update(stats[pid])
        players.append(row)
    match_row = dict(match_id=m["match_id"], league=league, date=m["match_date"], home_team=home, away_team=away,
                     home_score=m["home_score"], away_score=m["away_score"], match_week=m.get("match_week"))
    return match_row, shots, players


def main():
    jobs = []
    for league, (cid, sid) in LEAGUES.items():
        matches = get(f"{BASE}/matches/{cid}/{sid}.json")
        matches = sorted(matches, key=lambda m: m["match_date"])[:LIMIT]
        print(f"{league}: {len(matches)} matches")
        jobs += [(m, league) for m in matches]

    all_m, all_s, all_p, done = [], [], [], 0
    with ThreadPoolExecutor(12) as ex:
        for mr, sh, pl in ex.map(lambda a: process_match(*a), jobs):
            all_m.append(mr); all_s += sh; all_p += pl
            done += 1
            if done % 100 == 0:
                print(f"  processed {done}/{len(jobs)}")

    pd.DataFrame(all_m).to_csv("data/matches.csv", index=False)
    pd.DataFrame(all_s).round(3).to_csv("data/shots.csv", index=False)

    p = pd.DataFrame(all_p).fillna(0)
    count_cols = [c for c in p.columns if c not in
                  ("match_id", "player_id", "player", "team", "league", "minutes", "position_detail")]
    agg = {c: "sum" for c in count_cols + ["minutes"]}
    ps = p.groupby("player_id").agg(
        player=("player", "first"), team=("team", lambda s: s.mode().iat[0]),
        league=("league", lambda s: s.mode().iat[0]), matches=("match_id", "nunique"),
        position_detail=("position_detail", lambda s: s.mode().iat[0]), **{c: (c, "sum") for c in agg}).reset_index()
    ps["position"] = ps["position_detail"].map(position_group)
    ps = ps[ps["minutes"] > 0].round(3)
    ps.to_csv("data/player_season.csv", index=False)
    print(f"Saved {len(all_m)} matches, {len(all_s)} shots, {len(ps)} players")


if __name__ == "__main__":
    main()
