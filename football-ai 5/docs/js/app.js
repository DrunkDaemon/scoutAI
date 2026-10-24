// ScoutAI front end. The trained xG model (js/xg.js + js/data.js) runs entirely in the browser.
const D = window.D, xg = makeXG(D);
const $ = q => document.querySelector(q);
const f1 = (v, n = 1) => (+v).toFixed(n);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const INK = "#16130E", PAPER = "#F3EEE3", RED = "#D8452B", BLUE = "#294C77", GREEN = "#2E6A47";

$("#count").textContent = `${D.n.matches.toLocaleString()} matches · ${D.n.shots.toLocaleString()} shots`;

/* ---------- tabs ---------- */
const tabs = document.querySelectorAll("#nav button");
tabs.forEach(b => b.onclick = () => {
  tabs.forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("main section").forEach(s => s.hidden = s.id !== b.dataset.t);
  dispatchEvent(new CustomEvent("tab", { detail: b.dataset.t }));
  if (b.dataset.t === "lab") layout();
});

/* ---------- shot calculator: controls ---------- */
const S = { x: 108, y: 40, body: "Foot", type: "Open Play", pat: "Regular Play", tech: "Normal", defs: 1, near: 3, gk: 2, first: 0, press: 0 };
const BASE = { ...S };
const SLIDERS = [["x", "Distance along pitch", 70, 119, 1], ["y", "Width of pitch", 0, 80, 1], ["defs", "Defenders in the way", 0, 6, 1],
                 ["near", "Nearest defender (yd)", .5, 15, .5], ["gk", "Keeper off his line (yd)", 0, 15, .5]];
const SELECTS = [["body", "Body part", ["Foot", "Head", "Other"]], ["type", "Situation", ["Open Play", "Free Kick", "Corner", "Penalty"]],
                 ["pat", "Play pattern", ["Regular Play", "From Counter", "From Corner", "From Free Kick", "From Throw In", "From Keeper", "From Goal Kick", "Other"]],
                 ["tech", "Technique", ["Normal", "Volley", "Half Volley", "Lob", "Overhead Kick", "Backheel", "Diving Header"]]];
const PRESETS = { "Penalty": { x: 108, y: 40, type: "Penalty", defs: 0, near: 12, gk: 0 }, "Tap-in": { x: 117, y: 40, defs: 0, near: 4, gk: 3 },
  "Edge of the box": { x: 98, y: 48, defs: 2, near: 2.5, gk: 3 }, "Header": { x: 111, y: 44, body: "Head", pat: "From Corner", defs: 3, near: 1.5, gk: 2 },
  "Free kick": { x: 94, y: 36, type: "Free Kick", pat: "From Free Kick", defs: 4, near: 9, gk: 5 }, "Long shot": { x: 82, y: 40, defs: 3, near: 2, gk: 4 } };

$("#ctl").innerHTML = `<div class="pre" id="pre">${Object.keys(PRESETS).map(k => `<button type="button">${k}</button>`).join("")}</div>`
  + SLIDERS.map(([k, t, a, b, s]) => `<div class="f"><label>${t}<b id="v_${k}"></b></label><input type="range" id="s_${k}" min="${a}" max="${b}" step="${s}"></div>`).join("")
  + SELECTS.map(([k, t, o]) => `<div class="f"><label>${t}</label><select id="s_${k}">${o.map(v => `<option>${v}</option>`).join("")}</select></div>`).join("")
  + `<label class="ck"><input type="checkbox" id="s_first"> First-time</label><label class="ck"><input type="checkbox" id="s_press"> Under pressure</label>`
  + `<button type="button" class="go" id="go">Take the shot</button>`;

SLIDERS.forEach(([k]) => $("#s_" + k).oninput = e => { S[k] = +e.target.value; schedule(); });
SELECTS.forEach(([k]) => $("#s_" + k).onchange = e => { S[k] = e.target.value; schedule(); });
["first", "press"].forEach(k => $("#s_" + k).onchange = e => { S[k] = +e.target.checked; schedule(); });

