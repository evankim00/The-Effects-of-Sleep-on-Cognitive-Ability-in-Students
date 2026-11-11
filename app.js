/* Sleep Debt Simulator: model, lecture and semester chart. No dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ Model
  // Every constant is explained in the "Where the numbers come from" table.
  const NIGHTS = 91;        // 13-week semester
  const GOAL = 8;           // h, low end of the 8–10 h recommendation
  const HOLD_AFTER = 14;    // longest controlled restriction study (Van Dongen 2003)
  const LO_DEBT_7 = 23.8;   // 7 nights × 3.4 h less sleep than controls (Lo 2016, PSG)
  const PVT_PROMPTS = 95;   // prompts in a 10-min PVT with 2–10 s gaps

  // Lapses per 10-min PVT for a cumulative sleep debt D (hours).
  function lapsesFor(D) {
    return D <= LO_DEBT_7 ? 2 + 0.68 * D : 2 + 16.2 * Math.pow(D / LO_DEBT_7, 0.67);
  }
  // KSS after n nights at h hours.
  function kssFor(h, n) {
    const short = Math.max(0, GOAL - h);
    return 4.7 + 2.3 * Math.sqrt(short / 3.4) * (1 - Math.exp(-n / 2.5));
  }
  function simulate(h) {
    const short = Math.max(0, GOAL - h);
    const out = { debt: [], lapse: [], kss: [] };
    for (let n = 0; n <= NIGHTS; n++) {
      out.debt.push(n * short);
      out.lapse.push(lapsesFor(Math.min(n, HOLD_AFTER) * short));
      out.kss.push(kssFor(h, n));
    }
    return out;
  }

  // Measured points read from Lo et al. 2016, Figure 2 (B3 = night 0, M1–M7 = nights 1–7)
  const LO = {
    lapse: { short: [1.8, 3.6, 6.2, 7.6, 12.5, 14.0, 16.0, 18.2], rested: [2.2, 2.1, 2.6, 2.2, 2.3, 2.3, 2.6, 3.0] },
    kss:   { short: [4.2, 5.3, 5.9, 6.2, 6.6, 5.9, 6.4, 6.9],      rested: [4.5, 4.4, 5.0, 5.1, 4.7, 4.9, 4.8, 4.9] },
  };

  const KSS_WORDS = ['', 'extremely alert', 'very alert', 'alert', 'rather alert', 'neither alert nor sleepy',
    'some signs of sleepiness', 'sleepy, but no effort to stay awake', 'sleepy, some effort to stay awake', 'fighting sleep'];

  // ------------------------------------------------------------------ Helpers
  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function at(arr, d) {
    const i = Math.floor(d), f = d - i;
    if (i >= NIGHTS) return arr[NIGHTS];
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }
  function niceMax(v) {
    const steps = [10, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800];
    return steps.find(s => s >= v * 1.08) || Math.ceil(v / 100) * 100;
  }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function setHTML(el, h) { if (el.innerHTML !== h) el.innerHTML = h; }
  const SA = '<span class="a-ink">Student A</span>';
  const SB = '<span class="b-ink">Student B</span>';

  // ------------------------------------------------------------------ State
  const state = { day: 45, target: 45, hours: 5, playing: false, metric: 'debt', yMax: 300, yTarget: 300 };
  const A = simulate(GOAL);
  let B = simulate(state.hours);
  let morph = null;

  const spring = t => 1 - (1 + 14 * t) * Math.exp(-14 * t); // critically damped, ~0.5 s

  function setHours(h) {
    state.hours = h;
    const next = simulate(h);
    if (reduceMotion.matches) { B = next; morph = null; }
    else {
      morph = { from: { debt: B.debt.slice(), lapse: B.lapse.slice(), kss: B.kss.slice() }, to: next, t0: performance.now() };
      B = { debt: B.debt.slice(), lapse: B.lapse.slice(), kss: B.kss.slice() };
    }
    retargetY();
    loop();
  }
  function stepMorph(now) {
    if (!morph) return false;
    const p = (now - morph.t0) / 1000 > 0.8 ? 1 : spring((now - morph.t0) / 1000);
    for (const k of ['debt', 'lapse', 'kss']) {
      const a = morph.from[k], b = morph.to[k], o = B[k];
      for (let i = 0; i <= NIGHTS; i++) o[i] = a[i] + (b[i] - a[i]) * p;
    }
    if (p >= 1) { B = morph.to; morph = null; return false; }
    return true;
  }

  function metricTargetMax() {
    if (state.metric === 'kss') return 9;
    const src = simulate(state.hours)[state.metric];
    let m = Math.max(...src);
    if (state.metric === 'lapse') m = Math.max(m, 18.2);
    return niceMax(m);
  }
  function retargetY(jump) {
    state.yTarget = metricTargetMax();
    if (jump || reduceMotion.matches) state.yMax = state.yTarget;
  }

  // ------------------------------------------------------------------ Chart
  const chart = $('chart');
  const METRIC = {
    debt:  { yMin: 0, fmt: v => `${Math.round(v)} h`, val: v => `${Math.round(v)} h`, points: null },
    lapse: { yMin: 0, fmt: v => `${Math.round(v)}`, val: v => v.toFixed(1), points: LO.lapse },
    kss:   { yMin: 1, fmt: v => `${Math.round(v)}`, val: v => v.toFixed(1), points: LO.kss },
  };

  function ticks(min, max) {
    if (state.metric === 'kss') return [1, 3, 5, 7, 9];
    const n = 4, out = [];
    for (let i = 0; i <= n; i++) out.push(min + (max - min) * i / n);
    return out;
  }

  function drawChart() {
    const W = Math.max(280, chart.clientWidth || chart.parentNode.clientWidth);
    const H = W < 560 ? 230 : 300;
    const M = METRIC[state.metric];
    const m = { l: 48, r: 56, t: 14, b: 30 };
    const yMin = M.yMin, yMax = state.yMax;
    const x = d => m.l + (d / NIGHTS) * (W - m.l - m.r);
    const y = v => m.t + (1 - (clamp(v, yMin, yMax * 1.2) - yMin) / (yMax - yMin)) * (H - m.t - m.b);
    const day = state.day;
    let s = `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(255,255,255,0.025)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.09)" stroke-width="2"/></pattern></defs>`;

    if (state.metric === 'lapse') {
      s += `<rect class="held" x="${x(HOLD_AFTER)}" y="${m.t}" width="${x(NIGHTS) - x(HOLD_AFTER)}" height="${H - m.t - m.b}" rx="6"/>`;
      s += `<text class="held-l" x="${x(HOLD_AFTER) + 10}" y="${m.t + 16}">After night 14: no data, value held</text>`;
    }
    ticks(yMin, yMax).forEach((t, i) => {
      s += `<line class="${i === 0 ? 'g0' : 'g'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text x="${m.l - 10}" y="${y(t) + 4}" text-anchor="end">${M.fmt(t)}</text>`;
    });
    const every = W < 560 ? 4 : 2;
    for (let w = 1; w <= 13; w++) {
      if (w % every !== 1 && w !== 13) continue;
      s += `<text x="${x(w * 7)}" y="${H - 8}" text-anchor="middle">Week ${w}</text>`;
    }

    [['sa', A[state.metric]], ['sb', B[state.metric]]].forEach(([cls, arr]) => {
      let full = '', part = '';
      for (let i = 0; i <= NIGHTS; i++) {
        const seg = `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
        full += seg; if (i <= day) part += seg;
      }
      part += `L${x(day).toFixed(1)},${y(at(arr, day)).toFixed(1)}`;
      s += `<path class="ghost ${cls}" d="${full}"/><path class="line ${cls}" d="${part}"/>`;
    });

    if (M.points) {
      [...M.points.short.map((v, i) => [i, v]), ...M.points.rested.map((v, i) => [i, v])]
        .forEach(([i, v]) => { s += `<circle class="pt" cx="${x(i)}" cy="${y(v)}" r="3.6"/>`; });
    }

    const va = at(A[state.metric], day), vb = at(B[state.metric], day);
    s += `<line class="cursor" x1="${x(day)}" x2="${x(day)}" y1="${m.t}" y2="${H - m.b}"/>`;
    s += `<circle class="dot-a" cx="${x(day)}" cy="${y(va)}" r="5.5"/><circle class="dot-b" cx="${x(day)}" cy="${y(vb)}" r="5.5"/>`;
    // Value labels beside the cursor, nudged apart so they never overlap
    let ya = y(va) + 4, yb = y(vb) + 4;
    if (Math.abs(ya - yb) < 16) { if (ya >= yb) { ya = yb + 16; } else { yb = ya + 16; } }
    const right = x(day) > W - m.r - 70;
    const lx = right ? x(day) - 10 : x(day) + 10, anchor = right ? 'end' : 'start';
    s += `<text class="val-l val-b" x="${lx}" y="${yb}" text-anchor="${anchor}">${M.val(vb)}</text>`;
    s += `<text class="val-l val-a" x="${lx}" y="${ya}" text-anchor="${anchor}">${M.val(va)}</text>`;

    chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    chart.setAttribute('height', H);
    chart.innerHTML = s;
  }

  // ------------------------------------------------------------------ Lost nights grid
  const nightsEl = $('nights');
  const nightCells = [];
  for (let i = 0; i < NIGHTS; i++) {
    const c = document.createElement('span');
    c.className = 'n';
    c.innerHTML = '<i></i>';
    nightsEl.appendChild(c);
    nightCells.push({ el: c, f: -1 });
  }
  function paintNights(lost) {
    nightCells.forEach((c, i) => {
      const f = clamp(lost - i, 0, 1);
      if (Math.abs(f - c.f) < 0.002) return;
      c.el.style.setProperty('--f', f.toFixed(3));
      c.el.classList.toggle('full', f >= 1);
      c.f = f;
    });
  }

  // ------------------------------------------------------------------ Render
  const legendData = document.querySelector('.lg-data');
  const legendHeld = document.querySelector('.lg-held');

  function render() {
    const d = state.day, n = Math.round(d);
    const short = GOAL - state.hours;

    // Controls
    const dayInput = $('day');
    dayInput.style.setProperty('--p', `${(d / NIGHTS) * 100}%`);
    if (state.playing) dayInput.value = d;
    setText($('day-label'), n === 0 ? 'Start · Day 0 of 91' : `Week ${Math.ceil(n / 7)} · Day ${n} of ${NIGHTS}`);
    const hoursInput = $('hours');
    hoursInput.style.setProperty('--p', `${((state.hours - 1) / 6) * 100}%`);
    setText($('hours-out'), `${state.hours} h`);

    // Student readouts
    const aL = at(A.lapse, d), bL = at(B.lapse, d), aK = at(A.kss, d), bK = at(B.kss, d), bD = at(B.debt, d);
    setHTML($('a-debt'), `0<small> h</small>`);
    setHTML($('b-debt'), `${Math.round(bD)}<small> h</small>`);
    setText($('a-lapse'), aL.toFixed(1));
    setText($('b-lapse'), bL.toFixed(1));
    setText($('a-kss'), aK.toFixed(1));
    setText($('b-kss'), bK.toFixed(1));
    setText($('a-rate'), `≈${Math.round(aL / PVT_PROMPTS * 100)}% of responses too slow`);
    setText($('b-rate'), `≈${Math.round(bL / PVT_PROMPTS * 100)}% of responses too slow`);
    setText($('stage-sub'), n === 0
      ? 'The night before the semester. Both students start rested. Blurred words are ones missed during a lapse.'
      : `Night ${n} of the semester. Blurred words are ones missed during an attention lapse.`);

    // Takeaway
    let t = '';
    if (state.metric === 'debt') {
      t = n === 0
        ? 'The semester hasn\'t started. Press <strong>Play semester</strong> or drag the slider.'
        : `After ${n} night${n === 1 ? '' : 's'}, ${SB} is <strong>${Math.round(bD)} hours</strong> short: <strong>${(bD / GOAL).toFixed(1)} full nights</strong> of sleep lost. It grows by ${short} h every night because nothing pays it back. ${SA} has lost none.`;
    } else if (state.metric === 'lapse') {
      t = `${SB} has <strong>${bL.toFixed(1)} lapses</strong> per 10-minute test versus ${aL.toFixed(1)} for ${SA}, so about <strong>${Math.round(bL / PVT_PROMPTS * 100)}%</strong> of their responses come too late.` +
        (n > HOLD_AFTER ? ' Held at the night-14 value, because no study has measured longer.' : '');
    } else {
      const w = KSS_WORDS[clamp(Math.round(bK), 1, 9)];
      t = `${SB} rates <strong>${bK.toFixed(1)}</strong>, “${w}.” ${SA}: ${aK.toFixed(1)}. Sleepiness levels off within a week while lapses keep climbing, so tired students underestimate how impaired they are.`;
    }
    setHTML($('takeaway'), t);
    const isDebt = state.metric === 'debt';
    legendData.hidden = isDebt;
    legendHeld.hidden = state.metric !== 'lapse';
    document.querySelectorAll('.lg-line').forEach(el => { el.hidden = isDebt; });
    document.querySelector('.lg-night').hidden = !isDebt;
    chart.style.display = isDebt ? 'none' : '';
    nightsEl.hidden = !isDebt;

    if (isDebt) paintNights(bD / GOAL); else drawChart();
    lecture.rates(aL / PVT_PROMPTS, bL / PVT_PROMPTS);
  }

  let queued = false;
  function requestRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  // ------------------------------------------------------------------ Loop
  const DAYS_PER_SEC = 2;   // a full semester plays in about 45 s
  let running = false, last = 0;
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
      if (state.day >= NIGHTS) setPlaying(false); else keep = true;
    } else {
      const diff = state.target - state.day;
      if (Math.abs(diff) > 0.002) { state.day += diff * (1 - Math.exp(-dt * 14)); keep = true; }
      else state.day = state.target;
    }
    const dy = state.yTarget - state.yMax;
    if (Math.abs(dy) > 0.01) { state.yMax += dy * (1 - Math.exp(-dt * 9)); keep = true; } else state.yMax = state.yTarget;
    render();
    if (keep) requestAnimationFrame(tick); else running = false;
  }

  function setPlaying(on) {
    state.playing = on;
    const btn = $('play');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    $('play-text').textContent = on ? 'Pause' : 'Play semester';
    if (on) {
      if (state.day >= NIGHTS - 0.01) state.day = state.target = 0;
      if (reduceMotion.matches) {
        state.day = state.target = NIGHTS; state.playing = false;
        btn.classList.remove('on'); $('play-text').textContent = 'Play semester';
        $('day').value = NIGHTS; requestRender(); return;
      }
      loop();
    } else requestRender();
  }

  // ------------------------------------------------------------------ Lecture
  const LECTURE = 'Today we are looking at how the brain stores what you learn. New information first lands in the hippocampus, a small curved structure deep inside the temporal lobe. It can only hold so much. While you sleep, especially during deep slow-wave sleep, the hippocampus replays the day and the cortex copies the important parts into long-term memory. That is why sleep is not wasted time. Cut it short and the replay gets cut short too. Tomorrow\'s quiz covers the hippocampus, slow-wave sleep and long-term memory, so write those three terms down.'.split(' ');
  const WORD_MS = 300;

  const lecture = (() => {
    const make = key => ({
      screen: $(`screen-${key}`), words: $(`words-${key}`), missedEl: $(`${key}-missed`),
      rate: 0, left: 0, missed: 0, inner: null,
    });
    const S = [make('a'), make('b')];
    let idx = 0, timer = 0, visible = true, done = false;

    function reset() {
      clearTimeout(timer); idx = 0; done = false;
      S.forEach(s => {
        s.words.innerHTML = '<span class="inner"></span>';
        s.inner = s.words.firstChild; s.left = 0; s.missed = 0;
        s.screen.classList.remove('lapsing');
        s.missedEl.textContent = `0 of 0 words missed`;
      });
      schedule(400);
    }
    function schedule(ms) { clearTimeout(timer); if (visible) timer = setTimeout(step, ms); }
    function step() {
      if (idx >= LECTURE.length) {
        S.forEach(s => s.screen.classList.remove('lapsing'));
        done = true; timer = setTimeout(reset, 3500); return;
      }
      S.forEach(s => {
        const f = clamp(s.rate, 0, 0.6);
        if (s.left <= 0 && Math.random() < f / (3.3 * (1 - f))) s.left = 2 + Math.floor(Math.random() * 3);
        const lapsing = s.left > 0;
        if (lapsing) { s.left--; s.missed++; }
        s.screen.classList.toggle('lapsing', lapsing);
        const sp = document.createElement('span');
        sp.textContent = LECTURE[idx] + ' ';
        if (lapsing) sp.className = 'missed';
        s.inner.appendChild(sp);
        s.missedEl.textContent = `${s.missed} of ${idx + 1} words missed`;
      });
      idx++;
      schedule(WORD_MS);
    }
    function setVisible(v) {
      visible = v;
      if (!v) clearTimeout(timer);
      else if (!done) schedule(WORD_MS);
    }
    return {
      start: reset,
      restart: reset,
      setVisible,
      rates(a, b) { S[0].rate = a; S[1].rate = b; },
    };
  })();

  // ------------------------------------------------------------------ Events
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('day').addEventListener('input', e => {
    if (state.playing) setPlaying(false);
    state.target = +e.target.value;
    if (reduceMotion.matches) { state.day = state.target; requestRender(); } else loop();
  });
  $('hours').addEventListener('input', e => setHours(+e.target.value));
  $('lecture-btn').addEventListener('click', () => lecture.restart());

  document.querySelectorAll('.seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.metric === btn.dataset.metric) return;
      document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-selected', b === btn));
      state.metric = btn.dataset.metric;
      retargetY(true);
      if (!reduceMotion.matches) {
        chart.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
      }
      requestRender();
    });
  });

  // Pause the lecture while it's off screen
  new IntersectionObserver(([e]) => lecture.setVisible(e.isIntersecting), { threshold: 0.15 })
    .observe(document.querySelector('.students'));

  let lastW = 0;
  new ResizeObserver(() => {
    const w = chart.parentNode.clientWidth;
    if (w !== lastW) { lastW = w; requestRender(); }
  }).observe(chart.parentNode);

  // Gentle reveal for sections below the fold
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.trend, .method, .refs').forEach(el => { el.classList.add('reveal'); io.observe(el); });

  // ------------------------------------------------------------------ Go
  retargetY(true);
  render();
  lecture.start();
})();
