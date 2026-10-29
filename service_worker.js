import { installRemoteWorker } from "./remote-worker.js";
import { TOOL_REGISTRY } from "./tools/registry.js";

const DEVICE_KEY = "device_id";
const DEVICE_FP_KEY = "device_fp";
const LICENSE_KEY = "license_key";
const LICENSE_CACHE_KEY = "license_status_cache_v2";
const TOOL_AUTH_CACHE_KEY = "tool_auth_cache_v2";

const VALIDATE_URL = "https://vetasist-app.vercel.app/api/license/validate";
const TOOL_FETCH_URL = "https://vetasist-app.vercel.app/api/tool/fetch";
const EXTENSION_VERSION_URL = "https://vetasist-app.vercel.app/api/extension/version";

const EXTENSION_UPDATE_ALARM = "vetassist_extension_update_check";
const EXTENSION_UPDATE_CHECK_MINUTES = 240;

const LICENSE_CACHE_TTL_MS = 60 * 1000;
const TOOL_AUTH_CACHE_TTL_MS = 60 * 1000;

const AIRS_MATCH_PATTERN = "https://airsso.vet.minpolj.gov.rs/*";
const AIRS_PRIMARY_URL =
  "https://airsso.vet.minpolj.gov.rs/pls/aimcs_prod/W_ANIMAL_LIST.STARTUP";

let toolRegistryCache = null;
let localToolManifestCache = {};

function makeDeviceId() {
  return "dev_" + crypto.randomUUID();
}

async function getStored(keys) {
  return chrome.storage.local.get(keys);
}

async function setStored(obj) {
  return chrome.storage.local.set(obj);
}

async function ensureDeviceId() {
  const st = await getStored([DEVICE_KEY]);
  if (st[DEVICE_KEY]) return st[DEVICE_KEY];

  const id = makeDeviceId();
  await setStored({ [DEVICE_KEY]: id });
  return id;
}

