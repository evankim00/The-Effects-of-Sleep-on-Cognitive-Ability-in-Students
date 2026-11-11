/* Sleep Debt Simulator: model, lecture and semester chart. No dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ Model
  // Every constant is explained in the "Where the numbers come from" table.
  const NIGHTS = 91;        // 13-week semester
  const GOAL = 8;           // h, low end of the 8–10 h recommendation
  const MEASURED = 14;      // longest controlled restriction study (Van Dongen 2003)
  const TAU = 14;           // nights over which the post-study estimate levels off (assumption)
  const LO_DEBT_7 = 23.8;   // 7 nights × 3.4 h less sleep than controls (Lo 2016, PSG)
  const PVT_PROMPTS = 95;   // prompts in a 10-min PVT with 2–10 s gaps
  const MIN_H = 1, MAX_H = 7;

  // Lapses per 10-min PVT for a cumulative sleep debt D (hours), fitted range
  function lapsesFor(D) {
    return D <= LO_DEBT_7 ? 2 + 0.68 * D : 2 + 16.2 * Math.pow(D / LO_DEBT_7, 0.67);
  }
  // Lapses after n nights that are each `short` hours under 8.
  // Up to night 14: fitted to data. After: keep the night-14 rate s and level off
  // over another TAU nights: L14 + TAU·s·(1 − e^(−(n−14)/TAU)).
  function lapsesAt(n, short) {
    if (n <= MEASURED) return lapsesFor(n * short);
    const L14 = lapsesFor(MEASURED * short);
    const s = (L14 - lapsesFor((MEASURED - 0.01) * short)) / 0.01;
    return L14 + TAU * s * (1 - Math.exp(-(n - MEASURED) / TAU));
  }
  function kssFor(h, n) {
    const short = Math.max(0, GOAL - h);
    return 4.7 + 2.3 * Math.sqrt(short / 3.4) * (1 - Math.exp(-n / 2.5));
  }
  function simulate(h) {
    const short = Math.max(0, GOAL - h);
    const out = { debt: [], lapse: [], kss: [] };
    for (let n = 0; n <= NIGHTS; n++) {
      out.debt.push(n * short);
      out.lapse.push(lapsesAt(n, short));
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
    d = clamp(d || 0, 0, NIGHTS);
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
  const SA = '<span class="a">Student A</span>';
  const SB = '<span class="b">Student B</span>';

  // ------------------------------------------------------------------ State
  const state = { day: 45, target: 45, hours: 5, playing: false, metric: 'debt', yMax: 300, yTarget: 300 };
  const A = simulate(GOAL);
  let B = simulate(state.hours);
  let morph = null;

  const spring = t => 1 - (1 + 14 * t) * Math.exp(-14 * t); // critically damped, ~0.5 s

  function setHours(h) {
    h = clamp(h, MIN_H, MAX_H);
    if (h === state.hours) return;
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
    let m = Math.max(...simulate(state.hours)[state.metric]);
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
    debt:  { yMin: 0, fmt: v => `${Math.round(v)} h`, val: v => `${Math.round(v)} h`, points: null, title: '' },
    lapse: { yMin: 0, fmt: v => `${Math.round(v)}`, val: v => v.toFixed(1), points: LO.lapse, title: 'Lapses per 10-minute test' },
    kss:   { yMin: 1, fmt: v => `${Math.round(v)}`, val: v => v.toFixed(1), points: LO.kss, title: 'Sleepiness, Karolinska scale 1–9' },
  };

  function ticks(min, max) {
    if (state.metric === 'kss') return [1, 3, 5, 7, 9];
    const out = [];
    for (let i = 0; i <= 4; i++) out.push(min + (max - min) * i / 4);
    return out;
  }

  function drawChart() {
    const W = Math.max(280, chart.clientWidth || chart.parentNode.clientWidth);
    const H = W < 560 ? 230 : 300;
    const M = METRIC[state.metric];
    const m = { l: 48, r: 56, t: 34, b: 30 };
    const yMin = M.yMin, yMax = state.yMax;
    const x = d => m.l + (d / NIGHTS) * (W - m.l - m.r);
    const y = v => m.t + (1 - (clamp(v, yMin, yMax * 1.2) - yMin) / (yMax - yMin)) * (H - m.t - m.b);
    const day = clamp(state.day || 0, 0, NIGHTS);
    const est = state.metric === 'lapse';
    let s = `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#e2e8f0" stroke-width="2"/></pattern></defs>`;

    if (est) {
      s += `<rect class="held" x="${x(MEASURED)}" y="${m.t}" width="${x(NIGHTS) - x(MEASURED)}" height="${H - m.t - m.b}" rx="6"/>`;
      s += `<text class="held-l" x="${x(MEASURED) + 10}" y="${m.t + 16}">After night 14: estimate</text>`;
    }
    s += `<text class="axis-t" x="${m.l}" y="14">${M.title}</text>`;
    ticks(yMin, yMax).forEach((t, i) => {
      s += `<line class="${i === 0 ? 'g0' : 'g'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text x="${m.l - 10}" y="${y(t) + 4}" text-anchor="end">${M.fmt(t)}</text>`;
    });
    const every = W < 560 ? 4 : 2;
    for (let w = 1; w <= 13; w++) {
      if (w % every !== 1 && w !== 13) continue;
      s += `<text x="${x(w * 7)}" y="${H - 8}" text-anchor="middle">Week ${w}</text>`;
    }

    // Lines: solid where the model is fitted to data, dashed where it's an estimate
    const pathOf = (arr, from, to) => {
      if (to <= from) return '';
      let p = `M${x(from).toFixed(1)},${y(at(arr, from)).toFixed(1)}`;
      for (let i = Math.floor(from) + 1; i < to; i++) p += `L${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
      return p + `L${x(to).toFixed(1)},${y(at(arr, to)).toFixed(1)}`;
    };
    [['sa', A[state.metric]], ['sb', B[state.metric]]].forEach(([cls, arr]) => {
      // Only Student B is extrapolated; 8 h a night matches the measured rested group
      const dashed = est && cls === 'sb' && state.hours < GOAL;
      const split = dashed ? MEASURED : NIGHTS;
      s += `<path class="ghost ${cls}" d="${pathOf(arr, 0, split)}"/>`;
      if (dashed) s += `<path class="ghost dash ${cls}" d="${pathOf(arr, split, NIGHTS)}"/>`;
      s += `<path class="line ${cls}" d="${pathOf(arr, 0, Math.min(day, split))}"/>`;
      if (dashed && day > split) s += `<path class="line dash ${cls}" d="${pathOf(arr, split, day)}"/>`;
    });

    if (M.points) {
      [...M.points.short.map((v, i) => [i, v]), ...M.points.rested.map((v, i) => [i, v])]
        .forEach(([i, v]) => { s += `<circle class="pt" cx="${x(i)}" cy="${y(v)}" r="3.6"/>`; });
    }

    const va = at(A[state.metric], day), vb = at(B[state.metric], day);
    s += `<line class="cursor" x1="${x(day)}" x2="${x(day)}" y1="${m.t}" y2="${H - m.b}"/>`;
    s += `<circle class="dot-a" cx="${x(day)}" cy="${y(va)}" r="5.5"/><circle class="dot-b" cx="${x(day)}" cy="${y(vb)}" r="5.5"/>`;
    let ya = y(va) + 4, yb = y(vb) + 4;
    if (Math.abs(ya - yb) < 16) { if (ya >= yb) ya = yb + 16; else yb = ya + 16; }
    const right = x(day) > W - m.r - 70;
    const lx = right ? x(day) - 10 : x(day) + 10, anchor = right ? 'end' : 'start';
    s += `<text class="val-l val-b" x="${lx}" y="${yb}" text-anchor="${anchor}">${M.val(vb)}</text>`;
    s += `<text class="val-l val-a" x="${lx}" y="${ya}" text-anchor="${anchor}">${M.val(va)}</text>`;

    chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    chart.setAttribute('height', H);
    chart.innerHTML = s;
  }

  // ------------------------------------------------------------------ Sleep debt bars
  // Both bars end at the whole semester: 91 nights = 728 hours at 8 h a night.
  const debtEl = $('debt');
  const SEMESTER_HOURS = NIGHTS * GOAL;
  function paintDebt(hours) {
    const f = clamp(hours / SEMESTER_HOURS, 0, 1).toFixed(4);
    const nights = hours / GOAL;
    $('bar-hours').style.setProperty('--f', f);
    $('bar-nights').style.setProperty('--f', f);
    setText($('debt-hours'), `${Math.round(hours)} hours`);
    setText($('debt-nights'), `${nights.toFixed(1)} nights`);
    $('bar-hours-m').setAttribute('aria-valuenow', Math.round(hours));
    $('bar-nights-m').setAttribute('aria-valuenow', nights.toFixed(1));
  }

  // ------------------------------------------------------------------ Sources per tab
  const REF = {
    1: 'Lo et al., 2016', 2: 'Cousins et al., 2019', 3: 'Cousins et al., 2018',
    4: 'Basner & Dinges, 2011', 5: 'CDC, 2025', 6: 'Van Dongen et al., 2003',
  };
  const SOURCES = { debt: [5], lapse: [1, 6, 4], kss: [1, 6] };
  function sourcesHTML(metric) {
    return 'Sources: ' + SOURCES[metric].map(n => `<a href="#ref-${n}">${REF[n]}</a>`).join('; ');
  }

  // ------------------------------------------------------------------ Tonight card
  // Timeline from 9 pm to 7 am (10 h). Both students wake at 7 am.
  function clock(h24) {
    const h = ((h24 % 24) + 24) % 24, ap = h >= 12 ? 'pm' : 'am', h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${ap}`;
  }
  let lastTonight = -1;
  function renderTonight() {
    const h = state.hours;
    if (h === lastTonight) return;
    lastTonight = h;
    const start = (10 - h) / 10;               // bedtime as a share of 9 pm → 7 am
    const shortH = GOAL - h;
    $('b-short').style.left = '20%';
    $('b-short').style.width = `${(start - 0.2) * 100}%`;
    $('b-slept').style.left = `${start * 100}%`;
    $('b-slept').style.width = `${(1 - start) * 100}%`;
    $('b-night').textContent = `${clock(7 - h)} – 7:00 am`;
    $('tonight-foot').textContent = `Student B goes to bed ${shortH} hour${shortH === 1 ? '' : 's'} later and loses ${shortH} hour${shortH === 1 ? '' : 's'} of sleep.`;
  }

  // ------------------------------------------------------------------ Render
  const legendData = document.querySelector('.lg-data');
  const legendHeld = document.querySelector('.lg-held');
  const dayInput = $('day');

  function render() {
    const d = state.day, n = Math.round(d);
    const short = GOAL - state.hours;

    // Toolbar. The fill follows the thumb (target), never the eased value.
    dayInput.style.setProperty('--p', `${((state.playing ? d : state.target) / NIGHTS) * 100}%`);
    if (state.playing) dayInput.value = d;
    setText($('day-label'), n === 0 ? 'Before day 1' : `Week ${Math.ceil(n / 7)}, day ${n} of ${NIGHTS}`);
    const hrs = `${state.hours} hour${state.hours === 1 ? '' : 's'}`;
    setText($('hours-out'), hrs);
    setText($('b-sleep'), `${hrs} a night`);
    $('hours-dec').disabled = state.hours <= MIN_H;
    $('hours-inc').disabled = state.hours >= MAX_H;
    renderTonight();

    // Student readouts
    const aL = at(A.lapse, d), bL = at(B.lapse, d), aK = at(A.kss, d), bK = at(B.kss, d), bD = at(B.debt, d);
    setText($('a-debt'), '0 h');
    setText($('b-debt'), `${Math.round(bD)} h`);
    // Past night 14 Student B's lapse count is an estimate, and says so
    const est = n > MEASURED && short > 0 ? '<span class="est">est.</span>' : '';
    setText($('a-lapse'), aL.toFixed(1));
    setHTML($('b-lapse'), `${bL.toFixed(1)}${est}`);
    setText($('a-kss'), aK.toFixed(1));
    setText($('b-kss'), bK.toFixed(1));

    // Takeaway
    let t = '';
    if (state.metric === 'debt') {
      t = n === 0
        ? 'The semester hasn\'t started. Press <strong>Play</strong> or drag the slider.'
        : `${SB} falls <strong>${short} hours</strong> short every night, and nothing pays it back, so the debt only grows. ${SA} loses none. Every 8 hours lost is a full night of sleep gone.`;
    } else if (state.metric === 'lapse') {
      t = `${SB} has <strong>${bL.toFixed(1)} lapses</strong> per 10-minute test versus ${aL.toFixed(1)} for ${SA}, so about <strong>${Math.round(bL / PVT_PROMPTS * 100)}%</strong> of their responses come too late.`;
    } else {
      const w = KSS_WORDS[clamp(Math.round(bK), 1, 9)];
      t = `${SB} rates <strong>${bK.toFixed(1)}</strong>, “${w}.” ${SA}: ${aK.toFixed(1)}. Sleepiness levels off within a week, but measured attention keeps getting worse for at least two weeks, so tired students underestimate how impaired they are.`;
    }
    setHTML($('takeaway'), t);
    setHTML($('trend-src'), sourcesHTML(state.metric));
    const isDebt = state.metric === 'debt';
    legendData.hidden = isDebt;
    legendHeld.hidden = state.metric !== 'lapse';
    document.querySelectorAll('.lg-line').forEach(el => { el.hidden = isDebt; });
    document.querySelector('.lg-night').hidden = !isDebt;
    chart.style.display = isDebt ? 'none' : '';
    debtEl.style.display = isDebt ? '' : 'none';

    if (isDebt) paintDebt(bD); else drawChart();
    lecture.rates(aL / PVT_PROMPTS, bL / PVT_PROMPTS);
  }

  let queued = false;
  function requestRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  // ------------------------------------------------------------------ Loop
  const DAYS_PER_SEC = 5;   // a full semester plays in about 18 s
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
      if (Math.abs(diff) > 0.002) { state.day += diff * (1 - Math.exp(-dt * 18)); keep = true; }
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
    $('play-text').textContent = on ? 'Pause' : 'Play';
    if (on) {
      if (state.day >= NIGHTS - 0.01) state.day = state.target = 0;
      if (reduceMotion.matches) {
        state.day = state.target = NIGHTS; state.playing = false;
        btn.classList.remove('on'); $('play-text').textContent = 'Play';
        dayInput.value = NIGHTS; requestRender(); return;
      }
      loop();
    } else requestRender();
  }

  // ------------------------------------------------------------------ Lecture
  const LECTURE = 'Today we are looking at how the brain stores what you learn. New information first lands in the hippocampus, a small curved structure deep inside the temporal lobe. It can only hold so much. While you sleep, especially during deep slow-wave sleep, the hippocampus replays the day and the cortex copies the important parts into long-term memory. That is why sleep is not wasted time. Cut it short and the replay gets cut short too. Tomorrow\'s quiz covers the hippocampus, slow-wave sleep and long-term memory, so write those three terms down.'.split(' ');
  const WORD_MS = 300;
  const HINT = 'Press Start lecture. Both students hear the same lesson, word for word.';

  const lecture = (() => {
    const make = key => ({ screen: $(`screen-${key}`), words: $(`words-${key}`), missedEl: $(`${key}-missed`), rate: 0, left: 0, missed: 0 });
    const S = [make('a'), make('b')];
    const toggle = $('lecture-toggle'), restartBtn = $('lecture-restart');
    let idx = 0, timer = 0, visible = true;
    let status = 'idle';   // idle | running | paused | done

    const LABEL = { idle: 'Start lecture', running: 'Stop lecture', paused: 'Resume lecture', done: 'Start again' };
    function sync() {
      toggle.textContent = LABEL[status];
      restartBtn.hidden = status === 'idle';
      if (status !== 'running') S.forEach(s => s.screen.classList.remove('lapsing'));
    }
    function clearScreens(hint) {
      idx = 0;
      S.forEach(s => {
        s.words.innerHTML = hint ? `<span class="hint">${HINT}</span>` : '';
        s.words.scrollTop = 0;
        s.left = 0; s.missed = 0;
        s.missedEl.textContent = '0 of 0 words missed';
      });
    }
    function schedule(ms) { clearTimeout(timer); if (visible && status === 'running') timer = setTimeout(step, ms); }
    function start() { clearScreens(false); status = 'running'; sync(); schedule(250); }

    function step() {
      if (idx >= LECTURE.length) { status = 'done'; sync(); return; }   // stop in the finished state
      S.forEach(s => {
        const f = clamp(s.rate, 0, 0.6);
        if (s.left <= 0 && Math.random() < f / (3.3 * (1 - f))) s.left = 2 + Math.floor(Math.random() * 3);
        const lapsing = s.left > 0;
        if (lapsing) { s.left--; s.missed++; }
        s.screen.classList.toggle('lapsing', lapsing);
        const sp = document.createElement('span');
        sp.textContent = LECTURE[idx] + ' ';
        if (lapsing) sp.className = 'missed';
        s.words.appendChild(sp);
        // Text fills from the top; once it reaches the bottom, keep the newest line in view
        const over = s.words.scrollHeight - s.words.clientHeight;
        if (over > 0 && s.words.scrollTop < over) s.words.scrollTop = over;
        s.missedEl.textContent = `${s.missed} of ${idx + 1} words missed`;
      });
      idx++;
      schedule(WORD_MS);
    }

    toggle.addEventListener('click', () => {
      if (status === 'idle' || status === 'done') start();
      else if (status === 'running') { status = 'paused'; clearTimeout(timer); sync(); }
      else { status = 'running'; sync(); schedule(WORD_MS); }
    });
    // Reset clears the screens and ends the lecture; it does not start a new one
    restartBtn.addEventListener('click', () => {
      clearTimeout(timer);
      status = 'idle';
      clearScreens(true);
      sync();
      toggle.focus();
    });

    clearScreens(true);
    sync();
    return {
      setVisible(v) { visible = v; if (!v) clearTimeout(timer); else schedule(WORD_MS); },
      rates(a, b) { S[0].rate = a; S[1].rate = b; },
    };
  })();

  // ------------------------------------------------------------------ Events
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  dayInput.addEventListener('input', e => {
    if (state.playing) setPlaying(false);
    state.target = +e.target.value;
    if (reduceMotion.matches) { state.day = state.target; requestRender(); } else loop();
  });
  $('hours-dec').addEventListener('click', () => setHours(state.hours - 1));
  $('hours-inc').addEventListener('click', () => setHours(state.hours + 1));

  const tabs = [...document.querySelectorAll('.seg button')];
  tabs.forEach(b => { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; });
  document.querySelector('.seg').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[j].focus(); tabs[j].click();
  });
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => { b.tabIndex = b === btn ? 0 : -1; });
      if (state.metric === btn.dataset.metric) return;
      tabs.forEach(b => b.setAttribute('aria-selected', b === btn));
      state.metric = btn.dataset.metric;
      setHTML($('trend-src'), sourcesHTML(state.metric));
      retargetY(true);
      if (!reduceMotion.matches) {
        (state.metric === 'debt' ? debtEl : chart).animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
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

  // ------------------------------------------------------------------ Hero sleep-stage trace
  // A simplified night of sleep stages (minutes): 0 awake, 1 REM, 2 light, 3 deep.
  const NIGHT = [[0, 10], [2, 20], [3, 45], [2, 10], [1, 10], [2, 20], [3, 30], [2, 15], [1, 20], [0, 3], [2, 30], [3, 10], [2, 15], [1, 30],
    [0, 2], [2, 40], [1, 40], [2, 35], [1, 45], [0, 3], [2, 27], [1, 30]];
  function drawHeroTrace() {
    const svg = $('hero-trace');
    const W = svg.clientWidth || window.innerWidth, H = 108;   // 88 for the stages + a row for the caption
    // Stage names sit in a column aligned with the page text; the night starts just right of them
    const inner = document.querySelector('.hero-inner');
    const textLeft = inner.getBoundingClientRect().left - svg.getBoundingClientRect().left + parseFloat(getComputedStyle(inner).paddingLeft);
    const GUTTER = 52;
    const x0 = textLeft + GUTTER;
    const TOTAL = NIGHT.reduce((a, [, dur]) => a + dur, 0);
    const x = m => x0 + (m / TOTAL) * (W - x0), y = st => 8 + st * 24;
    let t = 0, d = '', rem = '';
    NIGHT.forEach(([st, dur], k) => {
      d += k === 0 ? `M${x0.toFixed(1)},${y(st)}` : `L${x(t).toFixed(1)},${y(st)}`;
      d += `L${x(t + dur).toFixed(1)},${y(st)}`;
      if (st === 1) rem += `M${(x(t) + 3).toFixed(1)},${y(1)}L${(x(t + dur) - 3).toFixed(1)},${y(1)}`;
      t += dur;
    });
    // Stage names end right where the night begins; a faint guide carries each level across
    const labels = ['Awake', 'REM', 'Light', 'Deep'].map((name, st) =>
      `<line class="stage-guide" x1="${x0.toFixed(1)}" x2="${W}" y1="${y(st)}" y2="${y(st)}"/>` +
      `<text class="stage-l" x="${(x0 - 8).toFixed(1)}" y="${y(st) + 4.5}" text-anchor="end">${name}</text>`).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `${labels}<path d="${d}"/><path class="rem" d="${rem}"/>` +
      (W < 640 ? '' : `<text x="${W - 16}" y="${H - 4}" text-anchor="end">One night of sleep stages. REM, highlighted, grows toward morning.</text>`);
  }
  window.addEventListener('resize', drawHeroTrace);

  // ------------------------------------------------------------------ Go
  drawHeroTrace();
  retargetY(true);
  render();
})();
