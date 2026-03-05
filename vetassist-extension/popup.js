function normalizeLicenseKey(input) {
  let s = String(input || "").trim();

  // remove common prefixes like "License key", "Licence key", with optional ":" or "-"
  s = s.replace(/^\s*(licen[cs]e\s*key)\s*[:\-]?\s*/i, "");

  // remove any remaining leading junk
  s = s.trim();

  // keep only letters, digits, hyphen; convert spaces/underscores to hyphen
  s = s.replace(/[\s_]+/g, "-");
  s = s.replace(/[^a-z0-9-]/gi, "");
  s = s.toUpperCase();

  // collapse multiple hyphens
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");

  return s;
}

function normalizeDeviceId(input) {
  let s = String(input || "").trim();
  // keep it simple, but remove weird whitespace
  s = s.replace(/\s+/g, " ");
  return s;
}

document.addEventListener("DOMContentLoaded", async () => {
  const licenseEl = document.getElementById("license_key");
  const deviceEl = document.getElementById("device_id");
  const saveBtn = document.getElementById("save");

  const cfg = await chrome.storage.sync.get(["license_key", "device_id"]);
  if (licenseEl) licenseEl.value = cfg.license_key || "";
  if (deviceEl) deviceEl.value = cfg.device_id || "";

  saveBtn?.addEventListener("click", async () => {
    const rawLicense = licenseEl?.value ?? "";
    const rawDevice = deviceEl?.value ?? "";

    const license_key = normalizeLicenseKey(rawLicense);
    const device_id = normalizeDeviceId(rawDevice);

    await chrome.storage.sync.set({ license_key, device_id });

    // optional: show in console for debugging
    console.log("VetAssist saved:", { license_key, device_id });
  });
});