/* ---------- pitch drawing ---------- */
const cv = $("#c"), cx = cv.getContext("2d");
const heatCv = document.createElement("canvas"), hx = heatCv.getContext("2d");
heatCv.width = 81; heatCv.height = 50;
let K = 1, ball = null, busy = false;
const PX = y => (y + 1) * K, PY = x => (123 - x) * K;      // pitch yards -> canvas pixels (goal at the top)

// risograph-style ramp: paper -> gold -> red -> dark red
const RAMP = [[0, [216, 69, 43, 0]], [.1, [227, 167, 43, 0]], [.3, [227, 167, 43, 175]], [.6, [216, 69, 43, 225]], [1, [122, 31, 18, 255]]];
function rampColor(t) {
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) {
    const [a, A] = RAMP[i - 1], [b, B] = RAMP[i], u = (t - a) / (b - a);
    return A.map((v, j) => v + (B[j] - v) * u);
  }
  return RAMP[RAMP.length - 1][1];
}
function layout() {
  const w = cv.parentElement.clientWidth, r = devicePixelRatio || 1;
  cv.style.height = w * 64 / 82 + "px";
  cv.width = w * r; cv.height = w * 64 / 82 * r; K = cv.width / 82;
  draw();
}
function computeHeat() {                       // what the same shot would be worth from every spot on the pitch
  const img = hx.createImageData(81, 50), t = { ...S };
  if (t.type === "Penalty") t.type = "Open Play";
  for (let r = 0; r < 50; r++) for (let c = 0; c < 81; c++) {
    t.x = 119 - r; t.y = c;
    img.data.set(rampColor(Math.min(xg(t) / .4, 1)), (r * 81 + c) * 4);
  }
  hx.putImageData(img, 0, 0);
}
function draw() {
  const box = (a, b, w, h) => cx.strokeRect(PX(a), PY(b), w * K, h * K);
  cx.fillStyle = "#EDE6D5"; cx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 8; i += 2) { cx.fillStyle = "#E8E0CC"; cx.fillRect(PX(0), PY(120 - i * 7.5), 80 * K, 7.5 * K); }
  cx.imageSmoothingEnabled = true;
  cx.drawImage(heatCv, PX(-.5), PY(119.5), 81 * K, 50 * K);
  cx.strokeStyle = GREEN; cx.lineWidth = Math.max(1.5, K * .22);
  box(0, 120, 80, 60); box(18, 120, 44, 18); box(30, 120, 20, 6); box(36, 122, 8, 2);
  cx.beginPath(); cx.arc(PX(40), PY(108), 10 * K, .646, 2.495); cx.stroke();
  cx.beginPath(); cx.arc(PX(40), PY(60), 10 * K, Math.PI, 2 * Math.PI); cx.stroke();
  // the goal as the shooter sees it
  cx.fillStyle = "rgba(41,76,119,.16)"; cx.strokeStyle = BLUE; cx.lineWidth = Math.max(1, K * .12);
  cx.beginPath(); cx.moveTo(PX(S.y), PY(S.x)); cx.lineTo(PX(36), PY(120)); cx.lineTo(PX(44), PY(120)); cx.closePath(); cx.fill(); cx.stroke();
  if (ball) {                                   // dashed flight path + ball
    cx.strokeStyle = INK; cx.lineWidth = Math.max(1, K * .15); cx.setLineDash([K * .8, K * .8]);
    cx.beginPath(); cx.moveTo(PX(S.y), PY(S.x)); cx.lineTo(PX(ball.y), PY(ball.x)); cx.stroke(); cx.setLineDash([]);
    cx.beginPath(); cx.arc(PX(ball.y), PY(ball.x), K * 1.1, 0, 7); cx.fillStyle = PAPER; cx.fill(); cx.lineWidth = K * .3; cx.stroke();
  }
  cx.beginPath(); cx.arc(PX(S.y), PY(S.x), K * 1.05, 0, 7);
  cx.fillStyle = INK; cx.fill(); cx.strokeStyle = PAPER; cx.lineWidth = K * .35; cx.stroke();
}

