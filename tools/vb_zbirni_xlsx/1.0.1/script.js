console.log("VetAssist tool loaded: vb_zbirni_xlsx v3.0.1");

(function () {
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_vb_zbirni_xlsx_v301_loaded) {
    console.log("VetAssist tool already loaded: vb_zbirni_xlsx v3.0.1");
    return;
  }
  root.__vetassist_vb_zbirni_xlsx_v301_loaded = true;

  const TOOL_CODE = 'vb_zbirni_xlsx';
  const SS_KEY = 'vetassist_vb_zbirni_xlsx_v301';
  const START_PAYLOADS_KEY = 'vetassist_tool_start_payloads_v1';
  const ACTIVE_TOOL_KEY = 'vetassist_active_tool_v1';
  const RETURN_BTN_ID = 'vetassist-return-picker-btn';
  const COMPLETION_PANEL_ID = 'vetassist-vb-zbirni-complete-panel';
  const PICKER_ID = 'vetassist-vb-reference-picker';

  const DB_NAME = 'vetassist_vb_zbirni_xlsx_v301_db';
  const DB_VERSION = 2;
  const DB_CURRENT_STORE = 'current_rows';
  const DB_REFERENCE_STORE = 'reference_rows';

  function safeJson(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
  }

  const ST = Object.assign({
    active: false,
    idx: 0,
    rows: [],
    delay: 550,
    timeoutSec: 70,
    directFarm: true,
    rbrByHid: {},
    currentHid: '',
    fileNameLast: '',
    diffFileNameLast: '',
    animalCount: 0,
    errorCount: 0,
    referenceEnabled: false,
    referenceFileName: ''
  }, safeJson(sessionStorage.getItem(SS_KEY)));

  function getPersistableState() {
    return {
      active: !!ST.active,
      idx: Number(ST.idx || 0),
      rows: Array.isArray(ST.rows) ? ST.rows : [],
      delay: Number(ST.delay || 550),
      timeoutSec: Number(ST.timeoutSec || 70),
      directFarm: !!ST.directFarm,
      rbrByHid: ST.rbrByHid || {},
      currentHid: String(ST.currentHid || ''),
      fileNameLast: String(ST.fileNameLast || ''),
      diffFileNameLast: String(ST.diffFileNameLast || ''),
      animalCount: Number(ST.animalCount || 0),
      errorCount: Number(ST.errorCount || 0),
      referenceEnabled: !!ST.referenceEnabled,
      referenceFileName: String(ST.referenceFileName || '')
    };
  }

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(getPersistableState()));
  }

  async function resetState() {
    ST.active = false;
    ST.idx = 0;
    ST.rows = [];
    ST.rbrByHid = {};
    ST.currentHid = '';
    ST.fileNameLast = '';
    ST.diffFileNameLast = '';
    ST.animalCount = 0;
    ST.errorCount = 0;
    ST.referenceEnabled = false;
    ST.referenceFileName = '';
    save();
    await dbClearStore(DB_CURRENT_STORE);
    await dbClearStore(DB_REFERENCE_STORE);
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
    try { sessionStorage.removeItem(ACTIVE_TOOL_KEY); } catch {}
  }

  function getActiveTool() {
    try { return sessionStorage.getItem(ACTIVE_TOOL_KEY) || ''; } catch { return ''; }
  }

  function isStillActiveTool() {
    return getActiveTool() === TOOL_CODE;
  }

  async function stopBecauseDetached(reason = 'DETACHED') {
    log(`Zaustavljam alat: ${reason}`);
    await window.VetAssistTools.vb_zbirni_xlsx.stop();
  }

  function getTopDocument() {
    try { return window.top.document || document; } catch { return document; }
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

  function removeReferencePicker() {
    try {
      const topDoc = getTopDocument();
      const old = topDoc.getElementById(PICKER_ID);
      if (old) old.remove();
    } catch {}
  }

  function ensureStyles() {
    const topDoc = getTopDocument();
    if (topDoc.getElementById('vetassist-vb-zbirni-v301-styles')) return;

    const style = topDoc.createElement('style');
    style.id = 'vetassist-vb-zbirni-v301-styles';
    style.textContent = `
      #${COMPLETION_PANEL_ID}, #${PICKER_ID} {
        position: fixed;
        top: 120px;
        right: 18px;
        width: 420px;
        z-index: 2147483647;
        background: #f7f5e8;
        border: 1px solid #9e9b87;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        color: #222;
        font: 13px/1.4 Arial, sans-serif;
      }

      #${COMPLETION_PANEL_ID} .va-head,
      #${PICKER_ID} .va-head {
        padding: 10px 12px;
        background: #e9e3c6;
        border-bottom: 1px solid #c9c19d;
        font-weight: 700;
        font-size: 14px;
      }

      #${COMPLETION_PANEL_ID} .va-body,
      #${PICKER_ID} .va-body {
        padding: 12px;
      }

      #${COMPLETION_PANEL_ID} .va-ok,
      #${PICKER_ID} .va-ok {
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

      #${COMPLETION_PANEL_ID} .va-actions,
      #${PICKER_ID} .va-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      #${COMPLETION_PANEL_ID} .va-btn,
      #${PICKER_ID} .va-btn {
        border: 1px solid #9d9778;
        background: #fffdf2;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-weight: 700;
      }

      #${COMPLETION_PANEL_ID} .va-btn-primary,
      #${PICKER_ID} .va-btn-primary {
        border-color: #6e8f73;
        background: #eaf8ed;
      }

      #${PICKER_ID} .va-file {
        width: 100%;
        box-sizing: border-box;
        margin-top: 8px;
      }

      #${PICKER_ID} .va-help {
        margin-top: 8px;
        font-size: 12px;
        opacity: .85;
      }
    `;
    topDoc.documentElement.appendChild(style);
  }

  function showCompletionPanel(summary) {
    try {
      const topDoc = getTopDocument();
      ensureStyles();
      removeCompletionPanel();

      const box = topDoc.createElement('div');
      box.id = COMPLETION_PANEL_ID;

      box.innerHTML = `
        <div class="va-head">VetAssist — završeno</div>
        <div class="va-body">
          <div class="va-ok"><b>Obrada je uspešno završena.</b></div>

          <div class="va-meta">
            <div class="va-row">Obrađeni HID-ovi: <b>${summary.hidCount}</b></div>
            <div class="va-row">Pronađena grla: <b>${summary.animalCount}</b></div>
            <div class="va-row">Problematični HID-ovi: <b>${summary.errorCount}</b></div>
            <div class="va-row">Snapshot fajl: <b>${summary.fileName || '-'}</b></div>
            <div class="va-row">DIFF fajl: <b>${summary.diffFileName || '-'}</b></div>
            <div class="va-row">Referentni fajl: <b>${summary.referenceFileName || '-'}</b></div>
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

  function showFatalError(message) {
    const topDoc = getTopDocument();
    ensureStyles();
    removeCompletionPanel();

    const box = topDoc.createElement('div');
    box.id = COMPLETION_PANEL_ID;
    box.innerHTML = `
      <div class="va-head">VetAssist — greška</div>
      <div class="va-body">
        <div class="va-ok" style="border-color:#d28f8f;background:#fff4f4;"><b>${message}</b></div>
        <div class="va-actions">
          <button id="va-fatal-back" class="va-btn va-btn-primary">Nazad na alate</button>
        </div>
      </div>
    `;
    topDoc.documentElement.appendChild(box);

    box.querySelector('#va-fatal-back')?.addEventListener('click', () => {
      clearActiveTool();
      clearPendingStartPayload();
      removeCompletionPanel();
      location.reload();
    });
  }

  function askForReferenceWorkbook() {
    return new Promise((resolve) => {
      const topDoc = getTopDocument();
      ensureStyles();
      removeReferencePicker();

      const box = topDoc.createElement('div');
      box.id = PICKER_ID;
      box.innerHTML = `
        <div class="va-head">VB zbirni — referentni snapshot</div>
        <div class="va-body">
          <div class="va-ok"><b>Izaberi raniji VB_HID_ZBIRNO fajl ako želiš poređenje stanja.</b></div>
          <input class="va-file" id="va-ref-file" type="file" accept=".xlsx,.xls,.csv">
          <div class="va-help">Ako preskočiš, alat će napraviti samo novi snapshot trenutnog stanja.</div>
          <div class="va-actions">
            <button id="va-ref-start-compare" class="va-btn va-btn-primary">Nastavi sa poređenjem</button>
            <button id="va-ref-skip" class="va-btn">Preskoči poređenje</button>
          </div>
        </div>
      `;
      topDoc.documentElement.appendChild(box);

      const fileInput = box.querySelector('#va-ref-file');
      const compareBtn = box.querySelector('#va-ref-start-compare');
      const skipBtn = box.querySelector('#va-ref-skip');

      compareBtn.addEventListener('click', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          alert('Izaberi referentni Excel fajl ili klikni Preskoči poređenje.');
          return;
        }

        try {
          const parsed = await parseReferenceWorkbook(file);
          removeReferencePicker();
          resolve({
            enabled: true,
            fileName: file.name,
            rows: parsed
          });
        } catch (e) {
          console.error(e);
          alert('Referentni fajl nije validan ili ne sadrži potrebne kolone HID i Broj životinje.');
        }
      });

      skipBtn.addEventListener('click', () => {
        removeReferencePicker();
        resolve({
          enabled: false,
          fileName: '',
          rows: []
        });
      });
    });
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const onlyDigits = (s) => String(s || '').replace(/\D+/g, '');

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

  function polShort(s) {
    const t = deLatinStrict(String(s || '').trim().toUpperCase());
    if (t.startsWith('ZENSK')) return 'Ž';
    if (t.startsWith('MUSK')) return 'M';
    if (t === 'Ž' || t === 'M') return t;
    return '';
  }

  function splitPrefixNumber(raw) {
    const t = deLatinStrict(String(raw || '').trim().toUpperCase())
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let m = t.match(/^([A-Z]{1,3})\s+(\d{4,})/);
    if (m) return { prefix: m[1], num: m[2] };

    m = t.match(/^([A-Z]{1,3})(\d{4,})/);
    if (m) return { prefix: m[1], num: m[2] };

    const num = onlyDigits(t);
    return { prefix: '', num: num || '' };
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

  function readHolderFullName() {
    let container = null;

    for (const d of allDocs()) {
      try {
        const cand = [...d.querySelectorAll('*')].find(el =>
          /DRZALAC GOVEDA/i.test(deLatinStrict(el.innerText || ''))
        );
        if (cand) {
          container = cand.closest('table, fieldset, div') || cand.parentElement || cand;
          break;
        }
      } catch {}
    }

    if (!container) return '';

    const txt = (container.innerText || '').replace(/\r/g, '');

    let prez = (txt.match(/Prezime\s*([^\n]+)\n/i) || [])[1] || '';
    let ime = (txt.match(/\bIme\b\s*([^\n]+)\n/i) || [])[1] || '';

    return `${(prez || '').trim()} ${(ime || '').trim()}`.replace(/\s+/g, ' ').trim();
  }

  function findAnimalsTable() {
    for (const d of allDocs()) {
      try {
        const legends = d.querySelectorAll('legend, .SmallCaptionBold01, .SmallCaptionBold, .SmallCaption');
        for (const el of legends) {
          const t = (el.innerText || el.textContent || '').toUpperCase();
          if (t.includes('ŽIVOTINJE NA GAZDINSTVU') || t.includes('ZIVOTINJE NA GAZDINSTVU')) {
            const tbls = el.parentElement ? el.parentElement.querySelectorAll('table') : [];
            if (tbls.length) return tbls[tbls.length - 1];
          }
        }
      } catch {}
    }

    let best = null;
    let bestRows = 0;

    for (const d of allDocs()) {
      try {
        d.querySelectorAll('table').forEach(t => {
          const rows = t.querySelectorAll('tr').length;
          if (rows > bestRows) {
            best = t;
            bestRows = rows;
          }
        });
      } catch {}
    }

    return best;
  }

  function scrapeRowsForHID(hid) {
    const tbl = findAnimalsTable();
    if (!tbl) return { ok: false, status: 'NEMA_TABELA', rows: [] };

    const trs = Array.from(tbl.querySelectorAll('tr')).filter(tr => tr.querySelectorAll('td,th').length >= 3);
    if (trs.length < 2) return { ok: false, status: 'PRAZNA_TABELA', rows: [] };

    const hdr = Array.from(trs[0].querySelectorAll('th,td')).map(x =>
      (x.innerText || '').trim().toUpperCase()
    );

    const idx = {
      broj: hdr.findIndex(h => h.includes('BROJ') && (h.includes('ŽIVOTIN') || h.includes('ZIVOTIN'))),
      pol: hdr.findIndex(h => h === 'POL' || h.includes('POL')),
      dat: hdr.findIndex(h => h.includes('DATUM ROĐ') || h.includes('DATUM RODJ') || h.includes('DATUM DOLASKA'))
    };

    const out = [];

    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i].querySelectorAll('td');
      if (!tds.length) continue;

      const rawBroj = idx.broj >= 0 ? (tds[idx.broj].innerText || '').trim() : '';
      if (!rawBroj) continue;

      const { prefix, num } = splitPrefixNumber(rawBroj);
      if (!num) continue;

      const polTxt = idx.pol >= 0 ? (tds[idx.pol].innerText || '').trim() : '';
      const dat = idx.dat >= 0 ? (tds[idx.dat].innerText || '').trim() : '';

      out.push({
        hid,
        prefix,
        num,
        dob: dat,
        pol: polShort(polTxt)
      });
    }

    return { ok: true, status: 'OK', rows: out };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_CURRENT_STORE)) {
          db.createObjectStore(DB_CURRENT_STORE, { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(DB_REFERENCE_STORE)) {
          db.createObjectStore(DB_REFERENCE_STORE, { autoIncrement: true });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb_open_failed'));
    });
  }

  async function dbClearStore(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error(`indexeddb_clear_failed:${storeName}`));
      };
    });
  }

  async function dbAppendRows(storeName, rows) {
    if (!Array.isArray(rows) || !rows.length) return;

    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const row of rows) {
        store.add(row);
      }

      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error(`indexeddb_append_failed:${storeName}`));
      };
    });
  }

  async function dbGetAllRows(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        db.close();
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error(`indexeddb_getall_failed:${storeName}`));
      };
    });
  }

  async function appendResultRows(hid, holder, rows) {
    ST.rbrByHid[hid] = ST.rbrByHid[hid] || 0;

    const outRows = [];
    for (const a of rows) {
      ST.rbrByHid[hid] = (ST.rbrByHid[hid] || 0) + 1;
      ST.animalCount += 1;

      outRows.push({
        'R. Broj': ST.rbrByHid[hid],
        'HID': hid,
        'Predznak': a.prefix || '',
        'Broj životinje': a.num || '',
        'Datum rođenja': a.dob || '',
        'Pol': a.pol || '',
        'Držalac': holder || '',
        'Status': 'OK'
      });
    }

    await dbAppendRows(DB_CURRENT_STORE, outRows);
  }

  async function appendErrorRow(hid, holder, status) {
    ST.errorCount += 1;

    await dbAppendRows(DB_CURRENT_STORE, [{
      'R. Broj': '',
      'HID': hid,
      'Predznak': '',
      'Broj životinje': '',
      'Datum rođenja': '',
      'Pol': '',
      'Držalac': holder || '',
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

  function normalizeSnapshotRow(row) {
    const hid = String(row?.HID ?? row?.hid ?? '').trim();
    const brojRaw =
      row?.['Broj životinje'] ??
      row?.['Broj zivotinje'] ??
      row?.broj_zivotinje ??
      row?.broj ??
      '';
    const num = onlyDigits(brojRaw);
    if (!hid || !num) return null;

    return {
      'HID': hid,
      'Predznak': String(row?.['Predznak'] ?? row?.predznak ?? '').trim(),
      'Broj životinje': String(brojRaw).trim(),
      'Datum rođenja': String(row?.['Datum rođenja'] ?? row?.['Datum rodjenja'] ?? row?.datum_rodjenja ?? '').trim(),
      'Pol': String(row?.['Pol'] ?? row?.pol ?? '').trim(),
      'Držalac': String(row?.['Držalac'] ?? row?.['Drzalac'] ?? row?.drzalac ?? '').trim(),
      'Status': String(row?.['Status'] ?? row?.status ?? 'OK').trim()
    };
  }

  async function parseReferenceWorkbook(file) {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX vendor nije učitan.');
    }

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    let parsed = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      for (const row of rows) {
        const norm = normalizeSnapshotRow(row);
        if (norm) parsed.push(norm);
      }
      if (parsed.length) break;
    }

    if (!parsed.length) {
      throw new Error('reference_workbook_invalid');
    }

    return parsed;
  }

  function makeCompareKey(row) {
    const hid = String(row?.HID || '').trim();
    const num = onlyDigits(row?.['Broj životinje'] || '');
    return hid && num ? `${hid}__${num}` : '';
  }

  function buildDiffRows(referenceRows, currentRows) {
    const oldMap = new Map();
    const newMap = new Map();

    for (const row of referenceRows || []) {
      const key = makeCompareKey(row);
      if (key) oldMap.set(key, row);
    }

    for (const row of currentRows || []) {
      const key = makeCompareKey(row);
      if (key && String(row?.Status || '').toUpperCase() === 'OK') newMap.set(key, row);
    }

    const additions = [];
    const removals = [];

    for (const [key, row] of newMap.entries()) {
      if (!oldMap.has(key)) additions.push({
        'HID': row['HID'] || '',
        'Predznak': row['Predznak'] || '',
        'Broj životinje': row['Broj životinje'] || '',
        'Datum rođenja': row['Datum rođenja'] || '',
        'Pol': row['Pol'] || '',
        'Držalac': row['Držalac'] || ''
      });
    }

    for (const [key, row] of oldMap.entries()) {
      if (!newMap.has(key)) removals.push({
        'HID': row['HID'] || '',
        'Predznak': row['Predznak'] || '',
        'Broj životinje': row['Broj životinje'] || '',
        'Datum rođenja': row['Datum rođenja'] || '',
        'Pol': row['Pol'] || '',
        'Držalac': row['Držalac'] || ''
      });
    }

    additions.sort((a, b) =>
      String(a['HID']).localeCompare(String(b['HID'])) ||
      String(a['Broj životinje']).localeCompare(String(b['Broj životinje']))
    );

    removals.sort((a, b) =>
      String(a['HID']).localeCompare(String(b['HID'])) ||
      String(a['Broj životinje']).localeCompare(String(b['Broj životinje']))
    );

    return { additions, removals };
  }

  function enforceTextColumns(ws, headerNames) {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);

    const findCol = (name) => {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ c: C, r: 0 });
        if (ws[addr] && String(ws[addr].v).trim() === name) return C;
      }
      return null;
    };

    for (const name of headerNames) {
      const col = findCol(name);
      if (col == null) continue;
      for (let R = 1; R <= range.e.r; ++R) {
        const cell = XLSX.utils.encode_cell({ c: col, r: R });
        if (ws[cell]) ws[cell].t = 's';
      }
    }
  }

  async function downloadSnapshot() {
    if (!window.XLSX || !window.XLSX.utils) {
      throw new Error('XLSX not loaded');
    }

    const rows = await dbGetAllRows(DB_CURRENT_STORE);
    if (!rows.length) {
      log('Nema podataka za snapshot izvoz.');
      return '';
    }

    const wb = XLSX.utils.book_new();
    const header = ['R. Broj', 'HID', 'Predznak', 'Broj životinje', 'Datum rođenja', 'Pol', 'Držalac', 'Status'];
    const ws = XLSX.utils.json_to_sheet(rows, { header });

    enforceTextColumns(ws, ['Broj životinje', 'HID']);

    XLSX.utils.book_append_sheet(wb, ws, 'Grla');

    const stamp = makeDateTimeStamp();
    const name = `VB_HID_ZBIRNO_${stamp}.xlsx`;
    ST.fileNameLast = name;
    save();

    XLSX.writeFile(wb, name);
    log(`Sačuvan snapshot: ${name}`);
    return name;
  }

  async function downloadDiff(referenceRows) {
    if (!window.XLSX || !window.XLSX.utils) {
      throw new Error('XLSX not loaded');
    }

    const currentRows = await dbGetAllRows(DB_CURRENT_STORE);
    const diff = buildDiffRows(referenceRows || [], currentRows);

    const wb = XLSX.utils.book_new();
    const header = ['HID', 'Predznak', 'Broj životinje', 'Datum rođenja', 'Pol', 'Držalac'];

    const wsAdd = XLSX.utils.json_to_sheet(diff.additions, { header });
    const wsRem = XLSX.utils.json_to_sheet(diff.removals, { header });

    enforceTextColumns(wsAdd, ['Broj životinje', 'HID']);
    enforceTextColumns(wsRem, ['Broj životinje', 'HID']);

    XLSX.utils.book_append_sheet(wb, wsAdd, 'Nova grla');
    XLSX.utils.book_append_sheet(wb, wsRem, 'Van gazdinstva');

    const stamp = makeDateTimeStamp();
    const name = `VB_HID_PROMENE_${stamp}.xlsx`;
    ST.diffFileNameLast = name;
    save();

    XLSX.writeFile(wb, name);
    log(`Sačuvan DIFF: ${name}`);
    return name;
  }

  async function finishRun() {
    try {
      const referenceRows = ST.referenceEnabled ? await dbGetAllRows(DB_REFERENCE_STORE) : [];
      const snapshotName = await downloadSnapshot() || ST.fileNameLast || '';
      const diffName = ST.referenceEnabled ? (await downloadDiff(referenceRows) || ST.diffFileNameLast || '') : '';

      const summary = {
        hidCount: ST.rows.length,
        animalCount: Number(ST.animalCount || 0),
        errorCount: Number(ST.errorCount || 0),
        fileName: snapshotName,
        diffFileName: diffName,
        referenceFileName: ST.referenceFileName || '',
        finishedAt: new Date().toLocaleTimeString('sr-RS')
      };

      log('Obrada završena.');
      showCompletionPanel(summary);
    } catch (e) {
      console.error(e);
      showFatalError(`Greška pri izvozu: ${e?.message || e}`);
    } finally {
      clearPendingStartPayload();
      clearActiveTool();
      removeReturnButton();
      await resetState();
    }
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
    try {
      if (!ST.active) return;

      if (!isStillActiveTool()) {
        await stopBecauseDetached('RUN_GUARD_NOT_ACTIVE_TOOL');
        return;
      }

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

      if (!ST.active || !isStillActiveTool()) {
        await stopBecauseDetached('AFTER_SLEEP_NOT_ACTIVE_TOOL');
        return;
      }

      const holder = readHolderFullName() || '';
      const res = scrapeRowsForHID(hid);

      if (res.ok && res.rows.length) {
        await appendResultRows(hid, holder, res.rows);
        log(`HID ${hid}: pronađeno ${res.rows.length} grla`);
      } else {
        await appendErrorRow(hid, holder, res.status || 'ERROR');
        log(`HID ${hid}: ${res.status || 'ERROR'}`);
      }

      save();
      await sleep(ST.delay);

      if (!ST.active || !isStillActiveTool()) {
        await stopBecauseDetached('BEFORE_NEXT_NOT_ACTIVE_TOOL');
        return;
      }

      await goNextOrFinish();
    } catch (e) {
      console.error(e);
      await window.VetAssistTools.vb_zbirni_xlsx.stop();
      showFatalError(`Greška tokom obrade: ${e?.message || e}`);
    }
  }

  function normalizeHids(input) {
    const out = [];
    const seen = new Set();

    for (const x of (input || [])) {
      const hid = String(x || '').trim();
      if (!hid) continue;
      if (seen.has(hid)) continue;
      seen.add(hid);
      out.push(hid);
    }

    return out;
  }

  window.VetAssistTools = window.VetAssistTools || {};

  window.VetAssistTools.vb_zbirni_xlsx = {
    start: async function (config) {
      removeCompletionPanel();
      removeReferencePicker();

      if (ST.active) {
        log('Alat je već aktivan.');
        return;
      }

      const hids = normalizeHids(config?.hids);
      if (!hids.length) {
        console.error('No HIDs provided');
        return;
      }

      try {
        await dbClearStore(DB_CURRENT_STORE);
        await dbClearStore(DB_REFERENCE_STORE);

        const ref = await askForReferenceWorkbook();

        if (ref.enabled && Array.isArray(ref.rows) && ref.rows.length) {
          await dbAppendRows(DB_REFERENCE_STORE, ref.rows);
          ST.referenceEnabled = true;
          ST.referenceFileName = ref.fileName || '';
          log(`Referentni fajl učitan: ${ST.referenceFileName} (${ref.rows.length} redova)`);
        } else {
          ST.referenceEnabled = false;
          ST.referenceFileName = '';
          log('Poređenje preskočeno — radi se samo novi snapshot.');
        }

        ST.active = true;
        ST.idx = 0;
        ST.rows = hids.map(h => ({ hid: h }));
        ST.rbrByHid = {};
        ST.currentHid = '';
        ST.delay = Math.max(150, Number(config?.delay) || 550);
        ST.timeoutSec = Math.max(15, Number(config?.timeoutSec) || 70);
        ST.fileNameLast = '';
        ST.diffFileNameLast = '';
        ST.animalCount = 0;
        ST.errorCount = 0;
        save();

        log(`START: ${hids.length} HID-ova`);
        await run();
      } catch (e) {
        console.error(e);
        await window.VetAssistTools.vb_zbirni_xlsx.stop();
        showFatalError(`Greška pri pokretanju: ${e?.message || e}`);
      }
    },

    resume: async function () {
      try {
        if (!ST.active) return;
        if (!isStillActiveTool()) {
          await stopBecauseDetached('RESUME_GUARD_NOT_ACTIVE_TOOL');
          return;
        }
        log(`RESUME: idx=${ST.idx + 1}/${ST.rows.length}`);
        await run();
      } catch (e) {
        console.error(e);
        await window.VetAssistTools.vb_zbirni_xlsx.stop();
        showFatalError(`Greška pri nastavku rada: ${e?.message || e}`);
      }
    },

    stop: async function () {
      log('STOP');
      clearPendingStartPayload();
      clearActiveTool();
      removeReturnButton();
      removeCompletionPanel();
      removeReferencePicker();
      await resetState();
    },

    debugState: function () {
      return JSON.parse(JSON.stringify(getPersistableState()));
    }
  };

  setTimeout(async () => {
    try {
      const pending = getPendingStartPayload();

      if (pending && !ST.active) {
        clearPendingStartPayload();
        log('Pokrećem iz pending start payload-a');
        await window.VetAssistTools.vb_zbirni_xlsx.start(pending);
        return;
      }

      if (ST.active) {
        if (!isStillActiveTool()) {
          await stopBecauseDetached('BOOTSTRAP_NOT_ACTIVE_TOOL');
          return;
        }
        log('Auto-resume posle učitavanja stranice');
        await window.VetAssistTools.vb_zbirni_xlsx.resume();
      }
    } catch (e) {
      console.error(e);
      await window.VetAssistTools.vb_zbirni_xlsx.stop();
      showFatalError(`Greška pri bootstrap-u: ${e?.message || e}`);
    }
  }, 700);
})();
