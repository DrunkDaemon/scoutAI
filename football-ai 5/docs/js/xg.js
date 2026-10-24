// Runs the trained gradient-boosting xG model in the browser (works in Node too, for testing).
(function (g) {
  function make(D) {
    const R = {}, C = {}, N = D.names.length;
    D.names.forEach((n, i) => n.startsWith("remainder__") ? (R[n.slice(11)] = i) : (C[n.slice(5)] = i));
    function vec(s) {
      const dx = 120 - s.x, d = Math.hypot(dx, 40 - s.y), a = Math.hypot(dx, 36 - s.y), b = Math.hypot(dx, 44 - s.y),
        gk = Math.min(s.gk, d), f = new Float64Array(N);
      f[R.x] = s.x; f[R.y_off] = Math.abs(s.y - 40); f[R.dist] = d;
      f[R.angle] = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - 64) / (2 * a * b))));
      f[R.def_in_triangle] = s.defs; f[R.nearest_def] = s.near; f[R.gk_dist_to_goal] = gk;
      f[R.gk_dist_to_shot] = Math.max(d - gk, 0); f[R.first_time] = s.first; f[R.under_pressure] = s.press;
      for (const k of ["body_part_" + s.body, "shot_type_" + s.type, "technique_" + s.tech, "play_pattern_" + s.pat]) if (k in C) f[C[k]] = 1;
      return f;
    }
    return function xg(s) {
      if (s.type === "Penalty") return D.penalty;
      const f = vec(s); let z = D.base;
      for (const t of D.trees) { let i = 0; while (t[2][i] !== 0) i = f[t[0][i]] <= t[1][i] ? t[2][i] : t[3][i]; z += t[4][i]; }
      return 1 / (1 + Math.exp(-z));
    };
  }
  g.makeXG = make; if (typeof module !== "undefined") module.exports = make;
})(this);
