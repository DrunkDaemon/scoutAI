// Extra pages: model importance, Match Centre, Scouting and the Fixtures calendar.
const sum = a => a.reduce((t, v) => t + v, 0);
const inited = {};
addEventListener("tab", e => { const t = e.detail; if (!inited[t] && { mc: initMatchCentre, sc: initScouting, cal: initCalendar }[t]) { inited[t] = 1; ({ mc: initMatchCentre, sc: initScouting, cal: initCalendar })[t](); } });

/* ---------- what the model pays attention to ---------- */
const FEATURE_NAMES = { angle: "Angle to goal", gk_dist_to_shot: "Keeper distance to the shot", def_in_triangle: "Defenders in the way", nearest_def: "Nearest defender",
  gk_dist_to_goal: "Keeper position", dist: "Distance to goal", body_part: "Body part", x: "Distance along pitch", y_off: "Width of pitch", technique: "Technique",
  shot_type: "Situation", play_pattern: "Play pattern", first_time: "First-time shot", under_pressure: "Under pressure" };
const imp = Object.entries(D.imp).sort((a, b) => b[1] - a[1]).slice(0, 8);
$("#imp").innerHTML = imp.map(([k, v]) => `<div class="bar"><span>${FEATURE_NAMES[k] || k}</span><div class="track"><i style="width:${v / imp[0][1] * 100}%"></i></div><em>${Math.round(v / imp[0][1] * 100)}</em></div>`).join("")
  + `<p class="note">Permutation importance: how much worse the model gets when that column is shuffled. 100 = the most important.</p>`;

