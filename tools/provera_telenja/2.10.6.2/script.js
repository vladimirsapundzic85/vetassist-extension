console.log("VetAssist tool loaded: provera_telenja FINAL v1.0");

(function () {
  "use strict";

  const TOOL_CODE = "provera_telenja";
  const SS_KEY = "vetassist_provera_telenja_v1";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";

  function safeJson(s) {
    try { return JSON.parse(s || "{}"); } catch { return {}; }
  }

  let ST = Object.assign({
    active: false,
    idx: 0,
    rows: [],
    results: []
  }, safeJson(sessionStorage.getItem(SS_KEY)));

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(ST));
  }

  function reset() {
    ST = { active: false, idx: 0, rows: [], results: [] };
    save();
  }

  function log(...args) {
    console.log("[provera_telenja]", ...args);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function normalizeRow(row) {
    const parts = String(row).split(/[\s,;]+/).filter(Boolean);

    if (parts.length < 3) return null;

    // prepoznaj gde je datum
    if (parts[0].includes(".")) {
      return { date: parts[0], prefix: parts[1], id: parts[2] };
    } else {
      return { prefix: parts[0], id: parts[1], date: parts[2] };
    }
  }

  function parseRows(rows) {
    return rows.map(normalizeRow).filter(Boolean);
  }

  function goToSuccessor(id, prefix) {
    const url = `/pls/aimcs_prod/W_SUCCESSOR.STARTUP?p_id_broj=${id}&p_id_dr=${prefix}`;
    window.top.location.href = url;
  }

  function isSuccessorPage() {
    return document.body.innerText.includes("POTOMSTVO");
  }

  function extractDates() {
    const rows = document.querySelectorAll("table tr");
    const dates = [];

    rows.forEach(tr => {
      const m = tr.innerText.match(/\d{2}\.\d{2}\.\d{4}/g);
      if (m) dates.push(...m);
    });

    return dates;
  }

  function diffDays(a, b) {
    const d1 = new Date(a.split('.').reverse().join('-'));
    const d2 = new Date(b.split('.').reverse().join('-'));
    return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
  }

  async function run() {
    if (!ST.active) return;

    if (ST.idx >= ST.rows.length) {
      finish();
      return;
    }

    const row = ST.rows[ST.idx];

    if (!isSuccessorPage()) {
      goToSuccessor(row.id, row.prefix);
      return;
    }

    await sleep(400);

    const dates = extractDates();

    let best = null;
    let bestDiff = 9999;

    dates.forEach(d => {
      const diff = Math.abs(diffDays(d, row.date));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = d;
      }
    });

    ST.results.push({
      prefix: row.prefix,
      id: row.id,
      target: row.date,
      found: best || "",
      diff: bestDiff
    });

    ST.idx++;
    save();

    await sleep(300);
    run();
  }

  function download() {
    if (!window.XLSX) return;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(ST.results);
    XLSX.utils.book_append_sheet(wb, ws, "Rezultati");

    const name = "PROVERA_TELENJA_" + Date.now() + ".xlsx";
    XLSX.writeFile(wb, name);
  }

  function finish() {
    log("Završeno");
    download();
    sessionStorage.removeItem(ACTIVE_TOOL_KEY);
    reset();
  }

  function getPending() {
    const all = safeJson(sessionStorage.getItem(START_PAYLOADS_KEY));
    return all[TOOL_CODE];
  }

  window.VetAssistTools = window.VetAssistTools || {};

  window.VetAssistTools.provera_telenja = {
    start: function (cfg) {
      const parsed = parseRows(cfg.rows || []);

      if (!parsed.length) {
        console.error("Nema validnih redova");
        return;
      }

      ST = {
        active: true,
        idx: 0,
        rows: parsed,
        results: []
      };

      save();
      run();
    }
  };

  // auto-start
  setTimeout(() => {
    const pending = getPending();
    if (pending && !ST.active) {
      window.VetAssistTools.provera_telenja.start(pending);
    }
  }, 500);

})();