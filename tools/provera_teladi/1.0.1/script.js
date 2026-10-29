console.log("VetAssist tool loaded: provera_teladi v1.0.1");

(function () {
  "use strict";

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_provera_teladi_v101_loaded) {
    console.log("VetAssist tool already loaded: provera_teladi v1.0.1");
    return;
  }
  root.__vetassist_provera_teladi_v101_loaded = true;

  const TOOL_CODE = "provera_teladi";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";
  const COMPLETION_PANEL_ID = "vetassist-provera-teladi-complete-panel";

  const SS_KEY = "vetassist_provera_teladi_state_v101";
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
    timeoutSec: 3,
    selPrefix: "",
    selId: "",
    selSubmit: "",
    rawInput: "",
    includeDesc: false,
    debug: false,
    doubleCheck: true,
    dcFactor: 1.6,
    dcMode: "idle",
    dcTriedIdx: -1,
    dcPending: null,
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
      if (d.getElementById("vetassist-provera-teladi-complete-styles")) return;

      const style = d.createElement("style");
      style.id = "vetassist-provera-teladi-complete-styles";
      style.textContent = `
        #${COMPLETION_PANEL_ID}{
          position:fixed;top:120px;right:18px;width:380px;z-index:2147483647;
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
             <div class="va-row">Nađena telad: <b>${summary.foundCount}</b></div>
             <div class="va-row">Bez teladi: <b>${summary.noCalvesCount}</b></div>
             <div class="va-row">Fajl: <b>${summary.fileName || "-"}</b></div>
             <div class="va-row">Vreme završetka: <b>${summary.finishedAt || "-"}</b></div>
           </div>
           <div class="va-actions">
             <button id="va-ptel-back" class="va-btn va-btn-primary">Nazad na alate</button>
             <button id="va-ptel-close" class="va-btn">Zatvori</button>
           </div>
         </div>`;

      d.documentElement.appendChild(box);

      box.querySelector("#va-ptel-back")?.addEventListener("click", () => {
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector("#va-ptel-close")?.addEventListener("click", () => {
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

  if (!document.getElementById("sc-panel")) {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "fixed",
      right: "20px",
      top: "20px",
      zIndex: 999999,
      width: "640px",
      background: "#fff",
      border: "1px solid #dcdcdc",
      borderRadius: "12px",
      padding: "12px",
      boxShadow: "0 10px 26px rgba(0,0,0,.18)",
      font: "13px system-ui, Arial"
    });

    panel.id = "sc-panel";
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">AIRS – Provera teladi (VetAssist)</div>
      <textarea id="sc-data" rows="9" placeholder="PREFIX ; ID&#10;RS ; 7145048964" style="width:100%;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:12px;align-items:center;margin:8px 0;flex-wrap:wrap">
        <label>Pauza (ms):</label><input id="sc-delay" type="number" min="150" value="${+ST.delay || 450}" style="width:90px">
        <label>Max čekanje (s):</label><input id="sc-timeout" type="number" min="2" value="${+ST.timeoutSec || 3}" style="width:80px">
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-debug" type="checkbox" ${ST.debug ? "checked" : ""}> Debug
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-dc" type="checkbox" ${ST.doubleCheck ? "checked" : ""}> Double-check
        </label>
        <label>DC faktor:</label><input id="sc-dcf" type="number" step="0.1" min="1.1" value="${+ST.dcFactor || 1.6}" style="width:70px">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="sc-start" style="flex:1;padding:8px 10px">Start</button>
        <button id="sc-stop"  style="padding:8px 10px">Stop</button>
        <button id="sc-reset" style="padding:8px 10px">Reset</button>
        <button id="sc-xls"   style="padding:8px 10px">Excel (.xls)</button>
      </div>
      <div id="sc-status" style="margin-top:8px">Status: ${ST.active ? "u toku…" : "spremno"}</div>
      <textarea id="sc-log" rows="12" readonly style="width:100%;box-sizing:border-box;margin-top:6px;background:#fafafa;border:1px solid #eee"></textarea>
    `;

    panel.style.display = "none";
    document.body.appendChild(panel);

    $("#sc-log").value = (ST.log || []).join("\n");
    $("#sc-data").value = ST.rawInput || "";
  }

  $("#sc-debug").onchange = (e) => {
    ST.debug = e.target.checked;
    save();
  };

  $("#sc-dc").onchange = (e) => {
    ST.doubleCheck = e.target.checked;
    save();
  };

  $("#sc-dcf").onchange = (e) => {
    const v = Math.max(1.1, +e.target.value || 1.6);
    ST.dcFactor = v;
    save();
    log("DC faktor = " + v);
  };

  function normalizeIdString(s) {
    s = String(s || "").trim();
    const sci = /^(\d+(?:[.,]\d+)?)e\+?(\d+)$/i.exec(s);
    if (sci) {
      const mant = sci[1].replace(",", ".");
      const exp = +sci[2];
      const parts = mant.split(".");
      const ints = parts[0];
      const decs = parts[1] || "";
      const zeros = Math.max(0, exp - decs.length);
      return (ints + decs + "0".repeat(zeros)).replace(/^0+/, "") || "0";
    }
    return s.replace(/\D+/g, "");
  }

  function parseTextarea(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const out = [];

    for (const l of lines) {
      const cols = l.split(/[;,\t ]+/).map((s) => s.trim()).filter(Boolean);

      if (cols.length < 2) {
        log(`Preskačem nevalidan red: "${l}"`);
        continue;
      }

      const prefix = String(cols[0] || "").trim().toUpperCase();
      const id = normalizeIdString(cols[1] || "");

      if (!prefix || !id) {
        log(`Preskačem red bez prefix/id: "${l}"`);
        continue;
      }

      out.push({ prefix, id });
    }

    return out;
  }

  function splitDateParts(s) {
    const m = String(s || "").trim().match(/^(\d{1,4})[.\-\/](\d{1,2})[.\-\/](\d{1,4})$/);
    if (!m) return null;
    return [m[1], m[2], m[3]];
  }

  function makeDate(y, m, d) {
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) return null;
    return dt;
  }

  function parseDateFlexible(raw) {
    const parts = splitDateParts(raw);
    if (!parts) return null;

    const a = +parts[0];
    const b = +parts[1];
    const cRaw = parts[2];
    const c = +cRaw;
    const year = cRaw.length === 2 ? 2000 + c : c;

    if (/^\d{4}$/.test(parts[0])) {
      return makeDate(a, b, c);
    }

    if (a > 12 && b >= 1 && b <= 12) {
      return makeDate(year, b, a);
    }

    if (b > 12 && a >= 1 && a <= 12) {
      return makeDate(year, a, b);
    }

    return makeDate(year, b, a);
  }

  function formatDateFull(dt) {
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "";
    return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
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

    try {
      if (window.top.__AIRS_EXPORTED_RUNID === runId) return false;
    } catch {}

    try {
      if (localStorage.getItem("airs_exported_" + runId) === "1") return false;
    } catch {}

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
    const esc = (v) => String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const th = (t) =>
      `<th style="border:1px solid #ccc;padding:4px;background:#f5f5f5;text-align:left">${esc(t)}</th>`;

    const td = (t, { warn = false } = {}) => {
      const base = "border:1px solid #ddd;padding:4px;";
      const st = warn ? base + "color:#c00;font-weight:700;background:#ffecec" : base;
      return `<td style="${st}">${esc(t)}</td>`;
    };

    const headRow =
      `<tr>` +
      th("OZNAKA DRŽAVE") +
      th("ID MAJKE") +
      th("DATUM NAJNOVIJEG TELENJA") +
      th("ID TELETA") +
      th("POL TELETA") +
      th("NAPOMENA") +
      th("STATUS") +
      th("DC") +
      `</tr>`;

    const body = (rows || []).map((r) => {
      const warn = String(r.status || "") !== "OK";
      return `<tr>` +
        td(r.prefix || "") +
        td(r.motherId || "", { warn }) +
        td(r.birthDate || "", { warn }) +
        td(r.calfId || "", { warn }) +
        td(r.sex || "") +
        td(r.note || "") +
        td(r.status || "", { warn }) +
        td(r.dc ? "1" : "") +
        `</tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"></head><body>
<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px">
${headRow}${body}
</table></body></html>`;

    return new Blob([html], { type: "application/vnd.ms-excel" });
  }

  function getAllDocuments() {
    const docs = [];
    const seen = new Set();

    function addDoc(doc) {
      try {
        if (!doc) return;
        if (seen.has(doc)) return;
        seen.add(doc);
        docs.push(doc);
      } catch {}
    }

    function walk(win) {
      try { addDoc(win.document); } catch {}

      try {
        for (let i = 0; i < win.frames.length; i++) {
          walk(win.frames[i]);
        }
      } catch {}

      try {
        const frameEls = win.document.querySelectorAll("frame, iframe");
        frameEls.forEach((el) => {
          try {
            if (el.contentWindow) walk(el.contentWindow);
            else if (el.contentDocument) addDoc(el.contentDocument);
          } catch {}
        });
      } catch {}
    }

    try { walk(window.top); } catch { addDoc(document); }

    return docs;
  }

  let GO_LOCK = false;
  let DC_LOCK = false;

  $("#sc-start").onclick = () => {
    removeCompletionPanel();
    ensureAutoPick();

    ST.delay = Math.max(150, +$("#sc-delay").value || 450);
    ST.timeoutSec = Math.max(2, +$("#sc-timeout").value || 3);
    ST.rawInput = $("#sc-data").value;
    ST.includeDesc = false;
    ST.doubleCheck = $("#sc-dc").checked;
    ST.debug = $("#sc-debug").checked;
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
    ST.dcMode = "idle";
    ST.dcTriedIdx = -1;
    ST.dcPending = null;
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

    log(`Start: redova=${ST.rows.length}, delay=${ST.delay}, timeout=${ST.timeoutSec}, DC=${ST.doubleCheck ? "ON" : "OFF"}`);
    setStatus("Krećem…");
    go();
  };

  $("#sc-stop").onclick = () => {
    ST.active = false;
    save();
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
      doubleCheck: ST.doubleCheck,
      dcFactor: ST.dcFactor,
      dcMode: "idle",
      dcTriedIdx: -1,
      dcPending: null,
      _exported: false,
      _runId: ST._runId
    });

    save();
    $("#sc-log").value = "";
    setStatus("Reset.");
  };

  $("#sc-xls").onclick = () => {
    if (!ST.results.length) {
      setStatus("Nema rezultata za Excel");
      return;
    }

    downloadBinary(exportXLS(ST.results), `AIRS_telad_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  async function go() {
    if (!ST.active) return;

    if (GO_LOCK || ST.dcMode !== "idle") {
      if (ST.dcMode !== "idle") log("go(): DC u toku → skip");
      return;
    }

    GO_LOCK = true;

    try {
      if (ST.idx >= ST.rows.length) {
        ST.active = false;
        save();

        let fileName = "";

        if (ST.results.length) {
          fileName = downloadBinary(exportXLS(ST.results), `AIRS_telad_${new Date().toISOString().slice(0, 10)}.xls`) || "";
          if (ST._exported) log("Auto-izvoz: Excel (.xls) preuzet.");
          setStatus("Gotovo (XLS preuzet)");
        } else {
          setStatus("Gotovo (nema rezultata)");
          log("Kraj obrade – nema rezultata.");
        }

        clearPendingStartPayload();
        clearActiveTool();
        removeReturnButton();

        const foundCount = (ST.results || []).filter((r) => String(r.status || "") === "OK").length;
        const noCalvesCount = (ST.results || []).filter((r) => String(r.status || "") !== "OK").length;

        showCompletionPanel({
          rowCount: (ST.results || []).length,
          foundCount,
          noCalvesCount,
          fileName,
          finishedAt: new Date().toLocaleTimeString("sr-RS")
        });

        return;
      }

      const row = ST.rows[ST.idx];

      if (ST.phase !== "enter" && ST.phase !== "scan") {
        ST.phase = "enter";
        save();
      }

      if (ST.phase === "enter") {
        const ok = await submitForm(row.prefix, row.id);

        if (!ok) {
          log("submitForm: neuspeh");
          pushRes(row, null, "NO_FORM", false);
          return await nextAndForm();
        }
      }

      if (ST.phase === "scan") {
        log("waitCalves: start");
        const calves = await waitCalves(ST.timeoutSec, row.prefix, row.id, { broad: false });

        if ((!calves || !calves.length) && ST.doubleCheck && ST.dcTriedIdx !== ST.idx) {
          ST.dcMode = "armed";
          ST.dcTriedIdx = ST.idx;
          ST.dcPending = { prefix: row.prefix, id: row.id, idx: ST.idx };
          save();
          log("DC: prvi prolaz nema direktne teladi → ARM + resubmit");
          await dcResubmit(row.prefix, row.id);
          return;
        }

        if (!calves || !calves.length) {
          pushRes(row, null, "NEMA_TELADI", true);
          log(`Rezultat: ${row.prefix} ${row.id} → nema direktne teladi`);
          await nextAndForm();
          return;
        }

        const latestGroup = pickLatestCalfGroup(calves);
        pushRes(row, latestGroup, "OK", false);
        log(`Rezultat: ${row.prefix} ${row.id} → ${latestGroup.birthDate} | ${latestGroup.calfId} | ${latestGroup.sex}${latestGroup.note ? " | " + latestGroup.note : ""}`);
        await nextAndForm();
      }
    } finally {
      GO_LOCK = false;
    }
  }

  function pushRes(row, calf, status, dcFlag) {
    ST.results.push({
      prefix: row.prefix,
      motherId: row.id,
      birthDate: calf?.birthDate || "",
      calfId: calf?.calfId || "",
      sex: calf?.sex || "",
      note: calf?.note || "",
      status,
      dc: dcFlag ? "1" : ""
    });
    save();
  }

  function pickLatestCalfGroup(calves) {
    const valid = (calves || [])
      .map((c) => ({
        ...c,
        dateObj: parseDateFlexible(c.birthDate)
      }))
      .filter((c) => c.dateObj);

    const source = valid.length ? valid : (calves || []);

    if (!source.length) {
      return {
        birthDate: "",
        calfId: "",
        sex: "",
        note: ""
      };
    }

    let latestItems = [];

    if (valid.length) {
      valid.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
      const latestTs = valid[0].dateObj.getTime();
      latestItems = valid.filter((c) => c.dateObj.getTime() === latestTs);
    } else {
      latestItems = [source[0]];
    }

    const first = latestItems[0];

    const birthDate = first.dateObj
      ? formatDateFull(first.dateObj)
      : String(first.birthDate || "");

    const calfIds = latestItems
      .map((c) => c.calfId)
      .filter(Boolean);

    const sexes = latestItems
      .map((c) => c.sex)
      .filter(Boolean);

    const note = latestItems.length > 1
      ? `BLIZANAČKO TELENJE (${latestItems.length} teladi)`
      : "";

    return {
      birthDate,
      calfId: calfIds.join(", "),
      sex: sexes.join(", "),
      note
    };
  }

  async function nextAndForm() {
    ST.idx++;
    ST.phase = "enter";
    save();

    try { window.top.location.href = FORM_URL; } catch {}

    setTimeout(() => {
      if (ST.active && ST.dcMode === "idle") {
        log("Kick: povratak na formu → go()");
        go();
      }
    }, 350);
  }

  function getDocUrl(d) {
    try { return String(d.defaultView?.location?.href || ""); } catch { return ""; }
  }

  function docLooksLikeSuccessor(d) {
    try {
      const url = getDocUrl(d).toUpperCase();
      const txt = String(d.body?.innerText || "").toUpperCase();
      return (
        url.includes("/W_SUCCESSOR.STARTUP") ||
        txt.includes("POTOMSTVO ŽIVOTINJE") ||
        txt.includes("POTOMSTVO ZIVOTINJE") ||
        txt.includes("POTOMAK ŽIVOTINJE") ||
        txt.includes("POTOMAK ZIVOTINJE")
      );
    } catch {
      return false;
    }
  }

  function topLooksLikeSuccessor() {
    try {
      const url = String(window.top.location.href || "").toUpperCase();
      const txt = String(window.top.document?.body?.innerText || "").toUpperCase();
      return (
        url.includes("/W_SUCCESSOR.STARTUP") ||
        txt.includes("POTOMSTVO ŽIVOTINJE") ||
        txt.includes("POTOMSTVO ZIVOTINJE") ||
        txt.includes("POTOMAK ŽIVOTINJE") ||
        txt.includes("POTOMAK ZIVOTINJE")
      );
    } catch {
      return false;
    }
  }

  function findSubmit(d) {
    if (ST.selSubmit) {
      try {
        const el = d.querySelector(ST.selSubmit);
        if (el) return el;
      } catch {}
    }

    const candidates = [...d.querySelectorAll('button, input[type="submit"], input[type="button"], input[name="p_submit"]')];

    let btn = candidates.find((el) =>
      /potvrdi|prikaži potomstvo|prikazi potomstvo/i.test(el.value || el.textContent || "")
    ) || null;

    if (!btn) btn = candidates[0] || null;
    return btn;
  }

  function findFormInDocs() {
    for (const d of getAllDocuments()) {
      try {
        if (!docLooksLikeSuccessor(d)) continue;

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

  async function ensureForm(testOnly = false) {
    const deadline = Date.now() + 12000;

    while (Date.now() < deadline) {
      if (!topLooksLikeSuccessor()) {
        if (testOnly) return null;
        try { window.top.location.href = FORM_URL; } catch {}
        await sleep(220);
        continue;
      }

      const pack = findFormInDocs();
      if (pack) return pack;

      if (testOnly) return null;
      await sleep(150);
    }

    return null;
  }

  function realClick(el) {
    if (!el) return;

    const ev = (type) =>
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));

    el.focus();
    ev("mousedown");
    ev("mouseup");
    ev("click");
  }

  async function submitForm(prefix, id) {
    const pack = await ensureForm();

    if (!pack) {
      log("Forma nije pronađena na W_SUCCESSOR");
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
    typeWrite(inpId, String(id).trim());

    log(`Uneto na W_SUCCESSOR: PREFIX=${prefix}, ID=${id}`);

    ST.phase = "scan";
    save();

    await sleep(Math.max(150, ST.delay));

    try {
      if (btn) {
        realClick(btn);
        log("realClick(POTVRDI / PRIKAŽI POTOMSTVO) poslat");
      } else if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
        log("form.requestSubmit() poslat (fallback)");
      } else if (typeof form.submit === "function") {
        form.submit();
        log("form.submit() poslat (fallback)");
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        log("submit event dispatch (fallback)");
      }
    } catch (e) {
      log("submit exception: " + e);
    }

    setTimeout(() => {
      if (ST.active && ST.phase === "scan" && ST.dcMode === "idle") {
        log("Kick nakon submit-a → go()");
        go();
      }
    }, 250);

    return true;
  }

  async function dcResubmit(prefix, id) {
    ST.dcMode = "resubmitted";
    save();

    try { window.top.location.href = FORM_URL; } catch {}
  }

  async function dcResume() {
    if (DC_LOCK) return;
    DC_LOCK = true;

    try {
      if (!ST.active) return;
      if (ST.dcMode !== "resubmitted" && ST.dcMode !== "armed") return;

      const dc = ST.dcPending;

      if (!dc || typeof dc.idx !== "number") {
        log("DC resume: nema dcPending");
        ST.dcMode = "idle";
        ST.dcPending = null;
        save();
        return;
      }

      const ok = await submitForm(dc.prefix, dc.id);

      if (!ok) {
        const row = ST.rows[dc.idx] || { prefix: dc.prefix, id: dc.id };
        pushRes(row, null, "NO_FORM", true);
        log(`Rezultat (DC): ${row.prefix} ${row.id} → NO_FORM`);
        ST.dcMode = "idle";
        ST.dcPending = null;
        save();
        await nextAndForm();
        return;
      }

      ST.phase = "scan";
      ST.idx = dc.idx;
      ST.dcMode = "scanning";
      save();

      log("DC: resume → resubmit urađen, broad sken");
      const dcTimeout = Math.max(2, Math.round((+ST.timeoutSec || 3) * (+ST.dcFactor || 1.6)));
      const calves = await waitCalves(dcTimeout, dc.prefix, dc.id, { broad: true });

      const row = ST.rows[dc.idx] || { prefix: dc.prefix, id: dc.id };

      if (!calves || !calves.length) {
        pushRes(row, null, "NEMA_TELADI", true);
        log(`Rezultat (DC): ${row.prefix} ${row.id} → nema direktne teladi`);
      } else {
        const latestGroup = pickLatestCalfGroup(calves);
        pushRes(row, latestGroup, "OK", true);
        log(`Rezultat (DC): ${row.prefix} ${row.id} → ${latestGroup.birthDate} | ${latestGroup.calfId} | ${latestGroup.sex}${latestGroup.note ? " | " + latestGroup.note : ""}`);
      }

      ST.dcMode = "idle";
      ST.dcPending = null;
      save();

      await nextAndForm();
    } finally {
      DC_LOCK = false;
    }
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || "")
      .replace(/\u00A0/g, " ")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function normalizeSex(s) {
    const v = String(s || "").trim().toUpperCase();

    if (v === "M" || v === "MUŠKI" || v === "MUSKI") return "M";
    if (v === "Ž" || v === "Z" || v === "ŽENSKI" || v === "ZENSKI") return "Ž";

    return v;
  }

  function parseCalvesFromText(txt, motherPrefix, motherId) {
    const out = [];
    const wanted = normalizeIdString(motherId);
    const prefix = String(motherPrefix || "").trim();

    const lines = String(txt || "")
      .replace(/\u00A0/g, " ")
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);

    for (const line of lines) {
      const directMatch = line.match(/^\s*(\d{3})\b/);
      if (!directMatch) continue;

      const orderCode = directMatch[1];

      if (!/^\d{3}$/.test(orderCode)) continue;
      if (orderCode[0] !== "0") continue;

      const motherRe = new RegExp(`Majka\\s*:\\s*${prefix}\\s*${wanted}\\b`, "i");
      if (!motherRe.test(line)) continue;

      const calfMatch = line.match(/^\s*\d{3}\s+([A-ZČĆŽŠĐ]{2,3})?\s*([0-9]{6,})\b/i);
      const dateMatch = line.match(/Ro[đd]en\s*:\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/i);
      const sexMatch = line.match(/Pol\s*:\s*([MŽZ])/i);

      if (!calfMatch || !dateMatch) continue;

      out.push({
        orderCode,
        calfPrefix: (calfMatch[1] || "").trim(),
        calfId: normalizeIdString(calfMatch[2] || ""),
        birthDate: dateMatch[1],
        sex: normalizeSex(sexMatch?.[1] || ""),
        raw: line
      });
    }

    return out;
  }

  async function waitCalves(timeoutSec, prefix, wantedId, opts) {
    opts = opts || {};
    const deadline = Date.now() + Math.max(2000, timeoutSec * 1000);
    const POLL_STEP_MS = 180;

    while (Date.now() < deadline) {
      let found = [];
      let explicitNoData = false;

      for (const d of getAllDocuments()) {
        try {
          if (!docLooksLikeSuccessor(d)) continue;

          const bodyTxt = textOf(d.body || d.documentElement || d);
          if (/\bNEMA PODATAKA\b|\bNIJE PRONAĐEN\b|\bNE POSTOJI\b|НЕ ПОСТОЈИ|НЕМА ПОДАТАКА/.test(bodyTxt.toUpperCase())) {
            explicitNoData = true;
          }

          const calves = parseCalvesFromText(bodyTxt, prefix, wantedId);

          if (calves.length) {
            found.push(...calves);
          }
        } catch {}
      }

      if (found.length) {
        const unique = [];
        const seen = new Set();

        for (const c of found) {
          const key = `${c.orderCode}|${c.calfId}|${c.birthDate}|${c.sex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(c);
        }

        return unique;
      }

      if (explicitNoData) return [];

      await sleep(POLL_STEP_MS);
    }

    return [];
  }

  setInterval(() => {
    try {
      if (ST.active && ST.dcMode === "idle") go();
    } catch {}
  }, 900);

  setInterval(() => {
    try {
      if (ST.active && (ST.dcMode === "resubmitted" || ST.dcMode === "armed")) {
        log("Watchdog: DC resume kick");
        setTimeout(() => { dcResume(); }, 100);
      }
    } catch {}
  }, 700);

  window.VetAssistTools = window.VetAssistTools || {};
  window.VetAssistTools.provera_teladi = {
    start: function (cfg) {
      try {
        const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || "{}");
        all[TOOL_CODE] = cfg || {};
        sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
      } catch {}

      const ta = $("#sc-data");
      if (ta) {
        ta.value = Array.isArray(cfg?.rows) ? cfg.rows.join("\n") : "";
      }

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
      $("#sc-log") && ($("#sc-log").value = (ST.log || []).join("\n"));
      $("#sc-data") && ($("#sc-data").value = ST.rawInput || "");
      $("#sc-status") && setStatus(ST.active ? "u toku…" : "spremno");
      ensureAutoPick();

      const pending = getPendingStartPayload();

      if (!ST.active && pending && Array.isArray(pending.rows) && pending.rows.length) {
        ST.rawInput = pending.rows.join("\n");

        $("#sc-data") && ($("#sc-data").value = ST.rawInput);
        $("#sc-delay") && ($("#sc-delay").value = String(pending.delay || ST.delay || 450));
        $("#sc-timeout") && ($("#sc-timeout").value = String(pending.timeoutSec || ST.timeoutSec || 3));

        if ($("#sc-dc") && typeof pending.doubleCheck === "boolean") {
          $("#sc-dc").checked = pending.doubleCheck;
        }

        if ($("#sc-dcf") && pending.dcFactor) {
          $("#sc-dcf").value = String(pending.dcFactor);
        }

        log("Skripta učitana – pending start iz VetAssist panela");
        setTimeout(() => { $("#sc-start") && $("#sc-start").click(); }, 80);
        return;
      }

      if (ST.active) {
        if (ST.dcMode === "resubmitted" || ST.dcMode === "armed") {
          log(`Skripta učitana – resume (DC mode=${ST.dcMode}), idx=${ST.idx}/${ST.rows.length} → dcResume()`);
          setTimeout(() => { dcResume(); }, 120);
        } else {
          log(`Skripta učitana – resume: phase=${ST.phase}, idx=${ST.idx}/${ST.rows.length}`);
          setTimeout(() => { go(); }, 100);
        }
      } else {
        log("Skripta učitana – spremno.");
      }
    } catch (e) {
      console.error("bootstrapAutoStart error", e);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(bootstrapAutoStart, 20);
  } else {
    window.addEventListener("load", () => setTimeout(bootstrapAutoStart, 20), { once: true });
    document.addEventListener("DOMContentLoaded", () => setTimeout(bootstrapAutoStart, 20), { once: true });
  }
})();