/* ---------- Match Centre ---------- */
function initMatchCentre() {
  const s = document.createElement("script"); s.src = "js/matches.js";
  s.onload = buildMatchCentre; s.onerror = () => $("#mco").innerHTML = `<p class="note">Could not load match data.</p>`;
  document.head.appendChild(s);
}
function pitchSVG(shots, color) {
  let g = `<rect class="pl" x="0" y="3" width="80" height="60"/><rect class="pl" x="18" y="3" width="44" height="18"/><rect class="pl" x="30" y="3" width="20" height="6"/><rect class="pl" x="36" y="1" width="8" height="2"/>`
    + `<path class="pl" d="M32,21 A10,10 0 0 0 48,21"/><path class="pl" d="M30,63 A10,10 0 0 1 50,63"/>`;
  shots.forEach(sh => g += `<circle cx="${sh[2]}" cy="${123 - sh[1]}" r="${.9 + sh[4] * 5}" fill="${sh[5] ? color : color + "44"}" stroke="${sh[5] ? INK : color}" stroke-width="${sh[5] ? .5 : .35}">`
    + `<title>${esc(window.M.pn[sh[6]])} ${sh[3]}' · xG ${sh[4].toFixed(2)}${sh[5] ? " · GOAL" : ""}</title></circle>`);
  return `<svg class="pm" viewBox="-2 0 84 65">${g}</svg>`;
}
function raceSVG(H, A) {
  const W = 760, Ht = 230, L = 40, R = 20, T = 14, B = 26, mx = Math.max(sum(H.map(s => s[4])), sum(A.map(s => s[4])), 1) * 1.15;
  const sx = m => L + m / 95 * (W - L - R), sy = v => Ht - B - v / mx * (Ht - B - T), ord = sh => [...sh].sort((a, b) => a[3] - b[3]);
  let g = "";
  for (let v = 0; v <= mx; v++) g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tk" x="${L - 8}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`;
  for (let m = 0; m <= 90; m += 15) g += `<text class="tk" x="${sx(m)}" y="${Ht - 6}" text-anchor="middle">${m}'</text>`;
  [[H, BLUE], [A, RED]].forEach(([sh, c]) => {
    let cum = 0, d = `M${sx(0)},${sy(0)}`, dots = "";
    ord(sh).forEach(s => { d += ` H${sx(s[3])}`; cum += s[4]; d += ` V${sy(cum)}`; if (s[5]) dots += `<circle cx="${sx(s[3])}" cy="${sy(cum)}" r="5.5" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`; });
    g += `<path d="${d} H${sx(95)}" fill="none" stroke="${c}" stroke-width="2.5"/>${dots}`;
  });
  return `<svg viewBox="0 0 ${W} ${Ht}">${g}</svg>`;
}
function simulate(H, A, n = 4000) {                       // replay the match n times: each shot scores with probability = its xG
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < n; i++) { let h = 0, a = 0; for (const s of H) h += Math.random() < s[4]; for (const s of A) a += Math.random() < s[4]; h > a ? w++ : h === a ? d++ : l++; }
  return [w / n, d / n, l / n];
}
function buildMatchCentre() {
  const M = window.M, LG = ["Premier League", "La Liga", "Serie A", "Ligue 1", "Bundesliga"].filter(l => M.m[l]); let lg = LG[0];
  const show = () => {
    const row = M.m[lg].find(r => r[0] == $("#mcs").value), sh = M.s[row[0]] || [], H = sh.filter(s => !s[0]), A = sh.filter(s => s[0]);
    const xh = sum(H.map(s => s[4])), xa = sum(A.map(s => s[4])), [w, d, l] = simulate(H, A);
    const gap = xh - xa, real = Math.sign(row[4] - row[5]);
    const verdict = Math.abs(gap) > .4 && real !== Math.sign(gap)
      ? `<b>${esc(gap > 0 ? row[2] : row[3])}</b> created clearly better chances but did not get the result.` : `The result fits the chances that were created.`;
    $("#mco").innerHTML = `<div class="score"><div class="tm">${esc(row[2])}</div><div class="sc">${row[4]} – ${row[5]}</div><div class="tm">${esc(row[3])}</div></div>`
      + `<p class="cen">${row[1]} · ${lg} · expected goals ${f1(xh, 2)} – ${f1(xa, 2)}</p>`
      + `<div class="wbar"><span style="width:${w * 100}%;background:${BLUE}">${Math.round(w * 100)}%</span><span style="width:${d * 100}%;background:#8a8372">${Math.round(d * 100)}%</span><span style="width:${l * 100}%;background:${RED}">${Math.round(l * 100)}%</span></div>`
      + `<div class="wl"><span>${esc(row[2])} win</span><span>Draw</span><span>${esc(row[3])} win</span></div><p class="note">${verdict}</p>`
      + `<div class="maps"><div><h4>${esc(row[2])}<small>${H.length} shots</small></h4>${pitchSVG(H, BLUE)}</div><div><h4>${esc(row[3])}<small>${A.length} shots</small></h4>${pitchSVG(A, RED)}</div></div>`
      + `<h3 class="sub">The xG race: cumulative chance quality, goals marked</h3><div class="chart">${raceSVG(H, A)}</div>`
      + `<p class="note">Bigger circles are bigger chances; filled circles are goals. Hover a shot for the player and minute. Own goals are not shots, so they do not appear.</p>`;
  };
  const draw = () => {
    $("#mcl").innerHTML = LG.map(l => `<button class="${l === lg ? "on" : ""}">${l}${l === "Bundesliga" ? " (Leverkusen)" : ""}</button>`).join("");
    document.querySelectorAll("#mcl button").forEach((b, i) => b.onclick = () => { lg = LG[i]; draw(); });
    $("#mcs").innerHTML = M.m[lg].map(r => `<option value="${r[0]}">${r[1]}  ·  ${esc(r[2])} ${r[4]}–${r[5]} ${esc(r[3])}</option>`).join("");
    show();
  };
  $("#mcs").onchange = show; draw();
}

