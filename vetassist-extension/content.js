(async () => {

  const cfg = await chrome.storage.sync.get(["license_key", "device_id"]);

  // očisti license key
  const license_key = (cfg.license_key || "")
    .replace("License key", "")
    .trim()
    .toUpperCase();

  if (!license_key || !cfg.device_id) {
    console.log("VetAssist: license not configured");
    return;
  }

  const device_fp = cfg.device_id;

  try {

    const res = await fetch("https://vetasist-app.vercel.app/api/entitlements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        license_key: license_key,
        device_id: cfg.device_id,
        device_fp: device_fp
      })
    });

    const data = await res.json();

    if (!data.ok) {
      console.log("VetAssist error:", data);
      return;
    }

    console.log("VetAssist tools:", data.tools);

    for (const tool of data.tools) {

      const script = document.createElement("script");
      script.src = tool.url;
      script.type = "text/javascript";

      document.documentElement.appendChild(script);

      console.log("VetAssist loaded:", tool.tool_code);

    }

  } catch (e) {
    console.log("VetAssist fetch error:", e);
  }

})();
