console.log("VetAssist tool loaded: goveda_pregled_kretanja v1.0.3");

(function () {
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_goveda_pregled_kretanja_v103_loaded) {
    console.log("VetAssist tool already loaded: goveda_pregled_kretanja v1.0.3");
    return;
  }
  root.__vetassist_goveda_pregled_kretanja_v103_loaded = true;

  const TOOL_CODE = 'goveda_pregled_kretanja';
  const FORM_URL = '/pls/aimcs_prod/W_ANIMAL_LIST.STARTUP';
  const START_PAYLOADS_KEY = 'vetassist_tool_start_payloads_v1';
  const ACTIVE_TOOL_KEY = 'vetassist_active_tool_v1';
  const RETURN_BTN_ID = 'vetassist-return-picker-btn';
  const TOOL_CONTROL_EVENT = 'vetassist-tool-control';
  const COMPLETION_PANEL_ID = 'vetassist-goveda-pregled-kretanja-complete-panel';
  const SS_KEY = 'vetassist_goveda_pregled_kretanja_v103';

  const ENGINE_TICK_MS = 100;
  const DEFAULT_TIMEOUT_SEC = 4;
  const FIRST_ATTEMPT_WAIT_MS = 1100;
  const SECOND_ATTEMPT_WAIT_MS = 1600;
  const MAX_ATTEMPTS = 2;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const digits = (s) => String(s || '').replace(/\D+/g, '');

  let LOCK = false;

  function safeJsonParse(s, fallback = {}) {
    try { return JSON.parse(s || ''); } catch { return fallback; }
  }

  const ST = Object.assign({
    active: false,
    idx: 0,
    rows: [],
    results: [],
    reportMode: 'last',
    phase: 'idle',
    attempt: 0,
    phaseStartedAt: 0,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    exported: false,
    fileNameLast: '',
    warnCount: 0,
    runId: null,
    currentSearchId: ''
  }, safeJsonParse(sessionStorage.getItem(SS_KEY), {}));

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(ST));
  }

  function log(...args) {
    console.log(`[${TOOL_CODE}]`, ...args);
  }

  function isTopWindow() {
    try { return window.top === window; } catch { return false; }
  }

  function allDocs() {
    const docs = [];
    try {
      (function walk(w) {
        try { if (w.document) docs.push(w.document); } catch {}
        try { for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]); } catch {}
      })(window.top);
    } catch {}
    try { docs.push(document); } catch {}
    return [...new Set(docs)];
  }

  function deLatinStrict(s) {
    return String(s || '')
      .replace(/Đ/g, 'DJ').replace(/đ/g, 'dj')
      .replace(/[ČĆ]/g, 'C').replace(/[čć]/g, 'c')
      .replace(/Š/g, 'S').replace(/š/g, 's')
      .replace(/Ž/g, 'Z').replace(/ž/g, 'z');
  }

  function norm(s) {
    return deLatinStrict(String(s || ''))
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function textOf(el) {
    return String(el?.innerText || el?.textContent || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getPendingStartPayload() {
    try {
      const all = safeJsonParse(sessionStorage.getItem(START_PAYLOADS_KEY), {});
      return all[TOOL_CODE] || null;
    } catch {
      return null;
    }
  }

  function clearPendingStartPayload() {
    try {
      const all = safeJsonParse(sessionStorage.getItem(START_PAYLOADS_KEY), {});
      delete all[TOOL_CODE];
      sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
    } catch {}
  }

  function getActiveTool() {
    try { return sessionStorage.getItem(ACTIVE_TOOL_KEY) || ''; } catch { return ''; }
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

  function normalizeReportMode(raw) {
    const x = norm(raw).replace(/\s+/g, '_');
    if (
      x === 'ALL' || x === 'SVA' || x === 'SVA_KRETANJA' || x === 'ALL_MOVEMENTS' ||
      x === 'ALLMOVEMENTS' || x === 'SVE' || x === 'SVE_KRETNJE'
    ) return 'all';
    return 'last';
  }

  function parseIdsFromPayload(payload) {
    const raw =
      typeof payload?.rawInput === 'string'
        ? payload.rawInput
        : (Array.isArray(payload?.rows) ? payload.rows.join('\n') : '');

    return String(raw || '')
      .split(/\r?\n/)
      .map(line => {
        const matches = String(line || '').match(/\d{6,}/g) || [];
        if (!matches.length) return '';
        matches.sort((a, b) => b.length - a.length);
        return matches[0];
      })
      .filter(Boolean)
      .map(id => ({ id }));
  }

  function resolveModeFromPayload(payload) {
    if (payload?.onlyLast === true) return 'last';
    if (payload?.allMovements === true) return 'all';
    return normalizeReportMode(
      payload?.reportMode ?? payload?.movementMode ?? payload?.mode ?? 'last'
    );
  }

  function isAnimalDetailPage() {
    try {
      if (/w_animal.*data_form/i.test(String(window.top.location.href || ''))) return true;
    } catch {}

    return allDocs().some(d => {
      try { return norm(d.body?.innerText || '').includes('PODACI O ZIVOTINJI'); } catch { return false; }
    });
  }

  function findAirsQueryDoc() {
    for (const d of allDocs()) {
      try {
        const u = String(d.URL || '').toLowerCase();
        if (u.includes('anm_query_form')) return d;
      } catch {}
    }
    return null;
  }

  function isSearchContext() {
    try {
      if (/W_ANIMAL_LIST\.STARTUP/i.test(String(window.top.location.href || ''))) return true;
    } catch {}
    return !!findAirsQueryDoc();
  }

  function isAnimalListResultPage() {
    return allDocs().some(d => {
      try {
        const t = norm(d.body?.innerText || d.body?.textContent || '');
        return t.includes('LISTA ZIVOTINJA');
      } catch {
        return false;
      }
    });
  }

  function searchIdForAttempt(baseId, attemptNo) {
    const id = digits(baseId);
    if (attemptNo <= 1) return id;
    return id.startsWith('0') ? id : `0${id}`;
  }

  function setValueFast(el, val) {
    try {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto || {}, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
    } catch {
      try { el.value = val; } catch {}
    }
  }

  function typeWrite(el, val) {
    if (!el) return false;
    try {
      el.focus();
      setValueFast(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setValueFast(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function realClick(el) {
    if (!el) return false;
    try {
      const ev = type => el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      el.focus();
      ev('mousedown');
      ev('mouseup');
      ev('click');
      return true;
    } catch {
      try { el.click(); return true; } catch { return false; }
    }
  }

  function trySearchById(idDigits) {
    const queryDoc = findAirsQueryDoc();
    if (!queryDoc) {
      log('anm_query_form nije pronađen');
      return false;
    }

    const input = queryDoc.querySelector('input[name="p_id_animal"]');
    const btn = queryDoc.querySelector('input[name="p_submit"]');

    if (!input || !btn) {
      log('Nisu pronađeni p_id_animal / p_submit');
      return false;
    }

    if (!typeWrite(input, idDigits)) return false;
    log(`Tražim grlo ${idDigits}`);
    return realClick(btn);
  }

  // Ista mehanika ulaska u grlo kao u "Brzi pregled grla (goveda)".
  function tryOpenAnimal(idDigits) {
    if (!idDigits) return false;
    if (isAnimalDetailPage()) return true;

    for (const d of allDocs()) {
      try {
        let a = d.querySelector(
          `a[href*="w_animal_list.anm_data_form"][href*="p_id_animal=${idDigits}"],
           a[href*="w_animal_list_anm_data_form"][href*="p_id_animal=${idDigits}"]`
        );

        if (!a) {
          a = Array.from(d.querySelectorAll('a')).find((x) => {
            const href = x.getAttribute('href') || '';
            const txt = x.textContent || '';
            return (
              /w_animal_list(\.|_)anm_data_form/i.test(href) ||
              digits(txt) === idDigits
            );
          }) || null;
        }

        if (a) {
          const href = a.href || a.getAttribute('href');
          if (href) {
            location.href = href;
            return true;
          }
          a.click();
          return true;
        }
      } catch {}
    }

    return false;
  }

  function navigateToSearchForm() {
    try {
      window.top.location.href = FORM_URL;
      return true;
    } catch {
      return false;
    }
  }

  function parseDateDMY(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!m) return null;
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt) ? null : dt;
  }

  function eventTime(row) {
    const a = parseDateDMY(row['Datum dolaska']);
    const o = parseDateDMY(row['Datum odlaska']);
    const ta = a ? a.getTime() : 0;
    const to = o ? o.getTime() : 0;
    return Math.max(ta, to, 0);
  }

  function getDirectCells(tr) {
    try { return Array.from(tr?.cells || []); } catch { return []; }
  }

  // Traži baš red zaglavlja tabele kretanja, ne spoljašnju layout tabelu AIRS stranice.
  function findMovementTableInfo() {
    for (const d of allDocs()) {
      let trs = [];
      try { trs = Array.from(d.querySelectorAll('tr')); } catch { trs = []; }

      for (const tr of trs) {
        const cells = getDirectCells(tr);
        if (cells.length < 5) continue;

        const headers = cells.map(c => norm(textOf(c)));
        const joined = headers.join(' | ');

        const isHeader =
          joined.includes('KRETANJE') &&
          joined.includes('DATUM ODLASKA') &&
          joined.includes('DATUM DOLASKA') &&
          joined.includes('DRZALAC') &&
          joined.includes('DOLAZAK NA GAZDINSTVO');

        if (!isHeader) continue;

        const table = tr.closest('table');
        if (!table) continue;

        const ownRows = Array.from(table.rows || []);
        const headerIndex = ownRows.indexOf(tr);
        if (headerIndex < 0) continue;

        return { table, rows: ownRows, headerRow: tr, headerIndex, headers };
      }
    }

    return null;
  }

  function findHeaderIndex(headers, predicate) {
    for (let i = 0; i < headers.length; i++) {
      if (predicate(headers[i], i)) return i;
    }
    return -1;
  }

  // AIRS tabela ima kolonu sa strelicom/putanjom, pa zatim pravi Datum dolaska,
  // a Držalac je krajnja desna kolona. Zaglavlje ume da bude "spljošteno"
  // tako da pretraga samo po tekstu zaglavlja može da pomeri indekse za 1-2 kolone.
  function resolveArrivalDateIndex(cells, idxDolazak, fallbackIdx) {
    const start = Math.max(0, Number(idxDolazak) + 1);
    for (let i = start; i < cells.length; i++) {
      const value = textOf(cells[i]);
      if (parseDateDMY(value)) return i;
    }
    return fallbackIdx;
  }

  function resolveHolderIndex(cells, fallbackIdx) {
    // Na AIRS tabeli kretanja Držalac je poslednja kolona u redu.
    if (cells.length) return cells.length - 1;
    return fallbackIdx;
  }

  function extractDestination(cell, headerText) {
    if (!cell) return '';
    const raw = textOf(cell);
    const nraw = norm(raw);
    const header = norm(headerText);

    const arrowMatch = raw.match(/(?:=>|→|➡)/);
    if (arrowMatch) {
      const pos = arrowMatch.index ?? -1;
      const after = pos >= 0 ? raw.slice(pos + arrowMatch[0].length) : '';
      const idsAfter = after.match(/\d{6,}/g) || [];
      if (idsAfter.length) return idsAfter[idsAfter.length - 1];
      return '';
    }

    if (header.includes('DOLAZAK NA GAZDINSTVO') && !header.includes('ODLAZAK SA GAZDINSTVA')) {
      const ids = raw.match(/\d{6,}/g) || [];
      return ids.length ? ids[ids.length - 1] : '';
    }

    const anchors = Array.from(cell.querySelectorAll('a'));
    if (anchors.length >= 2) {
      for (let i = anchors.length - 1; i >= 0; i--) {
        const id = digits(textOf(anchors[i]));
        if (id.length >= 6) return id;
      }
    }

    if (!nraw.includes('=>')) {
      const ids = raw.match(/\d{6,}/g) || [];
      if (header.includes('DOLAZAK')) return ids.length ? ids[ids.length - 1] : '';
    }

    return '';
  }

  function scrapeMovementsForCurrentAnimal(animalId) {
    const info = findMovementTableInfo();
    if (!info?.table) {
      return { ok: false, rows: [], reason: 'Tabela kretanja nije pronađena' };
    }

    const trs = info.rows;
    const hIdx = info.headerIndex;
    const headers = info.headers;
    if (trs.length <= hIdx + 1) {
      return { ok: false, rows: [], reason: 'Tabela kretanja je prazna' };
    }

    const idxKretanje = findHeaderIndex(headers, h => h.includes('KRETANJE'));
    const idxDatOdl = findHeaderIndex(headers, h => h.includes('DATUM ODLASKA'));
    const idxDatDol = findHeaderIndex(headers, h => h.includes('DATUM DOLASKA'));
    const idxDrzalac = findHeaderIndex(headers, h => h.includes('DRZALAC'));
    const idxDolazak = findHeaderIndex(headers, h => h.includes('DOLAZAK NA GAZDINSTVO'));

    if (idxKretanje < 0 || idxDatOdl < 0 || idxDatDol < 0 || idxDrzalac < 0 || idxDolazak < 0) {
      log('Ne mogu pouzdano da mapiram zaglavlje tabele:', headers);
      return { ok: false, rows: [], reason: 'Zaglavlje tabele nije prepoznato' };
    }

    const out = [];
    let originalOrder = 0;

    for (let i = hIdx + 1; i < trs.length; i++) {
      const cells = getDirectCells(trs[i]);
      if (!cells.length) continue;
      if (cells.length <= Math.max(idxKretanje, idxDatOdl, idxDatDol, idxDrzalac, idxDolazak)) continue;

      const kretanje = textOf(cells[idxKretanje]);
      const datumOdlaska = textOf(cells[idxDatOdl]);
      const dolazak = extractDestination(cells[idxDolazak], headers[idxDolazak]);

      // Dve ciljane korekcije mapiranja:
      // 1) Datum dolaska uzima se iz prve stvarne datumske ćelije DESNO od kolone sa strelicom/HID-om.
      // 2) Držalac se uzima iz krajnje desne kolone AIRS reda.
      const realIdxDatDol = resolveArrivalDateIndex(cells, idxDolazak, idxDatDol);
      const realIdxDrzalac = resolveHolderIndex(cells, idxDrzalac);
      const datumDolaska = realIdxDatDol >= 0 ? textOf(cells[realIdxDatDol]) : '';
      const drzalac = realIdxDrzalac >= 0 ? textOf(cells[realIdxDrzalac]) : '';

      const hasUsefulData = !!(kretanje || datumOdlaska || datumDolaska || dolazak || drzalac);
      if (!hasUsefulData) continue;

      out.push({
        'Broj životinje': String(animalId),
        'Kretanje': kretanje,
        'Datum dolaska': datumDolaska,
        'Datum odlaska': datumOdlaska,
        'Dolazak na gazdinstvo': dolazak,
        'Držalac': drzalac,
        __ORDER: originalOrder++,
        __LATEST: '0',
        __WARN: '0'
      });
    }

    out.sort((a, b) => {
      const dt = eventTime(b) - eventTime(a);
      if (dt !== 0) return dt;
      return (b.__ORDER || 0) - (a.__ORDER || 0);
    });

    if (out.length) out[0].__LATEST = '1';

    return { ok: out.length > 0, rows: out, reason: out.length ? '' : 'Nema redova kretanja' };
  }

  function pushWarningRow(animalId, reason) {
    ST.results.push({
      'Broj životinje': String(animalId),
      'Kretanje': `NEMA PODATAKA — ${reason}`,
      'Datum dolaska': '',
      'Datum odlaska': '',
      'Dolazak na gazdinstvo': '',
      'Držalac': '',
      __LATEST: '1',
      __WARN: '1',
      __GROUP_START: '1'
    });
    ST.warnCount += 1;
    save();
  }

  function appendAnimalRows(animalId, rows) {
    const chosen = ST.reportMode === 'all' ? rows : rows.slice(0, 1);
    chosen.forEach((r, idx) => {
      ST.results.push({
        ...r,
        'Broj životinje': String(animalId),
        __GROUP_START: idx === 0 ? '1' : '0'
      });
    });
    save();
  }

  function htmlEscape(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const EXPORT_HEADERS = [
    'Broj životinje',
    'Kretanje',
    'Datum dolaska',
    'Datum odlaska',
    'Dolazak na gazdinstvo',
    'Držalac'
  ];

  function getColWidth(header) {
    const map = {
      'Broj životinje': 125,
      'Kretanje': 180,
      'Datum dolaska': 105,
      'Datum odlaska': 105,
      'Dolazak na gazdinstvo': 155,
      'Držalac': 330
    };
    return map[header] || 120;
  }

  function isTextColumn(header) {
    return ['Broj životinje', 'Dolazak na gazdinstvo'].includes(header);
  }

  function exportXLS(headers, rows) {
    const bodyRows = (rows || []).map(row => {
      const isLatest = String(row.__LATEST || '') === '1';
      const isWarn = String(row.__WARN || '') === '1';
      const groupStart = String(row.__GROUP_START || '') === '1';

      return '<tr>' + headers.map(h => {
        const styles = [];
        const classes = [];

        if (isTextColumn(h)) {
          styles.push('mso-number-format:"\\@";');
          classes.push('text-cell');
        }

        if (groupStart) {
          styles.push('border-top:4px solid #000;');
          styles.push('mso-border-top-alt:solid #000 3.0pt;');
        }

        if (isLatest && !isWarn) {
          styles.push('font-weight:700;');
          styles.push('font-size:13px;');
          styles.push('background:#eaf4ff;');
        }

        if (isWarn) {
          styles.push('font-weight:700;');
          styles.push('background:#fff2cc;');
        }

        const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
        const styleAttr = styles.length ? ` style="${styles.join('')}"` : '';
        return `<td${classAttr}${styleAttr}>${htmlEscape(row[h] ?? '')}</td>`;
      }).join('') + '</tr>';
    }).join('');

    const colgroup = headers.map(h => `<col style="width:${getColWidth(h)}px">`).join('');
    const modeLabel = ST.reportMode === 'all' ? 'SVA KRETANJA' : 'SAMO POSLEDNJE KRETANJE';

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; table-layout: fixed; }
          th, td {
            border: 1px solid #999;
            padding: 4px 6px;
            white-space: nowrap;
            vertical-align: middle;
          }
          th { background: #eee; font-weight: 700; }
          td.text-cell { mso-number-format: "\\@"; }
          .report-title { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="report-title">Pregled kretanja GOVEDA — ${modeLabel}</div>
        <table>
          <colgroup>${colgroup}</colgroup>
          <thead><tr>${headers.map(h => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
      </html>`;

    return new Blob([html], { type: 'application/vnd.ms-excel' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
      try { a.remove(); } catch {}
    }, 1200);
  }

  function autoDownloadOnce() {
    if (ST.exported) return ST.fileNameLast || '';
    ST.exported = true;
    save();

    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = ST.reportMode === 'all' ? 'SVA_KRETANJA' : 'POSLEDNJE_KRETANJE';
    const fname = `AIRS_Pregled_kretanja_GOVEDA_${suffix}_${stamp}.xls`;

    downloadBlob(exportXLS(EXPORT_HEADERS, ST.results), fname);
    ST.fileNameLast = fname;
    save();
    log(`AUTO XLS: ${fname}`);
    return fname;
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
      if (d.getElementById('vetassist-goveda-pregled-kretanja-complete-styles')) return;
      const style = d.createElement('style');
      style.id = 'vetassist-goveda-pregled-kretanja-complete-styles';
      style.textContent = `
        #${COMPLETION_PANEL_ID}{
          position:fixed;top:120px;right:18px;width:420px;z-index:2147483647;
          background:#f7f5e8;border:1px solid #9e9b87;border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.18);color:#222;font:13px/1.4 Arial,sans-serif
        }
        #${COMPLETION_PANEL_ID} .va-head{padding:10px 12px;background:#e9e3c6;border-bottom:1px solid #c9c19d;font-weight:700;font-size:14px}
        #${COMPLETION_PANEL_ID} .va-body{padding:12px}
        #${COMPLETION_PANEL_ID} .va-ok{margin-bottom:10px;padding:8px 10px;border:1px solid #9bc7a4;background:#f4fff6;border-radius:8px}
        #${COMPLETION_PANEL_ID} .va-meta{display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px}
        #${COMPLETION_PANEL_ID} .va-row{padding:6px 8px;border:1px solid #d7d0b0;background:#faf7ea;border-radius:8px}
        #${COMPLETION_PANEL_ID} .va-actions{display:flex;gap:8px;margin-top:12px}
        #${COMPLETION_PANEL_ID} .va-btn{border:1px solid #9d9778;background:#fffdf2;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700}
        #${COMPLETION_PANEL_ID} .va-btn-primary{border-color:#6e8f73;background:#eaf8ed}
      `;
      d.documentElement.appendChild(style);
    } catch {}
  }

  function showCompletionPanel(summary) {
    try {
      const d = window.top.document;
      ensureCompletionStyles();
      removeCompletionPanel();

      const modeLabel = ST.reportMode === 'all' ? 'Sva kretanja' : 'Samo poslednje kretanje';
      const box = d.createElement('div');
      box.id = COMPLETION_PANEL_ID;
      box.innerHTML = `
        <div class="va-head">VetAssist — Pregled kretanja GOVEDA</div>
        <div class="va-body">
          <div class="va-ok"><b>Obrada je završena.</b></div>
          <div class="va-meta">
            <div class="va-row">Izveštaj: <b>${modeLabel}</b></div>
            <div class="va-row">Obrađena grla: <b>${summary.animalCount}</b></div>
            <div class="va-row">Izvezeni redovi: <b>${summary.exportCount}</b></div>
            <div class="va-row">Bez podataka / upozorenja: <b>${summary.warnCount}</b></div>
            <div class="va-row">Fajl: <b>${summary.fileName || '-'}</b></div>
            <div class="va-row">Vreme završetka: <b>${summary.finishedAt || '-'}</b></div>
          </div>
          <div class="va-actions">
            <button id="va-gpk-back" class="va-btn va-btn-primary">Nazad na alate</button>
            <button id="va-gpk-close" class="va-btn">Zatvori</button>
          </div>
        </div>`;
      d.documentElement.appendChild(box);

      box.querySelector('#va-gpk-back')?.addEventListener('click', () => {
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector('#va-gpk-close')?.addEventListener('click', () => removeCompletionPanel());
    } catch (e) {
      console.error('Completion panel failed', e);
    }
  }

  function resetTool() {
    ST.active = false;
    ST.idx = 0;
    ST.rows = [];
    ST.results = [];
    ST.reportMode = 'last';
    ST.phase = 'idle';
    ST.attempt = 0;
    ST.phaseStartedAt = 0;
    ST.exported = false;
    ST.fileNameLast = '';
    ST.warnCount = 0;
    ST.runId = null;
    ST.currentSearchId = '';
    save();

    clearPendingStartPayload();
    clearActiveTool();
    removeReturnButton();
  }

  function startRun(config) {
    const rows = parseIdsFromPayload(config || {});
    if (!rows.length) {
      log('Nema validnih ID brojeva za obradu.');
      return false;
    }

    ST.active = true;
    ST.idx = 0;
    ST.rows = rows;
    ST.results = [];
    ST.reportMode = resolveModeFromPayload(config || {});
    ST.phase = 'ensure_form';
    ST.attempt = 0;
    ST.phaseStartedAt = Date.now();
    ST.timeoutSec = Math.max(4, Number(config?.timeoutSec || DEFAULT_TIMEOUT_SEC));
    ST.exported = false;
    ST.fileNameLast = '';
    ST.warnCount = 0;
    ST.remoteJobId = typeof config?.remoteJobId === 'string' ? config.remoteJobId : null;
    ST.runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    ST.currentSearchId = '';
    save();

    log(`START: grla=${ST.rows.length}, mode=${ST.reportMode}, timeout=${ST.timeoutSec}s`);
    if (!isSearchContext()) navigateToSearchForm();
    return true;
  }

  function bootstrapFromPending() {
    if (!isTopWindow()) return false;
    const pending = getPendingStartPayload();
    if (!pending || ST.active) return false;
    clearPendingStartPayload();
    return startRun(pending);
  }

  async function finishRun() {
    ST.active = false;
    ST.phase = 'done';
    save();

    const fileName = ST.remoteJobId ? '' : autoDownloadOnce();
    clearPendingStartPayload();
    clearActiveTool();
    removeReturnButton();

    showCompletionPanel({
      animalCount: ST.rows.length,
      exportCount: ST.results.length,
      warnCount: ST.warnCount,
      fileName,
      finishedAt: new Date().toLocaleTimeString('sr-RS')
    });
  }

  function currentRow() {
    return ST.rows[ST.idx] || null;
  }

  async function advanceAfterScrape() {
    ST.idx += 1;
    ST.phase = 'ensure_form';
    ST.attempt = 0;
    ST.currentSearchId = '';
    ST.phaseStartedAt = Date.now();
    save();

    if (ST.idx >= ST.rows.length) {
      await finishRun();
      return;
    }

    navigateToSearchForm();
  }

  async function handleAnimalDetail(row) {
    const effectiveId = digits(ST.currentSearchId || row.id) || row.id;
    const scraped = scrapeMovementsForCurrentAnimal(effectiveId);
    if (scraped.ok && scraped.rows.length) {
      appendAnimalRows(effectiveId, scraped.rows);
      log(`Grlo ${row.id}${effectiveId !== row.id ? ` -> ${effectiveId}` : ''}: kretanja=${scraped.rows.length}, izvoz=${ST.reportMode === 'all' ? scraped.rows.length : 1}`);
    } else {
      pushWarningRow(effectiveId, scraped.reason || 'Nema kretanja');
      log(`Grlo ${row.id}: ${scraped.reason || 'Nema kretanja'}`);
    }

    await advanceAfterScrape();
  }

  async function retryOrWarn(row, reason) {
    if (ST.attempt < MAX_ATTEMPTS) {
      const nextId = searchIdForAttempt(row.id, ST.attempt + 1);
      log(`Grlo ${row.id}: ${reason} → brzi drugi pokušaj sa ID ${nextId}`);
      ST.phase = 'ensure_form';
      ST.currentSearchId = '';
      ST.phaseStartedAt = Date.now();
      save();
      navigateToSearchForm();
      return;
    }

    pushWarningRow(row.id, reason);
    await advanceAfterScrape();
  }

  async function go() {
    if (!ST.active || LOCK || !isTopWindow()) return;
    LOCK = true;

    try {
      const row = currentRow();
      if (!row) {
        await finishRun();
        return;
      }

      if (isAnimalDetailPage()) {
        ST.phase = 'scrape';
        save();
        await sleep(80);
        await handleAnimalDetail(row);
        return;
      }

      if (ST.phase === 'ensure_form') {
        if (!isSearchContext()) {
          navigateToSearchForm();
          return;
        }

        const qd = findAirsQueryDoc();
        if (!qd) return;

        ST.attempt += 1;
        const searchId = searchIdForAttempt(row.id, ST.attempt);
        ST.currentSearchId = searchId;
        save();

        const ok = trySearchById(searchId);
        if (!ok) {
          await retryOrWarn(row, 'Pretraga nije pokrenuta');
          return;
        }

        ST.phase = 'await_result';
        ST.phaseStartedAt = Date.now();
        save();
        return;
      }

      if (ST.phase === 'await_result') {
        const searchId = digits(ST.currentSearchId || row.id) || row.id;

        // Po mehanici Brzog pregleda: čim se pojavi rezultat, odmah uđi u grlo.
        if (tryOpenAnimal(searchId)) {
          ST.phase = 'await_detail';
          ST.phaseStartedAt = Date.now();
          save();
          return;
        }

        const elapsed = Date.now() - Number(ST.phaseStartedAt || 0);
        const fastWait = ST.attempt <= 1 ? FIRST_ATTEMPT_WAIT_MS : SECOND_ATTEMPT_WAIT_MS;

        // Ako se lista rezultata već učitala, nema razloga da čekamo stari timeout od više sekundi.
        if (isAnimalListResultPage() && elapsed > fastWait) {
          await retryOrWarn(row, 'Nije pronađeno grlo / rezultat pretrage');
          return;
        }

        if (elapsed > ST.timeoutSec * 1000) {
          await retryOrWarn(row, 'Nije pronađeno grlo / rezultat pretrage');
        }
        return;
      }

      if (ST.phase === 'await_detail') {
        const elapsed = Date.now() - Number(ST.phaseStartedAt || 0);
        if (elapsed > ST.timeoutSec * 1000) {
          await retryOrWarn(row, 'Nije otvorena stranica životinje');
        }
        return;
      }

      ST.phase = 'ensure_form';
      ST.phaseStartedAt = Date.now();
      save();
    } catch (e) {
      console.error(`[${TOOL_CODE}] go error`, e);
    } finally {
      LOCK = false;
    }
  }

  function wireToolControl() {
    try {
      window.top.addEventListener(TOOL_CONTROL_EVENT, e => {
        const detail = e?.detail || {};
        if (detail.tool !== TOOL_CODE) return;
        if (detail.action === 'reset') {
          resetTool();
          removeCompletionPanel();
        }
      });
    } catch {}
  }

  function registerToolApi() {
    try {
      window.VetAssistTools = window.VetAssistTools || {};
      window.VetAssistTools[TOOL_CODE] = {
        start: (config) => startRun(config || {}),
        resume: () => go(),
        reset: () => {
          resetTool();
          removeCompletionPanel();
        },
        debugState: () => JSON.parse(JSON.stringify(ST))
      };
    } catch (e) {
      console.error('VetAssistTools register failed', e);
    }
  }

  wireToolControl();
  registerToolApi();

  if (isTopWindow()) {
    bootstrapFromPending();

    setInterval(() => {
      try {
        if (bootstrapFromPending()) return;
        if (!ST.active) return;

        const activeTool = getActiveTool();
        if (activeTool && activeTool !== TOOL_CODE) return;

        go();
      } catch (e) {
        console.error(`[${TOOL_CODE}] tick error`, e);
      }
    }, ENGINE_TICK_MS);
  }
})();
