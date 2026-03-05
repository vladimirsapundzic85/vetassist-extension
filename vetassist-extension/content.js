function normalizeLicenseKey(input) {
  let s = String(input || "").trim();
  s = s.replace(/^\s*(licen[cs]e\s*key)\s*[:\-]?\s*/i, "");
  s = s.trim();
  s = s.replace(/[\s_]+/g, "-");
  s = s.replace(/[^a-z0-9-]/gi, "");
  s = s.toUpperCase();
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

function toolLocalPath(tool_code, version) {
  // Folder struktura u repo (ti je praviš):
  // tools/<tool_code>/<version>/script.js
  return `tools/${tool_code}/${version}/script.js`;
}

async function injectScriptFile(path) {
  return new Promise((resolve, reject) => {
    const url = chrome.runtime.getURL(path);
    const script = document.createElement("script");
    script.src = url;
    script.type = "text/javascript";
    script.onload = () => resolve(url);
    script.onerror = (e) => reject(new Error(`Failed to load ${url}`));
    (document.head || document.documentElement).appendChild(script);
  });
}

(async () => {
  const cfg = await chrome.storage.sync.get(["license_key", "device_id"]);

  const license_key = normalizeLicenseKey(cfg.license_key);
  const device_id = String(cfg.device_id || "").trim();

  if (!license_key || !device_id) {
    console.log("VetAssist: license not configured");
    return;
  }

  try {
    const res = await fetch("https://vetasist-app.vercel.app/api/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key,
        device_id,
        device_fp: device_id
      })
    });

    const data = await res.json();

    if (!data.ok) {
      console.log("VetAssist error:", data);
      return;
    }

    console.log("VetAssist tools:", data.tools);

    for (const tool of data.tools || []) {
      const localPath = toolLocalPath(tool.tool_code, tool.version);

      try {
        const loadedUrl = await injectScriptFile(localPath);
        console.log("VetAssist loaded:", tool.tool_code, "from", loadedUrl);
      } catch (err) {
        console.log("VetAssist tool load failed:", tool.tool_code, err);
      }
    }
  } catch (e) {
    console.log("VetAssist fetch error:", e);
  }
})();
