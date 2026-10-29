(async function () {
  console.log("VetAssist content loaded");

  const PANEL_ID = "vetassist-tool-picker-panel";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";
  const STATE_KEY = "vetassist_picker_state_v1";
  const PANEL_VISIBILITY_KEY = "vetassist_panel_visibility_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const TOOL_CONTROL_REQUEST_KEY = "vetassist_tool_control_request_v1";
  const TOOL_CONTROL_EVENT = "vetassist-tool-control";
  const TOOL_INPUTS_KEY = "vetassist_tool_inputs_v1";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const SKIP_RESTORE_ONCE_KEY = "vetassist_skip_restore_once_v1";

  let TOOL_REGISTRY = {};
  let LOCAL_TOOL_MANIFEST_CACHE = {};

  const TOOL_ORDER = [
    "vb_zbirni_xlsx",
    "provera_telenja",
    "provera_teladi",
    "hid_bpg_verifikacija",
    "provera_pariteta",
    "goveda_otvori_grla_tab",
    "goveda_pregled_kretanja",
    "ovkoze_otvori_grla_tab",
    "ovkoze_kontrola_evidencije",
    "ovkoze_pedigre_pregled",
    "hid_koordinate_xlsx",
    "goveda_drzavna_zemlja",
  ];

  const TOOL_ORDER_INDEX = TOOL_ORDER.reduce((acc, code, idx) => {
    acc[code] = idx;
    return acc;
  }, {});

  async function loadRegistry() {
    try {
      const url = chrome.runtime.getURL("tools/registry.js");
      const mod = await import(url);
      TOOL_REGISTRY = mod?.TOOL_REGISTRY || {};
    } catch (e) {
      console.error("VetAssist: registry load failed", e);
      TOOL_REGISTRY = {};
    }
  }

  async function fetchLocalToolManifest(toolCode) {
    if (LOCAL_TOOL_MANIFEST_CACHE[toolCode]) {
      return LOCAL_TOOL_MANIFEST_CACHE[toolCode];
    }

    const manifestPath = TOOL_REGISTRY?.[toolCode]?.manifest;
    if (!manifestPath) return null;

    const res = await fetch(chrome.runtime.getURL(manifestPath), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`local_manifest_fetch_failed:${toolCode}:${res.status}`);
    }

    const data = await res.json();

    const normalized = {
      code: String(data?.code || toolCode),
      name: String(data?.name || toolCode),
      version: String(data?.version || ""),
      files: Array.isArray(data?.files)
        ? data.files.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
    };

    if (!normalized.files.length) {
      throw new Error(`local_manifest_no_files:${toolCode}`);
    }

    LOCAL_TOOL_MANIFEST_CACHE[toolCode] = normalized;
    return normalized;
  }

  async function getRegistryFiles(toolCode) {
    const manifest = await fetchLocalToolManifest(toolCode);
    return manifest?.files || [];
  }

  let activeToolLock = false;

  function getTopWindow() {
    try {
      return window.top || window;
    } catch {
      return window;
    }
  }

  function getTopDocument() {
    try {
      return window.top.document || document;
    } catch {
      return document;
    }
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveState(next) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function loadPanelVisibility() {
    try {
      const stored = await chrome.storage.local.get([PANEL_VISIBILITY_KEY]);
      const visibility = stored?.[PANEL_VISIBILITY_KEY];
      if (["open", "minimized", "closed"].includes(visibility)) return visibility;
    } catch {}

    // Jednokratna migracija starog stanja dugmeta "Sakrij".
    const visibility = loadState().minimized ? "minimized" : "open";
    try {
      await chrome.storage.local.set({ [PANEL_VISIBILITY_KEY]: visibility });
    } catch {}
    return visibility;
  }

  async function savePanelVisibility(visibility) {
    try {
      await chrome.storage.local.set({ [PANEL_VISIBILITY_KEY]: visibility });
    } catch {}
  }

  function loadToolInputs() {
    try {
      return JSON.parse(localStorage.getItem(TOOL_INPUTS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveToolInputs(next) {
    try {
      localStorage.setItem(TOOL_INPUTS_KEY, JSON.stringify(next));
    } catch {}
  }

  function getToolInput(toolCode) {
    const all = loadToolInputs();
    return all[toolCode] || {};
  }

  function setToolInput(toolCode, inputObj) {
    const all = loadToolInputs();
    all[toolCode] = Object.assign({}, all[toolCode] || {}, inputObj || {});
    saveToolInputs(all);
  }

  function loadStartPayloads() {
    try {
      return JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveStartPayloads(next) {
    try {
      sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(next));
    } catch {}
  }

  function setPendingStartPayload(toolCode, payload) {
    const all = loadStartPayloads();
    all[toolCode] = payload;
    saveStartPayloads(all);
  }

  function clearPendingStartPayload(toolCode) {
    const all = loadStartPayloads();
    delete all[toolCode];
    saveStartPayloads(all);
  }

  function clearAllPendingStartPayloads() {
    try {
      sessionStorage.removeItem(START_PAYLOADS_KEY);
    } catch {}
  }

  function getActiveTool() {
    try {
      return sessionStorage.getItem(ACTIVE_TOOL_KEY) || "";
    } catch {
      return "";
    }
  }

  function setActiveTool(code) {
    try {
      if (code) sessionStorage.setItem(ACTIVE_TOOL_KEY, code);
      else sessionStorage.removeItem(ACTIVE_TOOL_KEY);
    } catch {}
  }

  function isActiveToolLocked() {
    return activeToolLock === true;
  }

  function setActiveToolLock(value) {
    activeToolLock = !!value;
  }

  function setSkipRestoreOnce(toolCode) {
    try {
      sessionStorage.setItem(
        SKIP_RESTORE_ONCE_KEY,
        JSON.stringify({
          tool: toolCode || "",
          ts: Date.now(),
        })
      );
    } catch {}
  }

  function consumeSkipRestoreOnce(toolCode) {
    try {
      const raw = sessionStorage.getItem(SKIP_RESTORE_ONCE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);
      sessionStorage.removeItem(SKIP_RESTORE_ONCE_KEY);

      return !!(data?.tool && data.tool === toolCode);
    } catch {
      try {
        sessionStorage.removeItem(SKIP_RESTORE_ONCE_KEY);
      } catch {}
      return false;
    }
  }

  function clearSkipRestoreOnce() {
    try {
      sessionStorage.removeItem(SKIP_RESTORE_ONCE_KEY);
    } catch {}
  }

  function shouldRestoreActiveToolOnThisTab(activeToolCode) {
    const hash = String(location.hash || "");

    if (activeToolCode === "goveda_otvori_grla_tab") {
      return /vetassist_id=/i.test(hash);
    }

    if (activeToolCode === "ovkoze_otvori_grla_tab") {
      return /vp_p=/i.test(hash) && /vp_id=/i.test(hash);
    }

    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseHids(text) {
    return String(text || "")
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function parseRows(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function ensureBaseStyles() {
    const topDoc = getTopDocument();
    if (topDoc.getElementById("vetassist-picker-styles")) return;

    const style = topDoc.createElement("style");
    style.id = "vetassist-picker-styles";
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        top: 120px;
        right: 18px;
        width: 420px;
        max-height: calc(100vh - 140px);
        overflow: auto;
        z-index: 2147483646;
        background: #f7f5e8;
        border: 1px solid #9e9b87;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        font: 13px/1.4 Arial, sans-serif;
        color: #222;
        border-radius: 10px;
      }

      #${PANEL_ID}.minimized .va-body { display: none; }

      #${PANEL_ID}.minimized {
        top: auto;
        right: 12px;
        bottom: 12px;
        width: auto;
        max-width: none;
        max-height: none;
        overflow: visible;
        border-radius: 999px;
      }

      #${PANEL_ID}.minimized .va-head {
        padding: 0;
        border-bottom: 0;
        border-radius: 999px;
        background: transparent;
      }

      #${PANEL_ID}.minimized .va-head-title,
      #${PANEL_ID}.minimized #va-close-btn { display: none; }

      #${PANEL_ID}.minimized #va-min-btn {
        padding: 8px 12px;
        border: 0;
        border-radius: 999px;
        background: #e9e3c6;
        font-weight: 700;
        box-shadow: none;
      }

      #${PANEL_ID} .va-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        background: #e9e3c6;
        border-bottom: 1px solid #c9c19d;
        position: sticky;
        top: 0;
        z-index: 2;
      }

      #${PANEL_ID} .va-title { font-weight: 700; font-size: 14px; }
      #${PANEL_ID} .va-sub { font-size: 12px; opacity: .8; margin-top: 2px; }
      #${PANEL_ID} .va-head-actions { display: flex; gap: 6px; }

      #${PANEL_ID} .va-btn-mini {
        border: 1px solid #9d9778;
        background: #fffdf2;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
      }

      #${PANEL_ID} .va-body { padding: 12px; }

      #${PANEL_ID} .va-status {
        margin-bottom: 12px;
        padding: 8px 10px;
        border: 1px solid #cfc7a6;
        background: #fffdf2;
        border-radius: 8px;
      }

      #${PANEL_ID} .va-status.ok { border-color: #9bc7a4; background: #f4fff6; }
      #${PANEL_ID} .va-status.bad { border-color: #d7aaaa; background: #fff5f5; }
      #${PANEL_ID} .va-meta { font-size: 12px; opacity: .85; margin-top: 4px; }

      #${PANEL_ID} .va-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }

      #${PANEL_ID} .va-card {
        border: 1px solid #c9c19d;
        border-radius: 10px;
        background: #fffdf4;
        overflow: hidden;
      }

      #${PANEL_ID} .va-card.expanded { box-shadow: inset 0 0 0 1px #d9d1af; }

      #${PANEL_ID} .va-card-summary {
        padding: 12px;
        cursor: pointer;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      #${PANEL_ID} .va-card-summary:hover { background: #fcfaef; }
      #${PANEL_ID} .va-card-main { min-width: 0; }
      #${PANEL_ID} .va-card-title { font-weight: 700; font-size: 14px; }
      #${PANEL_ID} .va-card-desc { margin-top: 4px; color: #333; opacity: .9; }
      #${PANEL_ID} .va-card-arrow { font-size: 14px; opacity: .7; line-height: 1.2; padding-top: 2px; }

      #${PANEL_ID} .va-card-body {
        display: none;
        padding: 0 12px 12px 12px;
        border-top: 1px solid #e2dcc1;
      }

      #${PANEL_ID} .va-card.expanded .va-card-body { display: block; }
      #${PANEL_ID} .va-card.expanded .va-card-arrow { transform: rotate(90deg); }

      #${PANEL_ID} .va-badge {
        border: 1px solid #9d9778;
        background: #f0ead1;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        white-space: nowrap;
      }

      #${PANEL_ID} .va-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

      #${PANEL_ID} .va-tag {
        border: 1px solid #d7d0b0;
        background: #faf7ea;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
      }


      #${PANEL_ID} .va-input { margin-top: 10px; }

      #${PANEL_ID} .va-input-label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #333;
      }

      #${PANEL_ID} .va-textarea {
        width: 100%;
        min-height: 88px;
        resize: vertical;
        box-sizing: border-box;
        border: 1px solid #c9c19d;
        border-radius: 8px;
        background: #fffef8;
        padding: 8px 10px;
        font: 12px/1.35 Consolas, Monaco, monospace;
        color: #222;
      }

      #${PANEL_ID} .va-textarea:focus {
        outline: none;
        border-color: #8aa58c;
        box-shadow: 0 0 0 2px rgba(138,165,140,.15);
      }

      #${PANEL_ID} .va-input-line {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #c9c19d;
        border-radius: 8px;
        background: #fffef8;
        padding: 8px 10px;
        font: 12px/1.35 Arial, sans-serif;
        color: #222;
      }

      #${PANEL_ID} .va-input-line:focus {
        outline: none;
        border-color: #8aa58c;
        box-shadow: 0 0 0 2px rgba(138,165,140,.15);
      }

      #${PANEL_ID} .va-input-help { margin-top: 6px; font-size: 11px; opacity: .75; }

      #${PANEL_ID} .va-mode-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 6px;
      }

      #${PANEL_ID} .va-mode-btn {
        border: 1px solid #b7af8d;
        background: #fffef8;
        border-radius: 8px;
        padding: 8px 10px;
        cursor: pointer;
        font: 12px/1.3 Arial, sans-serif;
        color: #222;
      }

      #${PANEL_ID} .va-mode-btn.active {
        border-color: #6e8f73;
        background: #eaf8ed;
        font-weight: 700;
        box-shadow: inset 0 0 0 1px rgba(110,143,115,.18);
      }

      #${PANEL_ID} .va-actions { display: flex; gap: 8px; margin-top: 10px; }

      #${PANEL_ID} .va-btn-run {
        border: 1px solid #6e8f73;
        background: #eaf8ed;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-weight: 700;
      }

      #${PANEL_ID} .va-btn-run[disabled] { opacity: .55; cursor: default; }
      #${PANEL_ID} .va-note { margin-top: 12px; font-size: 12px; opacity: .8; }

      #${RETURN_BTN_ID} {
        position: fixed;
        top: 76px;
        right: 18px;
        z-index: 2147483646;
        border: 1px solid #9d9778;
        background: #fffdf2;
        color: #222;
        border-radius: 8px;
        padding: 8px 10px;
        cursor: pointer;
        font: 12px/1.2 Arial, sans-serif;
        box-shadow: 0 6px 16px rgba(0,0,0,.15);
      }

      #${RETURN_BTN_ID}:hover { background: #f7f0d6; }
    `;
    topDoc.documentElement.appendChild(style);
  }

  function removePanelIfExists() {
    const topDoc = getTopDocument();
    const old = topDoc.getElementById(PANEL_ID);
    if (old) old.remove();
  }

  function removeReturnButtonIfExists() {
    const topDoc = getTopDocument();
    const btn = topDoc.getElementById(RETURN_BTN_ID);
    if (btn) btn.remove();
  }

  function sendToolControl(activeToolCode, action, options = {}) {
    const persist = options.persist !== false;

    if (persist) {
      try {
        sessionStorage.setItem(
          TOOL_CONTROL_REQUEST_KEY,
          JSON.stringify({
            tool: activeToolCode,
            action,
            ts: Date.now(),
          })
        );
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(TOOL_CONTROL_REQUEST_KEY);
      } catch {}
    }

    try {
      getTopWindow().dispatchEvent(
        new CustomEvent(TOOL_CONTROL_EVENT, {
          detail: {
            tool: activeToolCode,
            action,
            ts: Date.now(),
          },
        })
      );
    } catch (e) {
      console.warn("VetAssist: tool control dispatch failed", e);
    }
  }

  function createReturnButton(activeToolCode) {
    const topDoc = getTopDocument();
    removeReturnButtonIfExists();

    const btn = topDoc.createElement("button");
    btn.id = RETURN_BTN_ID;
    btn.textContent = "Vrati na izbor alata";
    btn.title = activeToolCode ? `Aktivan alat: ${activeToolCode}` : "Vrati na izbor alata";

    btn.addEventListener("click", () => {
      if (activeToolCode) {
        clearPendingStartPayload(activeToolCode);
        clearAllPendingStartPayloads();
        setSkipRestoreOnce(activeToolCode);
        sendToolControl(activeToolCode, "reset", { persist: false });
      }

      setActiveToolLock(false);
      setActiveTool("");
      removePanelIfExists();
      removeReturnButtonIfExists();
      location.reload();
    });

    topDoc.documentElement.appendChild(btn);
  }

  function createPanelShell(visibility = "open") {
    removePanelIfExists();

    const topDoc = getTopDocument();
    const panel = topDoc.createElement("div");
    panel.id = PANEL_ID;

    const minimized = visibility === "minimized";
    if (minimized) panel.classList.add("minimized");

    panel.innerHTML = `
      <div class="va-head">
        <div class="va-head-title">
          <div class="va-title">VetAsist — alati</div>
          <div class="va-sub">Izaberi alat koji želiš da pokreneš</div>
        </div>
        <div class="va-head-actions">
          <button class="va-btn-mini" id="va-min-btn">${minimized ? "VetAsist — Otvori" : "Sakrij"}</button>
          <button class="va-btn-mini" id="va-close-btn">Zatvori</button>
        </div>
      </div>
      <div class="va-body">
        <div id="va-status-box" class="va-status">Provera licence...</div>
        <div id="va-pin-warning" style="
  display:none;
  margin-bottom:12px;
  padding:10px;
  border:1px solid #f5d565;
  background:#fff8db;
  color:#6b5500;
  border-radius:8px;
  font-size:13px;
  line-height:1.4;
