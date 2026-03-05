const $ = (id) => document.getElementById(id);

async function load() {
  const { license_key, device_id } = await chrome.storage.sync.get(["license_key", "device_id"]);
  if (license_key) $("license").value = license_key;
  if (device_id) $("deviceId").value = device_id;
}

$("save").addEventListener("click", async () => {
  const license_key = $("license").value.trim();
  const device_id = $("deviceId").value.trim();

  if (!license_key) return ($("msg").textContent = "Missing license key.");
  if (!device_id) return ($("msg").textContent = "Missing device id.");

  await chrome.storage.sync.set({ license_key, device_id });
  $("msg").textContent = "Saved.";
});

load();