/* ---------- Scouting ---------- */
function initScouting() {
  const S = D.sc, label = i => `${S.full[i]} (${S.t[i]})`, idx = {}, norm = S.z.map(v => Math.hypot(...v));
  S.full.forEach((_, i) => idx[label(i)] = i);
  $("#scd").innerHTML = S.full.map((_, i) => `<option value="${esc(label(i))}">`).join("");
  const AX = ["Shots", "xG", "Key passes", "Prog. passes", "Prog. carries", "Dribbles won", "Pressures", "Interceptions"];
  const poly = (p, c, f) => `<polygon points="${p.map((v, a) => { const t = -Math.PI / 2 + a * 2 * Math.PI / 8; return [180 + 120 * v / 100 * Math.cos(t), 170 + 120 * v / 100 * Math.sin(t)].map(n => n.toFixed(1)); }).join(" ")}" fill="${f}" stroke="${c}" stroke-width="2.2"/>`;
  const run = () => {
    const i = idx[$("#scq").value]; if (i === undefined) return;
    const same = $("#scp").checked;
    const sims = S.z.map((v, j) => j === i || (same && S.pos[j] !== S.pos[i]) ? -9 : v.reduce((t, x, k) => t + x * S.z[i][k], 0) / (norm[i] * norm[j] || 1));
    const top = sims.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]).slice(0, 8), best = top[0][1];
    let rings = "", axes = "";
    [.25, .5, .75, 1].forEach(r => rings += `<polygon class="rg" points="${AX.map((_, a) => { const t = -Math.PI / 2 + a * 2 * Math.PI / 8; return `${(180 + 120 * r * Math.cos(t)).toFixed(1)},${(170 + 120 * r * Math.sin(t)).toFixed(1)}`; }).join(" ")}"/>`);
    AX.forEach((n, a) => { const t = -Math.PI / 2 + a * 2 * Math.PI / 8, c = Math.cos(t); axes += `<text x="${(180 + 146 * c).toFixed(1)}" y="${(173 + 138 * Math.sin(t)).toFixed(1)}" text-anchor="${Math.abs(c) < .3 ? "middle" : c > 0 ? "start" : "end"}">${n}</text>`; });
    $("#sco").innerHTML = `<div class="who"><b>${esc(S.full[i])}</b><small>${esc(S.t[i])} · ${S.lg[i]} · ${S.pos[i]} · ${S.min[i]} min</small>`
      + `<svg class="rad" viewBox="-30 -10 420 360">${rings}${axes}${poly(S.pct[i], RED, "rgba(216,69,43,.16)")}${poly(S.pct[best], BLUE, "rgba(41,76,119,.12)")}</svg>`
      + `<p class="note"><span class="lgk" style="background:${RED}">${esc(S.full[i])}</span> <span class="lgk" style="background:${BLUE}">${esc(S.full[best])}</span> Percentile against other ${S.pos[i]} players, 0 at the centre and 100 at the edge.</p></div>`
      + `<div><h3 class="sub" style="margin-top:0">Most similar players</h3>${top.map(([s, j]) => `<div class="sim"><div><b>${esc(S.full[j])}</b><small>${esc(S.t[j])} · ${S.lg[j]} · ${S.pos[j]}</small></div><div class="track"><i style="width:${Math.max(s, 0) * 100}%"></i></div><em>${Math.round(s * 100)}%</em></div>`).join("")}</div>`;
  };
  const start = S.full.findIndex(n => n.includes("Dybala")); $("#scq").value = label(start < 0 ? 0 : start);
  $("#scq").oninput = run; $("#scp").onchange = run; run();
}