">
  <b>Preporuka:</b><br><br>
  Pinujte VetAsist ekstenziju radi lakšeg pristupa.<br><br>

  1. Kliknite na puzzle ikonicu gore desno<br>
  2. Pronađite VetAsist<br>
  3. Kliknite na 📌 Pin
</div>
        <div id="va-tools-box" class="va-grid"></div>
        <div class="va-note">
          Aktivni alat će se automatski vratiti i na sledećim AIRS stranicama dok ga ručno ne isključiš.
        </div>
      </div>
    `;

    topDoc.documentElement.appendChild(panel);

    panel.querySelector("#va-min-btn")?.addEventListener("click", async () => {
      const minimized = !panel.classList.contains("minimized");
      panel.classList.toggle("minimized", minimized);
      panel.querySelector("#va-min-btn").textContent = minimized ? "VetAsist — Otvori" : "Sakrij";
      saveState({ ...loadState(), minimized });
      await savePanelVisibility(minimized ? "minimized" : "open");
    });

    panel.querySelector("#va-close-btn")?.addEventListener("click", async () => {
      panel.remove();
      await savePanelVisibility("closed");
    });

    return panel;
  }

  function renderStatus(panel, status, licenseKey = "") {
    const box = panel.querySelector("#va-status-box");
    if (!box) return;

    if (status?.ok) {
      box.className = "va-status ok";
      box.innerHTML = `
        <div><b>Licenca aktivna</b> ✅</div>
        <div class="va-meta">
          Plan: ${escapeHtml(status.plan || "-")}
          · ključ: ${escapeHtml(licenseKey || "-")}
        </div>
      `;
    } else {
      box.className = "va-status bad";
      box.innerHTML = `
        <div><b>Licenca nije aktivna</b> ❌</div>
        <div class="va-meta">Razlog: ${escapeHtml(status?.reason || "unknown")}</div>
      `;
    }
  }

  function applyToolPresentation(base) {
    const tool = { ...base };

    if (tool.code === "vb_zbirni_xlsx") {
  tool.name = "Zbirni pregled stanja po HID-ovima + PROMENE";
  tool.description = "Automatski pregled stanja za više HID-ova i detekcija promena između dva perioda.";
}

    if (tool.code === "hid_koordinate_xlsx") {
      tool.name = "HID koordinate i podaci gazdinstva";
      tool.description = "Preuzima koordinate HID-a, adresu gazdinstva, držaoca goveda i BPG za više HID-ova i pravi jedan zbirni Excel izveštaj.";
    }

    if (tool.code === "provera_telenja") {
      tool.name = "Provera telenja";
      tool.description = "Upoređuje uneti datum telenja sa pronađenim datumima u AIRS potomstvu i pravi Excel tabelu rezultata.";
    }

     if (tool.code === "provera_teladi") {
      tool.name = "Provera teladi";
      tool.description = "Pronalazi najnovije direktno tele majke i izvozi datum, ID teleta i pol.";
    }

    if (tool.code === "hid_bpg_verifikacija") {
      tool.name = "Provera gazdinstva (HID/BPG)";
      tool.description = "Proverava da li se grlo nalazi na zadatom HID-u i, po potrebi, da li se poklapa BPG gazdinstva. Izvoz u Excel.";
    }

    if (tool.code === "ovkoze_kontrola_evidencije") {
      tool.name = "Kontrola evidencije (ovce/koze)";
      tool.description = "Za uneta grla pronalazi najnoviji datum kontrole i proverava evidenciju, uz izvoz rezultata u Excel.";
    }

    if (tool.code === "provera_pariteta") {
      tool.name = "Provera pariteta";
      tool.description = "Broji paritet na osnovu direktnih potomaka, tretira blizance kao jedan paritet i izvozi Excel izveštaj.";
    }

    if (tool.code === "ovkoze_otvori_grla_tab") {
      tool.name = "Brzi pregled grla (ovce/koze)";
      tool.description = "Za svako grlo sa spiska otvara novi tab i automatski otvara rezultat pretrage radi brze ručne provere.";
    }

    if (tool.code === "goveda_otvori_grla_tab") {
      tool.name = "Brzi pregled grla (goveda)";
      tool.description = "Za svako grlo sa spiska otvara novi tab i automatski ulazi u rezultat pretrage radi brze ručne provere.";
    }

    if (tool.code === "goveda_pregled_kretanja") {
      tool.name = "Pregled kretanja GOVEDA";
      tool.description = "Za uneta grla proverava kretanja u AIRS-u i pravi objedinjeni Excel izveštaj. Može se izabrati samo poslednje kretanje ili sva kretanja.";
    }

    if (tool.code === "ovkoze_pedigre_pregled") {
      tool.name = "Pregled svih vađenja krvi po grlu (ovce/koze)";
      tool.description = "Za svako grlo proverava sve promene i kretanja i ispisuje podatke u Excel tabeli. Ovo je proširena verzija kontrole evidencije, sa svim promenama po grlu.";
    }

    if (tool.code === "goveda_drzavna_zemlja") {
      tool.name = "Spisak za državnu zemlju (goveda)";
      tool.description = "Priprema i sortira grla sa zadatih gazdinstava po parametrima potrebnim za obradu zahteva za pravo prečeg zakupa državne zemlje i snima svaki HID pojedinačno.";
    }

    return tool;
  }

  async function normalizeTools(tools) {
    if (!Array.isArray(tools)) return [];

    const normalized = await Promise.all(
      tools
        .filter((t) => t && t.code && t.version)
        .map(async (t) => {
          const code = String(t.code);

          let localManifest = null;
          try {
            localManifest = await fetchLocalToolManifest(code);
          } catch (e) {
            console.warn("VetAssist: local manifest load failed for tool", code, e);
          }

          const base = {
            code,
            version: String(t.version || localManifest?.version || ""),
            name: String(t.name || localManifest?.name || t.code),
            description: String(t.description || ""),
            category: String(t.category || "Opšte"),
            species: String(t.species || "nepoznato"),
            badge: t.badge ? String(t.badge) : "",
          };

          return applyToolPresentation(base);
        })
    );

    normalized.sort((a, b) => {
      const ai = TOOL_ORDER_INDEX[a.code] ?? 999;
      const bi = TOOL_ORDER_INDEX[b.code] ?? 999;
      if (ai !== bi) return ai - bi;
      return String(a.name).localeCompare(String(b.name), "sr");
    });

    return normalized;
  }

  async function injectFallbackFiles(toolCode) {
    const files = await getRegistryFiles(toolCode);
    if (!Array.isArray(files) || !files.length) {
      throw new Error(`no_fallback_files_for_${toolCode}`);
    }

    const topDoc = getTopDocument();

    for (const relPath of files) {
      await new Promise((resolve, reject) => {
        try {
          const s = topDoc.createElement("script");
          s.src = chrome.runtime.getURL(relPath);
          s.async = false;
          s.onload = () => {
            s.remove();
            resolve(true);
          };
          s.onerror = () => {
            s.remove();
            reject(new Error(`fallback_load_failed:${relPath}`));
          };
          topDoc.documentElement.appendChild(s);
        } catch (e) {
          reject(e);
        }
      });
    }
  }

  function forceResumeTool(toolCode, retries = 10, delayMs = 300) {
    try {
      const tool =
        window.VetAssistTools?.[toolCode] ||
        getTopWindow().VetAssistTools?.[toolCode];

      if (tool && typeof tool.resume === "function") {
        console.log(`VetAssist: forcing resume -> ${toolCode}`);
        tool.resume();
        return true;
      }
    } catch (e) {
      console.error(`VetAssist: force resume error -> ${toolCode}`, e);
      return false;
    }

    if (retries > 0) {
      setTimeout(() => forceResumeTool(toolCode, retries - 1, delayMs), delayMs);
    } else {
      console.warn(`VetAssist: resume not ready after retries -> ${toolCode}`);
    }

    return false;
  }

  async function runTool(tool, runBtn) {
    if (sessionStorage.getItem("vetassist_remote_job_v1")) {
      alert("GOO provera je u toku. Za prekid isključite prijem zadataka u ekstenziji.");
      return { ok: false, error: "remote_job_active" };
    }
    if (isActiveToolLocked()) {
      console.warn("VetAssist: tool launch already in progress");
      return { ok: false, error: "tool_launch_locked" };
    }

    try {
      setActiveToolLock(true);
      clearSkipRestoreOnce();

      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Pokrećem...";
      }

      const result = await chrome.runtime.sendMessage({
        type: "RUN_TOOL",
        tool_code: tool.code,
      });

      console.log("VetAssist RUN_TOOL result:", result);

      if (!result?.ok) {
        throw new Error(result?.error || result?.details || "tool_run_failed");
      }


      setActiveTool(tool.code);
      createReturnButton(tool.code);
      removePanelIfExists();

      console.log(
        `VetAssist: tool started -> ${tool.code} v${result?.tool?.version || tool.version}`
      );

      return { ok: true, result };
    } catch (e) {
      console.error("VetAssist: failed to run tool", e);
      setActiveTool("");
      removeReturnButtonIfExists();
      clearPendingStartPayload(tool.code);
      alert(`Greška pri učitavanju alata: ${tool.name}`);
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = "Pokreni";
      }
      return { ok: false, error: e?.message || "tool_run_failed" };
    } finally {
      setActiveToolLock(false);
    }
  }

  async function restoreActiveTool(toolCode) {
    if (isActiveToolLocked()) {
      console.warn("VetAssist: restore skipped because lock is active");
      return { ok: false, error: "restore_locked" };
    }

    try {
      setActiveToolLock(true);
      createReturnButton(toolCode);

      const result = await chrome.runtime.sendMessage({
        type: "RESTORE_TOOL",
        tool_code: toolCode,
      });

      if (result?.ok) {
        console.log(
          `VetAssist: active tool restored -> ${toolCode} v${result?.tool?.version || "unknown"}`
        );

        forceResumeTool(toolCode);

        return { ok: true, restored: "background" };
      }

      console.warn(`VetAssist: background restore failed -> ${toolCode}`, result);
    } catch (e) {
      console.warn(`VetAssist: background restore exception -> ${toolCode}`, e);
    }

    try {
      await injectFallbackFiles(toolCode);
      console.log(`VetAssist: fallback restore injected -> ${toolCode}`);

      forceResumeTool(toolCode);

      return { ok: true, restored: "fallback" };
    } catch (e) {
      console.error(`VetAssist: fallback restore failed -> ${toolCode}`, e);
      setActiveTool("");
      removeReturnButtonIfExists();
      return { ok: false, error: e?.message || "restore_failed" };
    } finally {
      setActiveToolLock(false);
    }
  }

  function collapseAllCards(exceptCard = null) {
    const topDoc = getTopDocument();
    topDoc.querySelectorAll(`#${PANEL_ID} .va-card.expanded`).forEach((card) => {
      if (card !== exceptCard) card.classList.remove("expanded");
    });
  }

  function attachAccordionBehavior(card, summary) {
    summary.addEventListener("click", (e) => {
      if (e.target.closest(".va-btn-run, .va-textarea, .va-input-line")) return;
      const shouldExpand = !card.classList.contains("expanded");
      collapseAllCards(card);
      card.classList.toggle("expanded", shouldExpand);
    });
  }

  function renderTools(panel, tools) {
    const box = panel.querySelector("#va-tools-box");
    if (!box) return;

    if (!tools.length) {
      box.innerHTML = `
        <div class="va-card">
          <div class="va-card-summary">
            <div class="va-card-main">
              <div class="va-card-title">Nema dostupnih alata</div>
              <div class="va-card-desc">Licenca je aktivna, ali server trenutno nije vratio nijedan alat za ovaj nalog.</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    box.innerHTML = "";

    const st = loadState();
    const openToolCode = st.openToolCode || "";

    tools.forEach((tool, idx) => {
      const topDoc = getTopDocument();
      const card = topDoc.createElement("div");
      card.className = "va-card";

      const savedInput = getToolInput(tool.code);

      const isHidListTool =
        tool.code === "vb_zbirni_xlsx" ||
        tool.code === "hid_koordinate_xlsx" ||
  tool.code === "goveda_drzavna_zemlja";

      const isTelenja = tool.code === "provera_telenja";
      const isTeladi = tool.code === "provera_teladi";
      const isOvkozeKontrola = tool.code === "ovkoze_kontrola_evidencije";
      const isHidBpg = tool.code === "hid_bpg_verifikacija";
      const isParitet = tool.code === "provera_pariteta";
      const isOvkozeNewTab = tool.code === "ovkoze_otvori_grla_tab";
      const isGovedaNewTab = tool.code === "goveda_otvori_grla_tab";
      const isGovedaPregledKretanja = tool.code === "goveda_pregled_kretanja";
      const isOvkozePedigre = tool.code === "ovkoze_pedigre_pregled";

      const shouldOpen = openToolCode ? openToolCode === tool.code : idx === 0;

      if (shouldOpen) card.classList.add("expanded");

      card.innerHTML = `
        <div class="va-card-summary">
  <div class="va-card-main">
    <div class="va-card-title">${escapeHtml(tool.name)}</div>
    <div class="va-card-desc">${escapeHtml(tool.description)}</div>
  </div>
  <div style="display:flex; align-items:flex-start; gap:8px;">
    ${tool.badge ? `<div class="va-badge">${escapeHtml(tool.badge)}</div>` : ""}
    <div class="va-card-arrow">▶</div>
  </div>
</div>

<div class="va-card-body">
          <div class="va-tags">
            <div class="va-tag">Kod: ${escapeHtml(tool.code)}</div>
            <div class="va-tag">Verzija: ${escapeHtml(tool.version)}</div>
            <div class="va-tag">Kategorija: ${escapeHtml(tool.category)}</div>
            <div class="va-tag">Grana: ${escapeHtml(tool.species)}</div>
          </div>

          ${
            isHidListTool
              ? `
            <div class="va-input">
              <label class="va-input-label">HID lista</label>
              <textarea class="va-textarea va-hids" placeholder="Unesi HID brojeve, po jedan u redu ili nalepi iz Excela">${escapeHtml(savedInput.hidsText || "")}</textarea>
              <div class="va-input-help">Podržano: redovi, razmaci, TAB i ; razdvajanje.</div>
            </div>
          `
              : ""
          }

          ${
            isTelenja
              ? `
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="DATE ; PREFIX ; ID&#10;ili&#10;PREFIX ; ID ; DATE">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Podržano: DATE ; PREFIX ; ID ili PREFIX ; ID ; DATE. Jedan red po grlu.</div>
            </div>
          `
              : ""
          }
          ${
  isTeladi
    ? `
  <div class="va-input">
    <label class="va-input-label">Unos redova</label>
    <textarea class="va-textarea va-rows" placeholder="PREFIX ; ID">${escapeHtml(savedInput.rowsText || "")}</textarea>
    <div class="va-input-help">Podržano: PREFIX ; ID. Jedan red po majci. Podržano: PREFIX ; ID. Jedan red po grlu.</div>
  </div>
`
    : ""
}

          ${
            isOvkozeKontrola
              ? `
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="PREFIX ; ID ; HID&#10;ili&#10;PREFIX ; ID">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Podržano: PREFIX ; ID ; HID ili PREFIX ; ID. Jedan red po grlu.</div>
            </div>
          `
              : ""
          }

          ${
            isHidBpg
              ? `
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="ID ; HID ; BPG&#10;ili&#10;ID ; HID">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Podržano: ID ; HID ; BPG ili ID ; HID. BPG je opcion.</div>
            </div>
          `
              : ""
          }

          ${
            isParitet
              ? `
            <div class="va-input">
              <label class="va-input-label">Datum prvog telenja (opciono)</label>
              <input class="va-input-line va-first-calving-date" type="text" placeholder="dd.mm.yyyy ili yyyy-mm-dd" value="${escapeHtml(savedInput.globalFirstCalvingDate || "")}">
              <div class="va-input-help">Ako ostaviš prazno, provera datuma se ne radi.</div>
            </div>
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="PREFIX ; ID ; EXPECTED_PARITY">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Jedan red po grlu. Podržano: razmak, TAB, ; i ,</div>
            </div>
          `
              : ""
          }

          ${
            isOvkozeNewTab
              ? `
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="PREFIX ; ID">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Jedan red po grlu. Podržano: razmak, TAB, ; i ,</div>
            </div>
          `
              : ""
          }

          ${
            isGovedaNewTab
              ? `
            <div class="va-input">
              <label class="va-input-label">ID grla</label>
              <textarea class="va-textarea va-rows" placeholder="Jedan ID po redu">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Unesi po jedan ID po redu.</div>
            </div>
          `
              : ""
          }

          ${
            isGovedaPregledKretanja
              ? `
            <div class="va-input">
              <label class="va-input-label">Obim izveštaja</label>
              <div class="va-mode-group">
                <button type="button"
                        class="va-mode-btn ${(savedInput.reportMode || "last") !== "all" ? "active" : ""}"
                        data-mode="last">Samo poslednje kretanje</button>
                <button type="button"
                        class="va-mode-btn ${(savedInput.reportMode || "last") === "all" ? "active" : ""}"
                        data-mode="all">Sva kretanja</button>
              </div>
              <div class="va-input-help">Izabrani režim određuje da li Excel sadrži jedan red po grlu ili kompletnu istoriju kretanja.</div>
            </div>
            <div class="va-input">
              <label class="va-input-label">ID grla</label>
              <textarea class="va-textarea va-rows" placeholder="Jedan ID po redu&#10;Primer: 7199347570">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Unesi po jedan ID po redu. Dozvoljeno je i da red sadrži prefiks države (npr. RS 7199347570).</div>
            </div>
          `
              : ""
          }

          ${
            isOvkozePedigre
              ? `
            <div class="va-input">
              <label class="va-input-label">Unos redova</label>
              <textarea class="va-textarea va-rows" placeholder="PREFIX ; ID ; HID&#10;ili&#10;PREFIX ; ID">${escapeHtml(savedInput.rowsText || "")}</textarea>
              <div class="va-input-help">Podržano: PREFIX ; ID ; HID ili PREFIX ; ID. Jedan red po grlu.</div>
            </div>
          `
              : ""
          }

          <div class="va-actions">
            <button class="va-btn-run">Pokreni</button>
          </div>
        </div>
      `;

      const summary = card.querySelector(".va-card-summary");
      const runBtn = card.querySelector(".va-btn-run");
      attachAccordionBehavior(card, summary);

      summary.addEventListener("click", () => {
        saveState({ ...loadState(), openToolCode: tool.code });
      });


      if (isHidListTool) {
        const textarea = card.querySelector(".va-hids");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            hidsText: textarea.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const hids = parseHids(text);

          if (!hids.length) {
            alert("Unesi bar jedan HID.");
            return;
          }

          setToolInput(tool.code, { hidsText: text });
          setPendingStartPayload(tool.code, { hids });

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else if (isTelenja) {
        const textarea = card.querySelector(".va-rows");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);

          if (!rows.length) {
            alert("Unesi bar jedan red za proveru telenja.");
            return;
          }

          setToolInput(tool.code, { rowsText: text });
          setPendingStartPayload(tool.code, {
            rows,
            delay: 450,
            timeoutSec: 3,
            tolDefault: 0,
            includeDesc: false,
            dedupeDates: true,
            doubleCheck: true,
            dcFactor: 1.6,
          });

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

        } else if (isTeladi) {
  const textarea = card.querySelector(".va-rows");

  textarea?.addEventListener("input", () => {
    setToolInput(tool.code, {
      rowsText: textarea.value || "",
    });
  });

  textarea?.addEventListener("focus", () => {
    collapseAllCards(card);
    card.classList.add("expanded");
    saveState({ ...loadState(), openToolCode: tool.code });
  });

  runBtn?.addEventListener("click", async () => {
    const text = textarea?.value || "";
    const rows = parseRows(text);

    if (!rows.length) {
      alert("Unesi bar jedan red za proveru teladi.");
      return;
    }

    setToolInput(tool.code, { rowsText: text });

    setPendingStartPayload(tool.code, {
      rows,
      delay: 450,
      timeoutSec: 3,
      includeDesc: false,
      doubleCheck: true,
      dcFactor: 1.6,
    });

    const started = await runTool(tool, runBtn);
    if (!started?.ok) return;
  });

      } else if (isOvkozeKontrola) {
        const textarea = card.querySelector(".va-rows");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);

          if (!rows.length) {
            alert("Unesi bar jedan red za kontrolu evidencije.");
            return;
          }

          setToolInput(tool.code, { rowsText: text });
          setPendingStartPayload(tool.code, {
            rows
          });

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else if (isHidBpg) {
        const textarea = card.querySelector(".va-rows");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);

          if (!rows.length) {
            alert("Unesi bar jedan red za HID/BPG proveru.");
            return;
          }

          setToolInput(tool.code, { rowsText: text });
          setPendingStartPayload(tool.code, {
            rawInput: text
          });

          console.log(
            "PAYLOAD SET:",
            JSON.parse(sessionStorage.getItem("vetassist_tool_start_payloads_v1") || "{}")
          );

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else if (isParitet) {
        const textarea = card.querySelector(".va-rows");
        const dateInput = card.querySelector(".va-first-calving-date");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea.value || "",
            globalFirstCalvingDate: dateInput?.value || "",
          });
        });

        dateInput?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea?.value || "",
            globalFirstCalvingDate: dateInput.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        dateInput?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);
          const globalFirstCalvingDate = dateInput?.value || "";

          if (!rows.length) {
            alert("Unesi bar jedan red za proveru pariteta.");
            return;
          }

          setToolInput(tool.code, {
            rowsText: text,
            globalFirstCalvingDate,
          });

          setPendingStartPayload(tool.code, {
            rawInput: text,
            globalFirstCalvingDate,
          });

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else if (isGovedaPregledKretanja) {
        const textarea = card.querySelector(".va-rows");
        const modeButtons = Array.from(card.querySelectorAll(".va-mode-btn"));

        const getSelectedMode = () => {
          const active = modeButtons.find(btn => btn.classList.contains("active"));
          return active?.dataset?.mode === "all" ? "all" : "last";
        };

        const persistMovementInput = () => {
          setToolInput(tool.code, {
            rowsText: textarea?.value || "",
            reportMode: getSelectedMode(),
          });
        };

        modeButtons.forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const mode = btn.dataset?.mode === "all" ? "all" : "last";
            modeButtons.forEach(x => x.classList.toggle("active", x === btn));
            setToolInput(tool.code, {
              rowsText: textarea?.value || "",
              reportMode: mode,
            });
          });
        });

        textarea?.addEventListener("input", persistMovementInput);

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);
          const reportMode = getSelectedMode();

          if (!rows.length) {
            alert("Unesi bar jedan ID grla.");
            return;
          }

          setToolInput(tool.code, {
            rowsText: text,
            reportMode,
          });

          setPendingStartPayload(tool.code, {
            rawInput: text,
            reportMode,
            timeoutSec: 8,
          });

          console.log(
            "PAYLOAD SET:",
            JSON.parse(sessionStorage.getItem("vetassist_tool_start_payloads_v1") || "{}")
          );

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else if (isOvkozeNewTab || isGovedaNewTab || isOvkozePedigre) {
        const textarea = card.querySelector(".va-rows");

        textarea?.addEventListener("input", () => {
          setToolInput(tool.code, {
            rowsText: textarea.value || "",
          });
        });

        textarea?.addEventListener("focus", () => {
          collapseAllCards(card);
          card.classList.add("expanded");
          saveState({ ...loadState(), openToolCode: tool.code });
        });

        runBtn?.addEventListener("click", async () => {
          const text = textarea?.value || "";
          const rows = parseRows(text);

          if (!rows.length) {
            alert("Unesi bar jedan red.");
            return;
          }

          setToolInput(tool.code, { rowsText: text });
          setPendingStartPayload(tool.code, {
            rawInput: text
          });

          console.log(
            "PAYLOAD SET:",
            JSON.parse(sessionStorage.getItem("vetassist_tool_start_payloads_v1") || "{}")
          );

          const started = await runTool(tool, runBtn);
          if (!started?.ok) return;
        });

      } else {
        runBtn?.addEventListener("click", async () => {
          clearPendingStartPayload(tool.code);
          await runTool(tool, runBtn);
        });
      }

      box.appendChild(card);
    });
  }

  async function renderPickerPanel() {
    removeReturnButtonIfExists();

    const visibility = await loadPanelVisibility();
    if (visibility === "closed") {
      removePanelIfExists();
      return;
    }

    const panel = createPanelShell(visibility);
    const status = await chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE" });
    const { license_key } = await chrome.storage.local.get(["license_key"]);

    renderStatus(panel, status, license_key || "");
    try {
  const topDoc = getTopDocument();
  const pinWarning = topDoc.getElementById("va-pin-warning");

  const pinStatus = await chrome.runtime.sendMessage({
    type: "GET_PIN_STATUS",
  });

  if (pinWarning) {
    pinWarning.style.display =
      pinStatus?.ok && pinStatus.isOnToolbar ? "none" : "block";
  }
} catch (e) {
  console.warn("VetAssist: pin detection failed", e);
}

    if (!status?.ok) {
      renderTools(panel, []);
      console.warn("VetAssist: license NOT OK -> tools disabled", status);
      return;
    }

    const tools = await normalizeTools(status.tools);
    renderTools(panel, tools);
  }

  async function main() {
    await loadRegistry();
    ensureBaseStyles();

    const activeTool = getActiveTool();
    if (activeTool) {
      const skipRestore = consumeSkipRestoreOnce(activeTool);
      if (skipRestore) {
        console.log(`VetAssist: skip restore once -> ${activeTool}`);
        setActiveTool("");
        removeReturnButtonIfExists();
        await renderPickerPanel();
        return;
      }

      const shouldRestoreHere = shouldRestoreActiveToolOnThisTab(activeTool);

      if (!shouldRestoreHere) {
  console.log(`VetAssist: active tool detected -> ${activeTool}; skipping restore on parent tab`);

  // ❗ NE briši activeTool — child tabovi ga trebaju
  removeReturnButtonIfExists();

  await renderPickerPanel();
  return;
  }

      console.log(`VetAssist: active tool detected -> ${activeTool}; restoring`);
      removePanelIfExists();

      const restored = await restoreActiveTool(activeTool);
      if (!restored?.ok) {
        console.warn("VetAssist: restore failed completely, reopening picker");
        await renderPickerPanel();
      }
      return;
    }

    await renderPickerPanel();
  }

  main().catch((e) => {
    console.error("VetAssist content fatal error", e);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[PANEL_VISIBILITY_KEY]) return;

    const visibility = changes[PANEL_VISIBILITY_KEY].newValue;
    if (visibility === "closed") {
      removePanelIfExists();
      return;
    }

    if (visibility === "open" || visibility === "minimized") {
      renderPickerPanel().catch((e) => {
        console.error("VetAssist: panel visibility update failed", e);
      });
    }
  });
})();
