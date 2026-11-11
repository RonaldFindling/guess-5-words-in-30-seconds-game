(function () {
  'use strict';

  const WORDS_PER_ROUND = 5;
  const STORAGE_KEY = 'thirty-seconds.settings';
  const LIMITS = {
    guessSeconds: { min: 5, max: 300, fallback: 30, label: 'guessSeconds' },
    previewSeconds: { min: 0, max: 120, fallback: 5, label: 'previewSeconds' },
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    error: $('error'),
    warning: $('warning'),
    phase: $('phase'),
    timer: $('timer'),
    words: $('words'),
    result: $('result'),
    packs: $('packs'),
    packSummary: $('pack-summary'),
    hint: $('hint'),
    start: $('start-btn'),
    ready: $('ready-btn'),
    stop: $('stop-btn'),
    settingsBtn: $('settings-btn'),
    dialog: $('settings-dialog'),
    form: $('settings-form'),
    guessInput: $('guess-input'),
    previewInput: $('preview-input'),
    guessDefault: $('guess-default'),
    previewDefault: $('preview-default'),
    settingsError: $('settings-error'),
    reset: $('reset-btn'),
    cancel: $('cancel-btn'),
  };

  // ---------- Settings ----------

  function isValid(key, value) {
    const l = LIMITS[key];
    return Number.isInteger(value) && value >= l.min && value <= l.max;
  }

  function loadFileDefaults(warnings) {
    const raw = window.SETTINGS;
    const out = {};
    if (raw === undefined) {
      warnings.push('settings.js was not found or could not be loaded – using built-in defaults.');
    }
    for (const key of Object.keys(LIMITS)) {
      const l = LIMITS[key];
      const value = raw && raw[key];
      if (isValid(key, value)) {
        out[key] = value;
      } else {
        out[key] = l.fallback;
        if (raw !== undefined) {
          warnings.push(`settings.js: "${key}" must be a whole number between ${l.min} and ${l.max} – using ${l.fallback}.`);
        }
      }
    }
    return out;
  }

  function loadOverrides() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const out = {};
      for (const key of Object.keys(LIMITS)) {
        if (isValid(key, parsed[key])) out[key] = parsed[key];
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function saveOverrides(values) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch (e) { /* storage unavailable */ }
  }

  function clearOverrides() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Words ----------

  const PACK_NAME = /^[A-Za-z0-9_-]+$/;
  const PACKS_STORAGE_KEY = 'thirty-seconds.packs';
  const registeredPacks = {};

  // Called by each words/<name>.js file. The pack name is taken from the file name,
  // so words/star-wars.js registers as "star-wars".
  window.wordPack = function (list) {
    const script = document.currentScript;
    const file = script && script.src ? script.src.split(/[?#]/)[0].split('/').pop() : '';
    const name = decodeURIComponent(file).replace(/\.js$/i, '');
    if (name) registeredPacks[name] = list;
  };

  // Trims entries and drops blanks and duplicates (case-insensitive).
  function uniqueWords(list) {
    const seen = new Set();
    const words = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const word = item.trim();
      const key = word.toLowerCase();
      if (!word || seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
    return words;
  }

  function packNamesFromSettings(errors, warnings) {
    const raw = window.SETTINGS && window.SETTINGS.packs;
    if (!Array.isArray(raw) || raw.length === 0) {
      errors.push('settings.js has no word packs. Add a list like:\n"packs": ["general", "star-wars"]');
      return [];
    }
    const names = [];
    for (const name of raw) {
      if (typeof name !== 'string' || !PACK_NAME.test(name)) {
        warnings.push(`settings.js: pack name ${JSON.stringify(name)} is not valid – use letters, digits, - and _ only.`);
      } else if (!names.includes(name)) {
        names.push(name);
      }
    }
    return names;
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function loadPacks(names, warnings) {
    const loaded = await Promise.all(names.map((name) => loadScript(`words/${encodeURIComponent(name)}.js`)));
    return names.map((name, i) => {
      const raw = registeredPacks[name];
      if (!loaded[i]) {
        warnings.push(`Word pack "${name}" could not be loaded – is there a file words/${name}.js?`);
        return { name, words: [], available: false };
      }
      if (!Array.isArray(raw)) {
        warnings.push(`words/${name}.js should contain wordPack(["word one", "word two", ...]);`);
        return { name, words: [], available: false };
      }
      const words = uniqueWords(raw);
      if (words.length === 0) warnings.push(`Word pack "${name}" has no words.`);
      return { name, words, available: words.length > 0 };
    });
  }

  function loadPackSelection(packs) {
    const available = packs.filter((p) => p.available).map((p) => p.name);
    try {
      const stored = JSON.parse(localStorage.getItem(PACKS_STORAGE_KEY));
      if (Array.isArray(stored)) return new Set(stored.filter((n) => available.includes(n)));
    } catch (e) { /* storage unavailable or invalid */ }
    return new Set(available); // first visit: everything selected
  }

  function savePackSelection(selected) {
    try { localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify([...selected])); } catch (e) { /* storage unavailable */ }
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // A shuffled deck: no word repeats until the whole pool has been used.
  function createDeck(pool) {
    let deck = shuffle(pool);
    let index = 0;
    return function draw(n) {
      if (deck.length - index < n) {
        const leftover = deck.slice(index);
        const rest = shuffle(pool.filter((w) => !leftover.includes(w)));
        deck = leftover.concat(rest);
        index = 0;
      }
      const hand = deck.slice(index, index + n);
      index += n;
      return hand;
    };
  }

  // ---------- Sound ----------

  let audioCtx = null;

  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
  }

  function beep(freq, duration, volume) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume || 0.3, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch (e) { /* ignore audio errors */ }
  }

  // ---------- Countdown ----------

  let timerId = null;

  function stopCountdown() {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
  }

  // Counts down from wall-clock time so the display never drifts.
  function startCountdown(seconds, onTick, onDone) {
    stopCountdown();
    const endAt = Date.now() + seconds * 1000;
    let lastShown = null;
    const tick = () => {
      const remainingMs = Math.max(0, endAt - Date.now());
      const shown = Math.ceil(remainingMs / 1000);
      if (shown !== lastShown) {
        lastShown = shown;
        onTick(shown);
      }
      if (remainingMs <= 0) {
        stopCountdown();
        onDone();
      }
    };
    timerId = setInterval(tick, 100);
    tick();
  }

  // ---------- Game state ----------

  const errors = [];
  const warnings = [];
  const fileDefaults = loadFileDefaults(warnings);
  let settings = Object.assign({}, fileDefaults, loadOverrides());

  let packs = [];            // [{ name, words, available }]
  let selectedPacks = new Set();
  let poolSize = 0;
  let packsLoaded = false;
  let draw = null;           // deck for the current pack selection, or null if not playable

  function rebuildDeck() {
    const pool = uniqueWords(packs.filter((p) => selectedPacks.has(p.name)).flatMap((p) => p.words));
    poolSize = pool.length;
    draw = poolSize >= WORDS_PER_ROUND ? createDeck(pool) : null;
  }

  function togglePack(name) {
    if (state.phase === 'preview' || state.phase === 'guessing') return;
    if (selectedPacks.has(name)) selectedPacks.delete(name); else selectedPacks.add(name);
    savePackSelection(selectedPacks);
    rebuildDeck();
    render();
  }

  const state = {
    phase: 'idle', // idle | preview | guessing | done
    words: [],
    guessed: new Set(),
    endReason: null, // time | all | stopped
  };

  function setPhase(phase) {
    state.phase = phase;
    document.body.dataset.phase = phase;
    render();
  }

  function startRound() {
    if (!draw) return;
    ensureAudio();
    state.words = draw(WORDS_PER_ROUND);
    state.guessed = new Set();
    state.endReason = null;
    if (settings.previewSeconds > 0) {
      setPhase('preview');
      startCountdown(settings.previewSeconds, showTime, startGuessing);
    } else {
      startGuessing();
    }
  }

  function startGuessing() {
    stopCountdown();
    setPhase('guessing');
    beep(660, 0.15);
    startCountdown(settings.guessSeconds, (s) => {
      showTime(s);
      if (s > 0 && s <= 3) beep(520, 0.08, 0.2);
    }, () => endRound('time'));
  }

  function endRound(reason) {
    stopCountdown();
    state.endReason = reason;
    beep(880, 0.6, 0.35);
    setPhase('done');
  }

  function toggleWord(i) {
    if (state.phase !== 'guessing' || i < 0 || i >= state.words.length) return;
    if (state.guessed.has(i)) state.guessed.delete(i); else state.guessed.add(i);
    if (state.guessed.size === state.words.length) {
      endRound('all');
    } else {
      renderWords();
    }
  }

  // ---------- Rendering ----------

  function showTime(seconds) {
    el.timer.textContent = String(seconds);
    el.timer.classList.toggle('urgent', state.phase === 'guessing' && seconds <= 5);
  }

  function renderWords() {
    el.words.replaceChildren(...state.words.map((word, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word' + (state.guessed.has(i) ? ' guessed' : '');
      btn.disabled = state.phase !== 'guessing';
      btn.setAttribute('aria-pressed', String(state.guessed.has(i)));
      btn.addEventListener('click', () => toggleWord(i));

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = word;
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = '✓';

      btn.append(num, label, check);
      li.append(btn);
      return li;
    }));
  }

  const PHASE_TEXT = {
    idle: 'Hand the screen to the describer, then start the round.',
    preview: 'Get ready – memorise your words',
    guessing: 'Go! Tap a word when it’s guessed',
    done: '',
  };

  const END_TEXT = { time: 'Time’s up!', all: 'All words guessed!', stopped: 'Round ended' };

  const HINT_TEXT = {
    idle: 'Space: start round',
    preview: 'Space: start the clock now',
    guessing: 'Keys 1–5: mark word as guessed',
    done: 'Space: next round',
  };

  function render() {
    const p = state.phase;
    el.phase.textContent = p === 'done' ? END_TEXT[state.endReason] : PHASE_TEXT[p];
    el.hint.textContent = draw ? HINT_TEXT[p] : '';

    if (p === 'idle') showTime(settings.guessSeconds);
    if (p === 'done') el.timer.classList.remove('urgent');

    renderWords();
    el.result.textContent = p === 'done' ? `${state.guessed.size} / ${state.words.length} guessed` : '';

    el.start.hidden = !(p === 'idle' || p === 'done');
    el.start.textContent = p === 'done' ? 'Next round' : 'Start round';
    el.start.disabled = !draw;
    el.ready.hidden = p !== 'preview';
    el.stop.hidden = p !== 'guessing';
    el.settingsBtn.disabled = p === 'preview' || p === 'guessing';
    renderPacks();
  }

  function renderPacks() {
    const locked = state.phase === 'preview' || state.phase === 'guessing';
    el.packs.replaceChildren(...packs.map((pack) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selectedPacks.has(pack.name) ? ' selected' : '') + (pack.available ? '' : ' unavailable');
      chip.disabled = locked || !pack.available;
      chip.setAttribute('aria-pressed', String(selectedPacks.has(pack.name)));
      chip.textContent = pack.available ? `${pack.name} (${pack.words.length})` : `${pack.name} – could not load`;
      chip.addEventListener('click', () => togglePack(pack.name));
      return chip;
    }));

    let summary = '';
    let problem = false;
    if (!packsLoaded) {
      summary = 'Loading word packs…';
    } else if (packs.some((p) => p.available)) {
      if (selectedPacks.size === 0) {
        summary = 'Select at least one word pack.';
        problem = true;
      } else if (poolSize < WORDS_PER_ROUND) {
        summary = `${poolSize} words selected – at least ${WORDS_PER_ROUND} are needed.`;
        problem = true;
      } else {
        summary = `${poolSize} words selected`;
      }
    }
    el.packSummary.textContent = summary;
    el.packSummary.classList.toggle('problem', problem);
  }

  function renderBanners() {
    el.error.hidden = errors.length === 0;
    el.error.textContent = errors.join('\n');
    el.warning.hidden = warnings.length === 0;
    el.warning.textContent = warnings.join('\n');
  }

  // ---------- Settings dialog ----------

  function openSettings() {
    if (el.settingsBtn.disabled) return;
    el.guessInput.value = settings.guessSeconds;
    el.previewInput.value = settings.previewSeconds;
    el.guessDefault.textContent = `File default: ${fileDefaults.guessSeconds} s (allowed ${LIMITS.guessSeconds.min}–${LIMITS.guessSeconds.max})`;
    el.previewDefault.textContent = `File default: ${fileDefaults.previewSeconds} s (allowed ${LIMITS.previewSeconds.min}–${LIMITS.previewSeconds.max})`;
    el.settingsError.hidden = true;
    el.dialog.showModal();
  }

  el.form.addEventListener('submit', (event) => {
    const next = {
      guessSeconds: Number(el.guessInput.value),
      previewSeconds: Number(el.previewInput.value),
    };
    const problems = Object.keys(LIMITS)
      .filter((key) => !isValid(key, next[key]))
      .map((key) => `${key === 'guessSeconds' ? 'Guessing' : 'Preview'} time must be a whole number between ${LIMITS[key].min} and ${LIMITS[key].max}.`);
    if (problems.length) {
      event.preventDefault();
      el.settingsError.textContent = problems.join(' ');
      el.settingsError.hidden = false;
      return;
    }
    settings = next;
    saveOverrides(next);
    render();
  });

  el.reset.addEventListener('click', () => {
    clearOverrides();
    settings = Object.assign({}, fileDefaults);
    el.dialog.close();
    render();
  });

  el.cancel.addEventListener('click', () => el.dialog.close());

  // ---------- Wiring ----------

  el.start.addEventListener('click', startRound);
  el.ready.addEventListener('click', startGuessing);
  el.stop.addEventListener('click', () => endRound('stopped'));
  el.settingsBtn.addEventListener('click', openSettings);

  document.addEventListener('keydown', (event) => {
    if (el.dialog.open || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (event.code === 'Space') {
      // Avoid double-triggering a focused button.
      event.preventDefault();
      if ((state.phase === 'idle' || state.phase === 'done') && draw) startRound();
      else if (state.phase === 'preview') startGuessing();
      return;
    }
    if (state.phase === 'guessing' && /^[1-9]$/.test(event.key)) {
      toggleWord(Number(event.key) - 1);
    }
  });

  async function init() {
    renderBanners();
    render();
    const names = packNamesFromSettings(errors, warnings);
    packs = await loadPacks(names, warnings);
    if (names.length > 0 && !packs.some((p) => p.available)) {
      errors.push('None of the word packs could be loaded – check the words/ folder and the "packs" list in settings.js.');
    }
    selectedPacks = loadPackSelection(packs);
    rebuildDeck();
    packsLoaded = true;
    renderBanners();
    render();
  }

  init();
})();
