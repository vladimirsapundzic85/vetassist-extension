console.log("VetAssist tool loaded: ovkoze_kontrola_evidencije v1.1.1");

(function () {
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_ovkoze_kontrola_evidencije_loaded_v111) {
    console.log("VetAssist tool already loaded: ovkoze_kontrola_evidencije v1.1.1");
    return;
  }
  root.__vetassist_ovkoze_kontrola_evidencije_loaded_v111 = true;

  const TOOL_CODE = "ovkoze_kontrola_evidencije";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";
  const COMPLETION_PANEL_ID = "vetassist-ovkoze-kontrola-complete-panel";

  const FORM_URL = '/pls/aimcs_prod/w_ov_reg_search.startup';
  const SS_KEY = 'vetassist_ovkoze_kontrola_evidencije_v111';

  const OLD_CONTROL_DAYS = 365;

  const ENGINE_LOCK_KEY = 'vetassist_ovkoze_engine_lock_v111';
  const ENGINE_HEARTBEAT_MS = 2000;
  const ENGINE_STALE_MS = 8000;

  const START_REQUEST_KEY = 'vetassist_ovkoze_start_request_v111';

  const BASE_HEADERS = [
    'Serijski broj potvrde',
    'ID broj gazdinstva',
    'Držalac životinja',
    'Adresa držaoca životinja',
    'Datum kontrole od',
    'Broj obeleženih ovaca',
    'Broj obeleženih koza',
    'Broj uzoraka krvi ovaca',
    'Broj uzoraka krvi koza',
    'Bruceloza na gazdinstvu'
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => new Date().toLocaleTimeString('sr-RS');

  const INSTANCE_TOKEN = `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  let LOCK = false;
  let CACHED_FORM_PACK = null;

  const ST = Object.assign({
    active: false,
    pendingStart: false,
    idx: 0,
    rows: [],
    results: [],
    log: [],

    delay: 60,
    timeoutSec: 6,
    dcTimeoutSec: 7,

    fastMode: true,
    fastClickWaitMs: 120,
    submitOnly: true,

    selPrefix: 'input[name="p_state"]',
    selId: 'input[name="p_id_animal"]',
    selBtn: 'input[value="Nastavi"], input[type="button"][value="Nastavi"], input[name="p_submit"], button',

    rawInput: '',
    exported: false,
    fileNameLast: '',
    runId: null,

    dcEnabled: true,
    dcTriedIdx: -1,
    dcPending: null,
    dcMode: 'idle',
    inFlight: false,
    inFlightSince: 0
  }, JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'));

  const save = () => sessionStorage.setItem(SS_KEY, JSON.stringify(ST));

  function log(msg) {
    ST.log.push(`[${now()}] ${msg}`);
    if (ST.log.length > 4000) ST.log.shift();
    save();
    console.log(`[${TOOL_CODE}] ${msg}`);
  }

  function setStatus(text) {
    console.log(`[${TOOL_CODE}] Status: ${text}`);
  }

  function getPendingStartPayload() {
    try {
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || '{}');
      return all[TOOL_CODE] || null;
    } catch {
      return null;
    }
  }

  function clearPendingStartPayload() {
    try {
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || '{}');
      delete all[TOOL_CODE];
      sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
    } catch {}
  }

  function clearActiveTool() {
    try { sessionStorage.removeItem(ACTIVE_TOOL_KEY); } catch {}
  }

  function removeReturnButton() {
    try {
      const btn = document.getElementById(RETURN_BTN_ID) || window.top.document.getElementById(RETURN_BTN_ID);
      if (btn) btn.remove();
    } catch {}
  }

  function removeCompletionPanel() {
    try {
      const old = window.top.document.getElementById(COMPLETION_PANEL_ID);
      if (old) old.remove();
    } catch {}
  }

  function ensureCompletionStyles() {
    try {
      const d = window.top.document;
      if (d.getElementById('vetassist-ovkoze-kontrola-complete-styles')) return;
      const style = d.createElement('style');
      style.id = 'vetassist-ovkoze-kontrola-complete-styles';
      style.textContent = `
        #${COMPLETION_PANEL_ID}{
          position:fixed;top:120px;right:18px;width:420px;z-index:2147483647;
          background:#f7f5e8;border:1px solid #9e9b87;border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.18);color:#222;font:13px/1.4 Arial,sans-serif
        }
        #${COMPLETION_PANEL_ID} .va-head{
          padding:10px 12px;background:#e9e3c6;border-bottom:1px solid #c9c19d;
          font-weight:700;font-size:14px
        }
        #${COMPLETION_PANEL_ID} .va-body{padding:12px}
        #${COMPLETION_PANEL_ID} .va-ok{
          margin-bottom:10px;padding:8px 10px;border:1px solid #9bc7a4;background:#f4fff6;border-radius:8px
        }
        #${COMPLETION_PANEL_ID} .va-meta{
          display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px
        }
        #${COMPLETION_PANEL_ID} .va-row{
          padding:6px 8px;border:1px solid #d7d0b0;background:#faf7ea;border-radius:8px
        }
        #${COMPLETION_PANEL_ID} .va-actions{display:flex;gap:8px;margin-top:12px}
        #${COMPLETION_PANEL_ID} .va-btn{
          border:1px solid #9d9778;background:#fffdf2;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700
        }
        #${COMPLETION_PANEL_ID} .va-btn-primary{
          border-color:#6e8f73;background:#eaf8ed
        }
      `;
      d.documentElement.appendChild(style);
    } catch {}
  }

  function showCompletionPanel(summary) {
    try {
      const d = window.top.document;
      ensureCompletionStyles();
      removeCompletionPanel();

      const box = d.createElement('div');
      box.id = COMPLETION_PANEL_ID;
      box.innerHTML =
        `<div class="va-head">VetAssist — završeno</div>
         <div class="va-body">
           <div class="va-ok"><b>Obrada je uspešno završena.</b></div>
           <div class="va-meta">
             <div class="va-row">Obrađena grla: <b>${summary.rowCount}</b></div>
             <div class="va-row">Upozorenja / bez rezultata: <b>${summary.warnCount}</b></div>
             <div class="va-row">Fajl: <b>${summary.fileName || '-'}</b></div>
             <div class="va-row">Vreme završetka: <b>${summary.finishedAt || '-'}</b></div>
           </div>
           <div class="va-actions">
             <button id="va-ov-back" class="va-btn va-btn-primary">Nazad na alate</button>
             <button id="va-ov-close" class="va-btn">Zatvori</button>
           </div>
         </div>`;
      d.documentElement.appendChild(box);

      box.querySelector('#va-ov-back')?.addEventListener('click', () => {
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector('#va-ov-close')?.addEventListener('click', () => {
        removeCompletionPanel();
      });
    } catch (e) {
      console.error('Completion panel failed', e);
    }
  }

  function parseTextarea(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const out = [];

    for (const line of lines) {
      const cols = line.split(/[;,\t]+|\s{2,}/).map(s => s.trim()).filter(Boolean);

      if (cols.length < 2) {
        log(`Preskačem nevalidan red: "${line}"`);
        continue;
      }

      const prefix = String(cols[0] || '').trim().toUpperCase();
      const id = String(cols[1] || '').replace(/\D+/g, '');
      const hid = cols.length >= 3 ? String(cols[2] || '').replace(/\D+/g, '') : '';

      if (!prefix || !id) {
        log(`Preskačem nevalidan red: "${line}"`);
        continue;
      }

      out.push({ prefix, id, hid });
    }

    return out;
  }

  function inFlightStale() {
    const t = +ST.inFlightSince || 0;
    const limit = (Math.max(4, +ST.dcTimeoutSec || +ST.timeoutSec || 7) * 1000) + 4000;
    return ST.inFlight && t && (Date.now() - t > limit);
  }

  function clearInFlightIfStale() {
    if (inFlightStale()) {
      ST.inFlight = false;
      ST.inFlightSince = 0;
      save();
      log('B-OPT: inFlight stale → cleared');
    }
  }

  function allDocs() {
    const out = [];
    try {
      (function walk(w) {
        try { if (w.document) out.push(w.document); } catch {}
        try { for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]); } catch {}
      })(window.top);
    } catch {}
    try { out.push(document); } catch {}
    return [...new Set(out)];
  }

  function getQueryFormDoc() {
    try {
      const top = window.top;
      for (let i = 0; i < top.frames.length; i++) {
        const fr = top.frames[i];
        try { if (fr.name === 'query_form' && fr.document) return fr.document; } catch {}
      }
    } catch {}
    return null;
  }

  function isTopWindow() {
    try { return window.top === window; } catch { return false; }
  }

  function readLock() {
    try { return JSON.parse(sessionStorage.getItem(ENGINE_LOCK_KEY) || 'null'); } catch { return null; }
  }
  function writeLock(obj) {
    try { sessionStorage.setItem(ENGINE_LOCK_KEY, JSON.stringify(obj)); } catch {}
  }
  function clearLock() {
    try { sessionStorage.removeItem(ENGINE_LOCK_KEY); } catch {}
  }
  function isStale(lockObj) {
    if (!lockObj || !lockObj.ts) return true;
    return (Date.now() - lockObj.ts) > ENGINE_STALE_MS;
  }
  function iAmOwner() {
    const cur = readLock();
    return !!cur && cur.owner === INSTANCE_TOKEN && !isStale(cur);
  }
  function claimLockTopOnly() {
    if (!isTopWindow()) return false;
    const cur = readLock();
    if (!cur || isStale(cur)) {
      writeLock({ owner: INSTANCE_TOKEN, ts: Date.now() });
      return true;
    }
    return cur.owner === INSTANCE_TOKEN;
  }
  function heartbeat() {
    if (!iAmOwner()) return;
    writeLock({ owner: INSTANCE_TOKEN, ts: Date.now() });
  }
  function releaseIfOwner() {
    const cur = readLock();
    if (cur && cur.owner === INSTANCE_TOKEN) clearLock();
  }

  function requestStartFromAnyFrame() {
    try {
      const payload = { by: INSTANCE_TOKEN, ts: Date.now() };
      sessionStorage.setItem(START_REQUEST_KEY, JSON.stringify(payload));
    } catch {}
  }
  function readStartRequest() {
    try { return JSON.parse(sessionStorage.getItem(START_REQUEST_KEY) || 'null'); } catch { return null; }
  }
  function clearStartRequest() {
    try { sessionStorage.removeItem(START_REQUEST_KEY); } catch {}
  }

  function isOvKozFormContext() {
  const docs = [];
  const qd = getQueryFormDoc();
  if (qd) docs.push(qd);
  docs.push(...allDocs());

  for (const d of docs) {
    try {
      const u = String(d.URL || '');

      // PRAVI OV/KOZ URL obrasci
      if (/w_ov_reg_search\.(startup|query_form|list_form)/i.test(u)) {
        return true;
      }

      // stroži fallback: mora da postoji baš OV/KOZ forma i da URL nije goveda
      const hasPrefix = !!d.querySelector('input[name="p_state"]');
      const hasId = !!d.querySelector('input[name="p_id_animal"]');
      const hasNastavi =
        !!d.querySelector('input[value="Nastavi"], input[type="button"][value="Nastavi"], input[name="p_submit"], button');

      const isCattlePage =
        /W_ANIMAL_LIST/i.test(u) ||
        /W_FARM_SEARCH/i.test(u);

      if (hasPrefix && hasId && hasNastavi && !isCattlePage) {
        return true;
      }
    } catch {}
  }

  return false;
}

  async function ensureOvKozThenResume() {
    if (!ST.active) return;
    if (!ST.pendingStart) return;
    if (!isOvKozFormContext()) return;

    ST.pendingStart = false;
    save();
    log('pendingStart: stigli na OV/KOZ FORMU → nastavljam');
    setStatus('Krećem…');
    await sleep(5);
    go();
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function isLiveInput(el) {
    try {
      return !!(el && el.isConnected && el.ownerDocument && el.ownerDocument.defaultView);
    } catch {
      return false;
    }
  }

  function getCachedFormPackIfValid() {
    try {
      if (!CACHED_FORM_PACK) return null;
      const { doc, inpP, inpI, formEl } = CACHED_FORM_PACK;
      if (!doc || !inpP || !inpI || !formEl) return null;
      if (!isLiveInput(inpP) || !isLiveInput(inpI)) return null;
      const url = String(doc.URL || '');
      if (!/w_ov_reg_search\.(startup|query_form)/i.test(url)) return null;
      return CACHED_FORM_PACK;
    } catch {
      return null;
    }
  }

  function setCachedFormPack(pack) {
    CACHED_FORM_PACK = pack || null;
  }

  function clearCachedFormPack() {
    CACHED_FORM_PACK = null;
  }

  function findNastaviInDoc(d, formEl) {
    try {
      const scope = formEl || d;

      let btn = null;
      try { btn = scope.querySelector(ST.selBtn); } catch {}
      if (btn) return btn;

      const candidates = Array.from(scope.querySelectorAll('button, input, a'))
        .filter(el => {
          const tag = (el.tagName || '').toLowerCase();
          if (tag === 'input') {
            const t = norm(el.getAttribute('type') || '');
            const v = norm(el.getAttribute('value') || el.value || '');
            return v.includes('NASTAVI') || t === 'SUBMIT' || t === 'BUTTON';
          }
          if (tag === 'button') {
            const tx = norm(el.textContent || el.innerText || '');
            const v = norm(el.getAttribute('value') || '');
            return tx.includes('NASTAVI') || v.includes('NASTAVI') || el.type === 'submit';
          }
          if (tag === 'a') {
            const tx = norm(el.textContent || el.innerText || '');
            const v = norm(el.getAttribute('title') || '');
            return tx.includes('NASTAVI') || v.includes('NASTAVI') || /nazad|pretra/i.test(norm(tx));
          }
          return false;
        });

      const best = candidates.find(el => norm(el.value || el.getAttribute('value') || el.textContent || '').includes('NASTAVI'))
        || candidates.find(el => (el.tagName || '').toLowerCase() === 'button' && (el.type === 'submit'))
        || candidates.find(el => (el.tagName || '').toLowerCase() === 'input' && norm(el.type).includes('SUBMIT'))
        || candidates[0];

      return best || null;
    } catch {}
    return null;
  }

  function trySubmitForm(formEl) {
    try {
      if (!formEl) return false;
      if (typeof formEl.requestSubmit === 'function') { formEl.requestSubmit(); return true; }
      formEl.submit(); return true;
    } catch {}
    return false;
  }

  function findFormPack() {
    let fallback = null;
    const docs = [];
    const qd = getQueryFormDoc();
    if (qd) docs.push(qd);
    docs.push(...allDocs());

    for (const d of docs) {
      try {
        const u = String(d.URL || '');
        const prefer = /w_ov_reg_search\.(startup|query_form)/i.test(u);

        const inpP = d.querySelector(ST.selPrefix) || d.querySelector('input[name="p_state"]');
        const inpI = d.querySelector(ST.selId) || d.querySelector('input[name="p_id_animal"]');
        if (!inpP || !inpI) continue;

        const formEl = inpI.form || inpP.form || null;
        const btn = findNastaviInDoc(d, formEl || d);

        const pack = { doc: d, inpP, inpI, btn, formEl, url: u, prefer };
        if (prefer) return pack;
        if (!fallback) fallback = pack;
      } catch {}
    }
    return fallback;
  }

  async function ensureForm(testOnly = false) {
    const cached = getCachedFormPackIfValid();
    if (cached) return cached;

    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      const pack = findFormPack();
      if (pack) {
        setCachedFormPack(pack);
        return pack;
      }
      if (testOnly) return null;
      await sleep(20);
    }
    return null;
  }

  function setValueFast(el, val) {
    try {
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
    } catch {
      el.value = val;
    }
  }

  function typeWrite(el, val) {
    if (!el) return;
    setValueFast(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setValueFast(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function realClick(el) {
    if (!el) return;
    const ev = (type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    el.focus();
    ev('mousedown');
    ev('mouseup');
    ev('click');
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function listDocScore(d) {
    try {
      const u = String(d.URL || '');
      const isListUrl = /W_ov_reg_search\.list_form/i.test(u);
      const hasTitle = /Lista\s+potvrda\s+ovaca\s*\/\s*koza/i.test(textOf(d.body));
      if (isListUrl) return 100;
      if (hasTitle) return 50;
      return 0;
    } catch { return 0; }
  }

  function anyListPageNow() {
    for (const d of allDocs()) {
      if (listDocScore(d) > 0) return true;
    }
    return false;
  }

  async function waitListPageMs(ms) {
    const deadline = Date.now() + Math.max(20, ms);
    while (Date.now() < deadline) {
      if (anyListPageNow()) return true;
      await sleep(12);
    }
    return false;
  }

  const LIST_FORM_RE = /W_ov_reg_search\.list_form/i;

  function getListFormDocFast() {
    for (const d of allDocs()) {
      try {
        const u = String(d.URL || '');
        if (LIST_FORM_RE.test(u)) return d;
      } catch {}
    }
    return null;
  }

  function parseNumericCell(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\D+/g, '');
    return digits.length >= 6 ? digits : '';
  }

  function isValidDataRow(tr) {
    try {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 5) return false;

      const first = parseNumericCell(textOf(tds[0]));
      const dateTxt = textOf(tds[4] || '');
      const hasDate = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateTxt);

      return !!first && hasDate;
    } catch {
      return false;
    }
  }

  function getConfirmationRowsFromDoc(doc) {
    try {
      const tables = Array.from(doc.querySelectorAll('table'));
      let best = [];

      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr')).filter(isValidDataRow);
        if (rows.length > best.length) best = rows;
      }

      return best;
    } catch {
      return [];
    }
  }

  function listHasRows(d) {
    try {
      return getConfirmationRowsFromDoc(d).length > 0;
    } catch {
      return false;
    }
  }

  function waitListRowsMutation(d, ms) {
    const timeoutMs = Math.max(0, ms | 0);
    return new Promise(resolve => {
      if (!d || !d.body) return resolve(false);
      if (listHasRows(d)) return resolve(true);

      let done = false;
      let timer = null;
      let obs = null;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { if (timer) clearTimeout(timer); } catch {}
        try { obs && obs.disconnect(); } catch {}
        resolve(!!ok);
      };

      try {
        obs = new MutationObserver(() => {
          if (listHasRows(d)) finish(true);
        });
        obs.observe(d.body, { childList: true, subtree: true });
      } catch {}

      timer = setTimeout(() => finish(listHasRows(d)), timeoutMs);
    });
  }

  function parseDateDMY(s) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt) ? null : dt;
  }
  function padIdTo9(id) {
  const raw = String(id || '').replace(/\D+/g, '');
  if (!raw) return '';
  if (raw.length >= 9) return raw;
  return raw.padStart(9, '0');
}

  function isDateOlderThanDays(dateStr, days) {
    const dt = parseDateDMY(dateStr);
    if (!dt) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - dt.getTime()) / 86400000);
    return diffDays > days;
  }

  function scrapeLatestRowFromListOnly() {
    const docs = allDocs();

    const listDocs = docs
      .map(d => ({ d, score: listDocScore(d) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const x of listDocs) {
      const d = x.d;
      try {
        const u = String(d.URL || '');
        const rows = getConfirmationRowsFromDoc(d);

        if (!rows.length) continue;

        let best = null;
        for (const tr of rows) {
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length < 10) continue;

          const dateTxt = textOf(tds[4] || '');
          const dt = parseDateDMY(dateTxt);
          if (!dt) continue;

          if (!best || dt > best.dt) {
            const serCell = tds[0] || null;
            const serLink = serCell ? serCell.querySelector('a') : null;
            const serText = serLink ? textOf(serLink) : textOf(serCell);

            best = {
              dt,
              row: {
                'Serijski broj potvrde': serText,
                'ID broj gazdinstva': textOf(tds[1] || ''),
                'Držalac životinja': textOf(tds[2] || ''),
                'Adresa držaoca životinja': textOf(tds[3] || ''),
                'Datum kontrole od': dateTxt,
                'Broj obeleženih ovaca': textOf(tds[5] || ''),
                'Broj obeleženih koza': textOf(tds[6] || ''),
                'Broj uzoraka krvi ovaca': textOf(tds[7] || ''),
                'Broj uzoraka krvi koza': textOf(tds[8] || ''),
                'Bruceloza na gazdinstvu': textOf(tds[9] || '')
              }
            };
          }
        }

        if (best) {
          return { ok: true, latest: best.row, rowCount: rows.length, url: u };
        }
      } catch {}
    }

    return { ok: false, latest: null, rowCount: 0, why: 'no-list-yet' };
  }

  async function waitResults(timeoutSec) {
    const deadline = Date.now() + Math.max(2000, timeoutSec * 1000);
    let lastDocUrl = '';
    while (Date.now() < deadline) {
      const ld = getListFormDocFast();
      if (ld) {
        try { lastDocUrl = String(ld.URL || lastDocUrl); } catch {}

        const s = scrapeLatestRowFromListOnly();
        if (s.ok) return s;

        const remain = deadline - Date.now();
        await waitListRowsMutation(ld, Math.min(350, Math.max(30, remain)));
        const s2 = scrapeLatestRowFromListOnly();
        if (s2.ok) return s2;

        await sleep(12);
      } else {
        await sleep(15);
      }
    }
    return { ok: false, latest: null, rowCount: 0, why: 'timeout-list', url: lastDocUrl };
  }

  function findBackOrNewSearchLink() {
    const docs = allDocs();
    const rx = /(NAZAD|NOVA\s+PRETRAGA|PRETRAŽIVANJE|PRETRAZIVANJE|UPIT|POVRATAK)/i;

    for (const d of docs) {
      try {
        const links = Array.from(d.querySelectorAll('a, button, input[type="button"], input[type="submit"]'));
        const cand = links.find(el => {
          const t = (el.tagName.toLowerCase() === 'input')
            ? (el.value || el.getAttribute('value') || '')
            : (el.textContent || el.innerText || el.getAttribute('value') || '');
          return rx.test(String(t || ''));
        });
        if (cand) return cand;
      } catch {}
    }
    return null;
  }

  async function returnToFormFast() {
    clearCachedFormPack();

    const el = findBackOrNewSearchLink();
    if (el) {
      try {
        realClick(el);
        for (let i = 0; i < 12; i++) {
          if (getCachedFormPackIfValid()) return true;
          const pack = findFormPack();
          if (pack) {
            setCachedFormPack(pack);
            return true;
          }
          await sleep(20);
        }
      } catch {}
    }

    try { window.top.location.href = FORM_URL; } catch {}
    return true;
  }

  async function submitOne(prefix, id) {
    if (!isOvKozFormContext()) {
      log('submitOne: nismo na formi → prebacujem na formu');
      clearCachedFormPack();
      try { window.top.location.href = FORM_URL; } catch {}
      return false;
    }

    const pack = await ensureForm(false);
    if (!pack) {
      log('Forma nije pronađena.');
      clearCachedFormPack();
      return false;
    }

    const { inpP, inpI, btn, formEl } = pack;

    typeWrite(inpP, String(prefix).toUpperCase());
    typeWrite(inpI, String(id));
    log(`Uneto: PREFIX=${prefix}, ID=${id}`);

    if (ST.delay > 0) await sleep(ST.delay);

    if (ST.submitOnly) {
      const ok = trySubmitForm(formEl);
      if (ok) { log('SUBMIT-ONLY: requestSubmit/submit poslat'); return true; }
      log('SUBMIT-ONLY fail');
      clearCachedFormPack();
      return false;
    }

    if (btn) {
      realClick(btn);
      log('realClick(NASTAVI) poslat');

      if (ST.fastMode) {
        const okList = await waitListPageMs(ST.fastClickWaitMs);
        if (okList) return true;
        log(`FAST: lista nije stigla za ${ST.fastClickWaitMs}ms → fallback SUBMIT`);
        if (trySubmitForm(formEl)) return true;
        clearCachedFormPack();
        return false;
      } else {
        const okList = await waitListPageMs(500);
        if (okList) return true;
        if (trySubmitForm(formEl)) return true;
        clearCachedFormPack();
        return false;
      }
    }

    if (trySubmitForm(formEl)) {
      log('Nastavi nije nađen → FORM SUBMIT poslat');
      return true;
    }

    log('Nema dugmeta Nastavi – proveri selektor / formu');
    clearCachedFormPack();
    return false;
  }

  function exportXLS(headers, rows) {
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const th = t => `<th style="border:1px solid #ccc;padding:4px;background:#f5f5f5;text-align:left">${esc(t)}</th>`;
    const td = (t, mode) => {
      const base = 'border:1px solid #ddd;padding:4px;';
      if (mode === 'warn') return `<td style="${base}color:#c00;font-weight:700;background:#ffecec">${esc(t)}</td>`;
      return `<td style="${base}">${esc(t)}</td>`;
    };

    const headRow = `<tr>${headers.map(th).join('')}</tr>`;

    const body = (rows || []).map(r => {
      const fail = String(r.__WARN || '') === '1';
      const old1y = String(r.__OLD1Y || '') === '1';
      const hidmm = String(r.__HID_MISMATCH || '') === '1';

      return `<tr>${headers.map(h => {
        if (h === 'Serijski broj potvrde') return td(r[h] ?? '', fail ? 'warn' : 'none');
        if (h === 'Datum kontrole od') return td(r[h] ?? '', (!fail && old1y) ? 'warn' : 'none');
        if (h === 'ID broj gazdinstva') return td(r[h] ?? '', (!fail && hidmm) ? 'warn' : 'none');
        return td(r[h] ?? '', 'none');
      }).join('')}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"></head><body>
