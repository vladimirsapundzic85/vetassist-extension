console.log("VetAssist tool loaded: goveda_drzavna_zemlja v1.2.1");

(function () {
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_goveda_drzavna_zemlja_v121_loaded) {
    console.log("VetAssist tool already loaded: goveda_drzavna_zemlja v1.2.1");
    return;
  }
  root.__vetassist_goveda_drzavna_zemlja_v121_loaded = true;

  const TOOL_CODE = 'goveda_drzavna_zemlja';
  const SS_KEY = 'vetassist_goveda_drzavna_zemlja_v121';
  const START_PAYLOADS_KEY = 'vetassist_tool_start_payloads_v1';
  const ACTIVE_TOOL_KEY = 'vetassist_active_tool_v1';
  const RETURN_BTN_ID = 'vetassist-return-picker-btn';
  const COMPLETION_PANEL_ID = 'vetassist-goveda-drzavna-zemlja-complete-panel';

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
    fileCount: 0,
    errorCount: 0,
    lastFileName: '',
    lastHolder: '',
    saveEmpty: true,
    savedForHid: {}
  }, safeJson(sessionStorage.getItem(SS_KEY)));

  function getPersistableState() {
    return {
      active: !!ST.active,
      idx: Number(ST.idx || 0),
      rows: Array.isArray(ST.rows) ? ST.rows : [],
      delay: Number(ST.delay || 550),
      timeoutSec: Number(ST.timeoutSec || 70),
      currentHid: String(ST.currentHid || ''),
      fileCount: Number(ST.fileCount || 0),
      errorCount: Number(ST.errorCount || 0),
      lastFileName: String(ST.lastFileName || ''),
      lastHolder: String(ST.lastHolder || ''),
      saveEmpty: !!ST.saveEmpty,
      savedForHid: ST.savedForHid || {}
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
    ST.fileCount = 0;
    ST.errorCount = 0;
    ST.lastFileName = '';
    ST.lastHolder = '';
    ST.saveEmpty = true;
    ST.savedForHid = {};
    save();
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

  function getActiveTool() {
    try {
      return sessionStorage.getItem(ACTIVE_TOOL_KEY) || '';
    } catch {
      return '';
    }
  }

  function isStillActiveTool() {
    return getActiveTool() === TOOL_CODE;
  }

  async function stopBecauseDetached(reason = 'DETACHED') {
    log(`Zaustavljam alat: ${reason}`);
    await window.VetAssistTools.goveda_drzavna_zemlja.stop();
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
    if (topDoc.getElementById('vetassist-goveda-drzavna-zemlja-complete-styles')) return;

    const style = topDoc.createElement('style');
    style.id = 'vetassist-goveda-drzavna-zemlja-complete-styles';
    style.textContent = `
      #${COMPLETION_PANEL_ID} {
        position: fixed;
        top: 120px;
        right: 18px;
        width: 390px;
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
      #${COMPLETION_PANEL_ID} .va-body { padding: 12px; }
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
            <div class="va-row">Sačuvani fajlovi: <b>${summary.fileCount}</b></div>
            <div class="va-row">Greške / prazni HID-ovi: <b>${summary.errorCount}</b></div>
            <div class="va-row">Poslednji fajl: <b>${summary.fileName || '-'}</b></div>
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

  function toAsciiFile(s) {
    return deLatinStrict(s).replace(/[^\w.\-]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
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

  function isFemalePol(v) {
    const t = deLatinStrict(String(v || '').trim().toUpperCase());
    return v === 'Ž' || t.startsWith('ZENSK');
  }

  function isMalePol(v) {
    const t = deLatinStrict(String(v || '').trim().toUpperCase());
    return v === 'M' || t.startsWith('MUSK');
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

  function parseDMY(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!m) return null;
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo - 1, d);
    return isNaN(dt) ? null : dt;
  }

  function months1dec(from, to) {
    if (!from || !to) return '';
    const ms = (to - from);
    return Math.round((ms / (1000 * 60 * 60 * 24 * 30.4375)) * 10) / 10;
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
    // Ista logika kao u provereno radnoj Tampermonkey v4.8:
    // 1) DRŽALAC GOVEDA, 2) bilo koji DRŽALAC, 3) VLASNIK GAZDINSTVA, 4) PREZIME/IME parovi.
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

    if (!container) {
      for (const d of allDocs()) {
        try {
          const cand = [...d.querySelectorAll('*')].find(el =>
            /\bDRZALAC\b/i.test(deLatinStrict(el.innerText || ''))
          );
          if (cand) {
            container = cand.closest('table, fieldset, div') || cand.parentElement || cand;
            break;
          }
        } catch {}
      }
    }

    if (!container) {
      for (const d of allDocs()) {
        try {
          const cand = [...d.querySelectorAll('*')].find(el =>
            /VLASNIK GAZDINSTVA/i.test(deLatinStrict(el.innerText || ''))
          );
          if (cand) {
            container = cand.closest('table, fieldset, div') || cand.parentElement || cand;
            break;
          }
        } catch {}
      }
    }

    const src = container || allDocs()[0] || document;
    const txt = (src.innerText || '').replace(/\r/g, '');

    let prez = (txt.match(/Prezime\s*([^\n]+)\n/i) || [])[1] || '';
    let ime = (txt.match(/\bIme\b\s*([^\n]+)\n/i) || [])[1] || '';

    if (!(prez || ime)) {
      try {
        const all = Array.from(src.querySelectorAll('td,dt,th,div,span')).filter(n => n.childElementCount === 0);
        const labP = all.find(el => /^\s*PREZIME\s*$/i.test(el.textContent || ''));
        const labI = all.find(el => /^\s*IME\s*$/i.test(el.textContent || ''));
        const vP = labP && (labP.nextElementSibling?.textContent || '').trim();
        const vI = labI && (labI.nextElementSibling?.textContent || '').trim();
        if (vP || vI) {
          prez = vP || '';
          ime = vI || '';
        }
      } catch {}
    }

    return `${(prez || '').trim()} ${(ime || '').trim()}`.replace(/\s+/g, ' ').trim();
  }

  function findAnimalsTable() {
    // Proverena Tampermonkey v4.8 logika: uzmi poslednju tabelu uz legendu "ŽIVOTINJE NA GAZDINSTVU".
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

    // Isti fallback kao u Tampermonkey v4.8.
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

  function scrapeRows(refDateIso) {
    const tbl = findAnimalsTable();
    if (!tbl) return [];

    const trs = Array.from(tbl.querySelectorAll('tr')).filter(tr => tr.querySelectorAll('td,th').length >= 3);
    if (trs.length < 2) return [];

    const hdr = Array.from(trs[0].querySelectorAll('th,td')).map(x => (x.innerText || '').trim().toUpperCase());

    const idx = {
      broj: hdr.findIndex(h => h.includes('BROJ') && (h.includes('ŽIVOTIN') || h.includes('ZIVOTIN'))),
      pol: hdr.findIndex(h => h === 'POL' || h.includes('POL')),
      rasa: hdr.findIndex(h => h.includes('RASA')),
      datrodj: hdr.findIndex(h => h.includes('DATUM ROĐ') || h.includes('DATUM RODJ'))
    };

    const ref = refDateIso ? new Date(refDateIso + (String(refDateIso).includes('T') ? '' : 'T00:00:00')) : new Date();
    const out = [];

    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i].querySelectorAll('td');
      if (!tds.length) continue;

      const rawBroj = idx.broj >= 0 ? (tds[idx.broj].innerText || '').trim() : '';
      if (!rawBroj) continue;

      // Samo numerički ID, bez oznake države (RS, AT, ...).
      const brojStr = onlyDigits(rawBroj);
      if (!brojStr) continue;

      const polTxt = idx.pol >= 0 ? (tds[idx.pol].innerText || '').trim() : '';
      const rasa = idx.rasa >= 0 ? (tds[idx.rasa].innerText || '').trim() : '';
      // Isključivo DATUM ROĐENJA; nema fallback-a na DATUM DOLASKA.
      const datRodj = idx.datrodj >= 0 ? (tds[idx.datrodj].innerText || '').trim() : '';

      const dt = parseDMY(datRodj);
      const starost = dt ? String(months1dec(dt, ref)).replace('.', ',') : '';

      out.push({
        'Broj životinje': brojStr,
        'Pol': polShort(polTxt),
        'Rasa': rasa || '',
        'Datum rođenja': datRodj || '',
        'Starost': starost,
        'Kategorija': ''
      });
    }

    return out;
  }

  function downloadXLSX(hid, rows, holderFullName) {
    // Kao u Tampermonkey v4.8: jedan fajl po HID-u.
    ST.savedForHid = ST.savedForHid || {};
    if (ST.savedForHid[hid]) return;
    ST.savedForHid[hid] = true;
    save();

    if (typeof XLSX === 'undefined') {
      console.error('XLSX vendor nije učitan.');
      ST.errorCount += 1;
      ST.savedForHid[hid] = false;
      save();
      return;
    }

    const female = (rows || []).filter(r => isFemalePol(r.Pol));
    const male = (rows || []).filter(r => isMalePol(r.Pol));

    const numStar = v => {
      const x = parseFloat(String(v).replace(',', '.'));
      return isNaN(x) ? null : x;
    };

    female.sort((a, b) => (numStar(b.Starost) || 0) - (numStar(a.Starost) || 0));
    male.sort((a, b) => (numStar(a.Starost) || 0) - (numStar(b.Starost) || 0));

    // Samo redosled/naziv kolona u Excelu; način popunjavanja vrednosti ostaje isti.
    const sorted = [...female, ...male].map((r, i) => ({
      'R. broj': i + 1,
      'Broj životinje': r['Broj životinje'],
      'Datum rođenja': r['Datum rođenja'],
      'Pol': r['Pol'],
      'Starost meseci': r['Starost'],
      'Kategorija': r['Kategorija'],
      'Rasa': r['Rasa']
    }));

    const wb = XLSX.utils.book_new();
    const header = ['R. broj', 'Broj životinje', 'Datum rođenja', 'Pol', 'Starost meseci', 'Kategorija', 'Rasa'];
    const ws = XLSX.utils.json_to_sheet(sorted, { header });

    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      let colBroj = null;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ c: C, r: 0 });
        if (ws[addr] && String(ws[addr].v).toLowerCase().includes('broj životinj')) {
          colBroj = C;
          break;
        }
      }
      if (colBroj != null) {
        for (let R = 1; R <= range.e.r; ++R) {
          const cell = XLSX.utils.encode_cell({ c: colBroj, r: R });
          if (ws[cell]) ws[cell].t = 's';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Grla');

    const stamp = new Date().toISOString().slice(0, 10);
    const baseHolder = holderFullName
      ? toAsciiFile(holderFullName).replace(/\s+/g, ' ').trim().replace(/\s/g, '_')
      : '';
    const safe = ((baseHolder ? baseHolder + '_' : '') + String(hid || 'izvoz')).slice(0, 80);
    const fileName = `VB_${safe}_${stamp}.xlsx`;

    // Isto kao u provereno radnoj Tampermonkey skripti: automatski download po HID-u.
    XLSX.writeFile(wb, fileName);

    ST.fileCount += 1;
    ST.lastFileName = fileName;
    save();
    log(`Sačuvan Excel: ${fileName}`);
  }

  function navigateToFarm(hid) {
    ST.currentHid = String(hid);
    save();

    const url = `/pls/aimcs_prod/W_FARM_SEARCH.FARM_DATA_FORM?p_kmg_mid=${encodeURIComponent(String(hid))}`;
    log(`Navigiram na gazdinstvo HID=${hid}`);
    window.top.location.href = url;
  }

  async function processCurrent() {
    if (!ST.active) return;

    if (!isStillActiveTool()) {
      await stopBecauseDetached('NOT_ACTIVE_TOOL');
      return;
    }

    const current = ST.rows[ST.idx];
    if (!current) {
      await finishRun();
      return;
    }

    const hid = String(current.hid || '').trim();
    if (!hid) {
      ST.errorCount += 1;
      ST.idx += 1;
      save();
      await go();
      return;
    }

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

    ST.lastHolder = readHolderFullName() || '';
    const ref = new Date().toISOString().slice(0, 10);
    const rows = scrapeRows(ref);

    if (rows.length || ST.saveEmpty) {
      downloadXLSX(hid, rows, ST.lastHolder);
    } else {
      log(`HID ${hid}: nema redova za izvoz`);
      ST.errorCount += 1;
    }

    ST.idx += 1;
    ST.currentHid = '';
    save();

    await sleep(ST.delay);

    if (!ST.active || !isStillActiveTool()) {
      await stopBecauseDetached('BEFORE_NEXT_NOT_ACTIVE_TOOL');
      return;
    }

    if (ST.idx >= ST.rows.length) {
      await finishRun();
      return;
    }

    navigateToFarm(String(ST.rows[ST.idx].hid));
  }

  async function go() {
    await processCurrent();
  }

  async function finishRun() {
    ST.active = false;
    save();

    showCompletionPanel({
      hidCount: Array.isArray(ST.rows) ? ST.rows.length : 0,
      fileCount: ST.fileCount || 0,
      errorCount: ST.errorCount || 0,
      fileName: ST.lastFileName || '',
      finishedAt: new Date().toLocaleTimeString('sr-RS')
    });
  }

  function normalizeHids(input) {
    return (input || []).map(x => String(x || '').trim()).filter(Boolean);
  }

  window.VetAssistTools = window.VetAssistTools || {};

  window.VetAssistTools.goveda_drzavna_zemlja = {
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

      ST.active = true;
      ST.idx = 0;
      ST.rows = hids.map(h => ({ hid: h }));
      ST.currentHid = '';
      ST.delay = Math.max(150, Number(config?.delay) || 550);
      ST.timeoutSec = Math.max(15, Number(config?.timeoutSec) || 70);
      ST.fileCount = 0;
      ST.errorCount = 0;
      ST.lastFileName = '';
      ST.lastHolder = '';
      ST.saveEmpty = true;
      ST.savedForHid = {};
      save();

      log(`START: ${hids.length} HID-ova`);
      navigateToFarm(String(ST.rows[0].hid));
    },

    resume: async function () {
      if (!ST.active) return;
      if (!isStillActiveTool()) {
        await stopBecauseDetached('RESUME_GUARD_NOT_ACTIVE_TOOL');
        return;
      }
      log(`RESUME: idx=${ST.idx + 1}/${ST.rows.length}`);
      await go();
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
      await window.VetAssistTools.goveda_drzavna_zemlja.start(pending);
      return;
    }

    if (ST.active) {
      if (!isStillActiveTool()) {
        await stopBecauseDetached('BOOTSTRAP_NOT_ACTIVE_TOOL');
        return;
      }
      log('Auto-resume posle učitavanja stranice');
      await window.VetAssistTools.goveda_drzavna_zemlja.resume();
    }
  }, 700);
})();
