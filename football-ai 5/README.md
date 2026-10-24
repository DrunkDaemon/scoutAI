# ScoutAI: Football xG Machine Learning Website

An expected-goals (xG) model trained on ~38,700 real shots from the 2015/16 season of Europe's top 5 leagues, deployed as a static website. The trained model is exported to JavaScript and runs live in the browser (no server needed).

**Live site:** _add your link here_

## Website features
- **Shot Calculator:** click or drag a shot anywhere on the pitch, change defenders, goalkeeper position, body part and situation, and see the xG probability, a live heatmap, and a take-the-shot mini game.
- **Match Centre:** replay any 2015/16 match: shot maps, an xG race chart, and a 4,000-run simulation of who deserved to win.
- **Scouting:** find players with a similar style (cosine similarity on 16 per-90 stats) with a radar chart.
- **Fixtures:** a calendar of upcoming matches for all five leagues (openfootball data, refreshed live in the browser).
- **Lucky & Unlucky:** real points vs expected points for four leagues in a dumbbell chart.
- **Finishers:** players who most over/under-performed their expected goals.
- **The Model:** accuracy vs a professional benchmark, and which features drive xG.

## Results
Evaluated on 20% of matches held out from training (split by match to avoid leakage):

| Model | ROC AUC | Log loss |
|---|---|---|
| Baseline (distance + angle) | 0.761 | 0.279 |
| **This model** | **0.821** | **0.253** |
| StatsBomb xG (professional benchmark) | 0.824 | 0.251 |

## Project structure
    docs/            the website: index.html, css/style.css, js/app.js, js/features.js, js/xg.js, js/data.js, js/matches.js, fonts/
    data_prep.py     downloads StatsBomb data, builds shots / matches / player tables
    train_xg.py      trains, tunes (grouped CV) and benchmarks the gradient-boosting model
    export_site.py   exports the model and tables to docs/data.js
    xg_utils.py      shot geometry helpers
    data/            processed CSV files

## Run locally
Open `docs/index.html` in a browser. To rebuild from scratch:

    pip install -r requirements.txt
    python data_prep.py      # downloads raw data (large)
    python train_xg.py       # trains the model
    python export_site.py    # regenerates docs/js/data.js and docs/js/matches.js (also refreshes the fixtures snapshot)

## Tech
Python, pandas, scikit-learn (HistGradientBoosting, GroupKFold, RandomizedSearchCV), JavaScript, HTML, CSS, canvas and SVG

## Notes
- Data is from the 2015/16 season, the most recent season where StatsBomb's free open data covers full league seasons.
- Bundesliga is excluded from the tables: the free data only covers Bayer Leverkusen.

Fixtures: openfootball (https://github.com/openfootball/football.json). Match data: StatsBomb Open Data (https://github.com/statsbomb/open-data). Please credit StatsBomb if you share this work.