/* ---------- readout ---------- */
const waffle = $("#wf"); waffle.innerHTML = "<i></i>".repeat(100);
const dots = [...waffle.children];
const verdict = p => p >= .6 ? ["Sitter", GREEN] : p >= .3 ? ["Big chance", GREEN] : p >= .12 ? ["Good chance", "#B27A0A"] : p >= .04 ? ["Half chance", RED] : ["Long shot", RED];
let frame = 0;
function schedule() { frame || (frame = requestAnimationFrame(() => { frame = 0; update(); })); }
function update() {
  const p = xg(S), [label, color] = verdict(p), n = Math.round(p * 100);
  $("#pv").textContent = f1(p * 100) + "%";
  $("#vd").textContent = label; $("#vd").style.color = color;
  dots.forEach((d, i) => d.classList.toggle("on", i < n));
  $("#wl").textContent = `${n} in every 100 shots like this go in`;
  SLIDERS.forEach(([k]) => { $("#v_" + k).textContent = S[k]; $("#s_" + k).value = S[k]; });
  computeHeat(); draw();
}
function pick(e) {                              // click or drag on the pitch
  const r = cv.getBoundingClientRect();
  S.y = Math.max(0, Math.min(80, Math.round((e.clientX - r.left) / r.width * 82 - 1)));
  S.x = Math.max(70, Math.min(119, Math.round(123 - (e.clientY - r.top) / r.height * 64)));
  schedule();
}
cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); pick(e); };
cv.onpointermove = e => { if (e.buttons) pick(e); };
addEventListener("resize", layout);

document.querySelectorAll("#pre button").forEach(b => b.onclick = () => {
  const target = { ...BASE, ...PRESETS[b.textContent] }, from = { x: S.x, y: S.y }, t0 = performance.now();
  Object.assign(S, target, from);
  SELECTS.forEach(([k]) => $("#s_" + k).value = S[k]);
  ["first", "press"].forEach(k => $("#s_" + k).checked = !!S[k]);
  (function slide(now) {                        // ease the shot to its new spot
    const u = Math.min((now - t0) / 350, 1), e = 1 - Math.pow(1 - u, 3);
    S.x = from.x + (target.x - from.x) * e; S.y = from.y + (target.y - from.y) * e;
    update(); if (u < 1) requestAnimationFrame(slide);
  })(t0);
});

/* ---------- take the shot ---------- */
const tally = { shots: 0, goals: 0, xg: 0 };
function call(text, color) {
  const el = $("#res"); el.textContent = text; el.style.color = color;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
}
$("#go").onclick = () => {
  if (busy) return; busy = true;
  const p = xg(S), goal = Math.random() < p, onTarget = goal || Math.random() < .55;
  const aim = onTarget ? 37 + Math.random() * 6 : (Math.random() < .5 ? 29 : 51);
  const from = { x: S.x, y: S.y }, t0 = performance.now();
  tally.shots++; tally.xg += p; tally.goals += goal;
  (function fly(now) {
    const u = Math.min((now - t0) / 650, 1);
    ball = { x: from.x + (120 - from.x) * u, y: from.y + (aim - from.y) * u };
    draw();
    if (u < 1) return requestAnimationFrame(fly);
    ball = null; draw();
    call(goal ? "Goal!" : onTarget ? "Saved." : "Wide.", goal ? GREEN : RED);
    $("#t1").textContent = tally.shots; $("#t2").textContent = tally.goals; $("#t3").textContent = f1(tally.xg);
    busy = false;
  })(t0);
};