/* ---------- Fixtures calendar ---------- */
const COLORS = { "Premier League": "#294C77", "La Liga": "#D8452B", "Serie A": "#2E6A47", "Bundesliga": "#B27A0A", "Ligue 1": "#7A4E7E" };
const TAG = { "Premier League": "PL", "La Liga": "LL", "Serie A": "SA", "Bundesliga": "BL", "Ligue 1": "L1" };
const CODES = { "Premier League": "en.1", "La Liga": "es.1", "Serie A": "it.1", "Bundesliga": "de.1", "Ligue 1": "fr.1" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const club = n => n.replace(/^(1\. FC|AFC|FC|SV|RCD|ACF|AC|AS|SS|US) /, "").replace(/ (FC|CF|AFC)$/, "");
const pad = n => String(n).padStart(2, "0");
const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const flat = o => Object.entries(o).flatMap(([lg, rows]) => rows.map(r => ({ lg, date: r[0], time: r[1], home: club(r[2]), away: club(r[3]), round: r[4], hs: r[5], as: r[6] })));

function initCalendar() {
  let FX = flat(D.fx), f = "All", ym = [now.getFullYear(), now.getMonth()], sel = today;
  const hasFx = d => FX.some(m => m.date === d && (f === "All" || m.lg === f));
  const row = m => `<li><time>${m.time || "TBC"}</time><div><span class="vs">${esc(m.home)} v ${esc(m.away)}</span>${m.hs !== undefined ? `<span class="ft">${m.hs}–${m.as}</span>` : ""}<small><span class="lgk" style="background:${COLORS[m.lg]}">${TAG[m.lg]}</span>${m.lg} · ${esc(m.round)}</small></div></li>`;
  const render = () => {
    const [Y, M] = ym, days = new Date(Y, M + 1, 0).getDate(), lead = (new Date(Y, M, 1).getDay() + 6) % 7, by = {};
    FX.forEach(m => { if (f === "All" || m.lg === f) (by[m.date] = by[m.date] || []).push(m); });
    let cells = '<span class="day"></span>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const k = `${Y}-${pad(M + 1)}-${pad(d)}`, ms = by[k] || [];
      cells += `<button class="day${ms.length ? " has" : ""}${k === today ? " today" : ""}${k === sel ? " sel" : ""}" data-d="${k}"><b>${d}</b><span class="dots">${[...new Set(ms.map(m => m.lg))].map(l => `<i style="background:${COLORS[l]}"></i>`).join("")}</span>${ms.length ? `<em>${ms.length}</em>` : ""}</button>`;
    }
    $("#calg").innerHTML = cells; $("#cm").textContent = `${MONTHS[M]} ${Y}`;
    document.querySelectorAll("#calg .has").forEach(b => b.onclick = () => { sel = b.dataset.d; render(); });
    const list = (by[sel] || []).sort((a, b) => a.time.localeCompare(b.time));
    $("#cd").textContent = new Date(sel + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    $("#cl").innerHTML = list.length ? list.map(row).join("") : `<li><span></span><div class="note" style="margin:0">No matches on this day. Pick a day with dots.</div></li>`;
    $("#cf").innerHTML = ["All", ...Object.keys(COLORS)].map(l => `<button class="${l === f ? "on" : ""}">${l}</button>`).join("");
    document.querySelectorAll("#cf button").forEach(b => b.onclick = () => { f = b.textContent; render(); });
    const next = FX.filter(m => m.date >= today && (f === "All" || m.lg === f)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
    $("#nx").innerHTML = next.length ? next.map(m => `<li><time>${new Date(m.date + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${m.time || "TBC"}</time><span class="lgk" style="background:${COLORS[m.lg]}">${TAG[m.lg]}</span><b>${esc(m.home)}</b> v <b>${esc(m.away)}</b></li>`).join("") : `<li>No later fixtures in the data yet.</li>`;
  };
  const first = FX.filter(m => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!hasFx(sel) && first) { sel = first.date; ym = [+sel.slice(0, 4), +sel.slice(5, 7) - 1]; }
  $("#cp").onclick = () => { ym = ym[1] ? [ym[0], ym[1] - 1] : [ym[0] - 1, 11]; render(); };
  $("#cn").onclick = () => { ym = ym[1] < 11 ? [ym[0], ym[1] + 1] : [ym[0] + 1, 0]; render(); };
  $("#cn2").textContent = "Fixtures: openfootball community data, kick-off times as listed for each league's local time zone. Dates can change; always confirm with the club. Past matches show a score when it is in the data.";
  render();
  // try to refresh from the live fixture feed; keep the built-in snapshot if anything fails
  const season = (m => `${m ? now.getFullYear() : now.getFullYear() - 1}-${String((m ? now.getFullYear() : now.getFullYear() - 1) + 1).slice(2)}`)(now.getMonth() >= 6);
  Promise.allSettled(Object.entries(CODES).map(([lg, c]) => fetch(`https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${c}.json`).then(r => r.json())
    .then(j => [lg, j.matches.map(m => [m.date, m.time || "", m.team1, m.team2, m.round || "", ...(((m.score || {}).ft || []).slice(0, 2))])]))).then(res => {
    const ok = res.filter(r => r.status === "fulfilled").map(r => r.value);
    if (ok.length === 5) { FX = flat(Object.fromEntries(ok)); render(); }
  });
}