async function generateDeviceFingerprint() {
  const ua = navigator.userAgent || "";
  const lang = navigator.language || "";
  const platform = navigator.platform || "";

  const screenData =
    typeof screen !== "undefined"
      ? `${screen.width}x${screen.height}x${screen.colorDepth}`
      : "";

  const base = `${ua}|${lang}|${platform}|${screenData}|${chrome.runtime.id}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(base);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return "fp_" + hashHex.slice(0, 32);
}

async function ensureDeviceFingerprint() {
  const st = await getStored([DEVICE_FP_KEY]);
  if (st[DEVICE_FP_KEY]) return st[DEVICE_FP_KEY];

  const fp = await generateDeviceFingerprint();
  await setStored({ [DEVICE_FP_KEY]: fp });
  return fp;
}

function isFresh(ts, ttlMs) {
  return typeof ts === "number" && Date.now() - ts < ttlMs;
}

async function getLicenseCache() {
  const st = await getStored([LICENSE_CACHE_KEY]);
  return st[LICENSE_CACHE_KEY] || null;
}

async function setLicenseCache(data) {
  await setStored({
    [LICENSE_CACHE_KEY]: {
      ts: Date.now(),
      data,
    },
  });
}

async function clearLicenseCache() {
  await chrome.storage.local.remove(LICENSE_CACHE_KEY);
}

async function getToolAuthCacheMap() {
  const st = await getStored([TOOL_AUTH_CACHE_KEY]);
  return st[TOOL_AUTH_CACHE_KEY] || {};
}

async function setToolAuthCacheMap(map) {
  await setStored({
    [TOOL_AUTH_CACHE_KEY]: map,
  });
}

function buildToolAuthCacheEntryKey({ license_key, device_id, tool_code }) {
  return `${license_key}::${device_id}::${tool_code}`;
}

async function getToolAuthCacheEntry(params) {
  const map = await getToolAuthCacheMap();
  const key = buildToolAuthCacheEntryKey(params);
  return map[key] || null;
}

async function setToolAuthCacheEntry(params, data) {
  const map = await getToolAuthCacheMap();
  const key = buildToolAuthCacheEntryKey(params);

  map[key] = {
    ts: Date.now(),
    data,
  };

  await setToolAuthCacheMap(map);
}

async function clearToolAuthCache() {
  await chrome.storage.local.remove(TOOL_AUTH_CACHE_KEY);
}

function clearLocalManifestCache() {
  localToolManifestCache = {};
}

async function clearAllCaches() {
  await clearLicenseCache();
  await clearToolAuthCache();
  clearLocalManifestCache();
}

function normalizeRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") return null;
  if (runtime.mode !== "local_files") return null;

  const files = Array.isArray(runtime.files)
    ? runtime.files.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  return {
    mode: "local_files",
    files,
  };
}

async function loadToolRegistry() {
  if (toolRegistryCache) return toolRegistryCache;

  try {
    const registry =
      TOOL_REGISTRY && typeof TOOL_REGISTRY === "object" ? TOOL_REGISTRY : {};
    toolRegistryCache = registry;
    return registry;
  } catch (e) {
    console.warn("VetAssist registry load failed:", e);
    toolRegistryCache = {};
    return toolRegistryCache;
  }
}

async function getRegistryTool(toolCode) {
  const registry = await loadToolRegistry();
  return registry?.[toolCode] || null;
}

async function fetchLocalToolManifest(toolCode) {
  if (localToolManifestCache[toolCode]) {
    return localToolManifestCache[toolCode];
  }

  const registryTool = await getRegistryTool(toolCode);
  const manifestPath = registryTool?.manifest;

  if (!manifestPath) {
    return null;
  }

  const url = chrome.runtime.getURL(manifestPath);
  const res = await fetch(url, { cache: "no-store" });
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

  localToolManifestCache[toolCode] = normalized;
  return normalized;
}

async function getLocalRuntimeFromManifest(toolCode) {
  const manifest = await fetchLocalToolManifest(toolCode);
  if (!manifest?.files?.length) return null;

  return {
    mode: "local_files",
    files: manifest.files,
  };
}

async function resolveToolRuntime(toolCode, backendRuntime) {
  const normalizedBackend = normalizeRuntime(backendRuntime);
  if (normalizedBackend && normalizedBackend.files.length) {
    return normalizedBackend;
  }

  const localManifestRuntime = await getLocalRuntimeFromManifest(toolCode);
  if (localManifestRuntime && localManifestRuntime.files.length) {
    return localManifestRuntime;
  }

  return null;
}


function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((x) => Number(x) || 0);
  const pb = String(b || "").split(".").map((x) => Number(x) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }

  return 0;
}

function getLocalExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch {
    return "";
  }
}

async function setExtensionUpdateBadge(hasUpdate) {
  try {
    if (hasUpdate) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setBadgeBackgroundColor({ color: "#D93025" });
      await chrome.action.setTitle({ title: "VetAssist — dostupno je ažuriranje" });
      return;
    }

    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "VetAssist" });
  } catch (e) {
    console.warn("VetAssist badge update failed:", e);
  }
}

async function checkExtensionUpdateStatus() {
  const localVersion = getLocalExtensionVersion();

  try {
    const res = await fetch(EXTENSION_VERSION_URL, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      await setExtensionUpdateBadge(false);
      return {
        ok: false,
        error: data?.error || "extension_version_fetch_failed",
        status: res.status,
        local_extension_version: localVersion,
      };
    }

    const latestVersion = String(data.latest_extension_version || "");
    const hasUpdate =
      !!latestVersion &&
      !!localVersion &&
      compareVersions(latestVersion, localVersion) > 0;

    await setExtensionUpdateBadge(hasUpdate);

    return {
      ...data,
      local_extension_version: localVersion,
      has_update: hasUpdate,
    };
  } catch (e) {
    await setExtensionUpdateBadge(false);
    return {
      ok: false,
      error: "extension_version_fetch_failed",
      details: String(e?.message || e || ""),
      local_extension_version: localVersion,
    };
  }
}

async function scheduleExtensionUpdateChecks() {
  try {
    await chrome.alarms.create(EXTENSION_UPDATE_ALARM, {
      periodInMinutes: EXTENSION_UPDATE_CHECK_MINUTES,
    });
  } catch (e) {
    console.warn("VetAssist update alarm setup failed:", e);
  }
}


async function validateLicenseOnline() {
  const { license_key } = await getStored([LICENSE_KEY]);
  const device_id = await ensureDeviceId();
  const device_fp = await ensureDeviceFingerprint();

  if (!license_key) {
    const s = { ok: false, reason: "NO_LICENSE_KEY", ts: Date.now() };
    await setLicenseCache(s);
    return s;
  }

  try {
    const res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ license_key, device_id, device_fp }),
    });

    const data = await res.json().catch(() => ({}));

    const s = {
      ok: !!data.ok,
      reason: data.reason || (data.ok ? "OK" : "DENIED"),
      tools: Array.isArray(data.tools) ? data.tools : [],
      plan: data.plan || "",
      valid_until: data.valid_until || null,
      device_limit: data.device_limit ?? null,
      device_new: !!data.device_new,
      device_count: data.device_count ?? null,
      ts: Date.now(),
    };

    await setLicenseCache(s);
    return s;
  } catch (e) {
    const s = {
      ok: false,
      reason: "NETWORK_ERROR",
      details: String(e?.message || e || ""),
      ts: Date.now(),
    };
    await setLicenseCache(s);
    return s;
  }
}

async function validateLicenseCached() {
  const cached = await getLicenseCache();

  if (cached && isFresh(cached.ts, LICENSE_CACHE_TTL_MS)) {
    return {
      ...cached.data,
      cache_hit: true,
    };
  }

  const fresh = await validateLicenseOnline();
  return {
    ...fresh,
    cache_hit: false,
  };
}

async function fetchToolAuthorizationOnline(tool_code) {
  const { license_key } = await getStored([LICENSE_KEY]);
  const device_id = await ensureDeviceId();
  const device_fp = await ensureDeviceFingerprint();

  if (!license_key) {
    return {
      ok: false,
      error: "missing_license_key",
    };
  }

  if (!tool_code) {
    return {
      ok: false,
      error: "missing_tool_code",
    };
  }

  try {
    const res = await fetch(TOOL_FETCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        license_key,
        device_id,
        device_fp,
        tool_code,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || "tool_fetch_failed",
        details: data?.details || null,
        tool: data?.tool || null,
        meta: data?.meta || null,
        runtime: null,
        status: res.status,
      };
    }

    let localManifest = null;
    try {
      localManifest = await fetchLocalToolManifest(tool_code);
    } catch (e) {
      console.warn("VetAssist local manifest read failed:", e);
    }

    return {
      ok: true,
      tool: data.tool || null,
      script_url: data.script_url || "",
      runtime: normalizeRuntime(data.runtime),
      meta: data.meta || null,
      local_version: localManifest?.version || null,
      local_name: localManifest?.name || null,
    };
  } catch (e) {
    return {
      ok: false,
      error: "network_error",
      details: String(e?.message || e || ""),
    };
  }
}

async function fetchToolAuthorizationCached(tool_code) {
  const { license_key } = await getStored([LICENSE_KEY]);
  const device_id = await ensureDeviceId();

  if (!license_key) {
    return {
      ok: false,
      error: "missing_license_key",
    };
  }

  const cacheParams = { license_key, device_id, tool_code };
  const cached = await getToolAuthCacheEntry(cacheParams);

  if (cached && isFresh(cached.ts, TOOL_AUTH_CACHE_TTL_MS)) {
    return {
      ...cached.data,
      cache_hit: true,
    };
  }

  const fresh = await fetchToolAuthorizationOnline(tool_code);

  if (fresh?.ok) {
    await setToolAuthCacheEntry(cacheParams, fresh);
  }

  return {
    ...fresh,
    cache_hit: false,
  };
}

async function getActiveTabId(sender) {
  if (sender?.tab?.id) return sender.tab.id;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) {
    throw new Error("no_active_tab");
  }
  return tabs[0].id;
}

async function injectFilesIntoTab(tabId, files) {
  if (!Array.isArray(files) || !files.length) {
    throw new Error("no_files_to_inject");
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
    world: "MAIN",
  });
}

async function runToolInTab(tabId, runtime, tool_code = "") {
  const resolvedRuntime = await resolveToolRuntime(tool_code, runtime);

  if (!resolvedRuntime) {
    return {
      ok: false,
      error: "invalid_tool_runtime",
      tool: { code: tool_code || "" },
    };
  }

  if (resolvedRuntime.mode !== "local_files") {
    return {
      ok: false,
      error: "unsupported_runtime_mode",
      tool: { code: tool_code || "" },
    };
  }

  if (!resolvedRuntime.files.length) {
    return {
      ok: false,
      error: "tool_has_no_runtime_files",
      tool: { code: tool_code || "" },
    };
  }

  try {
    await injectFilesIntoTab(tabId, resolvedRuntime.files);
    return {
      ok: true,
      tool: {
        code: tool_code || "",
      },
      injected_files: resolvedRuntime.files,
      runtime: resolvedRuntime,
    };
  } catch (e) {
    return {
      ok: false,
      error: "inject_failed",
      details: String(e?.message || e || ""),
      tool: { code: tool_code || "" },
    };
  }
}

async function authorizeAndRunTool(tabId, tool_code) {
  const auth = await fetchToolAuthorizationCached(tool_code);
  if (!auth?.ok) return auth;

  const run = await runToolInTab(tabId, auth.runtime, tool_code);
  if (!run?.ok) return run;

  return {
    ok: true,
    tool: auth.tool || { code: tool_code },
    script_url: auth.script_url || "",
    runtime: run.runtime || auth.runtime || null,
    meta: auth.meta || null,
    injected_files: run.injected_files || [],
    local_name: auth.local_name || null,
    local_version: auth.local_version || null,
  };
}

async function restoreToolInTab(tabId, tool_code) {
  const auth = await fetchToolAuthorizationCached(tool_code);
  if (!auth?.ok) return auth;

  const run = await runToolInTab(tabId, auth.runtime, tool_code);
  if (!run?.ok) return run;

  return {
    ok: true,
    tool: auth.tool || { code: tool_code },
    script_url: auth.script_url || "",
    runtime: run.runtime || auth.runtime || null,
    meta: auth.meta || null,
    injected_files: run.injected_files || [],
    local_version: auth.local_version || null,
    local_name: auth.local_name || null,
  };
}

async function setJavascriptForAirs() {
  return chrome.contentSettings.javascript.set({
    primaryPattern: AIRS_MATCH_PATTERN,
    setting: "allow",
    scope: "regular",
  });
}

async function setPopupsForAirs() {
  return chrome.contentSettings.popups.set({
    primaryPattern: AIRS_MATCH_PATTERN,
    setting: "allow",
    scope: "regular",
  });
}

async function setAutomaticDownloadsForAirs() {
  return chrome.contentSettings.automaticDownloads.set({
    primaryPattern: AIRS_MATCH_PATTERN,
    setting: "allow",
    scope: "regular",
  });
}

async function setupAirsSiteSettings() {
  try {
    await setJavascriptForAirs();
    await setPopupsForAirs();
    await setAutomaticDownloadsForAirs();

    const status = await getAirsSetupStatus();

    return {
      ok: true,
      ...status,
    };
  } catch (e) {
    return {
      ok: false,
      error: "airs_setup_failed",
      details: String(e?.message || e || ""),
    };
  }
}

async function getAirsSetupStatus() {
  try {
    const [js, popups, downloads] = await Promise.all([
      chrome.contentSettings.javascript.get({
        primaryUrl: AIRS_PRIMARY_URL,
        incognito: false,
      }),
      chrome.contentSettings.popups.get({
        primaryUrl: AIRS_PRIMARY_URL,
        incognito: false,
      }),
      chrome.contentSettings.automaticDownloads.get({
        primaryUrl: AIRS_PRIMARY_URL,
        incognito: false,
      }),
    ]);

    return {
      ok: true,
      javascript: js?.setting === "allow",
      popups: popups?.setting === "allow",
      automaticDownloads: downloads?.setting === "allow",
    };
  } catch (e) {
    return {
      ok: false,
      error: "airs_status_read_failed",
      details: String(e?.message || e || ""),
    };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDeviceId();
  await ensureDeviceFingerprint();
  await setupAirsSiteSettings();
  await scheduleExtensionUpdateChecks();
  await checkExtensionUpdateStatus();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleExtensionUpdateChecks();
  await checkExtensionUpdateStatus();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm?.name === EXTENSION_UPDATE_ALARM) {
    await checkExtensionUpdateStatus();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_DEVICE_ID") {
        const device_id = await ensureDeviceId();
        sendResponse({ device_id });
        return;
      }
      if (msg?.type === "GET_PIN_STATUS") {
  chrome.action.getUserSettings()
    .then((settings) => {
      sendResponse({
        ok: true,
        isOnToolbar: !!settings.isOnToolbar,
      });
    })
    .catch((e) => {
      sendResponse({
        ok: false,
        error: String(e?.message || e || "pin_status_failed"),
      });
    });

  return true;
}

      if (msg?.type === "GET_EXTENSION_UPDATE_STATUS") {
        const result = await checkExtensionUpdateStatus();
        sendResponse(result);
        return;
      }
            if (msg?.type === "INSTALL_EXTENSION_UPDATE") {
        try {
          const result = await chrome.runtime.requestUpdateCheck();

          if (result?.status === "update_available") {
            sendResponse({
              ok: true,
              status: "update_available",
              version: result?.version || null,
            });

            setTimeout(() => {
              chrome.runtime.reload();
            }, 1500);

            return;
          }

          sendResponse({
            ok: true,
            status: result?.status || "no_update",
            version: result?.version || null,
          });

          return;
        } catch (e) {
          sendResponse({
            ok: false,
            error: "extension_update_failed",
            details: String(e?.message || e || ""),
          });

          return;
        }
      }

      if (msg?.type === "GET_LICENSE_STATUS") {
        const s = await validateLicenseCached();
        sendResponse(s || { ok: null });
        return;
      }

      if (msg?.type === "VALIDATE_LICENSE") {
        const s = await validateLicenseOnline();
        sendResponse(s);
        return;
      }

      if (msg?.type === "FETCH_TOOL") {
        const result = await fetchToolAuthorizationOnline(msg.tool_code);
        sendResponse(result);
        return;
      }

      if (msg?.type === "RUN_TOOL") {
        const tabId = await getActiveTabId(sender);
        const result = await authorizeAndRunTool(tabId, msg.tool_code);
        sendResponse(result);
        return;
      }

      if (msg?.type === "RESTORE_TOOL") {
        const tabId = await getActiveTabId(sender);
        const result = await restoreToolInTab(tabId, msg.tool_code);
        sendResponse(result);
        return;
      }

      if (msg?.type === "CLEAR_CACHES") {
        await clearAllCaches();
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "SETUP_AIRS") {
        const result = await setupAirsSiteSettings();
        sendResponse(result);
        return;
      }

      if (msg?.type === "GET_AIRS_SETUP_STATUS") {
        const result = await getAirsSetupStatus();
        sendResponse(result);
        return;
      }
      

      sendResponse({ ok: false, reason: "UNKNOWN_MESSAGE" });
    } catch (e) {
      sendResponse({
        ok: false,
        error: "service_worker_error",
        details: String(e?.message || e || ""),
      });
    }
  })();

  return true;
});
installRemoteWorker({ ensureDeviceId, ensureDeviceFingerprint });
