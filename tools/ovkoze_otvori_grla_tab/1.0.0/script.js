console.log("VetAssist tool loaded: ovkoze_otvori_grla_tab v1.0.3");

(function () {
  "use strict";

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_ovkoze_otvori_grla_tab_v103_loaded) {
  console.log("VetAssist tool already loaded: ovkoze_otvori_grla_tab v1.0.3 -> rerun allowed");
} else {
  root.__vetassist_ovkoze_otvori_grla_tab_v103_loaded = true;
}

  const TOOL_CODE = "ovkoze_otvori_grla_tab";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";

  const FORM_URL = "/pls/aimcs_prod/w_ov_reg_search.startup";

  const FLOW_KEY = "vetassist_ovkoze_otvori_grla_tab_flow_v103";
  const STEP_KEY = "vetassist_ovkoze_otvori_grla_tab_step_v103";
  const LS_DELAY = "vetassist_ovkoze_otvori_grla_tab_delay_v103";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function safeJsonParse(s, fallback = {}) {
    try { return JSON.parse(s || ""); } catch { return fallback; }
  }

  function normalizePrefix(s) {
    return String(s || "").trim().toUpperCase();
  }

  function normalizeId(s) {
    return String(s || "").replace(/\D+/g, "");
  }

  function smartSplit(line) {
    let s = String(line || "").trim().replace(/\u00A0/g, " ");
    if (!s) return [];
    if (/[;]/.test(s) || /\t/.test(s) || /,/.test(s)) {
      const sep = /;/.test(s) ? ";" : (/\t/.test(s) ? "\t" : ",");
      return s.split(sep).map(x => x.trim()).filter(Boolean);
    }
    return s.split(/\s+/).map(x => x.trim()).filter(Boolean);
  }

  function parseLine(line) {
    const cols = smartSplit(line);
    if (cols.length < 2) return null;

    const prefix = normalizePrefix(cols[0]);
    const id = normalizeId(cols[1]);

    if (!prefix || !id) return null;
    return { prefix, id };
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

  function removeReturnButton() {
    try {
      const btn =
        document.getElementById(RETURN_BTN_ID) ||
        window.top.document.getElementById(RETURN_BTN_ID);
      if (btn) btn.remove();
    } catch {}
  }

  function allDocs() {
    const docs = [];
    try {
      docs.push(document);
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

  function pageLooksLikeResults() {
    for (const d of allDocs()) {
      try {
        const t = String(d.body?.innerText || d.body?.textContent || "").toUpperCase();
        if (t.includes("LISTA POTVRDA") && (t.includes("OVACA") || t.includes("KOZA"))) return true;
        if (t.includes("LISTA POTVRDA")) return true;
      } catch {}
    }
    return false;
  }

  function isOvKozFormContext() {
    for (const d of allDocs()) {
      try {
        const u = String(d.URL || "").toLowerCase();
        if (/w_ov_reg_search\.(startup|query_form|list_form)/i.test(u)) return true;

        const inpP = d.querySelector('input[name="p_state"]');
        const inpI = d.querySelector('input[name="p_id_animal"]');
        if (inpP && inpI) return true;
      } catch {}
    }
    return false;
  }

  function findOvKozFormPack() {
    const selPrefix = 'input[name="p_state"]';
    const selId = 'input[name="p_id_animal"]';
    const selBtn =
      'input[name="p_submit"][value="Nastavi"], input[name="p_submit"], input[value="Nastavi"], button';

    for (const d of allDocs()) {
      try {
        const inpP = d.querySelector(selPrefix);
        const inpI = d.querySelector(selId);
        if (!inpP || !inpI) continue;

        let btn = null;
        try { btn = d.querySelector(selBtn); } catch {}

        if (!btn) {
          btn = Array.from(d.querySelectorAll("button, input")).find((el) => {
            const txt = String(el.value || el.textContent || "").trim().toUpperCase();
            return txt.includes("NASTAVI");
          }) || null;
        }

        const form = inpP.form || inpI.form || btn?.form || null;

        return { doc: d, inpP, inpI, btn, form };
      } catch {}
    }

    return null;
  }

  function typeWrite(el, val) {
    if (!el) return false;
    try {
      el.focus();
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }));
      return true;
    } catch {
      return false;
    }
  }

  function realClick(el) {
    if (!el) return false;
    try {
      const ev = (type) =>
        el.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window
          })
        );
      el.focus();
      ev("mousedown");
      ev("mouseup");
      ev("click");
      return true;
    } catch {
      return false;
    }
  }

  function clearOwnFlow() {
    try {
      sessionStorage.removeItem(FLOW_KEY);
      sessionStorage.removeItem(STEP_KEY);
    } catch {}
  }

  function getOwnFlow() {
    return safeJsonParse(sessionStorage.getItem(FLOW_KEY), null);
  }

  function setOwnFlow(flow) {
    sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow || {}));
  }

  function setOwnStep(step) {
    sessionStorage.setItem(STEP_KEY, String(step));
  }

  function getOwnStep() {
    return Number(sessionStorage.getItem(STEP_KEY) || "0");
  }

  function parseRowsFromPayload(payload) {
    if (!payload) return [];

    if (Array.isArray(payload.rows)) {
      return payload.rows
        .map((r) => {
          if (typeof r === "string") return parseLine(r);
          if (r && typeof r === "object") {
            const prefix = normalizePrefix(r.prefix || "");
            const id = normalizeId(r.id || "");
            if (prefix && id) return { prefix, id };
          }
          return null;
        })
        .filter(Boolean);
    }

    const rawInput =
      String(payload.rawInput || "").trim() ||
      String(payload.rowsText || "").trim();

    if (!rawInput) return [];

    const out = [];
    for (const line of rawInput.split(/\r?\n/)) {
      const row = parseLine(line);
      if (row) out.push(row);
    }
    return out;
  }

  function startTabs(rows) {
    const delay = Math.max(250, Number(localStorage.getItem(LS_DELAY) || "700"));
    const firstOpenDelay = 600;
    let i = 0;

    const openNext = () => {
      if (i >= rows.length) {
        console.log(`[${TOOL_CODE}] finished opening ${rows.length} tabs`);
        return;
      }

      const { prefix, id } = rows[i++];
      const url =
        location.origin +
        FORM_URL +
        "#vp_p=" + encodeURIComponent(prefix) +
        "&vp_id=" + encodeURIComponent(id);

      console.log(`[${TOOL_CODE}] opening tab for: ${prefix} ${id}`);
      window.open(url, "_blank");

      setTimeout(openNext, delay);
    };

    setTimeout(openNext, firstOpenDelay);
  }

  function bootFlowFromHash() {
    try {
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
      const prefix = normalizePrefix(hashParams.get("vp_p") || "");
      const id = normalizeId(hashParams.get("vp_id") || "");

      if (!prefix || !id) return false;

      setOwnFlow({ prefix, id });
      setOwnStep(0);

      history.replaceState(null, "", location.pathname + location.search);
      return true;
    } catch {
      return false;
    }
  }

  function trySubmit(prefix, id) {
    const pack = findOvKozFormPack();
    if (!pack) {
      console.warn(`[${TOOL_CODE}] forma nije pronađena`);
      return false;
    }

    const okP = typeWrite(pack.inpP, prefix);
    const okI = typeWrite(pack.inpI, id);

    if (!okP || !okI) {
      console.warn(`[${TOOL_CODE}] nije uspelo upisivanje u polja`);
      return false;
    }

    console.log(`[${TOOL_CODE}] form doc:`, pack.doc?.URL || "(unknown)");
    console.log(`[${TOOL_CODE}] writing:`, prefix, id);

    // 1) Najstabilnije: requestSubmit
    try {
      if (pack.form && typeof pack.form.requestSubmit === "function") {
        if (pack.btn) {
          pack.form.requestSubmit(pack.btn);
        } else {
          pack.form.requestSubmit();
        }
        console.log(`[${TOOL_CODE}] submitted via form.requestSubmit()`);
        return true;
      }
    } catch (e) {
      console.warn(`[${TOOL_CODE}] requestSubmit failed`, e);
    }

    // 2) Fallback: form.submit
    try {
      if (pack.form && typeof pack.form.submit === "function") {
        pack.form.submit();
        console.log(`[${TOOL_CODE}] submitted via form.submit()`);
        return true;
      }
    } catch (e) {
      console.warn(`[${TOOL_CODE}] form.submit failed`, e);
    }

    // 3) Tek na kraju klik
    if (pack.btn) {
      console.log(`[${TOOL_CODE}] clicking Nastavi`);
      return realClick(pack.btn);
    }

    console.warn(`[${TOOL_CODE}] dugme Nastavi nije pronađeno`);
    return false;
  }

  function runChildFlow() {
    const flow = getOwnFlow();
    const prefix = normalizePrefix(flow?.prefix || "");
    const id = normalizeId(flow?.id || "");
    if (!prefix || !id) return false;

    const delay = Math.max(250, Number(localStorage.getItem(LS_DELAY) || "700"));
    const maxTicks = Math.ceil(45000 / delay);
    let ticks = 0;
    let step = getOwnStep();

    const iv = setInterval(() => {
      ticks++;

      if (pageLooksLikeResults()) {
        console.log(`[${TOOL_CODE}] results detected for ${prefix} ${id}`);
        clearOwnFlow();
        clearInterval(iv);
        return;
      }

      if (step === 0) {
        if (!isOvKozFormContext()) {
          try {
            if (!/w_ov_reg_search\.startup/i.test(String(window.top.location.href || ""))) {
              window.top.location.href = FORM_URL;
            }
          } catch {}
          return;
        }

        if (trySubmit(prefix, id)) {
          step = 1;
          setOwnStep(1);
          ticks = 0;
          return;
        }
      } else if (step === 1) {
        // čekamo rezultate, ne submitujemo ponovo
      }

      if (ticks > maxTicks) {
        console.warn(`[${TOOL_CODE}] timeout za ${prefix} ${id}`);
        clearOwnFlow();
        clearInterval(iv);
      }
    }, delay);

    document.title = `AIRS OV/KOZ • ${prefix} ${id}`;
    return true;
  }

  function resetTool() {
    clearOwnFlow();
    clearPendingStartPayload();
    clearActiveTool();
    removeReturnButton();
    console.log(`[${TOOL_CODE}] reset`);
  }

  // kontrola iz content.js
  try {
    window.top.addEventListener("vetassist-tool-control", (e) => {
      const detail = e?.detail || {};
      if (detail.tool !== TOOL_CODE) return;
      if (detail.action === "reset") {
        resetTool();
      }
    });
  } catch {}

  const pending = getPendingStartPayload();

  bootFlowFromHash();

  if (getOwnFlow()) {
    runChildFlow();
    return;
  }

  if (pending) {
    const rows = parseRowsFromPayload(pending);

    clearPendingStartPayload();

    if (!rows.length) {
      console.warn(`[${TOOL_CODE}] payload postoji ali nema validnih redova`);
      clearActiveTool();
      removeReturnButton();
      return;
    }

    // NAMERNO ne diramo parent tab.
    // Parent ostaje gde jeste; child tabovi sami rade flow.
    startTabs(rows);
    return;
  }

  console.log(`[${TOOL_CODE}] idle (no payload, no flow)`);
})();