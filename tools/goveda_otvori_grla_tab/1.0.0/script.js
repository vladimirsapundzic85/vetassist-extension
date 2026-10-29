console.log("VetAssist tool loaded: goveda_otvori_grla_tab v1.0.4");

(function () {
  "use strict";

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_goveda_otvori_grla_tab_v104_loaded) {
  console.log("VetAssist tool already loaded: goveda_otvori_grla_tab v1.0.4 -> rerun allowed");
} else {
  root.__vetassist_goveda_otvori_grla_tab_v104_loaded = true;
}

  const TOOL_CODE = "goveda_otvori_grla_tab";
const FORM_URL = "/pls/aimcs_prod/W_ANIMAL_LIST.STARTUP";
const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";

  const FLOW_KEY = "vetassist_goveda_otvori_grla_tab_flow_v104";
  const STEP_KEY = "vetassist_goveda_otvori_grla_tab_step_v104";
  const LS_DELAY = "vetassist_goveda_otvori_grla_tab_delay_v104";

  const digits = (s) => String(s || "").replace(/\D+/g, "");

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
      (function walk(w) {
        try { if (w.document) docs.push(w.document); } catch {}
        try {
          for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]);
        } catch {}
      })(window.top);
    } catch {}
    try { docs.push(document); } catch {}
    return [...new Set(docs)];
  }

  function isAnimalDetailPage() {
    try {
      if (/w_animal.*data_form/i.test(location.href)) return true;
    } catch {}

    return allDocs().some((d) => {
      try {
        const txt = String(d.body?.innerText || d.body?.textContent || "").toUpperCase();
        return txt.includes("PODACI O ŽIVOTINJI");
      } catch {
        return false;
      }
    });
  }

  function findAirsQueryDoc() {
    const docs = allDocs();
    for (const d of docs) {
      try {
        if (String(d.URL || "").toLowerCase().includes("anm_query_form")) {
          return d;
        }
      } catch {}
    }
    return null;
  }

  function findAirsHiddenDoc() {
    const docs = allDocs();
    for (const d of docs) {
      try {
        if (String(d.URL || "").toLowerCase().includes("anm_hidden1")) {
          return d;
        }
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
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
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
          a = Array.from(d.querySelectorAll("a")).find((x) => {
            const href = x.getAttribute("href") || "";
            const txt = x.textContent || "";
            return (
              /w_animal_list(\.|_)anm_data_form/i.test(href) ||
              digits(txt) === idDigits
            );
          });
        }

        if (a) {
          const href = a.href || a.getAttribute("href");
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

  function trySearchById(idDigits) {
    const queryDoc = findAirsQueryDoc();
    if (!queryDoc) {
      console.warn(`[${TOOL_CODE}] anm_query_form nije pronađen`);
      return false;
    }

    const hiddenDoc = findAirsHiddenDoc();

    const input = queryDoc.querySelector('input[name="p_id_animal"]');
    const btn = queryDoc.querySelector('input[name="p_submit"]');

    if (!input || !btn) {
      console.warn(`[${TOOL_CODE}] input[name="p_id_animal"] ili input[name="p_submit"] nisu pronađeni`);
      return false;
    }

    const ok = typeWrite(input, idDigits);
    if (!ok) return false;

    try {
      const stateInput = queryDoc.querySelector('input[name="p_state"]');
      if (stateInput && !String(stateInput.value || "").trim()) {
        stateInput.value = "RS";
        stateInput.dispatchEvent(new Event("input", { bubbles: true }));
        stateInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch {}

    try {
      if (hiddenDoc) {
        const hiddenState = hiddenDoc.querySelector('input[name="p_state"]');
        if (hiddenState && !String(hiddenState.value || "").trim()) {
          hiddenState.value = "RS";
        }
      }
    } catch {}

    console.log(`[${TOOL_CODE}] SEARCH DOC URL:`, queryDoc.URL);
    console.log(`[${TOOL_CODE}] Writing ID:`, idDigits);
    console.log(`[${TOOL_CODE}] Clicking submit in anm_query_form`);

    return realClick(btn);
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

  function parseIdsFromPayload(payload) {
    const rawInput = String(payload?.rawInput || "").trim();
    if (!rawInput) return [];

    return rawInput
      .split(/\r?\n/)
      .map((x) => digits(x.trim()))
      .filter(Boolean);
  }

  function finishParentTab() {
    console.log(`[${TOOL_CODE}] parent tab finished -> clearing active tool and restoring picker`);
    clearActiveTool();
    removeReturnButton();
    clearOwnFlow();
    setTimeout(() => {
      location.reload();
    }, 250);
  }

  function startTabs(ids) {
    const delay = Math.max(150, Number(localStorage.getItem(LS_DELAY) || "220"));
    const firstOpenDelay = 450;
    let i = 0;

    const openNext = () => {
      if (i >= ids.length) {
        finishParentTab();
        return;
      }

      const id = ids[i++];

      const url =
  location.origin +
  FORM_URL +
  "#vetassist_id=" +
  encodeURIComponent(id);

      console.log(`[${TOOL_CODE}] opening tab for ID:`, id);
      window.open(url, "_blank");

      setTimeout(openNext, delay);
    };

    setTimeout(openNext, firstOpenDelay);
  }

  function bootFlowFromHash() {
    try {
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
      const hashId = digits(hashParams.get("vetassist_id") || "");
      if (!hashId) return false;

      setOwnFlow({ id: hashId });
      setOwnStep(0);
      history.replaceState(null, "", location.pathname + location.search);
      return true;
    } catch {
      return false;
    }
  }

  function runChildFlow() {
    const flow = getOwnFlow();
    const id = digits(flow?.id || "");
    if (!id) return false;

    const delay = Math.max(150, Number(localStorage.getItem(LS_DELAY) || "220"));
    const maxTicks = Math.ceil(30000 / delay);
    let ticks = 0;
    let step = getOwnStep();

    const iv = setInterval(() => {
      ticks++;

      if (isAnimalDetailPage()) {
        clearOwnFlow();
        clearInterval(iv);
        return;
      }

      if (step === 0) {
        if (tryOpenAnimal(id)) {
          step = 99;
          ticks = 0;
          return;
        }

        if (trySearchById(id)) {
          step = 1;
          setOwnStep(1);
          ticks = 0;
          return;
        }
      } else if (step === 1) {
        if (tryOpenAnimal(id)) {
          step = 99;
          ticks = 0;
          return;
        }
      }

      if (ticks > maxTicks) {
        console.warn(`[${TOOL_CODE}] timeout za ID ${id}`);
        clearOwnFlow();
        clearInterval(iv);
      }
    }, delay);

    document.title = `AIRS • ${id}`;
    return true;
  }

  const pending = getPendingStartPayload();

  bootFlowFromHash();

  if (getOwnFlow()) {
    runChildFlow();
    return;
  }

  if (pending) {
    const ids = parseIdsFromPayload(pending);

    clearPendingStartPayload();

    if (!ids.length) {
      console.warn(`[${TOOL_CODE}] payload postoji ali nema validnih ID-jeva`);
      clearActiveTool();
      removeReturnButton();
      return;
    }

    startTabs(ids);
    return;
  }

  console.warn(`[${TOOL_CODE}] restore bez payload-a i bez state-a -> gasim alat`);
  clearActiveTool();
  removeReturnButton();
  clearOwnFlow();
})();