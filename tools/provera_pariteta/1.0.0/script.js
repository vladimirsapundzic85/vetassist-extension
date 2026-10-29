// ==UserScript==
// @name         AIRS – Provera pariteta (VetAssist)
// @namespace    vetassist-successor-parity
// @version      1.1.2
// @description  VetAssist verzija alata za proveru pariteta: auto-start, TM scraping mehanika, XLS eksport, završni panel.
// @match        https://airsso.vet.minpolj.gov.rs/pls/aimcs_prod/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  "use strict";

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_provera_pariteta_loaded_v112) {
    console.log("VetAssist tool already loaded: provera_pariteta v1.1.2");
    return;
  }
  root.__vetassist_provera_pariteta_loaded_v112 = true;

  console.log("VetAssist tool loaded: provera_pariteta v1.1.2");

  const TOOL_CODE = "provera_pariteta";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";
  const COMPLETION_PANEL_ID = "vetassist-provera-pariteta-complete-panel";

  const SS_KEY = "vetassist_provera_pariteta_v112";
  const FORM_URL = "/pls/aimcs_prod/W_SUCCESSOR.STARTUP";

  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => new Date().toLocaleTimeString("sr-RS");
  const pad2 = (n) => String(n).padStart(2, "0");

  const ST = Object.assign({
    active: false,
    phase: "",
    idx: 0,
    rows: [],
    results: [],
    log: [],
    delay: 450,
    timeoutSec: 5,
    selPrefix: "",
    selId: "",
    selSubmit: "",
    rawInput: "",
    debug: false,
    globalFirstCalvingDate: "",
    _exported: false,
    _runId: null
  }, JSON.parse(sessionStorage.getItem(SS_KEY) || "{}"));

  const save = () => sessionStorage.setItem(SS_KEY, JSON.stringify(ST));

  function clearPendingStartPayload() {
    try {
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || "{}");
      delete all[TOOL_CODE];
      sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
    } catch {}
  }

  function getPendingStartPayload() {
    try {
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || "{}");
      return all[TOOL_CODE] || null;
    } catch {
      return null;
    }
  }

  function clearActiveTool() {
    try { sessionStorage.removeItem(ACTIVE_TOOL_KEY); } catch {}
  }

  function removeReturnButton() {
    try {
      const btn =
        document.getElementById(RETURN_BTN_ID) ||
        window.top.document.getElementById(RETURN_BTN_ID);
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
      if (d.getElementById("vetassist-provera-pariteta-complete-styles")) return;

      const style = d.createElement("style");
      style.id = "vetassist-provera-pariteta-complete-styles";
      style.textContent = `
        #${COMPLETION_PANEL_ID}{
          position:fixed;top:120px;right:18px;width:400px;z-index:2147483647;
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

      const box = d.createElement("div");
      box.id = COMPLETION_PANEL_ID;
      box.innerHTML =
        `<div class="va-head">VetAssist — završeno</div>
         <div class="va-body">
           <div class="va-ok"><b>Obrada je uspešno završena.</b></div>
           <div class="va-meta">
             <div class="va-row">Obrađena grla: <b>${summary.rowCount}</b></div>
             <div class="va-row">Poklapanja pariteta: <b>${summary.matchCount}</b></div>
             <div class="va-row">Nepoklapanja: <b>${summary.noMatchCount}</b></div>
             <div class="va-row">Fajl: <b>${summary.fileName || "-"}</b></div>
             <div class="va-row">Vreme završetka: <b>${summary.finishedAt || "-"}</b></div>
           </div>
           <div class="va-actions">
             <button id="va-pp-back" class="va-btn va-btn-primary">Nazad na alate</button>
             <button id="va-pp-close" class="va-btn">Zatvori</button>
           </div>
         </div>`;
      d.documentElement.appendChild(box);

      box.querySelector("#va-pp-back")?.addEventListener("click", () => {
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector("#va-pp-close")?.addEventListener("click", () => {
        removeCompletionPanel();
      });
    } catch (e) {
      console.error("Completion panel failed", e);
    }
  }

  function ensureAutoPick() {
    ST.selPrefix = 'input[name="p_state"]';
    ST.selId = 'input[name="p_id_animal"]';
    ST.selSubmit = 'input[name="p_submit"], input[type="submit"], input[type="button"], button';
    save();
  }

  const setStatus = (t) => {
    const n = $("#sc-status");
    if (n) n.textContent = "Status: " + t;
    save();
  };

  function log(m) {
    ST.log.push(`[${now()}] ${m}`);
    if (ST.log.length > 3000) ST.log.shift();
    save();

    const ta = $("#sc-log");
    if (ta) {
      ta.value = ST.log.join("\n");
      ta.scrollTop = ta.scrollHeight;
    }
  }

  const validTargetRaw = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim()) ||
    /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/.test(String(s || "").trim());

  function normalizeTarget(s) {
    s = String(s || "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/.exec(s);
    if (!m) return s;
    return `${pad2(+m[1])}.${pad2(+m[2])}.${+m[3]}`;
  }

  function toDate(s) {
    s = String(s || "").trim();
    if (!s) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    }

    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    const m2 = /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/.exec(s);
    if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);

    return null;
  }

  function normalizeIdString(s) {
    s = String(s).trim();
    const sci = /^(\d+(?:[.,]\d+)?)e\+?(\d+)$/i.exec(s);
    if (sci) {
      const mant = sci[1].replace(",", ".");
      const exp = +sci[2];
      const parts = mant.split(".");
      const ints = parts[0];
      const decs = (parts[1] || "");
      const zeros = Math.max(0, exp - decs.length);
      return (ints + decs + "0".repeat(zeros)).replace(/^0+/, "") || "0";
    }
    return s.replace(/\D+/g, "");
  }

  function smartSplit(line) {
    let s = String(line || "").trim();
    if (!s) return [];
    s = s.replace(/\u00A0/g, " ");
    if (/[;,]/.test(s) || /\t/.test(s)) {
      const sep = /;/.test(s) ? ";" : (/\t/.test(s) ? "\t" : ",");
      return s.split(sep).map((x) => x.trim()).filter(Boolean);
    }
    return s.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  }

  function parseTextarea(text) {
    const lines = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const out = [];

    for (const l of lines) {
      const cols = smartSplit(l);
      if (cols.length < 3) {
        log(`Preskačem (manje od 3 polja): "${l}"`);
        continue;
      }

      const isParity = (v) => /^\d{1,2}$/.test(String(v || "").trim());
      let prefix = "", idRaw = "", parRaw = "";

      if (isParity(cols[0]) && !isParity(cols[1]) && !isParity(cols[2])) {
        parRaw = cols[0];
        prefix = cols[1];
        idRaw = cols[2];
      } else {
        prefix = cols[0];
        idRaw = cols[1];
        parRaw = cols[2];
      }

      const id = normalizeIdString(idRaw);
      const expected = +parRaw;

      if (!prefix || !id) {
        log(`Preskačem (prefix/id): "${l}"`);
        continue;
      }
      if (!(expected >= 0 && expected <= 30)) {
        log(`Preskačem (paritet 0–30): "${l}"`);
        continue;
      }

      out.push({
        prefix: String(prefix).trim(),
        id,
        expected
      });
    }

    return out;
  }

  function getRunId() {
    try {
      if (window.top.__AIRS_RUN_ID) {
        ST._runId = window.top.__AIRS_RUN_ID;
        save();
        return ST._runId;
      }
    } catch {}
    if (!ST._runId) {
      ST._runId = "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
      try { window.top.__AIRS_RUN_ID = ST._runId; } catch {}
      save();
    }
    return ST._runId;
  }

  function allowExportOnce() {
    const runId = getRunId();
    try {
      if (window.top.__AIRS_EXPORT_DONE) return false;
      const g = localStorage.getItem("airs_exported_global");
      if (g === "1") return false;
    } catch {}
    if (ST._exported) return false;
    try { if (window.top.__AIRS_EXPORTED_RUNID === runId) return false; } catch {}
    try { if (localStorage.getItem("airs_exported_" + runId) === "1") return false; } catch {}

    ST._exported = true;
    save();
    try { window.top.__AIRS_EXPORTED_RUNID = runId; } catch {}
    try { localStorage.setItem("airs_exported_" + runId, "1"); } catch {}
    return true;
  }

  function finishExportMark() {
    try { window.top.__AIRS_EXPORT_DONE = true; } catch {}
    try { localStorage.setItem("airs_exported_global", "1"); } catch {}
  }

  function downloadBinary(blob, filename) {
    if (!allowExportOnce()) {
      log("Auto-izvoz: preskočen (guard)");
      return "";
    }
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
      finishExportMark();
    }, 800);
    return filename;
  }

  function exportXLS(rows) {
    const globalDate = ST.globalFirstCalvingDate ? normalizeTarget(ST.globalFirstCalvingDate) : "";
    const checkEnabled = !!(globalDate && validTargetRaw(globalDate) && toDate(globalDate));

    const esc = (v) => String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const th = (t) => `<th style="border:1px solid #ccc;padding:4px;background:#f5f5f5;text-align:left">${esc(t)}</th>`;
    const td = (t, { warn = false } = {}) => {
      const base = "border:1px solid #ddd;padding:4px;";
      const st = warn ? base + "color:#c00;font-weight:700;background:#ffecec" : base;
      return `<td style="${st}">${esc(t)}</td>`;
    };

    const head = `<tr>
  ${th("Predznak")}${th("ID broj grla")}
  ${th("Očekivani paritet")}${th("Utvrđeni paritet")}
  ${th("Poklapanje pariteta")}
  ${th("Redni broj potomaka")}
  ${th("Datumi svih telenja")}
  ${th("Zadati datum prvog telenja")}
  ${th("Prvi paritet na ili posle zadatog datuma")}
  ${th("Datum prvog telenja")}
</tr>`;

    const body = (rows || []).map((r) => {
      const warnParity = String(r.matchParity || "") === "NE";
      const warnDate = checkEnabled && String(r.firstAfterGlobal || "") === "NE";
      const warnAny = warnParity || warnDate;

      return `<tr>
        ${td(r.prefix || "")}
        ${td(r.id || "", { warn: warnAny })}
        ${td(r.expected ?? "")}
        ${td(r.foundParity ?? "", { warn: warnParity })}
        ${td(r.matchParity || "", { warn: warnParity })}
        ${td(r.codes || "", { warn: warnAny })}
        ${td(r.twins || "", { warn: warnAny })}
        ${td(globalDate || "")}
        ${td(r.firstAfterGlobal || "", { warn: warnDate })}
        ${td(r.firstParityDate || "", { warn: warnDate })}
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      </head><body>
      <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px">
        ${head}${body}
      </table></body></html>`;

    return new Blob([html], { type: "application/vnd.ms-excel" });
  }

  function pushRes(row, extra) {
    ST.results.push({
      prefix: row.prefix,
      id: row.id,
      expected: row.expected,
      foundParity: extra.foundParity ?? "",
      matchParity: extra.matchParity ?? "NE",
      codes: extra.codes ?? "",
      twins: extra.twins ?? "",
      firstAfterGlobal: extra.firstAfterGlobal ?? "",
      firstParityDate: extra.firstParityDate ?? ""
    });
    save();
  }

  function allDocs() {
    const docs = [document];
    try {
      const walk = (w) => {
        for (let i = 0; i < w.frames.length; i++) {
          const f = w.frames[i];
          try {
            if (f.document) {
              docs.push(f.document);
              walk(f);
            }
          } catch {}
        }
      };
      walk(window.top);
    } catch {}
    return [...new Set(docs)];
  }

  function findSubmit(d) {
    if (ST.selSubmit) {
      try {
        const el = d.querySelector(ST.selSubmit);
        if (el) return el;
      } catch {}
    }
    const candidates = [...d.querySelectorAll('button, input[type="submit"], input[type="button"], input[name="p_submit"]')];
    let btn = candidates.find((el) => /potvrdi/i.test(el.value || el.textContent || "")) || null;
    if (!btn) btn = candidates[0] || null;
    return btn;
  }

  function findFormInDocs() {
    for (const d of allDocs()) {
      try {
        const inpPrefix = ST.selPrefix ? d.querySelector(ST.selPrefix) : d.querySelector('input[name="p_state"]');
        const inpId = ST.selId ? d.querySelector(ST.selId) : d.querySelector('input[name="p_id_animal"]');
        if (inpPrefix && inpId) {
          const form = inpPrefix.closest("form") || inpId.closest("form") || (d.forms ? d.forms[0] : null);
          if (form) {
            const btn = findSubmit(d);
            return { doc: d, form, inpPrefix, inpId, btn };
          }
        }
      } catch {}
    }
    return null;
  }

  function isOnFormPage() {
    try {
      const href = String(window.top.location.href || "").toLowerCase();
      const path = String(window.top.location.pathname || "").toLowerCase();
      return href.includes("/w_successor.startup") || path.includes("w_successor.startup");
    } catch {
      try {
        const href = String(location.href || "").toLowerCase();
        return href.includes("/w_successor.startup");
      } catch {
        return false;
      }
    }
  }

  async function ensureForm(testOnly = false) {
    // Ako smo već na pravoj stranici, traži formu normalno.
    if (isOnFormPage()) {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const pack = findFormInDocs();
        if (pack) return pack;
        if (testOnly) return null;
        await sleep(350);
      }
      return null;
    }

    // Ako nije prava stranica i radi se samo test selektora, ne navigiraj.
    if (testOnly) return null;

    // Nismo na W_SUCCESSOR.STARTUP: pređi na pravu stranicu i prekini ovaj ciklus.
    // Važno: ovo NIJE neuspešan rezultat za trenutno grlo.
    // Posle učitavanja stranice bootstrapAutoStart() nastavlja ISTI idx iz sessionStorage-a.
    log("Nisam na stranici za potomstvo po majci → prelazim na W_SUCCESSOR.STARTUP...");
    try {
      window.top.location.href = FORM_URL;
    } catch {
      try { location.href = FORM_URL; } catch {}
    }

    return { navigating: true };
  }

  function realClick(el) {
    if (!el) return;
    const ev = (type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    el.focus();
    ev("mousedown");
    ev("mouseup");
    ev("click");
  }

  async function submitForm(prefix, id) {
    const pack = await ensureForm();

    if (pack && pack.navigating) {
      log("Navigacija ka formi je pokrenuta; trenutno grlo se NE upisuje kao neuspešno.");
      return "NAVIGATING";
    }

    if (!pack) {
      if (!isOnFormPage()) {
        log("Navigacija ka formi je pokrenuta; obrada će se nastaviti posle učitavanja stranice.");
        return "NAVIGATING";
      }
      log("Forma nije pronađena na W_SUCCESSOR.STARTUP (probaj Auto-pick ili Test).");
      return false;
    }

    const { form, inpPrefix, inpId, btn } = pack;

    const typeWrite = (el, val) => {
      el.focus();
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    typeWrite(inpPrefix, String(prefix).trim());
    typeWrite(inpId, String(id));
    log(`Uneto: PREFIX=${prefix}, ID=${id}`);
    await sleep(ST.delay);

    try {
      if (btn) {
        realClick(btn);
        log("realClick(POTVRDI) poslat");
      } else if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
        log("form.requestSubmit() poslat");
      } else if (typeof form.submit === "function") {
        form.submit();
        log("form.submit() poslat");
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        log("submit event dispatch");
      }
    } catch (e) {
      log("submit exception: " + e);
    }

    setTimeout(() => {
      if (ST.active && ST.phase === "scan") {
        log("Kick nakon submit-a → go()");
        go();
      }
    }, 800);

    return true;
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || "")
      .replace(/\u00A0/g, " ")
      .replace(/\r\n/g, "\n");
  }

  function normalizeBirthDate(raw) {
    raw = String(raw || "").trim();
    const m = /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2}|\d{4})$/.exec(raw);
    if (!m) return null;

    const d = +m[1];
    const mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2099) return null;

    return `${pad2(d)}.${pad2(mo)}.${y}`;
  }

  function extractBirthDateFromLine(line) {
    const m = /\b(?:ro[đdj]en|rođen|roden|ро[ђд]ен)\s*:\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/i.exec(line);
    if (m) return normalizeBirthDate(m[1]);

    const m2 = /(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/.exec(line);
    if (m2) return normalizeBirthDate(m2[1]);

    return null;
  }

  function getScanRoots(d) {
    const roots = new Set();

    d.querySelectorAll("table").forEach((tbl) => {
      try {
        const hasCodeRow = [...tbl.querySelectorAll("tr")].some((tr) => {
          const t = tr.cells && tr.cells[0] ? textOf(tr.cells[0]) : textOf(tr);
          return /^\s*\d{3}\b/.test(t);
        });
        if (hasCodeRow) roots.add(tbl);
      } catch {}
    });

    if (!roots.size && d.body) roots.add(d.body);

    return [...roots];
  }

  async function waitParity(timeoutSec, prefix, wantedId) {
    const wanted = String(wantedId).replace(/\D+/g, "");
    const deadline = Date.now() + Math.max(3000, timeoutSec * 1000);
    const POLL_STEP_MS = 320;

    const reCode = /^\s*(\d{3})\b/;
    const reMother = new RegExp(String.raw`\b(?:Majka|МАЈКА)\s*:\s*${prefix}\s*${wanted}\b`, "i");

    while (Date.now() < deadline) {
      let dates = [];
      let codes = [];

      for (const d of allDocs()) {
        try {
          const roots = getScanRoots(d);
          if (!roots.length) continue;

          for (const rootEl of roots) {
            const bigTxt = textOf(rootEl);
            if (!bigTxt) continue;

            const lines = bigTxt.split("\n").map((x) => x.trim()).filter(Boolean);

            for (const line of lines) {
              const mc = reCode.exec(line);
              if (!mc) continue;

              const code = +mc[1];
              if (!(code >= 1 && code <= 99)) continue; // 001–099

              if (/(?:Majka|МАЈКА)\s*:/i.test(line) && !reMother.test(line)) continue;

              const bd = extractBirthDateFromLine(line);
              if (bd) {
                dates.push(bd);
                codes.push(mc[1]);
              } else if (ST.debug) {
                log(`DEBUG: nema datuma u liniji code=${mc[1]} line="${line.slice(0, 180)}"`);
              }
            }
          }
        } catch {}
      }

      if (dates.length) {
        const uniqDates = [...new Set(dates)];
        uniqDates.sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          return new Date(pa[2], pa[1] - 1, pa[0]) - new Date(pb[2], pb[1] - 1, pb[0]);
        });

        const uniqCodes = [...new Set(codes)];
        uniqCodes.sort();

        return { parity: uniqDates.length, uniqueDates: uniqDates, codes: uniqCodes };
      }

      await sleep(POLL_STEP_MS);
    }

    return { parity: 0, uniqueDates: [], codes: [] };
  }

  let GO_LOCK = false;
  let AUTO_KICK_INTERVAL = null;

  async function nextAndForm() {
    ST.idx++;
    ST.phase = "enter";
    save();
    try { window.top.location.href = FORM_URL; } catch {}
    setTimeout(() => {
      if (ST.active) {
        log("Kick: povratak na formu → go()");
        go();
      }
    }, 800);
  }

  async function finishRun() {
    ST.active = false;
    save();

    if (AUTO_KICK_INTERVAL) {
      clearInterval(AUTO_KICK_INTERVAL);
      AUTO_KICK_INTERVAL = null;
    }

    let fileName = "";
    if (ST.results.length) {
      const blob = exportXLS(ST.results);
      fileName = downloadBinary(blob, `AIRS_paritet_${new Date().toISOString().slice(0, 10)}.xls`) || "";
      if (fileName) {
        setStatus("Gotovo (XLS preuzet)");
        log("Kraj: export urađen.");
      } else {
        setStatus("Gotovo (export preskočen – guard)");
        log("Kraj: export preskočen (guard).");
      }
    } else {
      setStatus("Gotovo (nema rezultata)");
      log("Kraj: nema rezultata.");
    }

    clearPendingStartPayload();
    clearActiveTool();
    removeReturnButton();

    const matchCount = (ST.results || []).filter((r) => String(r.matchParity || "") === "DA").length;
    const noMatchCount = (ST.results || []).filter((r) => String(r.matchParity || "") !== "DA").length;

    showCompletionPanel({
      rowCount: (ST.results || []).length,
      matchCount,
      noMatchCount,
      fileName,
      finishedAt: new Date().toLocaleTimeString("sr-RS")
    });
  }

  async function go() {
    if (!ST.active) return;
    if (GO_LOCK) return;
    GO_LOCK = true;

    try {
      if (ST.idx >= ST.rows.length) {
        await finishRun();
        return;
      }

      const row = ST.rows[ST.idx];

      if (ST.phase === "enter") {
        const ok = await submitForm(row.prefix, row.id);

        if (ok === "NAVIGATING") {
          // Ne upisuj rezultat i ne pomeraj idx.
          // Ovaj isti red mora ponovo da se obradi posle reload-a na W_SUCCESSOR.STARTUP.
          log(`Čekam učitavanje potrebne stranice; ostajem na istom grlu idx=${ST.idx + 1}/${ST.rows.length}.`);
          return;
        }

        if (!ok) {
          pushRes(row, {
            foundParity: "",
            matchParity: "NE",
            twins: "(NO_FORM)",
            codes: "",
            firstAfterGlobal: ST.globalFirstCalvingDate ? "NE" : "",
            firstParityDate: ""
          });
          await nextAndForm();
          return;
        }
        ST.phase = "scan";
        save();
      }

      if (ST.phase === "scan") {
        log("scanParity: start");

        const scan = await waitParity(ST.timeoutSec, row.prefix, row.id);

        const foundParity = scan.parity;
        const matchParity = (foundParity === row.expected) ? "DA" : "NE";
        const firstParityDate = (scan.uniqueDates && scan.uniqueDates.length) ? scan.uniqueDates[0] : "";

        let firstAfterGlobal = "";
        if (ST.globalFirstCalvingDate) {
          const t = toDate(ST.globalFirstCalvingDate);
          const f = firstParityDate ? toDate(firstParityDate) : null;
          if (!t || !f) {
            firstAfterGlobal = "NE";
          } else {
            f.setHours(0, 0, 0, 0);
            t.setHours(0, 0, 0, 0);
            firstAfterGlobal = (f.getTime() >= t.getTime()) ? "DA" : "NE";
          }
        }

        ST.results.push({
          prefix: row.prefix,
          id: row.id,
          expected: row.expected,
          foundParity,
          matchParity,
          codes: (scan.codes && scan.codes.length) ? scan.codes.join(",") : "",
          twins: (scan.uniqueDates && scan.uniqueDates.length) ? scan.uniqueDates.join(" | ") : "",
          firstAfterGlobal,
          firstParityDate
        });
        save();

        log(`Rezultat: ${row.prefix} ${row.id} expP=${row.expected} foundP=${foundParity} matchP=${matchParity} first=${firstParityDate || "(none)"} global=${ST.globalFirstCalvingDate || "(none)"} ok=${firstAfterGlobal || "(n/a)"}`);

        await nextAndForm();
      }
    } finally {
      GO_LOCK = false;
    }
  }

  if (!document.getElementById("sc-panel")) {
    const panel = document.createElement("div");
    panel.id = "sc-panel";
    Object.assign(panel.style, {
      position: "fixed",
      right: "20px",
      top: "20px",
      zIndex: 999999,
      width: "720px",
      background: "#fff",
      border: "1px solid #dcdcdc",
      borderRadius: "12px",
      padding: "12px",
      boxShadow: "0 10px 26px rgba(0,0,0,.18)",
      font: "13px system-ui, Arial",
      display: "none"
    });

    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">AIRS – Provera pariteta (VetAssist)</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <button id="sc-autopick" style="padding:6px 8px">Auto-pick</button>
        <button id="sc-test" style="padding:6px 8px">Test selektora</button>
      </div>

      <div style="display:flex;gap:10px;align-items:center;margin:6px 0;flex-wrap:wrap">
        <label style="font-weight:600">Datum prvog telenja (globalno):</label>
        <input id="sc-global-date" type="text" placeholder="dd.mm.yyyy ili yyyy-mm-dd (ostavi prazno ako ne želiš proveru)"
          value="${(ST.globalFirstCalvingDate || "")}"
          style="width:260px;padding:6px 8px;border:1px solid #ccc;border-radius:8px">
      </div>

      <textarea id="sc-data" rows="9"
        placeholder="PREFIX ID EXPECTED_PARITY&#10;ili&#10;EXPECTED_PARITY PREFIX ID"
        style="width:100%;box-sizing:border-box"></textarea>

      <div style="display:flex;gap:12px;align-items:center;margin:8px 0;flex-wrap:wrap">
        <label>Pauza (ms):</label><input id="sc-delay" type="number" min="250" value="${+ST.delay || 450}" style="width:90px">
        <label>Max čekanje (s):</label><input id="sc-timeout" type="number" min="3" value="${+ST.timeoutSec || 5}" style="width:80px">
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-debug" type="checkbox" ${ST.debug ? "checked" : ""}> Debug
        </label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="sc-start" style="flex:1;padding:8px 10px">Start</button>
        <button id="sc-stop" style="padding:8px 10px">Stop</button>
        <button id="sc-reset" style="padding:8px 10px">Reset</button>
        <button id="sc-xls" style="padding:8px 10px">Excel (.xls)</button>
      </div>

      <div id="sc-status" style="margin-top:8px">Status: ${ST.active ? "u toku…" : "spremno"}</div>
      <textarea id="sc-log" rows="12" readonly
        style="width:100%;box-sizing:border-box;margin-top:6px;background:#fafafa;border:1px solid #eee"></textarea>
    `;

    document.body.appendChild(panel);

    $("#sc-log").value = (ST.log || []).join("\n");
    $("#sc-data").value = ST.rawInput || "";
  }

  $("#sc-autopick").onclick = () => {
    ensureAutoPick();
    log("Auto-pick postavljen (p_state, p_id_animal, p_submit)");
    setStatus("Auto-pick OK");
  };

  $("#sc-test").onclick = async () => {
    const pack = await ensureForm(true);
    log(pack ? "TEST: forma pronađena ✓" : "TEST: forma NIJE pronađena ✗");
  };

  $("#sc-debug").onchange = (e) => {
    ST.debug = e.target.checked;
    save();
  };

  $("#sc-start").onclick = () => {
    removeCompletionPanel();
    ensureAutoPick();

    if (!ST.selPrefix || !ST.selId) {
      setStatus("Odaberi PREDZNAK i ID (ili klikni Auto-pick)");
      return;
    }

    ST.delay = Math.max(250, +$("#sc-delay").value || 450);
    ST.timeoutSec = Math.max(3, +$("#sc-timeout").value || 5);
    ST.rawInput = $("#sc-data").value;

    const gRaw = String($("#sc-global-date")?.value || "").trim();
    ST.globalFirstCalvingDate = gRaw ? normalizeTarget(gRaw) : "";
    save();

    if (ST.globalFirstCalvingDate) {
      if (!validTargetRaw(ST.globalFirstCalvingDate) || !toDate(ST.globalFirstCalvingDate)) {
        setStatus("Globalni datum nije validan (koristi dd.mm.yyyy ili yyyy-mm-dd)");
        log(`ERROR: globalni datum nije validan: "${ST.globalFirstCalvingDate}"`);
        return;
      }
    }

    ST.rows = parseTextarea(ST.rawInput);
    if (!ST.rows.length) {
      setStatus("Nijedan red nije validan");
      save();
      return;
    }

    ST.results = [];
    ST.idx = 0;
    ST.active = true;
    ST.phase = "enter";
    ST._exported = false;

    try {
      if (window.top.__AIRS_RUN_ID) {
        ST._runId = window.top.__AIRS_RUN_ID;
      } else {
        ST._runId = "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
        window.top.__AIRS_RUN_ID = ST._runId;
      }
    } catch {
      ST._runId = "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
    }
    save();

    try { localStorage.removeItem("airs_exported_global"); } catch {}
    try { window.top.__AIRS_EXPORT_DONE = false; } catch {}

    if (AUTO_KICK_INTERVAL) clearInterval(AUTO_KICK_INTERVAL);
    AUTO_KICK_INTERVAL = setInterval(() => {
      try { if (ST.active) go(); } catch {}
    }, 1800);

    log(`Start: redova=${ST.rows.length}, delay=${ST.delay}, timeout=${ST.timeoutSec}, globalDate=${ST.globalFirstCalvingDate || "(none)"}`);
    setStatus("Krećem…");
    go();
  };

  $("#sc-stop").onclick = () => {
    ST.active = false;
    save();
    if (AUTO_KICK_INTERVAL) {
      clearInterval(AUTO_KICK_INTERVAL);
      AUTO_KICK_INTERVAL = null;
    }
    setStatus("Zaustavljeno");
    log("STOP");
  };

  $("#sc-reset").onclick = () => {
    Object.assign(ST, {
      active: false,
      phase: "",
      idx: 0,
      rows: [],
      results: [],
      log: [],
      rawInput: ST.rawInput,
      debug: ST.debug,
      globalFirstCalvingDate: ST.globalFirstCalvingDate,
      _exported: false,
      _runId: ST._runId
    });
    save();
    if (AUTO_KICK_INTERVAL) {
      clearInterval(AUTO_KICK_INTERVAL);
      AUTO_KICK_INTERVAL = null;
    }
    $("#sc-log").value = "";
    setStatus("Reset.");
  };

  $("#sc-xls").onclick = () => {
    if (!ST.results.length) {
      setStatus("Nema rezultata za Excel");
      return;
    }
    const fname = downloadBinary(exportXLS(ST.results), `AIRS_paritet_${new Date().toISOString().slice(0, 10)}.xls`);
    if (!fname) setStatus("Export preskočen (guard)");
  };

  window.VetAssistTools = window.VetAssistTools || {};
  window.VetAssistTools.provera_pariteta = {
    start: function (cfg) {
      try {
        const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || "{}");
        all[TOOL_CODE] = cfg || {};
        sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
      } catch {}

      if ($("#sc-data")) $("#sc-data").value = String(cfg?.rawInput || "");
      if ($("#sc-global-date")) $("#sc-global-date").value = String(cfg?.globalFirstCalvingDate || "");

      if ($("#sc-start")) $("#sc-start").click();
    },
    stop: function () {
      if ($("#sc-stop")) $("#sc-stop").click();
    },
    debugState: function () {
      return JSON.parse(JSON.stringify(ST));
    }
  };

  let bootstrapRan = false;

  function bootstrapAutoStart() {
    if (bootstrapRan) return;
    bootstrapRan = true;

    try {
      if (ST.active && !isOnFormPage()) {
        log("Aktivna obrada, ali nismo na W_SUCCESSOR.STARTUP → prelazim na potrebnu stranicu bez pomeranja idx.");
        try {
          window.top.location.href = FORM_URL;
        } catch {
          try { location.href = FORM_URL; } catch {}
        }
        return;
      }
      $("#sc-log") && ($("#sc-log").value = (ST.log || []).join("\n"));
      $("#sc-data") && ($("#sc-data").value = ST.rawInput || "");
      $("#sc-status") && setStatus(ST.active ? "u toku…" : "spremno");
      $("#sc-global-date") && ($("#sc-global-date").value = ST.globalFirstCalvingDate || "");
      ensureAutoPick();

      const pending = getPendingStartPayload();

      if (!ST.active && pending && String(pending.rawInput || "").trim()) {
        ST.rawInput = String(pending.rawInput || "");
        ST.globalFirstCalvingDate = String(pending.globalFirstCalvingDate || "").trim();

        $("#sc-data") && ($("#sc-data").value = ST.rawInput);
        $("#sc-global-date") && ($("#sc-global-date").value = ST.globalFirstCalvingDate);

        log("Skripta učitana – pending start iz VetAssist panela");
        setTimeout(() => { $("#sc-start") && $("#sc-start").click(); }, 80);
        return;
      }

      if (ST.active) {
        if (AUTO_KICK_INTERVAL) clearInterval(AUTO_KICK_INTERVAL);
        AUTO_KICK_INTERVAL = setInterval(() => {
          try { if (ST.active) go(); } catch {}
        }, 1800);

        log(`Skripta učitana – resume: phase=${ST.phase}, idx=${ST.idx}/${ST.rows.length}`);
        setTimeout(() => { go(); }, 400);
      } else {
        log("Skripta učitana – spremno.");
      }
    } catch {}
  }

  window.addEventListener("load", bootstrapAutoStart);
  if (document.readyState === "complete") {
    setTimeout(bootstrapAutoStart, 30);
  }
})();