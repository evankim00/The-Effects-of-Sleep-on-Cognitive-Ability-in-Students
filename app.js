/* Sleep Debt Simulator: model + rendering. No dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ Constants
  const NIGHTS = 91;            // 13 weeks, about 3 months
  const GOAL = 8;               // hours
  const REST_HOURS = 8;
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const COURSES = [
    { key: 'g_bio', name: 'Biology',      kind: 'Memorizing facts',    m: 1.15 },
    { key: 'g_his', name: 'U.S. History', kind: 'Reading and recall',  m: 1.00 },
    { key: 'g_alg', name: 'Algebra II',   kind: 'Multi-step problems', m: 0.85 },
  ];
  const KSS_WORDS = [
    '', 'Extremely alert', 'Very alert', 'Alert', 'Rather alert', 'Neither alert nor sleepy',
    'Some signs of sleepiness', 'Sleepy, but no effort to stay awake',
    'Sleepy, some effort to stay awake', 'Fighting sleep',
  ];
  const SERIES_KEYS = ['sleep', 'debt', 'kss', 'core', 'lapse', 'rt', ...COURSES.map(c => c.key)];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------------ Helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0; while (!u) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  function letter(p) {
    if (p == null) return '—';
    if (p >= 93) return 'A';  if (p >= 90) return 'A−';
    if (p >= 87) return 'B+'; if (p >= 83) return 'B';  if (p >= 80) return 'B−';
    if (p >= 77) return 'C+'; if (p >= 73) return 'C';  if (p >= 70) return 'C−';
    if (p >= 67) return 'D+'; if (p >= 63) return 'D';  if (p >= 60) return 'D−';
    return 'F';
  }
  const GPA = { 'A': 4, 'A−': 3.7, 'B+': 3.3, 'B': 3, 'B−': 2.7, 'C+': 2.3, 'C': 2, 'C−': 1.7, 'D+': 1.3, 'D': 1, 'D−': 0.7, 'F': 0 };

  function dayLabel(d) {
    if (d <= 0) return 'Before the semester · Day 0 of 91';
    return `Week ${Math.ceil(d / 7)}, ${DAYS[(d - 1) % 7]} · Day ${d} of ${NIGHTS}`;
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // ------------------------------------------------------------------ Model
  // Day i = 1..91; sleep[i] is the night before it. The semester starts on a Monday.
  function simulate(hours, weekendCatchup, seed) {
    const r = mulberry32(seed);
    const out = {};
    SERIES_KEYS.forEach(k => { out[k] = new Array(NIGHTS + 1).fill(null); });

    let D = 0, P = 0, S = 0, n = 0;
    const kP = Math.exp(-1 / 4), kS = Math.exp(-1 / 21);
    const sums = {}; COURSES.forEach(c => { sums[c.key] = 0; });

    out.sleep[0] = hours; out.debt[0] = 0; out.kss[0] = 3; out.core[0] = 255; out.lapse[0] = 0.01; out.rt[0] = 259;

    for (let i = 1; i <= NIGHTS; i++) {
      const dow = (i - 1) % 7;
      const weekend = dow >= 5;
      let s = hours;
      if (weekendCatchup && weekend && hours < GOAL) s = Math.min(9, hours + 2);
      const def = GOAL - s;

      D = Math.max(0, D + def);
      P = Math.max(0, P * kP + def);
      S = Math.max(0, S * kS + def);

      const kss = clamp(3 + 6 * (1 - Math.exp(-P / 12)) + gauss(r) * 0.22, 1, 9);
      const core = 255 + 1.2 * S + 1.5 * P;
      const lapse = Math.min(0.3, 0.01 + 0.0015 * S + 0.003 * P);
      const rt = (1 - lapse) * core + lapse * 650 + gauss(r) * 3;

      out.sleep[i] = s; out.debt[i] = D; out.kss[i] = kss;
      out.core[i] = core; out.lapse[i] = lapse; out.rt[i] = rt;

      if (!weekend) n++;
      COURSES.forEach(c => {
        const noise = clamp(gauss(r) * 1.2, -2.5, 2.5);
        if (!weekend) {
          const pen = c.m * 40 * (1 - Math.exp(-(0.3 * S + 0.4 * P) / 40));
          sums[c.key] += clamp(96 - pen + noise, 0, 100);
        }
        out[c.key][i] = sums[c.key] / n;
      });
    }
    return out;
  }

  // Linear interpolation into a series at fractional day d
  function at(arr, d) {
    const i = Math.floor(d), f = d - i;
    if (i >= NIGHTS) return arr[NIGHTS];
    const a = arr[i], b = arr[i + 1];
    if (a == null) return f > 0.5 ? b : null;
    if (b == null || f === 0) return a;
    return a + (b - a) * f;
  }

  // ------------------------------------------------------------------ State
  const state = { day: 45, target: 45, hours: 5, weekend: false, playing: false };
  const A = simulate(REST_HOURS, false, 11);
  let B = simulate(state.hours, state.weekend, 23);
  let morph = null;

  function setB(next) {
    if (reduceMotion.matches) { B = next; morph = null; requestRender(); return; }
    const from = {};
    SERIES_KEYS.forEach(k => { from[k] = B[k].slice(); });
    morph = { from, to: next, t0: performance.now() };
    B = { ...next };
    SERIES_KEYS.forEach(k => { B[k] = from[k].slice(); });
    loop();
  }

  // Critically damped spring: no overshoot on data, settles in about 450 ms
  const springProgress = t => 1 - (1 + 15 * t) * Math.exp(-15 * t);

  function stepMorph(now) {
    if (!morph) return false;
    const t = (now - morph.t0) / 1000;
    const p = t > 0.7 ? 1 : springProgress(t);
    SERIES_KEYS.forEach(k => {
      const a = morph.from[k], b = morph.to[k], o = B[k];
      for (let i = 0; i <= NIGHTS; i++) {
        o[i] = (a[i] == null || b[i] == null) ? b[i] : a[i] + (b[i] - a[i]) * p;
      }
    });
    if (p >= 1) { B = morph.to; morph = null; return false; }
    return true;
  }

  // ------------------------------------------------------------------ Line chart
  function lineChart(svg, opt) {
    const W = Math.max(260, svg.clientWidth || svg.parentNode.clientWidth);
    const H = opt.height;
    const m = { l: opt.ml || 40, r: 10, t: 8, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = d => m.l + (d / NIGHTS) * iw;
    const y = v => m.t + (1 - (v - opt.yMin) / (opt.yMax - opt.yMin)) * ih;
    const day = state.day;
    let s = '';

    opt.yTicks.forEach(t => {
      s += `<line class="${t === opt.yMin ? 'g0' : 'g'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${opt.yFmt(t)}</text>`;
    });
    const every = W < 480 ? 4 : 2;
    for (let w = 1; w <= 13; w++) {
      const xx = x(w * 7);
      s += `<line class="xt" x1="${xx}" x2="${xx}" y1="${H - m.b}" y2="${H - m.b + 4}"/>`;
      if (w % every === 1 || w === 13) s += `<text x="${xx}" y="${H - m.b + 17}" text-anchor="${w === 13 ? 'end' : 'middle'}">Week ${w}</text>`;
    }

    opt.series.forEach(se => {
      const start = se.data[0] == null ? 1 : 0;
      let full = '', part = '';
      for (let i = start; i <= NIGHTS; i++) {
        const seg = `${i === start ? 'M' : 'L'}${x(i).toFixed(1)},${y(se.data[i]).toFixed(1)}`;
        full += seg;
        if (i <= day) part += seg;
      }
      const v = at(se.data, day);
      if (v != null && day > start) part += `L${x(day).toFixed(1)},${y(v).toFixed(1)}`;
      s += `<path class="ghost ${se.cls}" d="${full}"/>`;
      if (part) s += `<path class="line ${se.cls}" d="${part}"/>`;
    });

    s += `<line class="cursor" x1="${x(day)}" x2="${x(day)}" y1="${m.t}" y2="${H - m.b}"/>`;
    opt.series.forEach(se => {
      const v = at(se.data, day);
      if (v != null) s += `<circle class="dot ${se.cls}" cx="${x(day)}" cy="${y(v)}" r="4.5"/>`;
    });

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.innerHTML = s;
  }

  // ------------------------------------------------------------------ Reaction trials
  function trials(series, d, seed) {
    const i = Math.round(d);
    const r = mulberry32(seed * 1000 + i);
    const core = series.core[i], lapse = series.lapse[i];
    const sd = 24 + (core - 255) * 0.45;
    const out = [];
    for (let k = 0; k < 20; k++) {
      if (r() < lapse) out.push(Math.min(1000, 500 + -Math.log(1 - r()) * 170));
      else out.push(clamp(core + gauss(r) * sd, 160, 495));
    }
    return out;
  }

  function trialChart(svg) {
    const W = Math.max(260, svg.clientWidth || svg.parentNode.clientWidth);
    const rows = [{ label: 'A', data: trials(A, state.day, 1), cls: 'sa' }, { label: 'B', data: trials(B, state.day, 2), cls: 'sb' }];
    const rowH = 32, m = { l: 40, r: 10, t: 18, b: 24 };
    const H = m.t + rows.length * rowH + m.b;
    const lo = 150, hi = 1000;
    const x = v => m.l + ((clamp(v, lo, hi) - lo) / (hi - lo)) * (W - m.l - m.r);
    let s = `<rect class="zone" x="${x(500)}" y="${m.t}" width="${x(hi) - x(500)}" height="${rows.length * rowH}" rx="4"/>`;
    const ticks = W < 480 ? [200, 400, 600, 800, 1000] : [200, 300, 400, 500, 600, 700, 800, 900, 1000];
    ticks.forEach(t => {
      s += `<line class="xt" x1="${x(t)}" x2="${x(t)}" y1="${H - m.b}" y2="${H - m.b + 4}"/>`;
      s += `<text x="${x(t)}" y="${H - m.b + 17}" text-anchor="${t === 1000 ? 'end' : 'middle'}">${t === 1000 ? '1000 ms' : t}</text>`;
    });
    s += `<line class="g0" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    s += `<line class="thr" x1="${x(500)}" x2="${x(500)}" y1="${m.t - 4}" y2="${H - m.b}"/>`;
    s += `<text class="thr-l" x="${x(500) + 6}" y="${m.t - 6}">Lapse zone, 500 ms or slower</text>`;
    rows.forEach((row, ri) => {
      const cy = m.t + ri * rowH + rowH / 2;
      s += `<text class="row-l" x="${m.l - 12}" y="${cy + 4}" text-anchor="end">${row.label}</text>`;
      row.data.forEach((v, k) => {
        const jitter = ((k * 37) % 9 - 4) * 1.5;
        s += `<circle class="trial ${row.cls}" cx="${x(v).toFixed(1)}" cy="${(cy + jitter).toFixed(1)}" r="4.5"/>`;
      });
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.innerHTML = s;
  }

  // ------------------------------------------------------------------ Grade sparklines
  function sparkline(svg, keyName) {
    const W = Math.max(160, svg.clientWidth || 300), H = 52;
    const lo = 60, hi = 100;
    const x = d => (d / NIGHTS) * (W - 6) + 3;
    const y = v => 5 + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * (H - 10);
    const day = state.day;
    let s = `<line class="thr" x1="0" x2="${W}" y1="${y(90)}" y2="${y(90)}" style="opacity:.4"/>`;
    [[A, 'sa'], [B, 'sb']].forEach(([ser, cls]) => {
      const arr = ser[keyName];
      let full = '', part = '';
      for (let i = 1; i <= NIGHTS; i++) {
        const seg = `${i === 1 ? 'M' : 'L'}${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
        full += seg; if (i <= day) part += seg;
      }
      s += `<path class="ghost ${cls}" d="${full}"/>`;
      if (part) s += `<path class="line ${cls}" d="${part}" style="stroke-width:2"/>`;
      const v = at(arr, day);
      if (v != null) s += `<circle class="dot ${cls}" cx="${x(day)}" cy="${y(v)}" r="3.5"/>`;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }

  // ------------------------------------------------------------------ Hypnogram (hero)
  // A simplified night: [stage, minutes]. 0 Awake, 1 REM, 2 Light, 3 Deep.
  const NIGHT = [
    [2, 20], [3, 45], [2, 10], [1, 10],
    [2, 20], [3, 30], [2, 15], [1, 20],
    [0, 3], [2, 30], [3, 10], [2, 15], [1, 30],
    [0, 2], [2, 40], [1, 40],
    [2, 35], [1, 45],
    [0, 3], [2, 27], [1, 30],
  ];
  const STAGE_NAMES = ['Awake', 'REM', 'Light', 'Deep'];

  function clock(h) {
    const hh = ((h % 24) + 24) % 24;
    const ap = hh >= 12 ? 'pm' : 'am';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:00 ${ap}`;
  }

  function hypnogram() {
    const svg = $('hypnogram');
    const W = Math.max(260, svg.clientWidth || svg.parentNode.clientWidth);
    const narrow = W < 560;
    const m = { l: narrow ? 44 : 54, r: 8 };
    const plotH = 64, titleH = 22, gap = 18;
    const iw = W - m.l - m.r;
    const x = min => m.l + (min / 480) * iw;
    let s = '';

    const rows = [
      { cls: 'sa', title: 'Student A', sub: `${clock(23)} to 7:00 am, 8 h`, cut: 480 },
      { cls: 'sb', title: 'Student B', sub: `${clock(7 - state.hours)} to 7:00 am, ${state.hours} h`, cut: state.hours * 60 },
    ];

    rows.forEach((row, ri) => {
      const top = ri * (titleH + plotH + gap);
      const y0 = top + titleH + 6;
      const yS = st => y0 + (st / 3) * (plotH - 12);
      s += `<text class="row-t" x="0" y="${top + 14}">${row.title}</text>`;
      s += `<text class="row-s" x="${narrow ? 72 : 82}" y="${top + 14}">${row.sub}</text>`;
      STAGE_NAMES.forEach((n, st) => {
        s += `<text class="stage-l" x="${m.l - 8}" y="${yS(st) + 4}" text-anchor="end">${n}</text>`;
        s += `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${yS(st)}" y2="${yS(st)}"/>`;
      });

      let t = 0, kept = '', lost = '', rem = '', prevY = null;
      NIGHT.forEach(([st, dur]) => {
        const a = t, b = t + dur; t = b;
        const yy = yS(st);
        const seg = (from, to) => `${prevY == null ? 'M' : 'L'}${x(from).toFixed(1)},${(prevY == null ? yy : prevY).toFixed(1)}L${x(from).toFixed(1)},${yy.toFixed(1)}L${x(to).toFixed(1)},${yy.toFixed(1)}`;
        if (b <= row.cut) {
          kept += seg(a, b);
          if (st === 1) rem += `M${x(a) + 2},${yy}L${x(b) - 2},${yy}`;
        } else if (a >= row.cut) {
          lost += (lost ? '' : `M${x(a).toFixed(1)},${(prevY ?? yy).toFixed(1)}`) + `L${x(a).toFixed(1)},${yy.toFixed(1)}L${x(b).toFixed(1)},${yy.toFixed(1)}`;
        } else {
          kept += seg(a, row.cut);
          if (st === 1 && row.cut - a > 4) rem += `M${x(a) + 2},${yy}L${x(row.cut) - 2},${yy}`;
          lost += `M${x(row.cut).toFixed(1)},${yy.toFixed(1)}L${x(b).toFixed(1)},${yy.toFixed(1)}`;
        }
        prevY = yy;
      });
      s += `<path class="stage" d="${kept}"/>`;
      if (lost) s += `<path class="stage lost" d="${lost}"/>`;
      s += `<path class="rem ${row.cls}" d="${rem}"/>`;
      if (row.cut < 480) {
        s += `<line class="alarm" x1="${x(row.cut)}" x2="${x(row.cut)}" y1="${y0 - 6}" y2="${y0 + plotH - 6}"/>`;
        s += `<text class="alarm-l" x="${x(row.cut) + 6}" y="${y0 + plotH - 8}">Alarm</text>`;
      }
    });

    const axisY = 2 * (titleH + plotH + gap) - gap + 6;
    for (let h = 0; h <= 8; h++) {
      if (narrow && h % 2) continue;
      s += `<text x="${x(h * 60)}" y="${axisY + 12}" text-anchor="${h === 8 ? 'end' : h === 0 ? 'start' : 'middle'}">${h === 0 ? 'Fall asleep' : h + ' h'}</text>`;
    }
    const H = axisY + 18;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.innerHTML = s;
  }

  // ------------------------------------------------------------------ DOM setup
  const els = {
    day: $('day'), dayLabel: $('day-label'), play: $('play'), playText: $('play-text'), weekend: $('weekend'),
    chartKss: $('chart-kss'), chartRt: $('chart-rt'), chartTrials: $('chart-trials'),
    kssA: $('kss-a'), kssB: $('kss-b'), gradeRows: $('grade-rows'), nightsRow: $('nights-row'),
  };

  // KSS ticks
  const tickBox = $('kss-ticks');
  for (let k = 1; k <= 9; k++) {
    const t = document.createElement('i');
    t.className = 'kss-tick';
    t.style.left = `${((k - 1) / 8) * 100}%`;
    t.innerHTML = `<span>${k}</span>`;
    tickBox.appendChild(t);
  }

  // Sleep calendars
  function buildCalendar(host, cls) {
    const wrap = document.createElement('div');
    wrap.className = 'cal-wrap';
    wrap.innerHTML = `<div class="cal-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span>${d}</span>`).join('')}</div>`;
    const right = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = `cal ${cls}`;
    const cells = [];
    for (let i = 1; i <= NIGHTS; i++) {
      const c = document.createElement('span');
      c.className = 'cell';
      c.innerHTML = '<i></i>';
      grid.appendChild(c);
      cells.push({ el: c, f: -1, state: '' });
    }
    right.appendChild(grid);
    right.insertAdjacentHTML('beforeend', `<div class="cal-weeks">${Array.from({ length: 13 }, (_, w) => `<span>${w + 1}</span>`).join('')}</div>`);
    wrap.appendChild(right);
    host.replaceWith(wrap);
    wrap.querySelector('.cal').id = host.id;
    return cells;
  }
  const calA = buildCalendar($('cal-a'), 'a');
  const calB = buildCalendar($('cal-b'), 'b');

  function paintCalendar(cells, series, di) {
    cells.forEach((c, k) => {
      const i = k + 1;
      const f = clamp(series.sleep[i] / GOAL, 0, 1);
      if (Math.abs(f - c.f) > 0.001) { c.el.style.setProperty('--f', f.toFixed(3)); c.f = f; }
      const st = i > di ? 'future' : i === di ? 'today' : '';
      if (st !== c.state) {
        c.el.classList.toggle('future', st === 'future');
        c.el.classList.toggle('today', st === 'today');
        c.state = st;
      }
    });
  }

  let lastTokens = -1;
  function paintNights(debt) {
    const n = debt / GOAL;
    const key = Math.round(n * 20);
    if (key === lastTokens) return;
    lastTokens = key;
    const whole = Math.floor(n), frac = n - whole;
    let h = '';
    for (let k = 0; k < whole; k++) h += '<span class="night-tok"><i></i></span>';
    if (frac > 0.05) h += `<span class="night-tok"><i style="--f:${frac.toFixed(2)}"></i></span>`;
    els.nightsRow.innerHTML = h;
    $('nights-n').textContent = n.toFixed(1);
  }

  // Grade rows
  const gradeEls = COURSES.map(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <th scope="row"><span class="course">${c.name}</span><span class="kind">${c.kind}</span></th>
      <td class="grade-cell a"><span class="letter">—</span><span class="pct">—</span></td>
      <td class="grade-cell b"><span class="letter">—</span><span class="pct">—</span></td>
      <td class="spark-cell"><svg class="chart spark" aria-hidden="true"></svg></td>`;
    els.gradeRows.appendChild(tr);
    const cells = tr.querySelectorAll('.grade-cell');
    return {
      c,
      aL: cells[0].querySelector('.letter'), aP: cells[0].querySelector('.pct'),
      bL: cells[1].querySelector('.letter'), bP: cells[1].querySelector('.pct'),
      spark: tr.querySelector('.spark'),
    };
  });

  function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
  function setHTML(el, html) { if (el.innerHTML !== html) el.innerHTML = html; }
  function setLetter(el, txt) {
    if (el.textContent === txt) return;
    el.textContent = txt;
    if (reduceMotion.matches) return;
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
  }
  const SA = '<span class="a-ink">Student A</span>';
  const SB = '<span class="b-ink">Student B</span>';

  // ------------------------------------------------------------------ Render
  function render() {
    const d = state.day;
    const di = Math.round(d);

    // Controls
    els.day.style.setProperty('--p', `${(d / NIGHTS) * 100}%`);
    if (state.playing) els.day.value = d;
    setText(els.dayLabel, dayLabel(di));
    setText($('board-day'), di === 0 ? 'Day 0' : `Day ${di}`);

    const debtA = at(A.debt, d), debtB = at(B.debt, d);
    const kssA = at(A.kss, d), kssB = at(B.kss, d);
    const rtA = at(A.rt, d), rtB = at(B.rt, d);
    const lapA = Math.round(at(A.lapse, d) * 20), lapB = Math.round(at(B.lapse, d) * 20);

    // Scoreboard
    const slB = di === 0 ? state.hours : B.sleep[di];
    setText($('s-sleep-a'), `${REST_HOURS.toFixed(1)} h`);
    setText($('s-sleep-b'), `${slB.toFixed(1)} h`);
    setText($('s-debt-a'), `${debtA.toFixed(0)} h`);
    setText($('s-debt-b'), `${debtB.toFixed(0)} h`);
    setText($('s-kss-a'), kssA.toFixed(1));
    setText($('s-kss-b'), kssB.toFixed(1));
    setText($('s-rt-a'), `${Math.round(rtA)} ms`);
    setText($('s-rt-b'), `${Math.round(rtB)} ms`);

    // 1 Sleep debt
    setHTML($('f1-b'), `${debtB.toFixed(1)}<small> h</small>`);
    setHTML($('f1-a'), `${debtA.toFixed(1)}<small> h</small>`);
    setHTML($('t1'), di === 0
      ? 'The semester hasn\'t started yet. Press <strong>Play semester</strong> or drag the slider.'
      : `After ${plural(di, 'night')}, ${SB} is <strong>${debtB.toFixed(0)} hours</strong> short on sleep, the same as skipping <strong>${(debtB / GOAL).toFixed(1)} full nights</strong>. ${SA} owes nothing.`);
    paintCalendar(calA, A, di);
    paintCalendar(calB, B, di);
    paintNights(debtB);

    // 2 Sleepiness
    const wA = KSS_WORDS[clamp(Math.round(kssA), 1, 9)], wB = KSS_WORDS[clamp(Math.round(kssB), 1, 9)];
    setText($('f2-a'), kssA.toFixed(1));
    setText($('f2-b'), kssB.toFixed(1));
    setHTML($('t2'), `${SB} rates <strong>${kssB.toFixed(1)}</strong>, “${wB.toLowerCase()}.” ${SA} rates <strong>${kssA.toFixed(1)}</strong>, “${wA.toLowerCase()}.”`);
    els.kssA.style.setProperty('--x', `${((kssA - 1) / 8) * 100}%`);
    els.kssB.style.setProperty('--x', `${((kssB - 1) / 8) * 100}%`);
    lineChart(els.chartKss, {
      height: 150, yMin: 1, yMax: 9, yTicks: [1, 3, 5, 7, 9], yFmt: t => t, ml: 28,
      series: [{ data: A.kss, cls: 'sa' }, { data: B.kss, cls: 'sb' }],
    });

    // 3 Reaction time
    setHTML($('f3-a'), `${Math.round(rtA)}<small> ms</small>`);
    setHTML($('f3-b'), `${Math.round(rtB)}<small> ms</small>`);
    setHTML($('t3'), `${SB} reacts <strong>${Math.round(rtB - rtA)} ms slower</strong> on average and has about <strong>${plural(lapB, 'lapse')}</strong> in every 20 tries. ${SA} has ${lapA === 0 ? 'none' : `about ${lapA}`}.`);
    trialChart(els.chartTrials);
    lineChart(els.chartRt, {
      height: 160, yMin: 200, yMax: 450, yTicks: [200, 250, 300, 350, 400, 450], yFmt: t => t,
      series: [{ data: A.rt, cls: 'sa' }, { data: B.rt, cls: 'sb' }],
    });

    // 4 Grades + GPA
    let gpaA = 0, gpaB = 0;
    const lettersB = [];
    gradeEls.forEach(g => {
      const a = at(A[g.c.key], d), b = at(B[g.c.key], d);
      const la = letter(a), lb = letter(b);
      setLetter(g.aL, la); setLetter(g.bL, lb);
      setText(g.aP, a == null ? '—' : `${a.toFixed(1)}%`);
      setText(g.bP, b == null ? '—' : `${b.toFixed(1)}%`);
      gpaA += GPA[la] || 0; gpaB += GPA[lb] || 0;
      lettersB.push(`${lb} in ${g.c.name}`);
      sparkline(g.spark, g.c.key);
    });
    const hasGrades = at(A.g_bio, d) != null;
    const gA = hasGrades ? (gpaA / 3).toFixed(2) : '—', gB = hasGrades ? (gpaB / 3).toFixed(2) : '—';
    setText($('s-gpa-a'), gA); setText($('s-gpa-b'), gB);
    setText($('f4-a'), gA); setText($('f4-b'), gB);
    setHTML($('t4'), !hasGrades
      ? 'Grades start once classes do.'
      : gpaB === gpaA
        ? `Both students have straight A's so far. Keep going.`
        : `${SA} keeps straight A's. ${SB} has slipped to <strong>${lettersB[0]}</strong>, <strong>${lettersB[1]}</strong> and <strong>${lettersB[2]}</strong>.`);
  }

  let queued = false;
  function requestRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  // ------------------------------------------------------------------ Animation loop
  let running = false, last = 0;
  const DAYS_PER_SEC = 9;

  function loop() {
    if (running) return;
    running = true; last = performance.now();
    requestAnimationFrame(tick);
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let keep = stepMorph(now);
    if (state.playing) {
      state.day = Math.min(NIGHTS, state.day + dt * DAYS_PER_SEC);
      state.target = state.day;
      if (state.day >= NIGHTS) setPlaying(false);
      else keep = true;
    } else {
      // Ease toward the slider so drags and track clicks glide instead of jumping.
      const diff = state.target - state.day;
      if (Math.abs(diff) > 0.002) { state.day += diff * (1 - Math.exp(-dt * 26)); keep = true; }
      else state.day = state.target;
    }
    render();
    if (keep) requestAnimationFrame(tick);
    else running = false;
  }

  function setPlaying(on) {
    state.playing = on;
    els.play.classList.toggle('on', on);
    els.play.setAttribute('aria-pressed', on);
    els.playText.textContent = on ? 'Pause' : 'Play semester';
    if (on) {
      if (state.day >= NIGHTS - 0.01) { state.day = 0; state.target = 0; }
      if (reduceMotion.matches) {
        state.day = state.target = NIGHTS; state.playing = false;
        els.play.classList.remove('on');
        els.playText.textContent = 'Play semester';
        els.day.value = NIGHTS;
        requestRender();
        return;
      }
      loop();
    } else {
      requestRender();
    }
  }

  // ------------------------------------------------------------------ Events
  els.play.addEventListener('click', () => setPlaying(!state.playing));

  els.day.addEventListener('input', () => {
    if (state.playing) setPlaying(false);
    state.target = +els.day.value;
    if (reduceMotion.matches) { state.day = state.target; requestRender(); }
    else loop();
  });

  document.querySelectorAll('input[name="hours"]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.hours = +inp.value;
      document.querySelectorAll('.hb').forEach(el => { el.textContent = state.hours; });
      hypnogram();
      setB(simulate(state.hours, state.weekend, 23));
    });
  });
  els.weekend.addEventListener('change', () => {
    state.weekend = els.weekend.checked;
    setB(simulate(state.hours, state.weekend, 23));
  });

  // Redraw SVGs at the new width
  let lastW = 0;
  const onResize = () => {
    const w = document.querySelector('main').clientWidth;
    if (w === lastW) return;
    lastW = w;
    hypnogram();
    requestRender();
  };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.querySelector('main'));
  else window.addEventListener('resize', onResize);

  // Shadow on the control bar once it's pinned
  const controls = $('sim');
  const sentinel = document.createElement('div');
  controls.parentNode.insertBefore(sentinel, controls);
  new IntersectionObserver(([e]) => controls.classList.toggle('stuck', !e.isIntersecting)).observe(sentinel);

  // Reveal panels once as they enter
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealIO.observe(el));

  // ------------------------------------------------------------------ Go
  hypnogram();
  render();
})();
