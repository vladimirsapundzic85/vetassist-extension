async function updatePinWarning() {
  try {
    const settings = await chrome.action.getUserSettings();

    const warning = document.getElementById("pinWarning");

    if (!warning) return;

    if (settings.isOnToolbar) {
      warning.style.display = "none";
    } else {
      warning.style.display = "block";
    }
  } catch (e) {
    console.error("Pin status check failed", e);
  }
}
(async function () {
  const $ = (id) => document.getElementById(id);

  const licenseInput = $("license_key");
  const statusEl = $("status");
  const saveBtn = $("save");
  const togglePanelBtn = $("toggle_panel");
  const panelStatusEl = $("panel_status");
  const PANEL_VISIBILITY_KEY = "vetassist_panel_visibility_v1";

  const setupAirsBtn = $("setup_airs");
  const airsStatusEl = $("airs_status");
  const checkJsEl = $("check_js");
  const checkPopupsEl = $("check_popups");
  const checkDownloadsEl = $("check_downloads");

  const deviceIdDisplayEl = $("device_id_display");
  const deviceFpDisplayEl = $("device_fp_display");
  const licensePlanEl = $("license_plan");
  const licenseStatusTextEl = $("license_status_text");
  const licenseValidUntilEl = $("license_valid_until");
  const licenseDeviceCountEl = $("license_device_count");

  const extensionVersionEl = $("ext_version");
  const extensionUpdateEl = $("ext_update");
  const updateBtn = $("ext_update_btn");

  let realDeviceId = "";
  let realDeviceFp = "";
  let currentLicenseKey = "";
  let currentLicenseStatus = null;
  let isValidating = false;

  async function refreshPanelControl() {
    const stored = await chrome.storage.local.get([PANEL_VISIBILITY_KEY]);
    const visibility = stored?.[PANEL_VISIBILITY_KEY] || "open";
    togglePanelBtn.textContent = visibility === "closed"
      ? "Prikaži VetAsist panel"
      : "Zatvori VetAsist panel";
  }

  async function togglePanel() {
    togglePanelBtn.disabled = true;
    panelStatusEl.textContent = "";

    try {
      const stored = await chrome.storage.local.get([PANEL_VISIBILITY_KEY]);
      const visibility = stored?.[PANEL_VISIBILITY_KEY] || "open";
      const nextVisibility = visibility === "closed" ? "open" : "closed";
      await chrome.storage.local.set({ [PANEL_VISIBILITY_KEY]: nextVisibility });
      panelStatusEl.textContent = nextVisibility === "closed"
        ? "Panel je zatvoren."
        : "Panel je prikazan.";
      panelStatusEl.className = "row ok";
      await refreshPanelControl();
    } catch (e) {
      panelStatusEl.textContent = "Promena prikaza panela nije uspela.";
      panelStatusEl.className = "row bad";
    } finally {
      togglePanelBtn.disabled = false;
    }
  }

  function getLocalExtensionVersion() {
    return chrome.runtime.getManifest().version;
  }

  function compareVersions(a, b) {
    const pa = String(a || "").split(".").map(Number);
    const pb = String(b || "").split(".").map(Number);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  function setStatus(msg, ok = true) {
    statusEl.textContent = msg;
    statusEl.className = ok ? "ok" : "bad";
  }

  function formatDate(value) {
    if (!value) return "—";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleDateString("sr-RS");
  }

  function renderLicenseInfo() {
    deviceIdDisplayEl.textContent = realDeviceId || "—";
    deviceFpDisplayEl.textContent = realDeviceFp || "—";
  }

  function clearLicenseResponse() {
    licensePlanEl.textContent = "—";
    licenseStatusTextEl.textContent = "—";
    licenseValidUntilEl.textContent = "—";
    licenseDeviceCountEl.textContent = "—";
  }

  async function loadLocalState() {
    const st = await chrome.storage.local.get([
      "license_key",
      "device_id",
      "device_fp",
      "license_status_cache_v2",
    ]);

    currentLicenseKey = String(st.license_key || "").trim();
    licenseInput.value = currentLicenseKey;

    realDeviceId = String(st.device_id || "").trim();
    realDeviceFp = String(st.device_fp || "").trim();

    renderLicenseInfo();

    // Ako postoji keš licence, prikaži ga odmah dok ne stigne sveža validacija
    if (st.license_status_cache_v2) {
      currentLicenseStatus = st.license_status_cache_v2;
      applyLicenseResponse(currentLicenseStatus);
    } else {
      clearLicenseResponse();
    }
  }

  async function checkExtensionUpdate() {
    const localVersion = getLocalExtensionVersion();
    extensionVersionEl.textContent = localVersion;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "GET_EXTENSION_UPDATE_STATUS",
      });

      if (!resp?.ok) {
        extensionUpdateEl.textContent = "Ne mogu da proverim update";
        extensionUpdateEl.className = "bad";
        updateBtn.style.display = "none";
        return;
      }

      const latest = resp.latest_extension_version;

      if (compareVersions(latest, localVersion) > 0) {
        extensionUpdateEl.textContent = `Nova verzija dostupna (${latest})`;
        extensionUpdateEl.className = "bad";
        updateBtn.style.display = "block";

        updateBtn.onclick = async () => {
  updateBtn.disabled = true;
  updateBtn.textContent = "Ažuriram...";
  extensionUpdateEl.textContent = "Proveravam Chrome Web Store update...";
  extensionUpdateEl.className = "bad";

  try {
    const r = await chrome.runtime.sendMessage({
      type: "INSTALL_EXTENSION_UPDATE",
    });

    if (r?.ok && r.status === "update_available") {
      extensionUpdateEl.textContent = "Update je pronađen. Ekstenzija se restartuje...";
      extensionUpdateEl.className = "ok";
      return;
    }

    if (r?.ok && r.status === "no_update") {
      extensionUpdateEl.textContent = "Chrome još ne vidi novu verziju. Pokušaj kasnije.";
      extensionUpdateEl.className = "bad";
      updateBtn.disabled = false;
      updateBtn.textContent = "Ažuriraj ekstenziju";
      return;
    }

    if (r?.ok && r.status === "throttled") {
      extensionUpdateEl.textContent = "Chrome blokira česte provere. Pokušaj kasnije.";
      extensionUpdateEl.className = "bad";
      updateBtn.disabled = false;
      updateBtn.textContent = "Ažuriraj ekstenziju";
      return;
    }

    throw new Error(r?.details || r?.error || "update_failed");
  } catch (e) {
    extensionUpdateEl.textContent = "Ažuriranje nije uspelo. Otvori Chrome Web Store ručno.";
    extensionUpdateEl.className = "bad";
    updateBtn.disabled = false;
    updateBtn.textContent = "Ažuriraj ekstenziju";
  }
};
      } else {
        extensionUpdateEl.textContent = "Ekstenzija je ažurna";
        extensionUpdateEl.className = "ok";
        updateBtn.style.display = "none";
      }
    } catch (e) {
      extensionUpdateEl.textContent = "Ne mogu da proverim update";
      extensionUpdateEl.className = "bad";
      updateBtn.style.display = "none";
    }
  }

  function applyLicenseResponse(v) {
    licensePlanEl.textContent = v?.plan || "—";
    licenseStatusTextEl.textContent = v?.ok ? "Aktivna" : "Neaktivna";
    licenseValidUntilEl.textContent = formatDate(v?.valid_until);

    if (v?.device_count != null && v?.device_limit != null) {
      licenseDeviceCountEl.textContent = `${v.device_count}/${v.device_limit}`;
    } else {
      licenseDeviceCountEl.textContent = "—";
    }
  }

  function buildLicenseStatusMessage(v) {
    if (v?.ok) {
      return { text: "Licenca OK ✅", ok: true };
    }

    let msg = "Licenca NIJE OK ❌";

    if (v?.reason === "device_limit_reached") {
      msg = `Prekoračen broj uređaja (${v.device_count}/${v.device_limit}) ❌`;
    } else if (v?.reason === "expired") {
      msg = "Licenca je istekla ❌";
    } else if (v?.reason === "license_key_not_found") {
      msg = "Neispravan ključ ❌";
    } else if (v?.reason === "no_subscription") {
      msg = "Nema aktivne pretplate ❌";
    } else if (v?.reason === "inactive_license") {
      msg = "Licenca nije aktivna ❌";
    } else if (v?.reason === "license_key_inactive") {
      msg = "Ključ licence je deaktiviran ❌";
    } else if (v?.reason === "missing_device_fp") {
      msg = "Nedostaje device fingerprint ❌";
    } else if (v?.reason === "server_error") {
      msg = "Greška servera pri proveri licence ❌";
    }

    return { text: msg, ok: false };
  }

  async function validateLicense(options = {}) {
    const {
      silent = false,
      saveKey = true,
      showCheckingMessage = true,
    } = options;

    if (isValidating) return currentLicenseStatus;

    try {
      isValidating = true;

      currentLicenseKey = String(licenseInput.value || "").trim();

      if (!currentLicenseKey) {
        currentLicenseStatus = null;
        clearLicenseResponse();
        if (!silent) {
          setStatus("Unesi license key.", false);
        }
        return null;
      }

      if (saveKey) {
        await chrome.storage.local.set({ license_key: currentLicenseKey });
      }

      if (showCheckingMessage && !silent) {
        setStatus("Provera licence...", true);
      }

      const v = await chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE" });
      currentLicenseStatus = v || null;

      await loadLocalState();
      applyLicenseResponse(v);

      const statusMsg = buildLicenseStatusMessage(v);

      if (!silent) {
        setStatus(statusMsg.text, statusMsg.ok);
      } else if (v?.ok) {
        setStatus("Licenca OK ✅", true);
      } else {
        setStatus(statusMsg.text, false);
      }

      return v;
    } catch (e) {
      currentLicenseStatus = null;
      clearLicenseResponse();
      setStatus("Greška pri proveri licence ❌", false);
      return null;
    } finally {
      isValidating = false;
    }
  }

  async function setupAirs() {
  airsStatusEl.textContent = "Tražim dozvolu za podešavanje AIRS sajta...";
  airsStatusEl.className = "";

  try {
    

    airsStatusEl.textContent = "Podešavanje u toku...";

    const result = await chrome.runtime.sendMessage({ type: "SETUP_AIRS" });

    if (!result?.ok) {
      airsStatusEl.textContent =
        "Podešavanje AIRS nije uspelo ❌ " + (result?.details || result?.error || "");
      airsStatusEl.className = "bad";
      return;
    }

    airsStatusEl.textContent = "AIRS podešen ✅";
    airsStatusEl.className = "ok";

    checkJsEl.textContent = result.javascript ? "dozvoljen" : "nije dozvoljen";
    checkPopupsEl.textContent = result.popups ? "dozvoljeni" : "nisu dozvoljeni";
    checkDownloadsEl.textContent = result.automaticDownloads
      ? "dozvoljeni"
      : "nisu dozvoljeni";
  } catch (e) {
    airsStatusEl.textContent =
      "Podešavanje AIRS nije uspelo ❌ " + String(e?.message || e || "");
    airsStatusEl.className = "bad";
  }
}

  async function loadAirsStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "GET_AIRS_SETUP_STATUS" });

      if (!result?.ok) {
        checkJsEl.textContent = "nepoznato";
        checkPopupsEl.textContent = "nepoznato";
        checkDownloadsEl.textContent = "nepoznato";
        return;
      }

      checkJsEl.textContent = result.javascript ? "dozvoljen" : "nije dozvoljen";
      checkPopupsEl.textContent = result.popups ? "dozvoljeni" : "nisu dozvoljeni";
      checkDownloadsEl.textContent = result.automaticDownloads
        ? "dozvoljeni"
        : "nisu dozvoljeni";
    } catch (e) {
      checkJsEl.textContent = "nepoznato";
      checkPopupsEl.textContent = "nepoznato";
      checkDownloadsEl.textContent = "nepoznato";
    }
  }

  async function autoValidateOnOpen() {
    const key = String(licenseInput.value || "").trim();

    if (!key) {
      clearLicenseResponse();
      setStatus("Unesi license key.", false);
      return;
    }

    // automatska validacija bez potrebe da korisnik klikne dugme
    await validateLicense({
      silent: true,
      saveKey: false,
      showCheckingMessage: false,
    });
  }

  saveBtn.addEventListener("click", () =>
    validateLicense({
      silent: false,
      saveKey: true,
      showCheckingMessage: true,
    })
  );

  if (setupAirsBtn) {
    setupAirsBtn.addEventListener("click", setupAirs);
  }

  togglePanelBtn.addEventListener("click", togglePanel);

  await updatePinWarning();
  await refreshPanelControl();
await loadLocalState();
await checkExtensionUpdate();
await loadAirsStatus();
await autoValidateOnOpen();
})();
