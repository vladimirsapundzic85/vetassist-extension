console.log("VetAssist tool loaded: hid_bpg_verifikacija v1.1.2");

(function () {
  "use strict";

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_hid_bpg_verifikacija_loaded_v112) {
    console.log("VetAssist tool already loaded: hid_bpg_verifikacija v1.1.2");
    return;
  }
  root.__vetassist_hid_bpg_verifikacija_loaded_v112 = true;

  const TOOL_CODE = "hid_bpg_verifikacija";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const TOOL_CONTROL_REQUEST_KEY = "vetassist_tool_control_request_v1";
  const TOOL_CONTROL_EVENT = "vetassist-tool-control";
  const EXPORT_GUARD_KEY = "vetassist_hidchk_export_guard_v112";

  const SS_KEY = "vetassist_hidchk_state_v111";
  const FORM_STARTUP = "/pls/aimcs_prod/W_ANIMAL_LIST.STARTUP";
  const FARM_FORM = "/pls/aimcs_prod/W_FARM_SEARCH.FARM_DATA_FORM";

  const now = () => new Date().toLocaleTimeString("sr-RS");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const digits = (s) => String(s ?? "").replace(/\D+/g, "");
  const deLatin = (s) =>
    String(s || "")
      .replace(/đ|Đ/g, "dj")
      .replace(/č|ć|Č|Ć/g, "c")
      .replace(/š|Š/g, "s")
      .replace(/ž|Ž/g, "z");
  const normText = (s) =>
    deLatin(String(s || "").toUpperCase()).replace(/\s+/g, " ").trim();

  function safeJsonParse(s, fallback = {}) {
    try { return JSON.parse(s || ""); } catch { return fallback; }
  }

  function getPendingStartPayload() {
    const all = safeJsonParse(sessionStorage.getItem(START_PAYLOADS_KEY), {});
    return all[TOOL_CODE] || null;
  }

  function clearPendingStartPayload() {
    const all = safeJsonParse(sessionStorage.getItem(START_PAYLOADS_KEY), {});
    delete all[TOOL_CODE];
    sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
  }

  function clearActiveTool() {
    try { sessionStorage.removeItem(ACTIVE_TOOL_KEY); } catch {}
  }

  function makeRunId() {
    return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function readExportGuard() {
    try { return localStorage.getItem(EXPORT_GUARD_KEY) || ""; } catch { return ""; }
  }

  function writeExportGuard(runId) {
    try { localStorage.setItem(EXPORT_GUARD_KEY, String(runId || "")); } catch {}
  }

  function clearExportGuard() {
    try { localStorage.removeItem(EXPORT_GUARD_KEY); } catch {}
  }

  const state = Object.assign({
    active: false,
    phase: "",
    idx: 0,
    rows: [],
    results: [],
    log: [],
    delay: 550,
    timeoutSec: 70,
    selHid: "",
    selSubmit: "",
    directFarm: true,
    groupByHid: true,
    lastHolder: "",
    lastBpg: "",
    hidQueue: [],
    groups: {},
    runId: null
  }, safeJsonParse(sessionStorage.getItem(SS_KEY), {}));

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(state));
  }

  function addLog(msg) {
    const line = `[${now()}] ${msg}`;
    state.log.push(line);
    if (state.log.length > 3000) state.log.shift();
    save();
    console.log(`[${TOOL_CODE}] ${msg}`);
  }

  function setStatus(t) {
    console.log(`[${TOOL_CODE}] STATUS: ${t}`);
  }

  function clearAllState() {
    sessionStorage.removeItem(SS_KEY);
    Object.assign(state, {
      active: false,
      phase: "",
      idx: 0,
      rows: [],
      results: [],
      log: [],
      selHid: "",
      selSubmit: "",
      directFarm: true,
      groupByHid: true,
      delay: 550,
      timeoutSec: 70,
      lastHolder: "",
      lastBpg: "",
      hidQueue: [],
      groups: {},
      runId: null
    });
    clearExportGuard();
  }

  function consumeToolControlRequest() {
    try {
      const raw = sessionStorage.getItem(TOOL_CONTROL_REQUEST_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(TOOL_CONTROL_REQUEST_KEY);
      return JSON.parse(raw);
    } catch {
      try { sessionStorage.removeItem(TOOL_CONTROL_REQUEST_KEY); } catch {}
      return null;
    }
  }

  function handleToolControl(detail) {
    if (!detail || detail.tool !== TOOL_CODE) return;
    if (detail.action !== "reset") return;

    addLog("reset requested from extension");
    clearPendingStartPayload();
    clearActiveTool();
    clearAllState();
    save();
  }

  try {
    if (!root.__vetassist_hid_bpg_control_listener_v111) {
      root.__vetassist_hid_bpg_control_listener_v111 = true;
      root.addEventListener(TOOL_CONTROL_EVENT, (e) => {
        handleToolControl(e.detail || null);
      });
    }
  } catch {}

  function detectSep(line) {
    if (line.includes(";")) return ";";
    if (/\t/.test(line)) return "\t";
    if (line.includes(",")) return ",";
    return ";";
  }

  function looksLikeHeader(cols) {
    return cols.some((c) => /[A-Za-zŠĐČĆŽšđčćž]/.test(c));
  }

  function parseCSVFlexible(text) {
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return { rows: [] };

    const sep = detectSep(lines[0]);
    const firstCols = lines[0].split(sep).map((s) => s.replace(/^"(.*)"$/, "$1").trim());
    const hasHeader = looksLikeHeader(firstCols);
    const header = hasHeader ? firstCols : ["ID", "HID", "BPG"];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const norm = (s) => s.toUpperCase().replace(/\s+/g, " ").trim();
    const hmap = header.map(norm);

    const idIdx = hmap.findIndex((h) =>
      /^(ID(_|\s*)UNISOFT|ID\s*BROJ|ID_BROJ|ID|ID DR)$/.test(h)
    );
    const hidIdx = hmap.findIndex((h) =>
      /^(HID(\s|$)|HID\s*GOP|HID\s*UNISOFT)$/.test(h)
    );
    const bpgIdx = hmap.findIndex((h) =>
      /^(BPG(\s|$)|BROJ POLJOPRIVREDNOG GAZDINSTVA|BPG BROJ|BPG_UNISOFT)$/i.test(h)
    );

    const idPos = idIdx >= 0 ? idIdx : 0;
    const hidPos = hidIdx >= 0 ? hidIdx : 1;
    const bpgPos = bpgIdx >= 0 ? bpgIdx : 2;

    const rows = dataLines.map((l) => {
      const cols = l.split(sep).map((s) => s.replace(/^"(.*)"$/, "$1").trim());
      return {
        id: cols[idPos] || "",
        hid: cols[hidPos] || "",
        bpg: cols[bpgPos] || ""
      };
    });

    return { rows };
  }

  function downloadBinary(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 800);
  }

  function allDocs() {
    const docs = [document];
    try {
      (function walk(w) {
        for (let i = 0; i < w.frames.length; i++) {
          const f = w.frames[i];
          try {
            if (f.document) {
              docs.push(f.document);
              walk(f);
            }
          } catch {}
        }
      })(window.top);
    } catch {}
    return docs;
  }

  function pageHas(txt) {
    return allDocs().some((d) =>
      normText(d.body?.innerText || "").includes(normText(txt))
    );
  }

  const isListUrl = () => /W_ANIMAL_LIST\.ANM_LIST_FORM/i.test(location.href);
  const isStartup = () => /W_ANIMAL_LIST\.STARTUP/i.test(location.href);

  function findGazdInstInput() {
    for (const d of allDocs()) {
      const el = state.selHid
        ? d.querySelector(state.selHid)
        : d.querySelector(
            'input[name="p_kmg_mid_a"], input[name="p_kmg_mid"], input[name*="kmg_mid"], input[name*="gazd"]'
          );
      if (el) return el;
    }
    return null;
  }

  function autoFindPotvrdi() {
    for (const d of allDocs()) {
      const nodes = d.querySelectorAll(
        'input[type="submit"],button[type="submit"],input[type="button"],button'
      );
      const el =
        Array.from(nodes).find((n) => /potvrdi/i.test(n.value || n.textContent || "")) || null;
      if (el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
        const val = (el.value || "").trim();
        if (val) return `${el.tagName.toLowerCase()}[value="${CSS.escape(val)}"]`;
        return 'button, input[type="submit"]';
      }
    }
    return "";
  }

  function findPotvrdiBtn() {
    for (const d of allDocs()) {
      if (state.selSubmit && state.selSubmit !== state.selHid) {
        const b = d.querySelector(state.selSubmit);
        if (b) return b;
      }
      const nodes = d.querySelectorAll(
        'input[type="submit"],button[type="submit"],input[type="button"],button'
      );
      const b =
        Array.from(nodes).find((el) => /potvrdi/i.test(el.value || el.textContent || "")) || null;
      if (b) return b;
    }
    return null;
  }

  async function waitFor(pred, timeoutMs = state.timeoutSec * 1000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const v = await pred();
        if (v) return v;
      } catch {}
      await sleep(step);
    }
    return null;
  }

  async function gotoFarmDirect(hid) {
    try {
      addLog(`→ otvaram PODACI O GAZDINSTVU (HID ${hid})… (direktno)`);
      window.top.location.href = `${FARM_FORM}?p_kmg_mid=${encodeURIComponent(String(hid))}`;
      const ok = await waitFor(() => pageHas("PODACI O GAZDINSTVU"));
      return !!ok;
    } catch {
      return false;
    }
  }

  function farmLinkForHID(hid) {
    let fallback = null;
    for (const d of allDocs()) {
      const links = d.querySelectorAll('a[href*="w_farm_search.farm_data_form"]');
      for (const el of links) {
        const href = el.getAttribute("href") || "";
        const m = href.match(/p_kmg_mid=(\d+)/i);
        if (m && m[1] === String(hid)) return el;
        fallback = el;
      }
    }
    return fallback;
  }

  async function gotoFarmViaLink(hid) {
    const a = farmLinkForHID(hid);
    if (!a) return false;
    try { a.click(); } catch {}
    const ok = await waitFor(() => pageHas("PODACI O GAZDINSTVU"));
    return !!ok;
  }

  function firstAnimalLink() {
    for (const d of allDocs()) {
      const a = d.querySelector('a[href*="w_animal_list.anm_data_form"]');
      if (a) return a;
    }
    return null;
  }

  async function gotoAnimalDetail() {
    const a = firstAnimalLink();
    if (!a) return false;
    try { a.click(); } catch {}
    const ok = await waitFor(() => pageHas("PODACI O ŽIVOTINJI"));
    if (!ok) addLog("❌ PODACI O ŽIVOTINJI nisu otvoreni");
    return !!ok;
  }

  async function openListForHID(hid) {
    if (!isStartup()) {
      try { window.top.location.href = FORM_STARTUP; } catch {}
      await sleep(state.delay);
    }

    const inp = findGazdInstInput();
    let btn = findPotvrdiBtn();

    if (!inp) {
      addLog("Nisam našao HID input / POTVRDI");
      return false;
    }

    if (state.selHid && state.selSubmit && state.selHid === state.selSubmit) {
      const auto = autoFindPotvrdi();
      if (auto) {
        state.selSubmit = auto;
        save();
        addLog("⚠️ POTVRDI isti kao HID → auto-fix: " + auto);
      }
    }

    btn = findPotvrdiBtn();

    inp.focus();
    inp.value = "";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.value = hid;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));

    if (btn) {
      btn.click();
    } else {
      const frm = inp.closest("form");
      try {
        if (frm) {
          (frm.requestSubmit || frm.submit || function () {
            frm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }).call(frm);
        }
      } catch {}
    }

    const ok = await waitFor(() => isListUrl() || pageHas("LISTA ŽIVOTINJA"));
    if (!ok) addLog("❌ LISTA ŽIVOTINJA nije otvorena");
    return !!ok;
  }

  function readHolderFullName() {
    let container = null;
    for (const d of allDocs()) {
      const cand = [...d.querySelectorAll("*")].find((el) =>
        /DRZALAC GOVEDA/i.test(deLatin(el.innerText || ""))
      );
      if (cand) {
        container = cand.closest("table,fieldset,div") || cand.parentElement || cand;
        break;
      }
    }
    if (!container) {
      for (const d of allDocs()) {
        const cand = [...d.querySelectorAll("*")].find((el) =>
          /VLASNIK GAZDINSTVA/i.test(deLatin(el.innerText || ""))
        );
        if (cand) {
          container = cand.closest("table,fieldset,div") || cand.parentElement || cand;
          break;
        }
      }
    }

    const src = container || document;
    const txt = (src.innerText || "").replace(/\r/g, "");
    const prez = (txt.match(/Prezime\s*([^\n]+)\n/i) || [])[1] || "";
    const ime = (txt.match(/\bIme\b\s*([^\n]+)\n/i) || [])[1] || "";

    if (prez.trim() || ime.trim()) return `${prez} ${ime}`.trim();

    const all = Array.from(src.querySelectorAll("td,dt,th,div,span"));
    const labP = all.find((el) => /^\s*PREZIME\s*$/i.test(el.textContent || ""));
    const labI = all.find((el) => /^\s*IME\s*$/i.test(el.textContent || ""));
    const vP = labP && (labP.nextElementSibling?.textContent || "").trim();
    const vI = labI && (labI.nextElementSibling?.textContent || "").trim();

    return `${vP || ""} ${vI || ""}`.trim();
  }

  function readBPG() {
    for (const d of allDocs()) {
      const labels = Array.from(d.querySelectorAll("td,th,span,div"));
      for (const lab of labels) {
        const txt = normText(lab.textContent || "");
        if (!txt.includes("BROJ POLJOPRIVREDNOG GAZDINSTVA")) continue;

        const row = lab.closest("tr");
        if (row) {
          const cells = Array.from(row.querySelectorAll("td,th"));
          const idx = cells.indexOf(lab);
          if (idx >= 0 && cells[idx + 1]) {
            const val = digits(cells[idx + 1].textContent || "");
            if (val) return val;
          }
          for (const c of cells) {
            const val = digits(c.textContent || "");
            if (val && val.length >= 8) return val;
          }
        }

        const sibVal = digits(lab.nextElementSibling?.textContent || "");
        if (sibVal) return sibVal;

        const parentTxt = lab.parentElement ? lab.parentElement.innerText || "" : "";
        const m = parentTxt.match(/BROJ POLJOPRIVREDNOG GAZDINSTVA[^0-9]*([0-9]+)/i);
        if (m) return m[1];
      }
    }

    const txt = document.body?.innerText || "";
    const m = txt.match(/BROJ POLJOPRIVREDNOG GAZDINSTVA[^0-9]*([0-9]+)/i);
    return m ? m[1] : "";
  }

  function findAnimalsTable() {
    for (const d of allDocs()) {
      const tables = Array.from(d.querySelectorAll("table"));
      for (const t of tables) {
        const txt = normText(t.innerText || "");
        if (txt.includes("ZIVOTINJE NA GAZDINSTVU") || txt.includes("ŽIVOTINJE NA GAZDINSTVU")) {
          return t;
        }
      }
    }

    for (const d of allDocs()) {
      const legends = d.querySelectorAll(
        "legend, .SmallCaptionBold01, .SmallCaptionBold, .SmallCaption"
      );
      for (const el of legends) {
        const t = (el.innerText || el.textContent || "").toUpperCase();
        if (
          t.includes("ŽIVOTINJE NA GAZDINSTVU") ||
          t.includes("ZIVOTINJE NA GAZDINSTVU")
        ) {
          const tbls = el.parentElement ? el.parentElement.querySelectorAll("table") : [];
          if (tbls.length) return tbls[tbls.length - 1];
        }
      }
    }

    return null;
  }

  function collectIdsFromCurrentFarmPage() {
    const set = new Set();
    const tbl = findAnimalsTable();
    if (!tbl) return set;

    const rows = Array.from(tbl.querySelectorAll("tr"));
    for (const tr of rows) {
      const rowTxt = tr.innerText || "";
      if (!rowTxt.trim()) continue;
      const vals = Array.from(rowTxt.matchAll(/\d{6,}/g)).map((m) => m[0]);
      for (const v of vals) set.add(v);
    }

    return set;
  }

  function findNextOnFarm() {
    for (const d of allDocs()) {
      const nodes = d.querySelectorAll('a,button,input,[role="button"]');
      const el = Array.from(nodes).find((el) => {
        const t = (el.value || el.textContent || "").trim();
        const alt = (el.getAttribute("title") || el.getAttribute("aria-label") || "").trim();
        return /Sledeć|Sledeca|Slede?a|Next/i.test(t) ||
               /Sledeć|Next/i.test(alt) ||
               /^[>»]{1,2}$/.test(t);
      });
      if (el) return el;
    }
    return null;
  }

  async function collectAllIdsOnFarm() {
    const all = new Set();
    for (const v of collectIdsFromCurrentFarmPage()) all.add(v);

    let guard = 0;
    let page = 1;

    while (guard++ < 80) {
      const next = findNextOnFarm();
      if (!next) break;

      addLog(`Tabela na farmi: strana ${page} → Sledeća`);
      try { next.click(); } catch {}
      await sleep(state.delay);

      const ok = await waitFor(() => pageHas("PODACI O GAZDINSTVU"));
      if (!ok) break;

      for (const v of collectIdsFromCurrentFarmPage()) all.add(v);
      page++;
    }

    addLog(`Na farmi prikupljeno ID-eva: ${all.size}`);
    return all;
  }

  function pushResultIdx(idx, id, hid, found, holder, bpgWanted, bpgAirs, bpgMatch, note) {
    state.results.push({
      idx,
      id,
      hid,
      match: found ? "DA" : "NE",
      holder: holder || "",
      bpgWanted: bpgWanted || "",
      bpgAirs: bpgAirs || "",
      bpgMatch: bpgMatch || "",
      note: note || ""
    });

    const notePart = note ? `; ${note}` : "";
    addLog(`Rezultat: [${idx}] HID=${hid} ID=${id} → ${found ? "NAĐEN" : "NIJE"}${notePart}`);
    save();
  }

  async function nextAndBack() {
    state.idx++;
    save();
    addLog("Nazad na STARTUP (sledeći korak)");
    try { window.top.location.href = FORM_STARTUP; } catch {}
    await sleep(state.delay);
    setTimeout(go, 250);
  }

  function exportXLS(rows) {
    const out = (rows || []).slice().sort((a, b) => (a.idx || 0) - (b.idx || 0));
    const esc = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const th = (t) =>
      `<th style="border:1px solid #ccc;padding:4px;background:#f5f5f5;text-align:left">${esc(t)}</th>`;

    const td = (t, { warn = false, forceText = false } = {}) => {
      const base = "border:1px solid #ddd;padding:4px;";
      const stWarn = warn ? "color:#c00;font-weight:700;background:#ffecec;" : "";
      const stText = forceText ? "mso-number-format:'\\@';" : "";
      return `<td style="${base}${stWarn}${stText}">${esc(t)}</td>`;
    };

    const headRow = `
      <tr>
        ${th("ID_GRLA")}${th("HID")}${th("POKLAPA_SE")}${th("DRZALAC")}
        ${th("BPG_TRAZENO")}${th("BPG_OD_HID-A")}${th("BPG_POKLAPA_SE")}${th("NAPOMENA")}
      </tr>`;

    const body = out.map((r) => {
      const warnID = String(r.match || "") === "NE";
      const warnBPG = String(r.bpgMatch || "") === "NE";
      const warnAny = warnID || warnBPG;
      return `<tr>
        ${td(r.id, { warn: warnID, forceText: true })}
        ${td(r.hid, { forceText: true })}
        ${td(r.match, { warn: warnID })}
        ${td(r.holder || "")}
        ${td(r.bpgWanted || "", { warn: warnBPG, forceText: true })}
        ${td(r.bpgAirs || "", { warn: warnBPG, forceText: true })}
        ${td(r.bpgMatch || "", { warn: warnBPG })}
        ${td(r.note || "", { warn: warnAny })}
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
</head>
<body>
<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px">
${headRow}
${body}
</table>
</body>
</html>`;

    return new Blob([html], { type: "application/vnd.ms-excel" });
  }

  function finishAndExport() {
    const currentRunId = String(state.runId || "");
    if (currentRunId && readExportGuard() === currentRunId) {
      addLog("Export guard: fajl je već preuzet za ovaj run — preskačem dupli download.");
      state.active = false;
      state.phase = "";
      save();
      clearActiveTool();
      setStatus("Gotovo");
      return;
    }

    const xlsBlob = exportXLS(state.results);
    downloadBinary(
      xlsBlob,
      `AIRS_provera_${new Date().toISOString().slice(0, 10)}.xls`
    );
    if (currentRunId) writeExportGuard(currentRunId);
    addLog("Kraj. Excel (.xls) preuzet.");
    state.active = false;
    state.phase = "";
    save();
    clearActiveTool();
    setStatus("Gotovo (Excel .xls preuzet)");
  }

  function startFromPayload(payload) {
    const rawInput = String(payload?.rawInput || "").trim();
    if (!rawInput) {
      addLog("Payload je prazan.");
      setStatus("Nema ulaza.");
      return false;
    }

    const parsed = parseCSVFlexible(rawInput);
    if (!parsed.rows.length) {
      addLog("Nisam pročitao ulaz iz payload-a.");
      setStatus("Ulaz nije validan.");
      return false;
    }

    const rowsWithIdx = parsed.rows
      .map((r, i) => ({
        idx: i,
        id: digits(r.id),
        hid: digits(r.hid),
        bpg: digits(r.bpg || ""),
        idRaw: r.id,
        hidRaw: r.hid,
        bpgRaw: r.bpg
      }))
      .filter((r) => r.id && r.hid);

    if (!rowsWithIdx.length) {
      addLog("Nema validnih redova u payload-u.");
      setStatus("Nema validnih redova.");
      return false;
    }

    const q = [];
    const seen = new Set();
    const groups = {};

    for (const r of rowsWithIdx) {
      if (!seen.has(r.hid)) {
        seen.add(r.hid);
        q.push(r.hid);
        groups[r.hid] = [];
      }
      groups[r.hid].push(r.idx);
    }

    Object.assign(state, {
      active: true,
      phase: "enter",
      rows: rowsWithIdx,
      results: [],
      idx: 0,
      lastHolder: "",
      lastBpg: "",
      hidQueue: q,
      groups,
      runId: makeRunId()
    });

    clearExportGuard();
    save();
    addLog(
      `Start: redova=${rowsWithIdx.length}, jedinstvenih HID=${q.length}, delay=${state.delay}, timeout=${state.timeoutSec}, directFarm=${state.directFarm ? "DA" : "NE"}, groupByHid=${state.groupByHid ? "DA" : "NE"}`
    );
    setStatus("Krećem…");
    go();
    return true;
  }

  let GO_LOCK = false;
  let BOOTSTRAP_LOCK = false;

  async function go() {
    if (!state.active) return;
    if (GO_LOCK) return;

    GO_LOCK = true;
    try {
      if (state.groupByHid) {
        if (state.idx >= state.hidQueue.length) {
          finishAndExport();
          return;
        }

        const hid = state.hidQueue[state.idx];
        const idxList = (state.groups[hid] || []).slice();
        setStatus(`HID ${state.idx + 1}/${state.hidQueue.length}: ${hid} (provera ${idxList.length} ID-a)`);

        let onFarm = false;
        if (state.directFarm) {
          onFarm = await gotoFarmDirect(hid);
          if (!onFarm) addLog("→ farma: nema direktnog otvaranja (fallback kroz listu)");
        }

        if (!onFarm) {
          const okList = await openListForHID(hid);
          if (!okList) {
            addLog("Lista nije otvorena / HID možda neispravan — markiram sve ID-eve tog HID-a kao NE");
            for (const idx of idxList) {
              const r = state.rows[idx];
              pushResultIdx(idx, r.id, r.hid, false, "", r.bpg || "", "", "", "Lista nije otvorena / HID neispravan");
            }
            await nextAndBack();
            return;
          }

          const okFarmLink = await gotoFarmViaLink(hid);
          if (!okFarmLink) {
            addLog("→ farma: nema linka na listi (idem preko PRVOG GRLA)");
            const okDetail = await gotoAnimalDetail();
            if (!okDetail) {
              for (const idx of idxList) {
                const r = state.rows[idx];
                pushResultIdx(idx, r.id, r.hid, false, "", r.bpg || "", "", "", "Ne mogu do farme (ni preko detalja)");
              }
              await nextAndBack();
              return;
            }

            const okFarm2 = await gotoFarmViaLink(hid);
            if (!okFarm2) {
              for (const idx of idxList) {
                const r = state.rows[idx];
                pushResultIdx(idx, r.id, r.hid, false, "", r.bpg || "", "", "", "Link ka farmi nije dostupan");
              }
              await nextAndBack();
              return;
            }
          }
        }

        state.lastHolder = readHolderFullName() || "";
        state.lastBpg = digits(readBPG() || "");
        addLog(`→ držalac: ${state.lastHolder || "(nije nađen)"} | BPG: ${state.lastBpg || "(nema)"}`);

        const present = await collectAllIdsOnFarm();

        for (const idx of idxList) {
          const r = state.rows[idx];
          const found = present.has(String(r.id));

          const bpgWanted = digits(r.bpg || "");
          const bpgOfHid = state.lastBpg || "";
          let bpgMatch = "";
          let note = found ? "" : "Nije nađen u tabeli";

          if (found && bpgWanted) {
            if (!bpgOfHid) {
              bpgMatch = "NE";
              note = note ? (note + "; BPG od HID-a: nema") : "BPG od HID-a: nema";
            } else if (bpgWanted !== bpgOfHid) {
              bpgMatch = "NE";
              note = note ? (note + `; BPG od HID-a: ${bpgOfHid}`) : `BPG od HID-a: ${bpgOfHid}`;
            } else {
              bpgMatch = "DA";
            }
          } else {
            bpgMatch = "";
          }

          pushResultIdx(idx, r.id, r.hid, found, state.lastHolder, bpgWanted, bpgOfHid, bpgMatch, note);
        }

        await nextAndBack();
        return;
      }

      const i = state.idx;
      if (i >= state.rows.length) {
        finishAndExport();
        return;
      }

      const row = state.rows[i];
      setStatus(`Red ${i + 1}/${state.rows.length}: HID=${row.hid} / ID=${row.id}`);

      let onFarm = false;
      if (state.directFarm) {
        onFarm = await gotoFarmDirect(row.hid);
        if (!onFarm) addLog("→ farma: nema direktnog otvaranja (fallback kroz listu)");
      }

      if (!onFarm) {
        const okList = await openListForHID(row.hid);
        if (!okList) {
          pushResultIdx(row.idx, row.id, row.hid, false, "", row.bpg || "", "", "", "Lista nije otvorena / HID neispravan");
          await nextAndBack();
          return;
        }

        const okFarmLink = await gotoFarmViaLink(row.hid);
        if (!okFarmLink) {
          addLog("→ farma: nema linka (idem preko PRVOG GRLA)");
          const okDetail = await gotoAnimalDetail();
          if (!okDetail) {
            pushResultIdx(row.idx, row.id, row.hid, false, "", row.bpg || "", "", "", "Ne mogu do farme (ni preko detalja)");
            await nextAndBack();
            return;
          }

          const okFarm2 = await gotoFarmViaLink(row.hid);
          if (!okFarm2) {
            pushResultIdx(row.idx, row.id, row.hid, false, "", row.bpg || "", "", "", "Link ka farmi nije dostupan");
            await nextAndBack();
            return;
          }
        }
      }

      state.lastHolder = readHolderFullName() || "";
      state.lastBpg = digits(readBPG() || "");
      addLog(`→ držalac: ${state.lastHolder || "(nije nađen)"} | BPG: ${state.lastBpg || "(nema)"}`);

      const present = await collectAllIdsOnFarm();
      const found = present.has(String(row.id));

      const bpgWanted = digits(row.bpg || "");
      const bpgOfHid = state.lastBpg || "";
      let bpgMatch = "";
      let note = found ? "" : "Nije nađen u tabeli";

      if (found && bpgWanted) {
        if (!bpgOfHid) {
          bpgMatch = "NE";
          note = note ? (note + "; BPG od HID-a: nema") : "BPG od HID-a: nema";
        } else if (bpgWanted !== bpgOfHid) {
          bpgMatch = "NE";
          note = note ? (note + `; BPG od HID-a: ${bpgOfHid}`) : `BPG od HID-a: ${bpgOfHid}`;
        } else {
          bpgMatch = "DA";
        }
      }

      pushResultIdx(row.idx, row.id, row.hid, found, state.lastHolder, bpgWanted, bpgOfHid, bpgMatch, note);
      await nextAndBack();
    } finally {
      GO_LOCK = false;
    }
  }

  function bootstrap() {
    if (BOOTSTRAP_LOCK) return;
    BOOTSTRAP_LOCK = true;

    try {
      const pending = getPendingStartPayload();
      if (pending) {
        addLog("Nađen pending payload → startujem alat.");
        clearPendingStartPayload();
        startFromPayload(pending);
        return;
      }

      if (state.active) {
        addLog(
          `Resume: ${state.groupByHid ? "HID idx" : "row idx"}=${state.idx}/${state.groupByHid ? state.hidQueue.length : state.rows.length}, url=${location.href}`
        );
        setStatus("u toku…");
        setTimeout(go, 400);
        return;
      }

      console.log(`[${TOOL_CODE}] idle (no payload, no active run)`);
    } finally {
      BOOTSTRAP_LOCK = false;
    }
  }

  if (!root.__vetassist_hid_bpg_verifikacija_v111_init) {
    root.__vetassist_hid_bpg_verifikacija_v111_init = true;

    window.addEventListener("load", () => {
      bootstrap();
    });

    setInterval(() => {
      try {
        const pending = getPendingStartPayload();
        if (pending && !state.active) {
          addLog("Watcher video pending payload → bootstrap.");
          bootstrap();
          return;
        }
        if (state.active) go();
      } catch {}
    }, 800);
  }

  const startupControl = consumeToolControlRequest();
  if (startupControl) {
    handleToolControl(startupControl);
  }

  bootstrap();
})();