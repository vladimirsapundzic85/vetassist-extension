console.log("VetAssist tool loaded: hid_koordinate_xlsx v1.0.0");

(function () {
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_hid_koordinate_xlsx_v100_loaded) {
    console.log("VetAssist tool already loaded: hid_koordinate_xlsx v1.0.0");
    return;
  }
  root.__vetassist_hid_koordinate_xlsx_v100_loaded = true;

  const TOOL_CODE = 'hid_koordinate_xlsx';
  const SS_KEY = 'vetassist_hid_koordinate_xlsx_v100';
  const START_PAYLOADS_KEY = 'vetassist_tool_start_payloads_v1';
  const ACTIVE_TOOL_KEY = 'vetassist_active_tool_v1';
  const RETURN_BTN_ID = 'vetassist-return-picker-btn';
  const COMPLETION_PANEL_ID = 'vetassist-hid-koordinate-complete-panel';

  const DB_NAME = 'vetassist_hid_koordinate_xlsx_v100_db';
  const DB_VERSION = 1;
  const DB_ROWS_STORE = 'rows';

  function safeJson(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
  }

  const ST = Object.assign({
    active: false,
    idx: 0,
    rows: [],
    delay: 550,
    timeoutSec: 70,
    currentHid: '',
    fileNameLast: '',
    okCount: 0,
    errorCount: 0
  }, safeJson(sessionStorage.getItem(SS_KEY)));

  function getPersistableState() {
    return {
      active: !!ST.active,
      idx: Number(ST.idx || 0),
      rows: Array.isArray(ST.rows) ? ST.rows : [],
      delay: Number(ST.delay || 550),
      timeoutSec: Number(ST.timeoutSec || 70),
      currentHid: String(ST.currentHid || ''),
      fileNameLast: String(ST.fileNameLast || ''),
      okCount: Number(ST.okCount || 0),
      errorCount: Number(ST.errorCount || 0)
    };
  }

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(getPersistableState()));
  }

  async function resetState() {
    ST.active = false;
    ST.idx = 0;
    ST.rows = [];
    ST.currentHid = '';
    ST.fileNameLast = '';
    ST.okCount = 0;
    ST.errorCount = 0;
    save();
    await dbClearRows();
  }

  function getPendingStartPayload() {
    const all = safeJson(sessionStorage.getItem(START_PAYLOADS_KEY));
    return all[TOOL_CODE] || null;
  }

  function clearPendingStartPayload() {
    const all = safeJson(sessionStorage.getItem(START_PAYLOADS_KEY));
    delete all[TOOL_CODE];
    sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
  }

  function clearActiveTool() {
    try {
      sessionStorage.removeItem(ACTIVE_TOOL_KEY);
    } catch {}
  }

  function getTopDocument() {
    try {
      return window.top.document || document;
    } catch {
      return document;
    }
  }

  function removeReturnButton() {
    try {
      const topDoc = getTopDocument();
      const btn = topDoc.getElementById(RETURN_BTN_ID);
      if (btn) btn.remove();
    } catch {}
  }

  function removeCompletionPanel() {
    try {
      const topDoc = getTopDocument();
      const old = topDoc.getElementById(COMPLETION_PANEL_ID);
      if (old) old.remove();
    } catch {}
  }

  function ensureCompletionStyles() {
    const topDoc = getTopDocument();
    if (topDoc.getElementById('vetassist-hid-koordinate-complete-styles')) return;

    const style = topDoc.createElement('style');
    style.id = 'vetassist-hid-koordinate-complete-styles';
    style.textContent = `
      #${COMPLETION_PANEL_ID} {
        position: fixed;
        top: 120px;
        right: 18px;
        width: 380px;
        z-index: 2147483647;
        background: #f7f5e8;
        border: 1px solid #9e9b87;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        color: #222;
        font: 13px/1.4 Arial, sans-serif;
      }

      #${COMPLETION_PANEL_ID} .va-head {
        padding: 10px 12px;
        background: #e9e3c6;
        border-bottom: 1px solid #c9c19d;
        font-weight: 700;
        font-size: 14px;
      }

      #${COMPLETION_PANEL_ID} .va-body {
        padding: 12px;
      }

      #${COMPLETION_PANEL_ID} .va-ok {
        margin-bottom: 10px;
        padding: 8px 10px;
        border: 1px solid #9bc7a4;
        background: #f4fff6;
        border-radius: 8px;
      }

      #${COMPLETION_PANEL_ID} .va-meta {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
        margin-top: 10px;
      }

      #${COMPLETION_PANEL_ID} .va-row {
        padding: 6px 8px;
        border: 1px solid #d7d0b0;
        background: #faf7ea;
        border-radius: 8px;
      }

      #${COMPLETION_PANEL_ID} .va-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      #${COMPLETION_PANEL_ID} .va-btn {
        border: 1px solid #9d9778;
        background: #fffdf2;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-weight: 700;
      }

      #${COMPLETION_PANEL_ID} .va-btn-primary {
        border-color: #6e8f73;
        background: #eaf8ed;
      }
    `;
    topDoc.documentElement.appendChild(style);
  }

  function showCompletionPanel(summary) {
    try {
      const topDoc = getTopDocument();
      ensureCompletionStyles();
      removeCompletionPanel();

      const box = topDoc.createElement('div');
      box.id = COMPLETION_PANEL_ID;

      box.innerHTML = `
        <div class="va-head">VetAssist — završeno</div>
        <div class="va-body">
          <div class="va-ok"><b>Obrada je uspešno završena.</b></div>

          <div class="va-meta">
            <div class="va-row">Obrađeni HID-ovi: <b>${summary.hidCount}</b></div>
            <div class="va-row">Uspešno obrađeni: <b>${summary.okCount}</b></div>
            <div class="va-row">Problematični HID-ovi: <b>${summary.errorCount}</b></div>
            <div class="va-row">Fajl: <b>${summary.fileName || '-'}</b></div>
            <div class="va-row">Vreme završetka: <b>${summary.finishedAt || '-'}</b></div>
          </div>

          <div class="va-actions">
            <button id="va-finish-back" class="va-btn va-btn-primary">Nazad na alate</button>
            <button id="va-finish-close" class="va-btn">Zatvori</button>
          </div>
        </div>
      `;

      topDoc.documentElement.appendChild(box);

      box.querySelector('#va-finish-back')?.addEventListener('click', () => {
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector('#va-finish-close')?.addEventListener('click', () => {
        removeCompletionPanel();
      });
    } catch (e) {
      console.error('Completion panel failed', e);
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function log(...args) {
    console.log(`[${TOOL_CODE}]`, ...args);
  }

  function deLatinStrict(s) {
    return String(s || '')
      .replace(/Đ/g, 'DJ').replace(/đ/g, 'dj')
      .replace(/[ČĆ]/g, 'C').replace(/[čć]/g, 'c')
      .replace(/Š/g, 'S').replace(/š/g, 's')
      .replace(/Ž/g, 'Z').replace(/ž/g, 'z');
  }

  function normText(s) {
    return deLatinStrict(String(s || '').toUpperCase()).replace(/\s+/g, ' ').trim();
  }

  function allDocs() {
    const docs = [];
    try {
      (function walk(w) {
        try { if (w.document) docs.push(w.document); } catch {}
        for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]);
      })(window.top);
    } catch {}
    return docs;
  }

  function pageHas(txt) {
    const needle = normText(txt);
    return allDocs().some(d => {
      try {
        return normText(d.body?.innerText || '').includes(needle);
      } catch {
        return false;
      }
    });
  }

  function currentFarmHidFromUrl() {
    try {
      const u = new URL(window.top.location.href);
      return u.searchParams.get('p_kmg_mid') || '';
    } catch {
      return '';
    }
  }

  function isFarmPageForHid(hid) {
    const urlHid = currentFarmHidFromUrl();
    if (!urlHid || String(urlHid) !== String(hid)) return false;
    return pageHas('PODACI O GAZDINSTVU');
  }

  function getFarmPageText() {
    for (const d of allDocs()) {
      try {
        const txt = String(d.body?.innerText || '').trim();
        if (txt && normText(txt).includes('PODACI O GAZDINSTVU')) {
          return txt.replace(/\r/g, '');
        }
      } catch {}
    }
    return '';
  }

  function splitLines(text) {
    return String(text || '')
      .split(/\n+/)
      .map(x => x.replace(/\u00A0/g, ' ').trim())
      .filter(Boolean);
  }

  function findValueAfterLabel(lines, label) {
    const wanted = normText(label);

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const n = normText(raw);

      if (n === wanted || n.startsWith(wanted + ' ')) {
        const rest = raw.slice(raw.indexOf(label) + label.length).trim();
        if (rest) return rest;

        for (let j = i + 1; j < lines.length; j++) {
          const next = String(lines[j] || '').trim();
          if (next) return next;
        }
      }
    }

    return '';
  }

  function compactAddress(parts) {
    return parts
      .map(x => String(x || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function scrapeFarmData(hid) {
    const txt = getFarmPageText();
    if (!txt) {
      return { ok: false, status: 'NO_FARM_TEXT' };
    }

    const lines = splitLines(txt);

    const hidText = findValueAfterLabel(lines, 'ID gazdinstva') || String(hid || '');
    const ulicaBroj = findValueAfterLabel(lines, 'Ulica, broj');
    const idMesta = findValueAfterLabel(lines, 'ID Mesta');
    const postanskiMesto = findValueAfterLabel(lines, 'Poštanski broj, mesto');
    const opstina = findValueAfterLabel(lines, 'Opština');
    const okrug = findValueAfterLabel(lines, 'Okrug');
    const bpg = findValueAfterLabel(lines, 'Broj poljoprivrednog gazdinstva');
    const koordX = findValueAfterLabel(lines, 'Koordinata X');
    const koordY = findValueAfterLabel(lines, 'Koordinata Y');

    // Držalac goveda
    const prezime = findValueAfterLabel(lines, 'Prezime');
    const ime = findValueAfterLabel(lines, 'Ime');

    const holder = `${prezime || ''} ${ime || ''}`.replace(/\s+/g, ' ').trim();

    const punaAdresa = compactAddress([
      ulicaBroj,
      idMesta ? `ID mesta ${idMesta}` : '',
      postanskiMesto,
      opstina ? `Opština ${opstina}` : '',
      okrug ? `Okrug ${okrug}` : ''
    ]);

    return {
      ok: true,
      status: 'OK',
      row: {
        'HID': String(hidText || hid || ''),
        'BPG': String(bpg || ''),
        'Držalac goveda': holder || '',
        'Adresa gazdinstva': punaAdresa || '',
        'Ulica i broj': String(ulicaBroj || ''),
        'ID mesta': String(idMesta || ''),
        'Poštanski broj i mesto': String(postanskiMesto || ''),
        'Opština': String(opstina || ''),
        'Okrug': String(okrug || ''),
        'Koordinata X': String(koordX || ''),
        'Koordinata Y': String(koordY || ''),
        'Status': 'OK'
      }
    };
  }

  // =====================
  // IndexedDB helpers
  // =====================

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_ROWS_STORE)) {
          db.createObjectStore(DB_ROWS_STORE, { autoIncrement: true });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb_open_failed'));
    });
  }

  async function dbClearRows() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_ROWS_STORE, 'readwrite');
      const store = tx.objectStore(DB_ROWS_STORE);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('indexeddb_clear_failed'));
      };
    });
  }

  async function dbAppendRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;

    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_ROWS_STORE, 'readwrite');
      const store = tx.objectStore(DB_ROWS_STORE);

      for (const row of rows) {
        store.add(row);
      }

      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('indexeddb_append_failed'));
      };
    });
  }

  async function dbGetAllRows() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_ROWS_STORE, 'readonly');
      const store = tx.objectStore(DB_ROWS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        db.close();
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('indexeddb_getall_failed'));
      };
    });
  }

  async function appendOkRow(row) {
    ST.okCount += 1;
    await dbAppendRows([row]);
  }

  async function appendErrorRow(hid, status) {
    ST.errorCount += 1;

    await dbAppendRows([{
      'HID': String(hid || ''),
      'BPG': '',
      'Držalac goveda': '',
      'Adresa gazdinstva': '',
      'Ulica i broj': '',
      'ID mesta': '',
      'Poštanski broj i mesto': '',
      'Opština': '',
      'Okrug': '',
      'Koordinata X': '',
      'Koordinata Y': '',
      'Status': status || 'ERROR'
    }]);
  }

  function makeDateTimeStamp() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
  }

  async function download() {
    if (!window.XLSX || !window.XLSX.utils) {
      console.error('XLSX not loaded');
      return '';
    }

    const rows = await dbGetAllRows();
    if (!rows.length) {
      log('Nema podataka za izvoz.');
      return '';
    }

    const wb = XLSX.utils.book_new();
    const header = [
      'HID',
      'BPG',
      'Držalac goveda',
      'Adresa gazdinstva',
      'Ulica i broj',
      'ID mesta',
      'Poštanski broj i mesto',
      'Opština',
      'Okrug',
      'Koordinata X',
      'Koordinata Y',
      'Status'
    ];

    const ws = XLSX.utils.json_to_sheet(rows, { header });

    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const findCol = (name) => {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const addr = XLSX.utils.encode_cell({ c: C, r: 0 });
          if (ws[addr] && String(ws[addr].v).trim() === name) return C;
        }
        return null;
      };

      const colHid = findCol('HID');
      const colBpg = findCol('BPG');

      for (let R = 1; R <= range.e.r; ++R) {
        if (colHid != null) {
          const cell = XLSX.utils.encode_cell({ c: colHid, r: R });
          if (ws[cell]) ws[cell].t = 's';
        }
        if (colBpg != null) {
          const cell = XLSX.utils.encode_cell({ c: colBpg, r: R });
          if (ws[cell]) ws[cell].t = 's';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'HID_Koordinate');

    const stamp = makeDateTimeStamp();
    const name = `HID_KOORDINATE_${stamp}.xlsx`;
    ST.fileNameLast = name;
    save();

    XLSX.writeFile(wb, name);
    log(`Sačuvan fajl: ${name}`);
    return name;
  }

  async function finishRun() {
    const summary = {
      hidCount: ST.rows.length,
      okCount: Number(ST.okCount || 0),
      errorCount: Number(ST.errorCount || 0),
      fileName: await download() || ST.fileNameLast || '',
      finishedAt: new Date().toLocaleTimeString('sr-RS')
    };

    log('Obrada završena.');
    clearPendingStartPayload();
    clearActiveTool();
    removeReturnButton();
    showCompletionPanel(summary);
    await resetState();
  }

  async function goNextOrFinish() {
    ST.idx += 1;
    ST.currentHid = '';
    save();

    if (ST.idx >= ST.rows.length) {
      await finishRun();
      return;
    }

    await run();
  }

  function navigateToFarm(hid) {
    ST.currentHid = String(hid);
    save();

    const url = `/pls/aimcs_prod/W_FARM_SEARCH.FARM_DATA_FORM?p_kmg_mid=${encodeURIComponent(String(hid))}`;
    log(`Navigiram na gazdinstvo HID=${hid}`);
    window.top.location.href = url;
  }

  async function run() {
    if (!ST.active) return;

    const current = ST.rows[ST.idx];
    if (!current) {
      await finishRun();
      return;
    }

    const hid = String(current.hid);

    if (!isFarmPageForHid(hid)) {
      navigateToFarm(hid);
      return;
    }

    log(`Na stranici gazdinstva za HID=${hid}, krećem scraping...`);

    await sleep(ST.delay);

    const res = scrapeFarmData(hid);

    if (res.ok && res.row) {
      await appendOkRow(res.row);
      log(`HID ${hid}: koordinata i podaci uspešno očitani`);
    } else {
      await appendErrorRow(hid, res.status || 'ERROR');
      log(`HID ${hid}: ${res.status || 'ERROR'}`);
    }

    save();
    await sleep(ST.delay);
    await goNextOrFinish();
  }

  function normalizeHids(input) {
    return (input || [])
      .map(x => String(x || '').trim())
      .filter(Boolean);
  }

  window.VetAssistTools = window.VetAssistTools || {};

  window.VetAssistTools.hid_koordinate_xlsx = {
    start: async function (config) {
      removeCompletionPanel();

      if (ST.active) {
        log('Alat je već aktivan.');
        return;
      }

      const hids = normalizeHids(config?.hids);
      if (!hids.length) {
        console.error('No HIDs provided');
        return;
      }

      await dbClearRows();

      ST.active = true;
      ST.idx = 0;
      ST.rows = hids.map(h => ({ hid: h }));
      ST.currentHid = '';
      ST.delay = Math.max(150, Number(config?.delay) || 550);
      ST.timeoutSec = Math.max(15, Number(config?.timeoutSec) || 70);
      ST.fileNameLast = '';
      ST.okCount = 0;
      ST.errorCount = 0;
      save();

      log(`START: ${hids.length} HID-ova`);
      await run();
    },

    resume: async function () {
      if (!ST.active) return;
      log(`RESUME: idx=${ST.idx + 1}/${ST.rows.length}`);
      await run();
    },

    stop: async function () {
      log('STOP');
      clearPendingStartPayload();
      clearActiveTool();
      removeReturnButton();
      removeCompletionPanel();
      await resetState();
    },

    debugState: function () {
      return JSON.parse(JSON.stringify(getPersistableState()));
    }
  };

  setTimeout(async () => {
    const pending = getPendingStartPayload();

    if (pending && !ST.active) {
      clearPendingStartPayload();
      log('Pokrećem iz pending start payload-a');
      await window.VetAssistTools.hid_koordinate_xlsx.start(pending);
      return;
    }

    if (ST.active) {
      log('Auto-resume posle učitavanja stranice');
      await window.VetAssistTools.hid_koordinate_xlsx.resume();
    }
  }, 700);
})();