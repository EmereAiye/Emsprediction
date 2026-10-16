/* ==========================================================
   EmsPredicts – script.js (Recent Results Evaluation & Audio)
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Firebase Configuration ---------- */
  const firebaseConfig = {
    apiKey: "AIzaSyDHHbw4p8XzJcd67pW1I1icKl4kwf4m19c",
    authDomain: "emspredict1478.firebaseapp.com",
    projectId: "emspredict1478",
    storageBucket: "emspredict1478.firebasestorage.app",
    messagingSenderId: "216350178362",
    appId: "1:216350178362:web:68b6328ba9969d861c0903"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();

  /* ---------- config ---------- */
  const WORKER_URL = 'https://emspredict.emmymasterwise.workers.dev';
  const BASE_URL = WORKER_URL.replace(/\/$/, '') + '/v4/';
  const NEEDS_SETUP = WORKER_URL.includes('YOURNAME');
  const CACHE_TTL = 10 * 60 * 1000;

  /* Hierarchical Global Competitions Structure (Europe & South America only) */
  const CONTINENTS = [
    {
      id: 'europe',
      name: 'Europe',
      leagues: [
        { code: 'PL', name: 'Premier League (England)' },
        { code: 'PD', name: 'La Liga (Spain)' },
        { code: 'SA', name: 'Serie A (Italy)' },
        { code: 'BL1', name: 'Bundesliga (Germany)' },
        { code: 'FL1', name: 'Ligue 1 (France)' },
        { code: 'DED', name: 'Eredivisie (Netherlands)' },
        { code: 'PPL', name: 'Primeira Liga (Portugal)' },
        { code: 'CL', name: 'UEFA Champions League' }
      ]
    },
    {
      id: 'south-america',
      name: 'South America',
      leagues: [
        { code: 'BSA', name: 'Brazilian Serie A' },
        { code: 'CLI', name: 'Copa Libertadores' }
      ]
    }
  ];

  const TOP_LEAGUES = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  const pad = n => String(n).padStart(2, '0');

  /* ==========================================================
     1. BACKGROUND – passing network
     ========================================================== */
  function startPitch() {
    const cv = $('#pitch');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SHAPE = [
      [0.05, 0.5],
      [0.22, 0.14], [0.2, 0.38], [0.2, 0.62], [0.22, 0.86],
      [0.45, 0.1], [0.42, 0.36], [0.42, 0.64], [0.45, 0.9],
      [0.7, 0.36], [0.72, 0.64]
    ];
    const nodes = SHAPE.map(([fx, fy]) => ({
      fx, fy, x: 0, y: 0,
      ph: Math.random() * 6.28,
      sp: 0.3 + Math.random() * 0.3
    }));

    const edges = new Map();
    let dpr = 1, W = 0, H = 0, portrait = false, R = { x: 0, y: 0, w: 0, h: 0 };
    let holder = 6, pass = null, hold = 0, last = performance.now(), t = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.width = Math.floor(window.innerWidth * dpr);
      H = cv.height = Math.floor(window.innerHeight * dpr);
      portrait = H > W;
      const LW = portrait ? H : W;
      const LH = portrait ? W : H;
      R = { x: LW * 0.04, y: LH * 0.07, w: LW * 0.92, h: LH * 0.86 };
      if (reduce) draw();
    }

    function place() {
      for (const n of nodes) {
        n.x = R.x + R.w * n.fx + Math.sin(t * n.sp + n.ph) * R.w * 0.012;
        n.y = R.y + R.h * n.fy + Math.cos(t * n.sp * 1.3 + n.ph) * R.h * 0.015;
      }
    }

    function startPass() {
      const from = nodes[holder];
      const options = nodes
        .map((n, i) => ({ i, d: Math.hypot(n.x - from.x, n.y - from.y), fwd: n.fx > from.fx }))
        .filter(o => o.i !== holder)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      const weights = options.map(o => (o.fwd ? 1.7 : 1));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let pick = options[0];
      for (let k = 0; k < options.length; k++) {
        r -= weights[k];
        if (r <= 0) { pick = options[k]; break; }
      }
      pass = { from: holder, to: pick.i, p: 0, dur: 900 + Math.random() * 600, bend: (Math.random() - 0.5) * 0.5 };
    }

    function ballPos() {
      const a = nodes[pass.from], b = nodes[pass.to];
      const u = pass.p < 0.5 ? 2 * pass.p * pass.p : 1 - Math.pow(-2 * pass.p + 2, 2) / 2;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const cx = mx - dy * pass.bend, cy = my + dx * pass.bend;
      const v = 1 - u;
      return {
        x: v * v * a.x + 2 * v * u * cx + u * u * b.x,
        y: v * v * a.y + 2 * v * u * cy + u * u * b.y
      };
    }

    function drawPitch() {
      const { x, y, w, h } = R;
      ctx.strokeStyle = 'rgba(233, 241, 234, 0.10)';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.135, 0, Math.PI * 2); ctx.stroke();
      const bw = w * 0.157, bh = h * 0.593, sw = w * 0.052, sh = h * 0.269;
      ctx.strokeRect(x, y + (h - bh) / 2, bw, bh);
      ctx.strokeRect(x + w - bw, y + (h - bh) / 2, bw, bh);
      ctx.strokeRect(x, y + (h - sh) / 2, sw, sh);
      ctx.strokeRect(x + w - sw, y + (h - sh) / 2, sw, sh);
    }

    function draw() {
      if (portrait) ctx.setTransform(0, 1, 1, 0, 0, 0);
      else ctx.setTransform(1, 0, 0, 1, 0, 0);
      const LW = portrait ? H : W, LH = portrait ? W : H;
      ctx.clearRect(0, 0, LW, LH);
      drawPitch();
      place();

      for (const [key, wt] of edges) {
        const [a, b] = key.split('-').map(Number);
        ctx.strokeStyle = 'rgba(233, 241, 234,' + Math.min(0.5, wt * 0.1).toFixed(3) + ')';
        ctx.lineWidth = (1 + Math.min(wt, 4) * 0.6) * dpr;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
      }

      nodes.forEach((n, i) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 6 * dpr, 0, Math.PI * 2);
        if (i === holder && !pass) {
          ctx.fillStyle = 'rgba(243, 182, 63, 0.9)';
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(233, 241, 234, 0.28)';
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
      });

      if (pass) {
        const p = ballPos();
        ctx.save();
        ctx.shadowColor = 'rgba(243, 182, 63, 0.9)';
        ctx.shadowBlur = 18 * dpr;
        ctx.fillStyle = '#f3b63f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function frame(now) {
      const dt = Math.min(now - last, 60);
      last = now;
      t += dt / 1000;

      for (const [k, v] of edges) {
        const nv = v * Math.exp(-dt / 6000);
        if (nv < 0.05) edges.delete(k); else edges.set(k, nv);
      }

      if (pass) {
        pass.p += dt / pass.dur;
        if (pass.p >= 1) {
          const key = [pass.from, pass.to].sort((a, b) => a - b).join('-');
          edges.set(key, (edges.get(key) || 0) + 1);
          holder = pass.to;
          pass = null;
          hold = 150 + Math.random() * 250;
        }
      } else {
        hold -= dt;
        if (hold <= 0) startPass();
      }

      draw();
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();

    if (reduce) {
      for (let i = 1; i < nodes.length; i++) edges.set([i - 1, i].join('-'), 2 + (i % 3));
      draw();
    } else {
      requestAnimationFrame(frame);
    }
  }

  /* ==========================================================
     2. STORAGE & FIREBASE AUTHENTICATION
     ========================================================== */
  const mem = {};
  const store = {
    get(key) {
      try {
        const v = window.localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) {
        return mem[key] ?? null;
      }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { mem[key] = value; }
    }
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function signUp({ name, email, password, adult }) {
    name = name.trim();
    email = email.trim().toLowerCase();
    if (name.length < 2) throw new Error('Enter your name.');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    if (!adult) throw new Error('You must be 18 or older to create an account.');
    
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    // Firebase emails a verification link to the address they registered with.
    cred.user.sendEmailVerification()
      .then(() => toast('Check your email: we sent a verification link to ' + email))
      .catch(err => console.error('Verification email failed', err));
    return { email: cred.user.email, name, uid: cred.user.uid };
  }

  async function signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return { email: cred.user.email, name: cred.user.displayName || email.split('@')[0], uid: cred.user.uid };
  }

  function signOutUser() {
    auth.signOut();
  }

  function currentUser() {
    const user = auth.currentUser;
    return user ? { email: user.email, name: user.displayName || user.email.split('@')[0], uid: user.uid } : null;
  }

  const picksKey = uid => 'pc_picks_' + uid;

  /* ==========================================================
     3. MATCH DATA API (football-data.org)
     ========================================================== */
  async function getJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const leagueCache = {};
  const standingsCache = {};

  async function loadLeague(league) {
    if (NEEDS_SETUP) return { past: [], next: [], limited: true, reason: 'setup' };
    if (leagueCache[league.code]) return leagueCache[league.code];

    const cached = store.get('pc_cache_' + league.code);
    if (cached && Date.now() - cached.t < CACHE_TTL) {
      const revive = m => ({ ...m, when: m.when ? new Date(m.when) : null });
      const res = { past: cached.past.map(revive), next: cached.next.map(revive), limited: false };
      leagueCache[league.code] = res;
      return res;
    }

    try {
      const data = await getJSON(`${BASE_URL}competitions/${league.code}/matches?status=SCHEDULED,TIMED,FINISHED`);
      const matches = (data.matches || []).map(m => ({
        id: String(m.id),
        home: m.homeTeam.name,
        away: m.awayTeam.name,
        idHome: String(m.homeTeam.id),
        idAway: String(m.awayTeam.id),
        badgeHome: m.homeTeam.crest || '',
        badgeAway: m.awayTeam.crest || '',
        hs: m.score.fullTime.home,
        as: m.score.fullTime.away,
        round: m.matchday ? String(m.matchday) : '',
        when: m.utcDate ? new Date(m.utcDate) : null,
        status: m.status
      }));

      const res = {
        past: matches.filter(m => m.status === 'FINISHED' && m.hs !== null && m.as !== null).sort((a, b) => b.when - a.when),
        next: matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED').sort((a, b) => a.when - b.when),
        limited: false
      };
      leagueCache[league.code] = res;
      store.set('pc_cache_' + league.code, { t: Date.now(), past: res.past, next: res.next });
      return res;
    } catch (err) {
      console.error('football-data.org error for', league.code, err);
      return { past: [], next: [], limited: true, reason: err.status || 0 };
    }
  }

  async function loadStandings(leagueCode) {
    if (standingsCache[leagueCode]) return standingsCache[leagueCode];
    const cached = store.get('pc_standings_' + leagueCode);
    if (cached && Date.now() - cached.t < CACHE_TTL) {
      standingsCache[leagueCode] = cached.data;
      return cached.data;
    }
    try {
      const data = await getJSON(`${BASE_URL}competitions/${leagueCode}/standings`);
      const tableObj = (data.standings || []).find(s => s.type === 'TOTAL') || data.standings?.[0];
      const table = tableObj ? tableObj.table : [];
      standingsCache[leagueCode] = table;
      store.set('pc_standings_' + leagueCode, { t: Date.now(), data: table });
      return table;
    } catch (err) {
      console.error('Standings error', err);
      return [];
    }
  }

  function limitMessage(data) {
    if (data.reason === 'setup') return 'Setup needed: put your Cloudflare Worker URL in WORKER_URL at the top of script.js.';
    if (data.reason === 404) return 'Worker or endpoint not found (404). Check WORKER_URL.';
    if (data.reason === 403) return 'This competition is not included in your football-data.org plan.';
    if (data.reason === 429) return 'Rate limit hit (free plan allows ~10 requests/min). Wait a minute and try again.';
    if (data.reason === 400 || data.reason === 401) return 'API key rejected. Check the FD_KEY secret in your Cloudflare Worker.';
    return 'Could not reach the data service (network error or timeout). Check WORKER_URL and the browser console.';
  }

  const formCache = {};

  /* ---- extra match context: key players + injuries ---- */
  const scorersCache = {};
  async function loadScorers(code) {
    if (scorersCache[code]) return scorersCache[code];
    try {
      const j = await getJSON(`${BASE_URL}competitions/${code}/scorers?limit=100`);
      return (scorersCache[code] = j.scorers || []);
    } catch (e) { return []; }
  }
  const normTeam = t => String(t).toLowerCase().replace(/\b(fc|afc|cf|sc|ac|as)\b/g, '').replace(/[^a-z0-9]/g, '');
  function teamPlayers(scorers, team) {
    return (scorers || []).filter(x => x.team && x.team.name === team).map(x => ({
      name: x.player.name, goals: x.goals || 0, assists: x.assists || 0, played: x.playedMatches || 0
    })).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).slice(0, 3);
  }
  function teamGoals(team) {
    let g = 0;
    ((state.data && state.data.past) || []).forEach(x => { if (x.home === team) g += x.hs || 0; else if (x.away === team) g += x.as || 0; });
    return g;
  }
  function whyLines(m, entry, r) {
    const f = (n, x) => {
      const w = x.form.filter(v => v === 'W').length, d = x.form.filter(v => v === 'D').length, l = x.form.filter(v => v === 'L').length;
      return x.p ? n + ': ' + w + 'W ' + d + 'D ' + l + 'L in the last ' + x.p + ', scoring ' + (x.gf / x.p).toFixed(1) + ' and conceding ' + (x.ga / x.p).toFixed(1) + ' per game.' : n + ': no recent results found.';
    };
    const L = [f(m.home, entry.hForm), f(m.away, entry.aForm)];
    L.push('Expected goals: ' + m.home + ' ' + r.lh.toFixed(1) + ', ' + m.away + ' ' + r.la.toFixed(1) + '. The home side gets about a 12% boost for playing at home.');
    const tot = r.lh + r.la;
    L.push(tot >= 2.9 ? 'Both attacks beat the defences they face, so goals are likely (' + tot.toFixed(1) + ' expected in total).'
      : tot <= 2.2 ? 'Tight matchup with only ' + tot.toFixed(1) + ' goals expected, so a low-scoring game is more likely.'
      : 'A balanced matchup with ' + tot.toFixed(1) + ' goals expected in total.');
    if (r.quality === 'Thin') L.push('Heads up: very little recent data, so treat this as a rough guess.');
    return L;
  }
  function playersBlock(m, extras) {
    const wrap = el('div', { class: 'ctx' }, el('h4', { text: 'Key players (top goals + assists this season)' }));
    let any = false;
    [m.home, m.away].forEach(team => {
      const ps = teamPlayers(extras.scorers, team), tg = teamGoals(team);
      if (!ps.length) return;
      any = true;
      wrap.append(el('div', { class: 'ctx-team', text: team }));
      ps.forEach(p => {
        const share = tg ? Math.min(100, Math.round((p.goals + p.assists) / tg * 100)) : 0;
        wrap.append(el('div', { class: 'player' },
          el('strong', { text: p.name }),
          el('span', { class: 'p-stats', text: p.goals + ' goals, ' + p.assists + ' assists in ' + p.played + ' games' }),
          el('span', { class: 'p-impact', text: share ? 'Involved in about ' + share + '% of ' + team + ' goals. ' + (share >= 30 ? 'Main threat: if he is quiet, their scoring drops a lot.' : 'Useful threat, but not the only one.') : 'Impact unknown.' })
        ));
      });
    });
    if (!any) wrap.append(el('p', { class: 'muted', text: 'No player stats available for this competition.' }));
    return wrap;
  }
  async function teamGames(teamId, name) {
    if (!teamId) return [];
    if (formCache[teamId]) return formCache[teamId];
    try {
      const j = await getJSON(`${BASE_URL}teams/${teamId}/matches?status=FINISHED&limit=10`);
      const games = (j.matches || []).map(m => ({
        id: String(m.id),
        home: m.homeTeam.name,
        away: m.awayTeam.name,
        hs: m.score.fullTime.home,
        as: m.score.fullTime.away,
        when: new Date(m.utcDate)
      }));
      formCache[teamId] = games;
      return games;
    } catch (err) {
      return [];
    }
  }

  /* ==========================================================
     4. OUTCOME MODEL (Poisson)
     ========================================================== */
  function teamForm(name, games) {
    const sorted = [...games].sort((a, b) => b.when - a.when).slice(0, 8);
    let gf = 0, ga = 0;
    const form = [];
    for (const g of sorted) {
      const isHome = g.home === name;
      const f = isHome ? g.hs : g.as;
      const a = isHome ? g.as : g.hs;
      gf += f; ga += a;
      form.push(f > a ? 'W' : f === a ? 'D' : 'L');
    }
    return { gf, ga, p: sorted.length, form };
  }

  function poisson(lambda, k) {
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / f;
  }

  function predict(hForm, aForm, leagueAvg) {
    const K = 3;
    const atk = s => ((s.gf + K * leagueAvg) / (s.p + K)) / leagueAvg;
    const def = s => ((s.ga + K * leagueAvg) / (s.p + K)) / leagueAvg;
    const lh = leagueAvg * atk(hForm) * def(aForm) * 1.12;
    const la = leagueAvg * atk(aForm) * def(hForm) * 0.92;

    const N = 9;
    let pH = 0, pD = 0, pA = 0, over = 0, btts = 0, total = 0;
    let best = { p: 0, h: 0, a: 0 };
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p = poisson(lh, i) * poisson(la, j);
        total += p;
        if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
        if (i + j > 2) over += p;
        if (i > 0 && j > 0) btts += p;
        if (p > best.p) best = { p, h: i, a: j };
      }
    }
    pH /= total; pD /= total; pA /= total; over /= total; btts /= total;

    const sample = Math.min(hForm.p, aForm.p);
    return {
      pH, pD, pA, over, btts,
      score: best.h + '-' + best.a,
      lh, la,
      quality: sample < 2 ? 'Thin' : sample < 4 ? 'Fair' : 'Good'
    };
  }

  /* ==========================================================
     5. UI & STATE MANAGEMENT
     ========================================================== */
  const state = {
    continent: CONTINENTS[0],
    league: CONTINENTS[0].leagues[0],
    view: 'upcoming',
    data: null,
    user: null,
    preds: {},
    openId: null,
    pendingId: null
  };

  const dlg = $('#authDialog');

  function setAuthMode(mode, hint) {
    const isIn = mode === 'signin';
    $('#authTitle').textContent = isIn ? 'Sign in' : 'Create account';
    $('#tabSignin').setAttribute('aria-selected', String(isIn));
    $('#tabSignup').setAttribute('aria-selected', String(!isIn));
    $('#signinForm').hidden = !isIn;
    $('#signupForm').hidden = isIn;
    $('#authHint').textContent = hint || '';
    $('#authError').textContent = '';
  }

  function openAuth(mode, hint) {
    setAuthMode(mode, hint);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    (mode === 'signin' ? $('#siEmail') : $('#suName')).focus();
  }

  function closeAuth() {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  function authMessage(err) {
    const map = {
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/user-not-found': 'Email or password is incorrect.',
      'auth/email-already-in-use': 'An account with that email already exists. Try signing in.',
      'auth/weak-password': 'Use a password with at least 8 characters.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Wait a bit and try again.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/operation-not-allowed': 'Email sign-up is not turned on in Firebase yet (Authentication > Sign-in method > Email/Password).',
      'auth/configuration-not-found': 'Firebase sign-in is not set up yet (Authentication > Get started).',
      'auth/unauthorized-domain': 'This site is not allowed in Firebase yet (Authentication > Settings > Authorized domains).',
      'auth/invalid-api-key': 'The Firebase API key in script.js is wrong.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key in script.js is wrong.'
    };
    return map[err && err.code] || (err && err.message && !err.code ? err.message : 'Something went wrong' + (err && err.code ? ' (' + err.code + ')' : '') + '. Please try again.');
  }

  async function handleAuth(e, action) {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $('button[type="submit"]', form);
    const fd = new FormData(form);
    $('#authError').textContent = '';
    btn.disabled = true;
    try {
      state.user = await action(fd);
      form.reset();
      closeAuth();
      refreshAccount();
      const pending = state.pendingId;
      state.pendingId = null;
      if (pending) togglePrediction(pending);
    } catch (err) {
      $('#authError').textContent = authMessage(err);
    } finally {
      btn.disabled = false;
    }
  }

  function refreshAccount() {
    state.user = currentUser();
    const u = state.user;
    $('#userChip').hidden = !u;
    $('#userChip').textContent = u ? 'Hi, ' + u.name.split(' ')[0] : '';
    $('#picksLink').hidden = !u;
    $('#signinBtn').hidden = !!u;
    $('#signupBtn').hidden = !!u;
    $('#signoutBtn').hidden = !u;
    const pb = $('#profileBtn'); if (pb) pb.hidden = !u;
    $('#picks').hidden = !u;
    if (u) renderPicks();
    renderMatches();
  }

  function fmtDate(d) {
    if (!d) return { day: 'Date to be confirmed', time: '' };
    return {
      day: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    };
  }

  function badge(src) {
    if (!src) return null;
    const img = el('img', { src, alt: '', loading: 'lazy', width: '30', height: '30' });
    img.addEventListener('error', () => img.remove());
    return img;
  }

  let renderToken = 0;
  async function renderMatches() {
    const token = ++renderToken;
    const list = $('#matches');
    list.replaceChildren();

    if (state.view === 'standings') {
      await renderStandingsView(token);
      return;
    }

    if (!state.data) return;

    if (state.data.limited) {
      $('#status').className = 'status warn';
      $('#status').textContent = limitMessage(state.data);
      return;
    }

    const upcoming = state.view === 'upcoming';
    let rows = upcoming ? [...state.data.next] : [...state.data.past];

    if (!rows.length) {
      $('#status').textContent = upcoming
        ? 'No upcoming fixtures listed for this competition right now.'
        : 'No recent results listed for this competition.';
      return;
    }

    if (upcoming) {
      const isTop = TOP_LEAGUES.includes(state.league.code);
      if (!isTop) {
        rows = rows.slice(0, 3);
      }
    } else if (rows.length > 0) {
      const latestRound = rows[0].round;
      if (latestRound) {
        rows = rows.filter(m => m.round === latestRound);
      } else {
        rows = rows.slice(0, 10);
      }
    }

    $('#status.warn')?.classList.remove('warn');
    if (!state.data.limited) $('#status').textContent = '';

    const groups = {};
    rows.forEach(m => {
      const roundKey = m.round ? 'Matchday ' + m.round : 'Fixtures';
      if (!groups[roundKey]) groups[roundKey] = [];
      groups[roundKey].push(m);
    });

    for (const [roundName, matchRows] of Object.entries(groups)) {
      const headerLi = el('li', {
        class: 'matchday-header',
        style: 'padding: 1.25rem 0 0.5rem; font-family: var(--display); font-weight: 700; font-size: 1.2rem; color: var(--flood); border-bottom: 2px solid var(--line); margin-top: 1rem;'
      }, roundName);
      list.append(headerLi);

      matchRows.forEach(m => {
        const d = fmtDate(m.when);
        const open = state.openId === m.id;

        const fixtureEls = [
          el('span', { class: 'team home' }, m.home, badge(m.badgeHome)),
          upcoming ? el('span', { class: 'vs', text: 'vs' }) : el('span', { class: 'score', text: m.hs + ' – ' + m.as }),
          el('span', { class: 'team away' }, badge(m.badgeAway), m.away)
        ];

        const row = el('div', { class: 'match-row' },
          el('div', { class: 'match-time' }, el('strong', { text: d.day }), d.time),
          el('div', { class: 'fixture' }, ...fixtureEls),
          el('button', {
            class: 'btn predict-btn',
            type: 'button',
            'data-predict': m.id,
            'aria-expanded': String(open),
            'aria-controls': 'pred-' + m.id,
            text: open ? (upcoming ? 'Hide prediction' : 'Hide result') : (upcoming ? 'Predict' : 'Result'),
            onclick: () => togglePrediction(m.id)
          })
        );

        const li = el('li', { class: 'match' }, row);
        if (open) {
          li.append(upcoming ? renderPrediction(m) : renderRecentResultPrediction(m));
        }
        list.append(li);
      });
    }
  }

  async function renderStandingsView(token) {
    const list = $('#matches');
    $('#status').className = 'status';
    $('#status').textContent = 'Loading standings & statistics…';

    const table = await loadStandings(state.league.code);
    if (token !== renderToken) return; // user moved on while loading
    $('#status').textContent = '';

    if (!table || table.length === 0) {
      $('#status').textContent = 'Standings not available for this competition.';
      return;
    }

    const tableEl = el('div', { style: 'overflow-x: auto; margin-top: 1rem;' },
      el('table', { style: 'width: 100%; border-collapse: collapse; font-size: 0.95rem; text-align: left;' },
        el('thead', {},
          el('tr', { style: 'border-bottom: 2px solid var(--line); color: var(--chalk-dim); font-size: 0.85rem;' },
            el('th', { style: 'padding: 0.75rem 0.5rem;' }, 'Pos'),
            el('th', { style: 'padding: 0.75rem 0.5rem;' }, 'Club'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'MP'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'W'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'D'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'L'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'GF'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'GA'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'GD'),
            el('th', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, 'Pts')
          )
        ),
        el('tbody', {},
          table.map(row => el('tr', { style: 'border-bottom: 1px solid var(--line);' },
            el('td', { style: 'padding: 0.75rem 0.5rem; font-weight: 700;' }, String(row.position)),
            el('td', { style: 'padding: 0.75rem 0.5rem; display: flex; align-items: center; gap: 0.5rem;' },
              badge(row.team.crest),
              el('span', { text: row.team.name })
            ),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.playedGames)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.won)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.draw)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.lost)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.goalsFor)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.goalsAgainst)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center;' }, String(row.goalDifference > 0 ? '+' + row.goalDifference : row.goalDifference)),
            el('td', { style: 'padding: 0.75rem 0.5rem; text-align:center; font-weight: 700; color: var(--flood);' }, String(row.points))
          ))
        )
      )
    );

    list.append(el('li', {}, tableEl));
  }

  function renderPrediction(m) {
    const box = el('section', { class: 'pred', id: 'pred-' + m.id, 'aria-live': 'polite' });
    const entry = state.preds[m.id];

    if (!entry || entry.status === 'loading') {
      box.append(el('p', { text: 'Working out the numbers…' }));
      return box;
    }

    const r = entry.result;
    const pct = n => Math.round(n * 100);
    const h = pct(r.pH), d = pct(r.pD), a = 100 - h - d;
    const odds = p => (1 / Math.max(p, 0.01)).toFixed(2);

    const top = Math.max(r.pH, r.pD, r.pA);
    const lean = top === r.pH ? m.home + ' win' : top === r.pA ? m.away + ' win' : 'Draw';
    const sorted = [r.pH, r.pD, r.pA].sort((x, y) => y - x);
    const closeCall = sorted[0] - sorted[1] < 0.08;

    const formLine = (name, f) => el('div', { class: 'form-line' },
      el('b', { text: name }),
      f.form.length
        ? f.form.map(x => el('span', { class: 'chip ' + x, text: x }))
        : el('span', { text: 'no recent results found' })
    );

    const tipOptions = [
      { label: m.home + ' to win', tag: 'Win', p: r.pH },
      { label: m.away + ' to win', tag: 'Win', p: r.pA },
      { label: 'Over 2.5 goals', tag: 'Goals', p: r.over },
      { label: 'Both teams to score (GG)', tag: 'GG', p: r.btts }
    ].sort((x, y) => y.p - x.p).slice(0, 2);
    const conf = p => (p >= 0.65 ? 'High' : p >= 0.52 ? 'Medium' : 'Low');
    const tipsBlock = el('div', { class: 'tips' },
      el('h4', { text: 'Top 2 bet ideas' }),
      el('div', { class: 'tip-grid' }, tipOptions.map((t, i) =>
        el('div', { class: 'tip conf-' + conf(t.p).toLowerCase() },
          el('span', { class: 'tip-rank', text: '#' + (i + 1) }),
          el('span', { class: 'tip-tag', text: t.tag }),
          el('strong', { class: 'tip-label', text: t.label }),
          el('span', { class: 'tip-meta', text: pct(t.p) + '% chance · fair odds ' + odds(t.p) + ' · ' + conf(t.p) + ' confidence' }),
          el('span', { class: 'tip-meter' }, el('i', { style: 'width:' + pct(t.p) + '%' }))
        )
      ))
    );

    box.append(
      el('h3', { text: lean + (closeCall ? ' (close call)' : '') }),
      el('div', { class: 'bar', role: 'img', 'aria-label': m.home + ' ' + h + '%, draw ' + d + '%, ' + m.away + ' ' + a + '%' },
        el('span', { class: 'b-home', style: 'flex-basis:' + h + '%' }),
        el('span', { class: 'b-draw', style: 'flex-basis:' + d + '%' }),
        el('span', { class: 'b-away', style: 'flex-basis:' + a + '%' })
      ),
      el('dl', { class: 'legend' },
        el('div', { class: 'l-home' }, el('dt', { text: m.home }), el('dd', {}, h + '%', el('small', { text: 'fair odds ' + odds(r.pH) }))),
        el('div', { class: 'l-draw' }, el('dt', { text: 'Draw' }), el('dd', {}, d + '%', el('small', { text: 'fair odds ' + odds(r.pD) }))),
        el('div', { class: 'l-away' }, el('dt', { text: m.away }), el('dd', {}, a + '%', el('small', { text: 'fair odds ' + odds(r.pA) })))
      ),
      el('dl', { class: 'facts' },
        el('div', {}, el('dt', { text: 'Most likely score' }), el('dd', { text: r.score })),
        el('div', {}, el('dt', { text: 'Over 2.5 goals' }), el('dd', { text: pct(r.over) + '%' })),
        el('div', {}, el('dt', { text: 'Both teams score' }), el('dd', { text: pct(r.btts) + '%' })),
        el('div', {}, el('dt', { text: 'Form data' }), el('dd', { text: r.quality }))
      ),
      tipsBlock,
      el('div', { class: 'ctx' }, el('h4', { text: 'Why this prediction' }), el('ul', { class: 'why' }, whyLines(m, entry, r).map(t => el('li', { text: t })))),
      playersBlock(m, entry.extras || {}),
      formLine(m.home, entry.hForm),
      formLine(m.away, entry.aForm),
      el('div', { class: 'pred-actions' },
        el('button', {
          class: 'btn btn-solid',
          type: 'button',
          text: isSaved(m.id) ? 'Pick saved' : 'Save this pick',
          disabled: isSaved(m.id),
          onclick: () => savePick(m, lean, h, d, a)
        }),
        el('p', {
          class: 'caveat',
          text: 'Built only from recent results, so injuries, lineups and motivation are not counted.'
        })
      )
    );
    return box;
  }

  function renderRecentResultPrediction(m) {
    const box = el('section', { class: 'pred', id: 'pred-' + m.id, 'aria-live': 'polite' });
    const entry = state.preds[m.id];

    if (!entry || entry.status === 'loading') {
      box.append(el('p', { text: 'Evaluating prediction vs actual result…' }));
      return box;
    }

    const r = entry.result;
    const pct = n => Math.round(n * 100);
    const h = pct(r.pH), d = pct(r.pD), a = 100 - h - d;

    const top = Math.max(r.pH, r.pD, r.pA);
    const lean = top === r.pH ? m.home + ' win' : top === r.pA ? m.away + ' win' : 'Draw';

    // Actual outcomes
    const homeWon = m.hs > m.as;
    const awayWon = m.as > m.hs;
    const isDraw = m.hs === m.as;

    const predIsHomeWin = top === r.pH;
    const predIsAwayWin = top === r.pA;
    const predIsDraw = top === r.pD;

    const outcomeCorrect = (predIsHomeWin && homeWon) || (predIsAwayWin && awayWon) || (predIsDraw && isDraw);

    // Over 2.5 evaluation (> 2 goals is Over 2.5)
    const actualTotalGoals = m.hs + m.as;
    const actualOver25 = actualTotalGoals > 2;
    const predOver25 = r.over > 0.5;
    const over25Correct = actualOver25 === predOver25;

    // Both Teams to Score evaluation
    const actualBtts = m.hs > 0 && m.as > 0;
    const predBtts = r.btts > 0.5;
    const bttsCorrect = actualBtts === predBtts;

    const outcomeBadge = el('span', {
      class: 'chip ' + (outcomeCorrect ? 'W' : 'L'),
      style: 'margin-left: 0.75rem; font-size: 0.8rem; padding: 0.2rem 0.5rem; background:' + (outcomeCorrect ? '#58c4b4' : '#ff9a85') + '; color:#0b2124;',
      text: outcomeCorrect ? 'Correct ✓' : 'Incorrect ❌'
    });

    const mark = ok => (ok ? '✅' : '❌');
    const over25Badge = (actualOver25 ? 'Over 2.5' : 'Under 2.5') + ' (predicted ' + (predOver25 ? 'over' : 'under') + ' ' + mark(over25Correct) + ')';
    const bttsBadge = (actualBtts ? 'Yes' : 'No') + ' (predicted ' + (predBtts ? 'yes' : 'no') + ' ' + mark(bttsCorrect) + ')';

    box.append(
      el('h3', { text: 'Predicted: ' + lean }, outcomeBadge),
      el('div', { class: 'bar', role: 'img', 'aria-label': m.home + ' ' + h + '%, draw ' + d + '%, ' + m.away + ' ' + a + '%' },
        el('span', { class: 'b-home', style: 'flex-basis:' + h + '%' }),
        el('span', { class: 'b-draw', style: 'flex-basis:' + d + '%' }),
        el('span', { class: 'b-away', style: 'flex-basis:' + a + '%' })
      ),
      el('dl', { class: 'facts' },
        el('div', {}, el('dt', { text: 'Final Score' }), el('dd', { text: m.hs + ' – ' + m.as })),
        el('div', {}, el('dt', { text: 'Match Winner' }), el('dd', { text: outcomeCorrect ? 'Correct prediction (✅)' : 'Incorrect prediction (❌)' })),
        el('div', {}, el('dt', { text: 'Over 2.5 goals' }), el('dd', { text: over25Badge })),
        el('div', {}, el('dt', { text: 'Both teams score' }), el('dd', { text: bttsBadge }))
      ),
      el('div', { class: 'pred-actions' },
        el('p', { class: 'caveat', text: 'Evaluation comparing model probabilities against full-time scoreline.' })
      )
    );
    return box;
  }

  async function togglePrediction(id) {
    if (!state.user) {
      state.pendingId = id;
      openAuth('signin', 'Sign in or create an account to see predictions.');
      return;
    }
    if (state.openId === id) {
      state.openId = null;
      renderMatches();
      focusPredict(id);
      return;
    }
    if (!state.data) return;
    const m = (state.data.next || []).find(x => x.id === id) || (state.data.past || []).find(x => x.id === id);
    if (!m) return;
    state.openId = id;

    if (!state.preds[id]) {
      state.preds[id] = { status: 'loading' };
      renderMatches();
      focusPredict(id);

      const before = g => !m.when || !g.when || g.when < m.when;
      const pastGames = state.data.past.filter(before);
      const [hExtra, aExtra] = await Promise.all([
        teamGames(m.idHome, m.home),
        teamGames(m.idAway, m.away)
      ]);
      const merge = (name, extra) => {
        const seen = new Set();
        return [...extra.filter(before), ...pastGames.filter(g => g.home === name || g.away === name)]
          .filter(g => (seen.has(g.id) ? false : seen.add(g.id)));
      };
      const hForm = teamForm(m.home, merge(m.home, hExtra));
      const aForm = teamForm(m.away, merge(m.away, aExtra));

      let goals = 0, n = 0;
      for (const g of pastGames) { goals += g.hs + g.as; n++; }
      const leagueAvg = n >= 5 ? goals / (2 * n) : 1.35;

      try {
        const scorers = await loadScorers(state.league.code);
        state.preds[id] = { status: 'done', result: predict(hForm, aForm, leagueAvg), hForm, aForm, extras: { scorers } };
      } catch (err) {
        console.error('Prediction failed', err);
        delete state.preds[id];
        state.openId = null;
      }
    }
    renderMatches();
    focusPredict(id);
  }

  function focusPredict(id) {
    const b = document.querySelector('[data-predict="' + id + '"]');
    if (b) b.focus({ preventScroll: true });
  }

  function getPicks() {
    const user = auth.currentUser;
    return user ? store.get(picksKey(user.uid)) || [] : [];
  }
  function isSaved(id) { return getPicks().some(p => p.id === id); }

  function savePick(m, lean, h, d, a) {
    const user = auth.currentUser;
    if (!user || isSaved(m.id)) return;
    const picks = getPicks();
    picks.unshift({
      id: m.id, 
      home: m.home, 
      away: m.away, 
      lean,
      pick: lean === 'Draw' ? 'D' : lean === m.home + ' win' ? 'H' : 'A',
      probs: h + '% / ' + d + '% / ' + a + '%',
      kickoff: m.when ? m.when.toISOString() : null,
      leagueCode: state.league.code
    });
    store.set(picksKey(user.uid), picks);
    renderPicks();
    renderMatches();
    focusPredict(m.id);
  }

  function removePick(id) {
    const user = auth.currentUser;
    if (!user) return;
    store.set(picksKey(user.uid), getPicks().filter(p => p.id !== id));
    renderPicks();
    renderMatches();
  }

  let picksToken = 0;
  async function renderPicks() {
    const token = ++picksToken;
    const ul = $('#picksList');
    const picks = getPicks();
    if (!picks.length) {
      ul.replaceChildren(el('li', { class: 'picks-empty', text: 'No saved picks yet.' }));
      return;
    }

    const codes = [...new Set(picks.map(p => p.leagueCode).filter(Boolean))];
    const loaded = {};
    await Promise.all(codes.map(async c => { loaded[c] = await loadLeague({ code: c }); }));
    if (token !== picksToken) return;
    ul.replaceChildren();

    for (const p of picks) {
      let statusBadge = el('span', { class: 'chip D', style: 'background:var(--draw); color:#fff; font-size:0.75rem; padding:0.1rem 0.5rem; margin-left:0.5rem;', text: 'Pending' });

      if (p.leagueCode) {
        const leagueData = loaded[p.leagueCode];
        const finishedMatch = leagueData.past.find(m => m.id === p.id);
        if (finishedMatch) {
          const homeWon = finishedMatch.hs > finishedMatch.as;
          const awayWon = finishedMatch.as > finishedMatch.hs;
          const isDraw = finishedMatch.hs === finishedMatch.as;
          
          const pickCode = p.pick || (p.lean === 'Draw' ? 'D' : p.lean === finishedMatch.home + ' win' ? 'H' : 'A');
          const isCorrect = (pickCode === 'H' && homeWon) || (pickCode === 'A' && awayWon) || (pickCode === 'D' && isDraw);

          if (isCorrect) {
            statusBadge = el('span', { class: 'chip W', style: 'background:#58c4b4; color:#0b2124; font-size:0.75rem; padding:0.1rem 0.5rem; margin-left:0.5rem;', text: 'Correct ✓ (' + finishedMatch.hs + '-' + finishedMatch.as + ')' });
          } else {
            statusBadge = el('span', { class: 'chip L', style: 'background:#ff9a85; color:#0b2124; font-size:0.75rem; padding:0.1rem 0.5rem; margin-left:0.5rem;', text: 'Incorrect ❌ (' + finishedMatch.hs + '-' + finishedMatch.as + ')' });
          }
        }
      }

      const when = p.kickoff ? fmtDate(new Date(p.kickoff)) : null;
      ul.append(el('li', {},
        el('div', { class: 'pk-main' },
          el('strong', {}, p.home + ' vs ' + p.away, statusBadge),
          el('span', { text: 'Prediction: ' + p.lean + ' (' + p.probs + ')' + (when ? ' · ' + when.day : '') })
        ),
        el('button', { class: 'btn btn-quiet', type: 'button', text: 'Remove', onclick: () => removePick(p.id) })
      ));
    }
  }

  let clockTimer = null;
  /* ---- wow layer: ticker + confetti ---- */
  function renderTicker() {
    const next = (state.data && state.data.next) || [];
    let t = $('#ticker');
    if (!t) { t = el('div', { class: 'ticker', id: 'ticker', 'aria-hidden': 'true' }); $('.hero').after(t); }
    t.hidden = !next.length;
    const items = next.slice(0, 10).map(m => el('span', { class: 'tick', text: m.home + '  vs  ' + m.away + '  \u2022  ' + (m.when ? new Date(m.when).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBC') }));
    const lane = () => el('div', { class: 'lane' }, items.map(n => n.cloneNode(true)));
    t.replaceChildren(el('div', { class: 'track' }, lane(), lane()));
  }
  function confetti() {
    const c = el('canvas', { class: 'confetti' });
    c.width = innerWidth; c.height = innerHeight;
    document.body.append(c);
    const g = c.getContext('2d'), cols = ['#f3b63f', '#4fd1bd', '#ffd067', '#ff8d75', '#eef5ef'];
    const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 3, r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
    let f = 0;
    (function tick() {
      g.clearRect(0, 0, c.width, c.height);
      P.forEach(q => { q.vy += 0.35; q.x += q.vx; q.y += q.vy; q.a += 0.2; g.fillStyle = q.c; g.save(); g.translate(q.x, q.y); g.rotate(q.a); g.fillRect(-q.r / 2, -q.r / 2, q.r, q.r * 0.6); g.restore(); });
      if (++f < 130) requestAnimationFrame(tick); else c.remove();
    })();
  }

  function startClock() {
    renderTicker();
    clearInterval(clockTimer);
    const next = state.data && state.data.next && state.data.next.find(m => m.when && m.when.getTime() > Date.now());
    const teams = $('#kickTeams'), clock = $('#kickClock'), when = $('#kickWhen');
    if (!next) {
      teams.textContent = 'No fixture scheduled';
      clock.textContent = '--:--:--';
      when.textContent = '';
      return;
    }
    teams.textContent = next.home + ' vs ' + next.away;
    const f = fmtDate(next.when);
    when.textContent = f.day + ', ' + f.time;
    const tick = () => {
      let s = Math.max(0, Math.floor((next.when.getTime() - Date.now()) / 1000));
      const days = Math.floor(s / 86400); s %= 86400;
      const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      clock.textContent = (days ? days + 'd ' : '') + pad(hh) + ':' + pad(mm) + ':' + pad(ss);
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  /* ---- welcome voice (built-in browser speech, no API needed) ---- */
  let voices = [], keepAlive = null, audioCtx = null, ttsAudio = null;
  if ('speechSynthesis' in window) {
    const loadVoices = () => { voices = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  // A short, valid silent WAV. Playing it during a tap "unlocks" audio on iPhone/Safari.
  function silentWav() {
    const n = 800, b = new Uint8Array(44 + n * 2), dv = new DataView(b.buffer);
    const w = (o, t) => [...t].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 16000, true); dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    let t = ''; b.forEach(x => { t += String.fromCharCode(x); });
    return 'data:audio/wav;base64,' + btoa(t);
  }

  // Must run synchronously inside the click/submit so the browser allows sound later.
  function unlockSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { audioCtx = audioCtx || new AC(); audioCtx.resume(); }
      ttsAudio = new Audio(silentWav());
      ttsAudio.play().catch(() => {});
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }

  function chime() {
    if (!audioCtx) return;
    audioCtx.resume();
    [[659.25, 0], [987.77, 0.18]].forEach(([f, d]) => {
      const t = audioCtx.currentTime + d, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.95);
    });
  }

  function toast(text) {
    const n = el('div', { class: 'toast', role: 'status', text });
    document.body.append(n);
    setTimeout(() => n.classList.add('out'), 4200);
    setTimeout(() => n.remove(), 4800);
  }

  const greeting = (name, back) => back
    ? 'Welcome back... ' + name + '.'
    : 'Welcome... to Ems Predicts, ' + name + '. ... Predict smarter... and follow the game.';

  function browserSpeak(name, back) {
    if (!name) return;
    const text = greeting(name, back).replace(/\.\.\./g, ',');
    if (!('speechSynthesis' in window)) { chime(); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => /^en/i.test(x.lang) && x.default) || voices.find(x => /^en/i.test(x.lang)) || voices[0];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.volume = 1; u.rate = 0.85; u.pitch = 1;
    u.onend = () => setTimeout(chime, 250);
    u.onerror = () => chime();
    keepAlive = u; // stops Chrome from garbage-collecting the utterance mid-speech
    setTimeout(() => synth.speak(u), 80);
  }

  async function speakName(name, back) {
    if (!name) return;
    toast((back ? 'Welcome back, ' : 'Welcome, ') + name + '!');
    try {
      const url = BASE_URL.replace(/v4\/$/, '') + 'speak?say=' + encodeURIComponent(greeting(name, back));
      const a = ttsAudio || new Audio();
      a.src = url; // let the audio element stream it directly (most reliable on iPhone)
      a.volume = 1;
      a.defaultPlaybackRate = 0.85; // slower, warmer welcome
      a.playbackRate = 0.85;
      a.onended = () => setTimeout(chime, 250); // little sound after the voice
      await a.play();
    } catch (err) {
      console.error('ElevenLabs voice failed, using browser voice', err);
      toast('Voice problem: ' + (err && err.message ? err.message : err));
      browserSpeak(name, back);
    }
  }


  /* ---- live score announcer ---- */
  const live = { on: false, timer: null, prev: {}, queue: [], busy: false };
  function sayLive(text) {
    live.queue.push(text);
    if (!live.busy) nextSay();
  }
  function nextSay() {
    const text = live.queue.shift();
    if (!text) { live.busy = false; return; }
    live.busy = true;
    toast(text);
    const a = ttsAudio || (ttsAudio = new Audio());
    const done = () => nextSay();
    a.onended = done;
    a.onerror = done;
    a.defaultPlaybackRate = 1;
    a.playbackRate = 1;
    a.src = WORKER_URL.replace(/\/$/, '') + '/speak?say=' + encodeURIComponent(text);
    a.play().catch(() => {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.onend = done; u.onerror = done;
        window.speechSynthesis.speak(u);
      } else done();
    });
  }
  function renderLiveBar(list) {
    const bar = $('#liveBar');
    if (!bar) return;
    bar.hidden = !live.on;
    bar.replaceChildren(
      el('span', { class: 'live-dot' }),
      el('b', { text: 'LIVE' }),
      ...(list.length ? list.map(x => el('span', { class: 'live-item', text: x.home + ' ' + x.hs + '-' + x.as + ' ' + x.away + (x.status === 'PAUSED' ? ' (HT)' : x.minute ? " " + x.minute + "'" : '') }))
        : [el('span', { class: 'live-item muted', text: 'No live matches in this league right now' })])
    );
  }
  async function pollLive() {
    if (!live.on) return;
    try {
      const j = await getJSON(`${BASE_URL}competitions/${state.league.code}/matches?status=IN_PLAY,PAUSED`);
      const cur = {};
      (j.matches || []).forEach(x => {
        cur[x.id] = { id: x.id, home: x.homeTeam.shortName || x.homeTeam.name, away: x.awayTeam.shortName || x.awayTeam.name,
          hs: x.score.fullTime.home ?? x.score.halfTime.home ?? 0, as: x.score.fullTime.away ?? x.score.halfTime.away ?? 0,
          status: x.status, minute: x.minute };
      });
      const first = !live.seeded;
      if (!first) {
        Object.values(cur).forEach(n => {
          const o = live.prev[n.id];
          if (!o) { sayLive('Kick off. ' + n.home + ' versus ' + n.away + '.'); return; }
          if (n.hs > o.hs) sayLive('Goal for ' + n.home + '! ' + n.home + ' ' + n.hs + ', ' + n.away + ' ' + n.as + '.');
          else if (n.as > o.as) sayLive('Goal for ' + n.away + '! ' + n.home + ' ' + n.hs + ', ' + n.away + ' ' + n.as + '.');
          else if (n.hs < o.hs || n.as < o.as) sayLive('Goal ruled out. ' + n.home + ' ' + n.hs + ', ' + n.away + ' ' + n.as + '.');
          if (n.status === 'PAUSED' && o.status !== 'PAUSED') sayLive('Half time. ' + n.home + ' ' + n.hs + ', ' + n.away + ' ' + n.as + '.');
        });
        Object.values(live.prev).forEach(o => { if (!cur[o.id]) sayLive('Full time. ' + o.home + ' ' + o.hs + ', ' + o.away + ' ' + o.as + '.'); });
      } else {
        const n = Object.keys(cur).length;
        toast(n ? n + ' live match' + (n > 1 ? 'es' : '') + ' being tracked.' : 'Alerts on. Waiting for a match to start.');
      }
      live.seeded = true;
      live.prev = cur;
      renderLiveBar(Object.values(cur));
    } catch (err) { console.error('Live poll failed', err); }
  }
  function setLive(on) {
    live.on = on;
    live.prev = {}; live.seeded = false; live.queue = [];
    clearInterval(live.timer);
    const btn = $('#liveBtn');
    if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? 'Live alerts: ON' : 'Live alerts: OFF'; }
    if (on) { unlockSound(); pollLive(); live.timer = setInterval(pollLive, 45000); }
    else renderLiveBar([]);
  }

  function renderContinentTabs() {
    const tabs = $('#continentTabs');
    if (!tabs) return;
    tabs.replaceChildren(...CONTINENTS.map(c => el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(c.id === state.continent.id),
      text: c.name,
      onclick: () => selectContinent(c)
    })));
  }

  function renderLeagueSelect() {
    const select = $('#leagueSelect');
    if (!select) return;
    select.replaceChildren(...state.continent.leagues.map(l => el('option', {
      value: l.code,
      selected: l.code === state.league.code,
      text: l.name
    })));
    select.onchange = e => {
      const found = state.continent.leagues.find(l => l.code === e.target.value);
      if (found) selectLeague(found);
    };
  }

  async function selectContinent(continent) {
    state.continent = continent;
    state.league = continent.leagues[0];
    renderContinentTabs();
    renderLeagueSelect();
    await selectLeague(state.league);
  }

  async function selectLeague(league) {
    state.league = league;
    if (live.on) setTimeout(() => { live.prev = {}; live.seeded = false; pollLive(); }, 600);
    state.openId = null;
    state.data = null;
    const select = $('#leagueSelect');
    if (select) select.value = league.code;

    const status = $('#status');
    status.className = 'status';
    status.textContent = 'Loading ' + league.name + '…';

    const data = await loadLeague(league);
    if (state.league.code !== league.code) return;
    state.data = data;

    if (data.limited) {
      status.className = 'status warn';
      status.textContent = limitMessage(data);
    } else {
      status.textContent = '';
    }
    renderMatches();
    startClock();
  }

  function setView(view) {
    state.view = view;
    state.openId = null;
    $('#viewUpcoming').setAttribute('aria-pressed', String(view === 'upcoming'));
    $('#viewRecent').setAttribute('aria-pressed', String(view === 'recent'));
    $('#viewStandings').setAttribute('aria-pressed', String(view === 'standings'));
    renderMatches();
  }

  function init() {
    startPitch();

    auth.onAuthStateChanged(() => {
      refreshAccount();
    });

    $('#signinBtn').addEventListener('click', () => openAuth('signin'));
    $('#signupBtn').addEventListener('click', () => openAuth('signup'));
    $('#signoutBtn').addEventListener('click', () => {
      signOutUser();
      state.openId = null;
      refreshAccount();
    });
    $('#authClose').addEventListener('click', closeAuth);
    $('#tabSignin').addEventListener('click', () => setAuthMode('signin', $('#authHint').textContent));
    $('#tabSignup').addEventListener('click', () => setAuthMode('signup', $('#authHint').textContent));
    dlg.addEventListener('click', e => { if (e.target === dlg) closeAuth(); });
    dlg.addEventListener('close', () => { state.pendingId = null; });

    $('#signinForm').addEventListener('submit', e => {
      unlockSound();
      handleAuth(e, async fd => {
        const user = await signIn({ email: fd.get('email') || '', password: fd.get('password') || '' });
        speakName(user.name, true);
        return user;
      });
    });
    $('#signupForm').addEventListener('submit', e => {
      unlockSound();
      handleAuth(e, async fd => {
        const user = await signUp({
          name: fd.get('name') || '',
          email: fd.get('email') || '',
          password: fd.get('password') || '',
          adult: fd.get('age') === 'on'
        });
        speakName(user.name);
        confetti();
        return user;
      });
    });

    $('#viewUpcoming').addEventListener('click', () => setView('upcoming'));
    $('#viewRecent').addEventListener('click', () => setView('recent'));
    $('#viewStandings').addEventListener('click', () => setView('standings'));

    // --- wow layer: glow, tilt, reveal, count-up ---
    const tiltSel = '.match,.kickoff,.tip,.legend>div';
    document.addEventListener('pointermove', e => {
      document.documentElement.style.setProperty('--gx', e.clientX + 'px');
      document.documentElement.style.setProperty('--gy', e.clientY + 'px');
      const t = e.pointerType !== 'touch' && e.target.closest && e.target.closest(tiltSel);
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5) * 5).toFixed(2) + 'deg');
      t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 7).toFixed(2) + 'deg');
    });
    document.addEventListener('pointerout', e => {
      const t = e.target.closest && e.target.closest(tiltSel);
      if (t) { t.style.removeProperty('--rx'); t.style.removeProperty('--ry'); }
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.12 });
      document.querySelectorAll('.picks,.foot,.hero-copy,.kickoff').forEach(n => { n.classList.add('reveal'); io.observe(n); });
    }
    new MutationObserver(() => {
      document.querySelectorAll('.legend dd:not([data-c])').forEach(dd => {
        dd.dataset.c = '1';
        const tn = dd.firstChild;
        const m = tn && tn.nodeType === 3 && /^(\d+)%/.exec(tn.nodeValue);
        if (!m) return;
        const end = +m[1], rest = tn.nodeValue.slice(m[0].length), t0 = performance.now();
        (function step(t) { const k = Math.min(1, (t - t0) / 900); tn.nodeValue = Math.round(end * (1 - Math.pow(1 - k, 3))) + '%' + rest; if (k < 1) requestAnimationFrame(step); })(t0);
      });
    }).observe($('#matches'), { childList: true, subtree: true });

    // --- My profile ---
    const profileBtn = el('button', { class: 'btn btn-quiet', id: 'profileBtn', type: 'button', hidden: true, text: 'My profile' });
    $('#signoutBtn').before(profileBtn);
    const pdlg = el('dialog', { id: 'profileDialog', 'aria-labelledby': 'profileTitle' });
    document.body.append(pdlg);
    pdlg.addEventListener('click', e => { if (e.target === pdlg) pdlg.close(); });
    function openProfile() {
      const u = auth.currentUser;
      if (!u) return;
      const fmt = t => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not available');
      const name = u.displayName || u.email.split('@')[0];
      const row = (k, v) => el('div', { class: 'prow' }, el('span', { class: 'pk', text: k }), el('span', { class: 'pv', text: v }));
      const nameInput = el('input', { type: 'text', id: 'profileName', value: name, maxlength: '40', 'aria-label': 'Display name' });
      const msg = el('p', { class: 'hint', id: 'profileMsg', role: 'status' });
      const saveName = el('button', { class: 'btn btn-solid', type: 'button', text: 'Save name' });
      saveName.addEventListener('click', async () => {
        const v = nameInput.value.trim();
        if (v.length < 2) { msg.textContent = 'Enter at least 2 characters.'; return; }
        try { await u.updateProfile({ displayName: v }); msg.textContent = 'Name updated.'; refreshAccount(); openProfile(); }
        catch (e) { msg.textContent = 'Could not update your name.'; }
      });
      const reset = el('button', { class: 'btn btn-quiet', type: 'button', text: 'Email me a password reset' });
      reset.addEventListener('click', async () => {
        try { await auth.sendPasswordResetEmail(u.email); msg.textContent = 'Password reset email sent to ' + u.email; }
        catch (e) { msg.textContent = 'Could not send the email. Try again later.'; }
      });
      const out = el('button', { class: 'btn btn-quiet', type: 'button', text: 'Sign out' });
      out.addEventListener('click', () => { pdlg.close(); $('#signoutBtn').click(); });
      const close = el('button', { class: 'dlg-close', type: 'button', 'aria-label': 'Close', text: '\u00d7' });
      close.addEventListener('click', () => pdlg.close());
      const verified = row('Email status', u.emailVerified ? 'Verified' : 'Not verified yet');
      if (!u.emailVerified) {
        const rs = el('button', { class: 'link-btn', type: 'button', text: 'Resend verification email' });
        rs.addEventListener('click', async () => {
          try { await u.sendEmailVerification(); msg.textContent = 'Verification email sent.'; } catch (e) { msg.textContent = 'Could not send it right now.'; }
        });
        verified.append(rs);
      }
      pdlg.replaceChildren(el('div', { class: 'dlg' },
        close,
        el('div', { class: 'avatar', text: name.trim().charAt(0).toUpperCase() }),
        el('h2', { id: 'profileTitle', text: name }),
        el('p', { class: 'hint', text: u.email }),
        el('div', { class: 'plist' },
          row('Member since', fmt(u.metadata && u.metadata.creationTime)),
          row('Last sign-in', fmt(u.metadata && u.metadata.lastSignInTime)),
          verified,
          row('Saved picks', String(getPicks().length))
        ),
        el('label', { for: 'profileName', text: 'Display name' }),
        nameInput, saveName, msg,
        el('div', { class: 'pactions' }, reset, out)
      ));
      pdlg.showModal();
    }
    profileBtn.addEventListener('click', openProfile);
    $('#userChip').addEventListener('click', openProfile);

    const liveBtn = el('button', { class: 'btn btn-quiet live-btn', id: 'liveBtn', type: 'button', 'aria-pressed': 'false', text: 'Live alerts: OFF' });
    liveBtn.addEventListener('click', () => setLive(!live.on));
    $('.controls').append(liveBtn);
    $('#status').before(el('div', { class: 'live-bar', id: 'liveBar', hidden: true }));

    // --- interactive polish ---
    const topBar = $('.top');
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      document.body.style.setProperty('--scroll', (max > 0 ? scrollY / max * 100 : 0) + '%');
      topBar.classList.toggle('scrolled', scrollY > 20);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    document.addEventListener('pointermove', e => {
      const row = e.target.closest && e.target.closest('.match-row');
      if (!row) return;
      const r = row.getBoundingClientRect();
      row.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      row.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.btn');
      if (!b) return;
      const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
      const dot = el('span', { class: 'ripple' });
      dot.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
      b.append(dot);
      setTimeout(() => dot.remove(), 600);
    });
    new MutationObserver(() => {
      document.querySelectorAll('#matches .match:not([data-i])').forEach((m, i) => {
        m.dataset.i = i;
        m.style.setProperty('--i', Math.min(i, 12));
      });
    }).observe($('#matches'), { childList: true });

    renderContinentTabs();
    renderLeagueSelect();
    selectLeague(state.league);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


 








 








 








 








 








 








 