/* ---------- dumbbell chart: open dot = expected, filled dot = actual ---------- */
function dumbbell(el, rows, step, fmt) {
  const W = 760, L = 210, R = 150, RH = 28, H = rows.length * RH + 34;
  const lo = Math.floor(Math.min(...rows.map(r => Math.min(r[1], r[2]))) / step) * step - step;
  const hi = Math.ceil(Math.max(...rows.map(r => Math.max(r[1], r[2]))) / step) * step + step;
  const sx = v => L + (v - lo) / (hi - lo) * (W - L - R);
  let g = "";
  for (let v = Math.max(lo, 0); v <= hi; v += step)
    g += `<line class="gl" x1="${sx(v)}" x2="${sx(v)}" y1="14" y2="${H - 16}"/><text class="tk" x="${sx(v)}" y="${H - 2}" text-anchor="middle">${v}</text>`;
  rows.forEach(([name, exp, act], i) => {
    const y = 28 + i * RH, d = act - exp, c = d >= 0 ? RED : BLUE;
    g += `<g class="dr"><rect class="hit" x="0" y="${y - RH / 2}" width="${W}" height="${RH}"/>`
      + `<text class="nm" x="${L - 14}" y="${y + 4}" text-anchor="end">${esc(name)}</text>`
      + `<line x1="${sx(exp)}" x2="${sx(act)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="3"/>`
      + `<circle cx="${sx(exp)}" cy="${y}" r="5.5" fill="${PAPER}" stroke="${c}" stroke-width="2"/><circle cx="${sx(act)}" cy="${y}" r="5.5" fill="${c}"/>`
      + `<text class="vl" x="${W - R + 22}" y="${y + 4}">${fmt(act)} / ${fmt(exp)}</text>`
      + `<text class="df" x="${W}" y="${y + 4}" text-anchor="end" fill="${c}">${d > 0 ? "+" : ""}${f1(d)}</text></g>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* ---------- lucky & unlucky ---------- */
const LEAGUES = ["Premier League", "La Liga", "Serie A", "Ligue 1"].filter(l => D.tables[l]);
let league = LEAGUES[0], sort = "pos";
function renderLeague() {
  $("#lg").innerHTML = LEAGUES.map(l => `<button class="${l === league ? "on" : ""}">${l}</button>`).join("");
  document.querySelectorAll("#lg button").forEach(b => b.onclick = () => { league = b.textContent; renderLeague(); });
  document.querySelectorAll(".sortrow button").forEach(b => b.classList.toggle("on", b.dataset.s === sort));
  const T = D.tables[league].map(r => ({ n: r[0], pts: r[2], xp: r[3], d: r[2] - r[3] }));
  const lucky = [...T].sort((a, b) => b.d - a.d)[0], unlucky = [...T].sort((a, b) => a.d - b.d)[0];
  $("#fd").innerHTML =
    `<li><small>Champion</small><b>${T[0].pts}</b>${esc(T[0].n)} won the league with ${T[0].pts} points.</li>`
    + `<li><small>Luckiest</small><b>+${f1(lucky.d)}</b>${esc(lucky.n)} took ${f1(lucky.d)} more points than their chances deserved.</li>`
    + `<li><small>Unluckiest</small><b>${f1(unlucky.d)}</b>${esc(unlucky.n)} should have had about ${Math.round(-unlucky.d)} more points.</li>`;
  const rows = [...T].sort(sort === "d" ? (a, b) => b.d - a.d : (a, b) => b.pts - a.pts).map(t => [t.n, t.xp, t.pts]);
  dumbbell($("#xc"), rows, 10, v => f1(v, 0 + (v % 1 ? 1 : 0)));
}
document.querySelectorAll(".sortrow button").forEach(b => b.onclick = () => { sort = b.dataset.s; renderLeague(); });

/* ---------- finishers ---------- */
const fin = [...D.fin.top, ...D.fin.bot].map(r => [`${r[0]} (${r[1]})`, r[4], r[3]]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]));
dumbbell($("#fc"), fin, 5, v => f1(v, v % 1 ? 1 : 0));

/* ---------- model ---------- */
const AUC = [["Basic baseline (distance + angle)", "Baseline (distance+angle)"], ["This model", "Our model"], ["StatsBomb xG, the industry benchmark", "StatsBomb xG (benchmark)"]];
$("#bars").innerHTML = AUC.map(([label, key]) => `<div class="bar ${key === "Our model" ? "me" : ""}"><span>${label}</span><div class="track"><i style="width:${(D.auc[key] - .5) / .35 * 100}%"></i></div><em>${f1(D.auc[key], 3)}</em></div>`).join("");

renderLeague(); layout(); update();