<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px">
${headRow}${body}
</table></body></html>`;

    return new Blob([html], { type: 'application/vnd.ms-excel' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function autoDownloadOnce() {
    if (ST.exported) return false;
    ST.exported = true;
    save();
    const headers = ['PREFIX', 'ID_GRLA', 'HID_UNETO', 'DC', ...BASE_HEADERS];
    const fname = `AIRS_OVKOZ_kontrole_${new Date().toISOString().slice(0,10)}.xls`;
    downloadBlob(exportXLS(headers, ST.results), fname);
    ST.fileNameLast = fname;
    save();
    log(`AUTO XLS: preuzet fajl "${fname}"`);
    return fname;
  }

  function pushRes(prefix, id, hidInput, latestRowOrNull, warn, dcFlag) {
    const rec = {
      PREFIX: String(prefix).toUpperCase(),
      ID_GRLA: String(id),
      HID_UNETO: String(hidInput || ''),
      DC: dcFlag ? '1' : '0',
      __WARN: warn ? '1' : '0',
      __OLD1Y: '0',
      __HID_MISMATCH: '0'
    };

    for (const h of BASE_HEADERS) rec[h] = latestRowOrNull ? (latestRowOrNull[h] ?? '') : '';

    const dateStr = rec['Datum kontrole od'];
    if (dateStr && isDateOlderThanDays(dateStr, OLD_CONTROL_DAYS)) rec.__OLD1Y = '1';

    const scrapedHidRaw = rec['ID broj gazdinstva'];
    const scrapedHid = String(scrapedHidRaw || '').replace(/\D+/g, '');
    const inputHid = String(hidInput || '').replace(/\D+/g, '');

    if (inputHid && scrapedHid && inputHid !== scrapedHid) rec.__HID_MISMATCH = '1';

    ST.results.push(rec);
    save();
  }

  function armDC(row) {
  ST.dcMode = 'armed';
  ST.dcTriedIdx = ST.idx;

  const originalId = String(row.id || '').replace(/\D+/g, '');
  const paddedId = padIdTo9(originalId);
  const usePaddedId = originalId.length > 0 && originalId.length < 9 && paddedId !== originalId;

  ST.dcPending = {
    prefix: row.prefix,
    id: usePaddedId ? paddedId : originalId,
    originalId,
    usedPaddedId: usePaddedId,
    hid: row.hid || '',
    idx: ST.idx
  };

  save();

  if (usePaddedId) {
    log(`DC: LISTA bez validnih redova → ponavljam sa nulama: ${originalId} -> ${paddedId}`);
    setStatus(`DC: ponavljam sa nulama (${paddedId})…`);
  } else {
    log('DC: LISTA bez validnih redova → ponavljam pretragu još jednom');
    setStatus('DC: ponavljam pretragu…');
  }
}

  async function dcResubmit() {
    if (!ST.active) return;
    if (!ST.dcPending) { ST.dcMode = 'idle'; save(); return; }
    ST.dcMode = 'resubmitted'; save();
    ST.inFlight = false; ST.inFlightSince = 0; save();
    await returnToFormFast();
  }

  async function dcResume() {
    if (!ST.active) return;
    if (ST.dcMode !== 'resubmitted' && ST.dcMode !== 'armed') return;
    const dc = ST.dcPending;
    if (!dc) { ST.dcMode = 'idle'; save(); return; }
    if (!isOvKozFormContext()) return;

    ST.dcMode = 'scanning'; save();
    const dcIdLabel = dc.usedPaddedId
  ? `${dc.originalId} -> ${dc.id}`
  : dc.id;

log(`DC: resubmit ${dc.prefix} ${dcIdLabel}`);
ST.inFlight = true; ST.inFlightSince = Date.now(); save();

const ok = await submitOne(dc.prefix, dc.id);
if (!ok) {
  pushRes(dc.prefix, dc.originalId || dc.id, dc.hid, null, true, true);
  log(`Rezultat (DC): ${dc.prefix} ${dcIdLabel} → FAIL (forma/submit) (WARN)`);
  ST.dcMode = 'idle'; ST.dcPending = null; save();
  ST.idx++; save();
  ST.inFlight = false; ST.inFlightSince = 0; save();
  return;
}

    log('DC: čekam LISTU potvrda…');
    const scraped = await waitResults(ST.dcTimeoutSec);

    if (scraped.ok && scraped.latest) {
  pushRes(dc.prefix, dc.originalId || dc.id, dc.hid, scraped.latest, false, true);
  if (dc.usedPaddedId) {
    log(`Rezultat (DC): ${dc.prefix} ${dc.originalId} → OK sa nulama (${dc.id}), najnoviji datum=${scraped.latest['Datum kontrole od'] || '(?)'}`);
  } else {
    log(`Rezultat (DC): ${dc.prefix} ${dc.id} → OK, najnoviji datum=${scraped.latest['Datum kontrole od'] || '(?)'}`);
  }
} else {
  pushRes(dc.prefix, dc.originalId || dc.id, dc.hid, null, true, true);
  if (dc.usedPaddedId) {
    log(`Rezultat (DC): ${dc.prefix} ${dc.originalId} → NEMA REDOVA ni sa nulama (${dc.id}) (WARN)`);
  } else {
    log(`Rezultat (DC): ${dc.prefix} ${dc.id} → NEMA REDOVA (potvrđeno) (WARN)`);
  }
}

    ST.inFlight = false;
    ST.inFlightSince = 0;
    save();

    await returnToFormFast();
    ST.dcMode = 'idle';
    ST.dcPending = null;
    save();
    ST.idx++;
    save();
  }

  async function go() {
    if (!ST.active) return;
    if (LOCK) return;
    if (ST.dcMode !== 'idle') return;

    LOCK = true;
    try {
      clearInFlightIfStale();
      if (ST.inFlight) return;

      if (ST.pendingStart) {
        await ensureOvKozThenResume();
        return;
      }

      if (ST.idx >= ST.rows.length) {
        ST.active = false;
        ST.pendingStart = false;
        ST.inFlight = false;
        ST.inFlightSince = 0;
        save();

        setStatus('Gotovo (AUTO XLS).');
        log(`Kraj: rezultata=${ST.results.length}/${ST.rows.length}`);

        const fileName = autoDownloadOnce() || ST.fileNameLast || '';

        clearPendingStartPayload();
        clearActiveTool();
        removeReturnButton();

        const warnCount = (ST.results || []).filter(r => String(r.__WARN || '') === '1').length;

        showCompletionPanel({
          rowCount: (ST.results || []).length,
          warnCount,
          fileName,
          finishedAt: new Date().toLocaleTimeString('sr-RS')
        });

        return;
      }

      if (!isOvKozFormContext()) {
        clearCachedFormPack();
        ST.pendingStart = true;
        save();
        setStatus('Vraćam na formu…');
        log('Gating: nismo na formi → pendingStart=TRUE → navigacija na formu');
        try { window.top.location.href = FORM_URL; } catch {}
        return;
      }

      const row = ST.rows[ST.idx];
      setStatus(`Obrada ${ST.idx + 1}/${ST.rows.length}: ${row.prefix} ${row.id}`);

      ST.inFlight = true;
      ST.inFlightSince = Date.now();
      save();

      const ok = await submitOne(row.prefix, row.id);
      if (!ok) {
        pushRes(row.prefix, row.id, row.hid, null, true, false);
        log(`Rezultat: ${row.prefix} ${row.id} → FAIL (forma/submit) (WARN)`);
        ST.idx++;
        save();
        ST.inFlight = false;
        ST.inFlightSince = 0;
        save();

        await returnToFormFast();
        return;
      }

      log('Čekam LISTU potvrda…');
      const scraped = await waitResults(ST.timeoutSec);

      if (scraped.ok && scraped.latest) {
        pushRes(row.prefix, row.id, row.hid, scraped.latest, false, false);

        const d = scraped.latest['Datum kontrole od'] || '';
        const old = d && isDateOlderThanDays(d, OLD_CONTROL_DAYS);
        const scrapedHid = String(scraped.latest['ID broj gazdinstva'] || '').replace(/\D+/g, '');
        const inputHid = String(row.hid || '').replace(/\D+/g, '');

        let extra = '';
        if (old) extra += ' [OLD>1Y]';
        if (inputHid && scrapedHid && inputHid !== scrapedHid) extra += ` [HID MISMATCH: ${inputHid}≠${scrapedHid}]`;

        log(`Rezultat: ${row.prefix} ${row.id} → OK, najnoviji datum=${d || '(?)'} (redova=${scraped.rowCount})${extra}`);

        ST.idx++;
        save();
        ST.inFlight = false;
        ST.inFlightSince = 0;
        save();

        await returnToFormFast();
        return;
      }

      log(`Rezultat: ${row.prefix} ${row.id} → LISTA bez validnih redova`);
      if (ST.dcEnabled && ST.dcTriedIdx !== ST.idx) {
        armDC(row);
        ST.inFlight = false;
        ST.inFlightSince = 0;
        save();
        await dcResubmit();
        return;
      }

      pushRes(row.prefix, row.id, row.hid, null, true, false);
      log(`Rezultat: ${row.prefix} ${row.id} → NEMA REDOVA (potvrđeno) (WARN)`);
      ST.idx++;
      save();
      ST.inFlight = false;
      ST.inFlightSince = 0;
      save();

      await returnToFormFast();
    } finally {
      LOCK = false;
    }
  }

  function bootstrapFromVetAssistPayload() {
  const pending = getPendingStartPayload();
  if (!pending || ST.active) return false;

  const rowsText = Array.isArray(pending.rows) ? pending.rows.join('\n') : '';
  ST.rawInput = rowsText;
  ST.delay = Math.max(0, +(pending.delay ?? ST.delay ?? 60));
  ST.timeoutSec = Math.max(2, +(pending.timeoutSec ?? ST.timeoutSec ?? 6));
  ST.dcTimeoutSec = Math.max(ST.timeoutSec, +(pending.dcTimeoutSec ?? ST.dcTimeoutSec ?? 7));

  ST.rows = parseTextarea(ST.rawInput);
  if (!ST.rows.length) {
    setStatus('Nijedan red nije validan');
    log('VetAssist payload postoji, ali nema validnih redova.');
    clearPendingStartPayload();
    clearActiveTool();
    save();
    return true;
  }

  clearPendingStartPayload();
  clearCachedFormPack();

  ST.results = [];
  ST.idx = 0;
  ST.active = true;
  ST.exported = false;
  ST.fileNameLast = '';
  ST.runId = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

  ST.dcEnabled = true;
  ST.dcTriedIdx = -1;
  ST.dcPending = null;
  ST.dcMode = 'idle';
  ST.inFlight = false;
  ST.inFlightSince = 0;

  if (isOvKozFormContext() && /w_ov_reg_search/i.test(String(location.href || ''))) {
    ST.pendingStart = false;
    save();
    log(
      `VetAssist start FAST: redova=${ST.rows.length}, delay=${ST.delay}, timeout=${ST.timeoutSec}, dcTimeout=${ST.dcTimeoutSec}, DC=${ST.dcEnabled ? 'ON' : 'OFF'}, FAST=${ST.fastMode ? 'ON' : 'OFF'}, submitOnly=${ST.submitOnly ? 'ON' : 'OFF'}`
    );
    setStatus('Krećem odmah…');
    setTimeout(() => {
      try { go(); } catch (e) { console.error(e); }
    }, 5);
    return true;
  }

  ST.pendingStart = true;
  save();

  log(
    `VetAssist start: redova=${ST.rows.length}, delay=${ST.delay}, timeout=${ST.timeoutSec}, dcTimeout=${ST.dcTimeoutSec}, DC=${ST.dcEnabled ? 'ON' : 'OFF'}, FAST=${ST.fastMode ? 'ON' : 'OFF'}, submitOnly=${ST.submitOnly ? 'ON' : 'OFF'}`
  );
  requestStartFromAnyFrame();
  log('Start → poslat REQUEST_START (TOP engine će preuzeti)');
  setStatus('Čekam TOP engine… prebacujem na formu…');
  try { window.top.location.href = FORM_URL; } catch {}
  return true;
}

  window.addEventListener('beforeunload', () => {
    try { if (isTopWindow() && iAmOwner()) releaseIfOwner(); } catch {}
  });

  setInterval(() => {
    try {
      if (!isTopWindow()) return;
      claimLockTopOnly();
      if (iAmOwner()) heartbeat();
    } catch {}
  }, ENGINE_HEARTBEAT_MS);

  const ENGINE_TICK_MS = 40;
  setInterval(() => {
    try {
      if (bootstrapFromVetAssistPayload()) return;

      if (isTopWindow()) {
        const req = readStartRequest();
        if (req && ST.active) {
          const okOwner = claimLockTopOnly();
          if (!okOwner) {
            log(`Start blokiran: ENGINE LOCK drži drugi owner.`);
            setStatus('ENGINE LOCK drži drugi tab.');
          } else {
            clearStartRequest();
          }
        }
      }

      if (!isTopWindow()) return;
      if (!iAmOwner()) return;
      if (!ST.active) return;

      if (ST.pendingStart) { ensureOvKozThenResume(); return; }

      if (ST.dcMode === 'armed' || ST.dcMode === 'resubmitted' || ST.dcMode === 'scanning') {
        if (isOvKozFormContext()) dcResume();
        return;
      }

      go();
    } catch (e) {
      try { console.error('ovkoze_kontrola_evidencije tick error', e); } catch {}
    }
  }, ENGINE_TICK_MS);

})();