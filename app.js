'use strict';

(() => {
    const $ = (id) => document.getElementById(id);

    // ---------------------------------------------------------------
    // Persistence
    // ---------------------------------------------------------------
    const SETTINGS_KEY = 'clucky:settings';
    const TIMER_KEY = 'clucky:timer';

    const store = {
        get(key, fallback) {
            try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
        },
    };

    const settings = Object.assign({
        tab: 'clock',
        tz: 'local',
        tzManual: false,
        geoZone: '',
        h24: false,
        theme: 'auto',
        mode: 'duration',
        dur: [0, 5, 0],
        targetTz: 'local',
        targetTzManual: false,
        targetValue: '',
        iosHintSeen: false,
    }, store.get(SETTINGS_KEY, {}));

    // Unless the user picked a zone themselves, always follow the device's real time zone.
    if (!settings.tzManual) settings.tz = 'local';
    if (!settings.targetTzManual) settings.targetTz = 'local';

    const saveSettings = () => store.set(SETTINGS_KEY, settings);

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------
    const pad = (n, len = 2) => String(n).padStart(len, '0');

    // Each character gets a fixed-width box so the numbers never jitter.
    function renderDigits(el, str) {
        if (el._v === str) return;
        el._v = str;
        let html = '';
        for (const c of str) {
            html += (c >= '0' && c <= '9') ? `<span class="d">${c}</span>` : `<span class="sep">${c}</span>`;
        }
        el.innerHTML = html;
    }

    // ---------------------------------------------------------------
    // Time zones
    // ---------------------------------------------------------------
    const ZONES = [
        ['local', 'Local time'],
        ['Asia/Manila', 'Manila'],
        ['Asia/Singapore', 'Singapore'],
        ['Asia/Hong_Kong', 'Hong Kong'],
        ['Asia/Tokyo', 'Tokyo'],
        ['Asia/Seoul', 'Seoul'],
        ['Asia/Kolkata', 'India'],
        ['Asia/Dubai', 'Dubai'],
        ['Australia/Sydney', 'Sydney'],
        ['Europe/London', 'London'],
        ['Europe/Paris', 'Paris'],
        ['UTC', 'UTC'],
        ['America/New_York', 'New York'],
        ['America/Chicago', 'Chicago'],
        ['America/Denver', 'Denver'],
        ['America/Los_Angeles', 'Los Angeles'],
        ['Pacific/Honolulu', 'Honolulu'],
    ];

    const partsFmtCache = new Map();
    function partsFormatter(tz) {
        let f = partsFmtCache.get(tz);
        if (!f) {
            f = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hourCycle: 'h23',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
            });
            partsFmtCache.set(tz, f);
        }
        return f;
    }

    // Wall-clock components of `epoch` in time zone `tz`.
    function zoneParts(epoch, tz) {
        if (tz !== 'local') {
            try {
                const p = {};
                for (const { type, value } of partsFormatter(tz).formatToParts(epoch)) {
                    if (type !== 'literal') p[type] = +value;
                }
                if (p.hour === 24) p.hour = 0;
                return p;
            } catch (e) { /* unknown zone: fall back to local */ }
        }
        const d = new Date(epoch);
        return {
            year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
            hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
        };
    }

    // Offset (ms) of `tz` from UTC at instant `epoch`.
    function zoneOffset(epoch, tz) {
        const p = zoneParts(epoch, tz);
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
    }

    // Epoch for a wall-clock time in `tz`.
    function zonedToEpoch(y, mo, d, h, mi, tz) {
        if (tz === 'local') return new Date(y, mo - 1, d, h, mi).getTime();
        const guess = Date.UTC(y, mo - 1, d, h, mi);
        const off = zoneOffset(guess, tz);
        let t = guess - off;
        const off2 = zoneOffset(t, tz);
        if (off2 !== off) t = guess - off2;
        return t;
    }

    function offsetLabel(epoch, tz) {
        const mins = Math.round(zoneOffset(epoch, tz) / 60000);
        if (mins === 0) return 'GMT';
        const sign = mins > 0 ? '+' : '−';
        const a = Math.abs(mins);
        return `GMT${sign}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
    }

    // The device's own IANA time zone (e.g. "Asia/Manila"). Re-read on resume
    // so the clock follows the phone when it changes zones while travelling.
    const readDeviceZone = () => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
    };
    let deviceZone = readDeviceZone();

    const isValidZone = (tz) => {
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
    };

    function zoneCity(tz) {
        if (tz === 'local') tz = deviceZone;
        const known = ZONES.find(([v]) => v === tz);
        if (known) return known[1];
        return (tz.split('/').pop() || tz).replace(/_/g, ' ');
    }

    function fillZoneSelect(select, selected) {
        const now = Date.now();
        const options = [];
        const deviceLabel = deviceZone ? `${zoneCity('local')} · ${offsetLabel(now, 'local')}` : offsetLabel(now, 'local');
        options.push(['local', `Auto · ${deviceLabel}`]);
        if (settings.geoZone && isValidZone(settings.geoZone)) {
            options.push([settings.geoZone, `📍 ${zoneCity(settings.geoZone)} · ${offsetLabel(now, settings.geoZone)}`]);
        }
        for (const [value, name] of ZONES) {
            if (value === 'local' || value === settings.geoZone) continue;
            options.push([value, `${name} · ${offsetLabel(now, value)}`]);
        }
        select.innerHTML = '';
        for (const [value, label] of options) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            select.appendChild(opt);
        }
        select.value = options.some(([v]) => v === selected) ? selected : 'local';
        return select.value;
    }

    // Small status message at the bottom of the screen.
    const notice = $('notice');
    let noticeTimer = 0;
    function notify(msg, ms = 3800) {
        notice.textContent = msg;
        notice.hidden = false;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { notice.hidden = true; }, ms);
    }

    // ---------------------------------------------------------------
    // Theme
    // ---------------------------------------------------------------
    const root = document.documentElement;
    const metaTheme = $('meta-theme');
    const themeIcon = $('theme-icon');
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const effectiveTheme = () => settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;

    function applyTheme() {
        if (settings.theme === 'auto') delete root.dataset.theme;
        else root.dataset.theme = settings.theme;
        const dark = effectiveTheme() === 'dark';
        themeIcon.setAttribute('href', dark ? '#i-sun' : '#i-moon');
        $('btn-theme').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        metaTheme.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#252a33' : '#e4e9f1'));
    }

    $('btn-theme').addEventListener('click', () => {
        const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        // Picking the system's own theme returns to "auto" so it keeps following the OS.
        settings.theme = next === (darkQuery.matches ? 'dark' : 'light') ? 'auto' : next;
        saveSettings();
        applyTheme();
    });
    darkQuery.addEventListener?.('change', applyTheme);
    applyTheme();

    // ---------------------------------------------------------------
    // Tabs
    // ---------------------------------------------------------------
    const tabs = document.querySelector('.tabs');
    const tabClock = $('tab-clock');
    const tabTimer = $('tab-timer');
    const viewClock = $('view-clock');
    const viewTimer = $('view-timer');

    function switchTab(name) {
        settings.tab = name === 'timer' ? 'timer' : 'clock';
        const isClock = settings.tab === 'clock';
        tabs.dataset.active = settings.tab;
        tabClock.setAttribute('aria-selected', String(isClock));
        tabTimer.setAttribute('aria-selected', String(!isClock));
        viewClock.hidden = !isClock;
        viewTimer.hidden = isClock;
        saveSettings();
    }

    tabClock.addEventListener('click', () => switchTab('clock'));
    tabTimer.addEventListener('click', () => switchTab('timer'));

    const urlTab = new URLSearchParams(location.search).get('tab');
    switchTab(urlTab || settings.tab);

    // ---------------------------------------------------------------
    // Clock
    // ---------------------------------------------------------------
    const clockTz = $('clock-tz');
    const clockH = $('clock-h');
    const clockM = $('clock-m');
    const clockS = $('clock-s');
    const clockMs = $('clock-ms');
    const clockColon = $('clock-colon');
    const clockAmPm = $('clock-ampm');
    const clockDate = $('clock-date');
    const clockOffset = $('clock-offset');
    const secFill = $('sec-fill');
    const btnFormat = $('btn-format');

    settings.tz = fillZoneSelect(clockTz, settings.tz);

    const dateFmtCache = new Map();
    function dateFormatter(tz) {
        let f = dateFmtCache.get(tz);
        if (!f) {
            const o = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
            if (tz !== 'local') o.timeZone = tz;
            try { f = new Intl.DateTimeFormat('en-US', o); } catch (e) { f = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
            dateFmtCache.set(tz, f);
        }
        return f;
    }

    let lastClockKey = '';

    function updateClock(now) {
        const tz = settings.tz;
        const p = zoneParts(now, tz);
        const ms = now % 1000;

        let h = p.hour;
        if (!settings.h24) h = h % 12 || 12;

        renderDigits(clockH, pad(h));
        renderDigits(clockM, pad(p.minute));
        renderDigits(clockS, pad(p.second));
        renderDigits(clockMs, '.' + pad(ms, 3));
        clockColon.classList.toggle('dim', ms >= 500);
        secFill.style.transform = `scaleX(${(p.second * 1000 + ms) / 60000})`;

        const key = `${tz}|${p.second}|${settings.h24}`;
        if (key !== lastClockKey) {
            lastClockKey = key;
            clockAmPm.textContent = p.hour >= 12 ? 'PM' : 'AM';
            clockAmPm.hidden = settings.h24;
            clockDate.textContent = dateFormatter(tz).format(now);
            clockOffset.textContent = `${zoneCity(tz)} · ${offsetLabel(now, tz)}`;
            $('clock-main').setAttribute('aria-label', `${pad(h)}:${pad(p.minute)}${settings.h24 ? '' : ' ' + clockAmPm.textContent}`);
        }
    }

    function renderFormatButton() {
        btnFormat.textContent = settings.h24 ? '24H' : '12H';
        btnFormat.setAttribute('aria-label', settings.h24 ? 'Using 24-hour time. Switch to 12-hour' : 'Using 12-hour time. Switch to 24-hour');
    }

    btnFormat.addEventListener('click', () => {
        settings.h24 = !settings.h24;
        saveSettings();
        renderFormatButton();
    });
    renderFormatButton();

    clockTz.addEventListener('change', () => {
        settings.tz = clockTz.value;
        settings.tzManual = settings.tz !== 'local';
        saveSettings();
    });

    // --- Detect the time zone from the device's location ---
    const btnLocate = $('btn-locate');
    let tzLookupLoading = null;

    function loadTzLookup() {
        if (window.tzlookup) return Promise.resolve(window.tzlookup);
        if (!tzLookupLoading) {
            tzLookupLoading = new Promise((resolve, reject) => {
                const sc = document.createElement('script');
                sc.src = 'vendor/tz-lookup.js';
                sc.onload = () => (window.tzlookup ? resolve(window.tzlookup) : reject(new Error('tz-lookup missing')));
                sc.onerror = () => { tzLookupLoading = null; reject(new Error('tz-lookup failed to load')); };
                document.head.appendChild(sc);
            });
        }
        return tzLookupLoading;
    }

    function getPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000,
            });
        });
    }

    function useDeviceZone(msg) {
        settings.tz = 'local';
        settings.tzManual = false;
        saveSettings();
        fillZoneSelect(clockTz, settings.tz);
        notify(msg);
    }

    btnLocate.addEventListener('click', async () => {
        if (btnLocate.classList.contains('is-busy')) return;
        if (!('geolocation' in navigator) || !window.isSecureContext) {
            useDeviceZone(`Location isn't available here. Using your device time zone (${zoneCity('local')}).`);
            return;
        }
        btnLocate.classList.add('is-busy');
        notify('Finding your location…', 15000);
        try {
            const [lookup, pos] = await Promise.all([loadTzLookup(), getPosition()]);
            const zone = lookup(pos.coords.latitude, pos.coords.longitude);
            if (!zone || !isValidZone(zone)) throw new Error('unknown zone');
            settings.geoZone = zone;
            settings.tz = zone;
            settings.tzManual = true;
            saveSettings();
            fillZoneSelect(clockTz, zone);
            fillZoneSelect(inputTargetTz, settings.targetTz);
            const now = Date.now();
            let msg = `📍 Time zone set to ${zoneCity(zone)} (${offsetLabel(now, zone)})`;
            if (deviceZone && zone !== deviceZone && zoneOffset(now, zone) !== zoneOffset(now, 'local')) {
                msg += ` — note: your device is set to ${zoneCity('local')}`;
            }
            notify(msg, 5000);
        } catch (err) {
            if (err && err.code === 1) {
                useDeviceZone(`Location permission denied. Using your device time zone (${zoneCity('local')}).`);
            } else {
                useDeviceZone(`Couldn't get your location. Using your device time zone (${zoneCity('local')}).`);
            }
        } finally {
            btnLocate.classList.remove('is-busy');
        }
    });

    // ---------------------------------------------------------------
    // Alarm sound + vibration
    // ---------------------------------------------------------------
    let audioCtx = null;
    let alarmTimer = 0;

    function unlockAudio() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audioCtx) audioCtx = new Ctx();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { audioCtx = null; }
    }

    function beep(at, freq) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.18);
    }

    function startAlarm() {
        stopAlarm();
        let rounds = 0;
        const ringOnce = () => {
            if (audioCtx && audioCtx.state === 'running') {
                const t = audioCtx.currentTime + 0.02;
                beep(t, 880); beep(t + 0.2, 880); beep(t + 0.4, 1175);
            }
            if (navigator.vibrate) navigator.vibrate([180, 80, 180, 80, 320]);
            if (++rounds >= 30) stopAlarm();
        };
        ringOnce();
        alarmTimer = setInterval(ringOnce, 1400);
    }

    function stopAlarm() {
        clearInterval(alarmTimer);
        alarmTimer = 0;
        if (navigator.vibrate) navigator.vibrate(0);
    }

    // ---------------------------------------------------------------
    // Timer
    // ---------------------------------------------------------------
    const inputH = $('input-h');
    const inputM = $('input-m');
    const inputS = $('input-s');
    const durInputs = [inputH, inputM, inputS];
    const durBox = $('dur');
    const presets = $('presets');
    const modeGroup = $('timer-mode');
    const setupDuration = $('timer-setup');
    const setupTarget = $('timer-target-setup');
    const inputTargetTime = $('input-target-time');
    const inputTargetTz = $('input-target-tz');
    const targetHint = $('target-hint');
    const runView = $('timer-run');
    const timerTiles = $('timer-tiles');
    const timerH = $('timer-h');
    const timerM = $('timer-m');
    const timerFill = $('timer-fill');
    const timerS = $('timer-s');
    const timerMs = $('timer-ms');
    const timerLabel = $('timer-label');
    const btnStart = $('btn-start');
    const btnPause = $('btn-pause');
    const btnReset = $('btn-reset');
    const btnAdd = $('btn-add');

    // state: idle | running | paused | done
    const timer = Object.assign({ state: 'idle', mode: 'duration', total: 0, endAt: 0, remaining: 0 }, store.get(TIMER_KEY, {}));
    const saveTimer = () => store.set(TIMER_KEY, timer);

    // --- Duration inputs ---
    durInputs.forEach((input, i) => {
        input.value = pad(Math.min(+input.dataset.max, Math.max(0, settings.dur[i] | 0)));

        input.addEventListener('focus', () => input.select());
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 2);
            syncDuration();
        });
        input.addEventListener('blur', () => {
            input.value = pad(Math.min(+input.dataset.max, parseInt(input.value, 10) || 0));
            syncDuration();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const max = +input.dataset.max;
                let v = (parseInt(input.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1);
                if (v > max) v = 0;
                if (v < 0) v = max;
                input.value = pad(v);
                input.select();
                syncDuration();
            } else if (e.key === 'Enter') {
                input.blur();
                startTimer();
            }
        });
    });

    function readDuration() {
        return durInputs.map((el) => Math.min(+el.dataset.max, parseInt(el.value, 10) || 0));
    }

    function syncDuration() {
        settings.dur = readDuration();
        saveSettings();
        const total = settings.dur[0] * 3600 + settings.dur[1] * 60 + settings.dur[2];
        presets.querySelectorAll('.preset').forEach((b) => b.classList.toggle('is-active', +b.dataset.sec === total));
    }

    presets.addEventListener('click', (e) => {
        const btn = e.target.closest('.preset');
        if (!btn) return;
        const sec = +btn.dataset.sec;
        inputH.value = pad(Math.floor(sec / 3600));
        inputM.value = pad(Math.floor((sec % 3600) / 60));
        inputS.value = pad(sec % 60);
        syncDuration();
    });
    syncDuration();

    // --- Target inputs ---
    settings.targetTz = fillZoneSelect(inputTargetTz, settings.targetTz);

    function defaultTargetValue() {
        const p = zoneParts(Date.now() + 3600000, settings.targetTz);
        return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:00`;
    }

    function parseTarget() {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(inputTargetTime.value);
        if (!m) return NaN;
        return zonedToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], settings.targetTz);
    }

    inputTargetTime.value = settings.targetValue || defaultTargetValue();
    if (!(parseTarget() > Date.now())) inputTargetTime.value = defaultTargetValue();

    inputTargetTime.addEventListener('change', () => {
        settings.targetValue = inputTargetTime.value;
        saveSettings();
        updateTargetHint(Date.now());
    });
    inputTargetTz.addEventListener('change', () => {
        settings.targetTz = inputTargetTz.value;
        settings.targetTzManual = settings.targetTz !== 'local';
        saveSettings();
        updateTargetHint(Date.now());
    });

    // Exact remaining time as HH / MM / SS / .mmm.
    // A 5-minute timer reads 00:05:00.000 when it starts and 00:00:00.000 when it rings.
    function formatCountdown(ms) {
        ms = Math.max(0, Math.floor(ms));
        const totalSec = Math.floor(ms / 1000);
        const hh = pad(Math.floor(totalSec / 3600));
        const mm = pad(Math.floor((totalSec % 3600) / 60));
        const ss = pad(totalSec % 60);
        const mmm = '.' + pad(ms % 1000, 3);
        return { hh, mm, ss, mmm, full: `${hh}:${mm}:${ss}` };
    }

    function updateTargetHint(now) {
        const target = parseTarget();
        if (!Number.isFinite(target)) {
            targetHint.textContent = 'Pick a date and time';
            targetHint.classList.add('bad');
        } else if (target <= now) {
            targetHint.textContent = 'That time has already passed';
            targetHint.classList.add('bad');
        } else {
            const c = formatCountdown(target - now);
            targetHint.textContent = `Countdown: ${c.full}${c.mmm}`;
            targetHint.classList.remove('bad');
        }
    }

    // --- Mode ---
    modeGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn || timer.state !== 'idle') return;
        settings.mode = btn.dataset.mode;
        saveSettings();
        renderTimerUI();
    });

    // --- Actions ---
    function flashError(el) {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        if (navigator.vibrate) navigator.vibrate(60);
    }

    function startTimer() {
        unlockAudio();
        const now = Date.now();

        if (timer.state === 'paused') {
            timer.endAt = now + timer.remaining;
            timer.state = 'running';
        } else if (timer.state === 'running') {
            return;
        } else {
            stopAlarm();
            const mode = settings.mode;
            if (mode === 'duration') {
                const [h, m, s] = readDuration();
                const total = (h * 3600 + m * 60 + s) * 1000;
                if (total <= 0) { timer.state = 'idle'; renderTimerUI(); flashError(durBox); return; }
                Object.assign(timer, { mode, total, endAt: now + total, remaining: total, state: 'running' });
            } else {
                const target = parseTarget();
                if (!(target > now + 500)) {
                    timer.state = 'idle';
                    renderTimerUI();
                    updateTargetHint(now);
                    flashError(inputTargetTime);
                    return;
                }
                Object.assign(timer, { mode, total: target - now, endAt: target, remaining: target - now, state: 'running' });
            }
        }
        saveTimer();
        renderTimerUI();
    }

    function pauseTimer() {
        if (timer.state !== 'running' || timer.mode !== 'duration') return;
        timer.remaining = Math.max(0, timer.endAt - Date.now());
        timer.state = 'paused';
        saveTimer();
        renderTimerUI();
    }

    function resetTimer() {
        stopAlarm();
        Object.assign(timer, { state: 'idle', total: 0, endAt: 0, remaining: 0 });
        saveTimer();
        renderTimerUI();
    }

    function addMinute() {
        const now = Date.now();
        if (timer.state === 'running') {
            timer.endAt += 60000;
            timer.total += 60000;
        } else if (timer.state === 'paused') {
            timer.remaining += 60000;
            timer.total += 60000;
        } else if (timer.state === 'done') {
            stopAlarm();
            Object.assign(timer, { mode: 'duration', total: 60000, endAt: now + 60000, remaining: 60000, state: 'running' });
        } else {
            return;
        }
        saveTimer();
        renderTimerUI();
    }

    function finishTimer() {
        timer.state = 'done';
        timer.remaining = 0;
        saveTimer();
        renderTimerUI();
        startAlarm();
    }

    btnStart.addEventListener('click', startTimer);
    btnPause.addEventListener('click', pauseTimer);
    btnReset.addEventListener('click', resetTimer);
    btnAdd.addEventListener('click', addMinute);
    runView.addEventListener('click', () => { if (timer.state === 'done') stopAlarm(); });

    const endFmt = (epoch) => new Date(epoch).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: !settings.h24,
    });

    function renderTimerUI() {
        const s = timer.state;
        const idle = s === 'idle';
        const durationRun = timer.mode === 'duration';

        modeGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode)));
        modeGroup.hidden = !idle;
        setupDuration.hidden = !idle || settings.mode !== 'duration';
        setupTarget.hidden = !idle || settings.mode !== 'target';
        runView.hidden = idle;

        btnStart.hidden = !(idle || s === 'paused' || (s === 'done' && durationRun));
        btnStart.setAttribute('aria-label', s === 'paused' ? 'Resume' : s === 'done' ? 'Restart' : 'Start');
        btnPause.hidden = !(s === 'running' && durationRun);
        btnAdd.hidden = !(durationRun && (s === 'running' || s === 'paused' || s === 'done'));

        runView.classList.toggle('is-paused', s === 'paused');
        runView.classList.toggle('is-done', s === 'done');
        if (s !== 'running') runView.classList.remove('is-warn');

        if (s === 'running') timerLabel.textContent = `Ends ${endFmt(timer.endAt)}`;
        else if (s === 'paused') timerLabel.textContent = 'Paused';
        else if (s === 'done') timerLabel.textContent = "Time's up!";

        if (idle) {
            document.title = 'Clucky';
            if (settings.mode === 'target') updateTargetHint(Date.now());
        }
        renderTimerDisplay(Date.now());
    }

    let lastTitle = '';

    function renderTimerDisplay(now) {
        if (timer.state === 'idle') return;
        // Clamp to the total so a clock that steps backwards can't show more than the timer length.
        const rem = timer.state === 'running' ? Math.min(timer.total, Math.max(0, timer.endAt - now))
            : timer.state === 'paused' ? timer.remaining : 0;

        const c = formatCountdown(rem);
        renderDigits(timerH, c.hh);
        renderDigits(timerM, c.mm);
        renderDigits(timerS, c.ss);
        renderDigits(timerMs, c.mmm);
        timerTiles.dataset.hlen = String(c.hh.length);
        const str = c.full;

        // Progress bar drains from full to empty as time runs out.
        const progress = timer.total > 0 ? Math.min(1, rem / timer.total) : 0;
        timerFill.style.width = `${(progress * 100).toFixed(3)}%`;
        runView.classList.toggle('is-warn', timer.state === 'running' && rem <= 10000);

        const title = timer.state === 'done' ? "⏰ Time's up · Clucky"
            : `${timer.state === 'paused' ? '❚❚' : '▶'} ${str} · Clucky`;
        if (title !== lastTitle) { document.title = title; lastTitle = title; }
    }

    // Restore a timer that was running when the app was closed.
    if (timer.state === 'running' && timer.endAt <= Date.now()) {
        timer.state = 'done';
        timer.remaining = 0;
        saveTimer();
    }
    if (timer.state !== 'idle') settings.mode = timer.mode;
    renderTimerUI();

    // ---------------------------------------------------------------
    // Main loop
    // ---------------------------------------------------------------

    function tick() {
        const now = Date.now();
        if (!viewClock.hidden) updateClock(now);

        if (timer.state === 'running') {
            if (now >= timer.endAt) finishTimer();
            else renderTimerDisplay(now);
        } else if (timer.state === 'idle' && settings.mode === 'target' && !viewTimer.hidden) {
            updateTargetHint(now);
        }
    }

    function frame() {
        tick();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // rAF pauses in background tabs; keep checking so the alarm still fires.
    setInterval(() => { if (document.hidden) tick(); }, 500);

    // ---------------------------------------------------------------
    // Keyboard shortcuts
    // ---------------------------------------------------------------
    document.addEventListener('keydown', (e) => {
        if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'escape' && document.body.classList.contains('focus')) setFocus(false);
        else if (k === 'f') setFocus(!document.body.classList.contains('focus'));
        else if (k === 'c') switchTab('clock');
        else if (k === 't') switchTab('timer');
        else if (k === ' ' && !viewTimer.hidden && !e.target.closest('button')) {
            e.preventDefault();
            if (timer.state === 'running') pauseTimer(); else startTimer();
        }
    });

    // ---------------------------------------------------------------
    // Focus mode: chrome hidden, huge digits, fullscreen + screen awake
    // ---------------------------------------------------------------
    let wakeLock = null;

    async function requestWakeLock() {
        if (!('wakeLock' in navigator) || wakeLock) return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch (e) { wakeLock = null; }
    }

    function releaseWakeLock() {
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }

    function setFocus(on) {
        document.body.classList.toggle('focus', on);
        if (on) {
            requestWakeLock();
            const el = document.documentElement;
            if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        } else {
            releaseWakeLock();
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        }
    }

    $('btn-focus').addEventListener('click', () => setFocus(true));
    $('btn-exit-focus').addEventListener('click', () => setFocus(false));
    viewClock.addEventListener('dblclick', () => setFocus(!document.body.classList.contains('focus')));

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('focus')) setFocus(false);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Phone changed time zone (e.g. after a flight)? Follow it.
            const z = readDeviceZone();
            if (z !== deviceZone) {
                deviceZone = z;
                dateFmtCache.delete('local');
                fillZoneSelect(clockTz, settings.tz);
                fillZoneSelect(inputTargetTz, settings.targetTz);
                lastClockKey = '';
            }
            if (document.body.classList.contains('focus')) requestWakeLock();
            tick();
        }
    });

    // ---------------------------------------------------------------
    // Install (PWA)
    // ---------------------------------------------------------------
    const btnInstall = $('btn-install');
    const iosHint = $('ios-hint');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        btnInstall.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        btnInstall.hidden = true;
    });

    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
            deferredPrompt = null;
            btnInstall.hidden = true;
        } else if (isIOS) {
            iosHint.hidden = false;
        }
    });

    $('ios-hint-close').addEventListener('click', () => {
        iosHint.hidden = true;
        settings.iosHintSeen = true;
        saveSettings();
    });

    if (isIOS && !isStandalone) {
        btnInstall.hidden = false;
        if (!settings.iosHintSeen) setTimeout(() => { iosHint.hidden = false; }, 2500);
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    }
})();
