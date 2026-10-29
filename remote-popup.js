const button = document.getElementById('remote_toggle');
const status = document.getElementById('remote_status');
let enabled = false;
async function refresh() {
  const value = await chrome.runtime.sendMessage({ type: 'VA_REMOTE_GET' });
  if (!value?.ok) throw new Error(value?.error || 'worker_unavailable');
  enabled = value.enabled;
  button.textContent = enabled ? 'Isključi prijem zadataka' : 'Uključi prijem zadataka na ovom AIRS tabu';
  const labels = { waiting: 'Čeka zadatak', running: 'Provera u toku', login: 'Potrebna AIRS prijava', busy: 'Tab je zauzet', completed: 'Rezultat poslat', failed: 'Provera prekinuta' };
  status.textContent = `${enabled ? 'Uključeno' : 'Isključeno'}${value.last ? ' — ' + (labels[value.last] || value.last) : ''}${value.error ? ' — ' + value.error : ''}`;
}
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const value = await chrome.runtime.sendMessage({ type: 'VA_REMOTE_SET', enabled: !enabled });
    if (!value?.ok) throw new Error(value?.error || 'worker_unavailable');
    await refresh();
  } catch (e) { status.textContent = e.message; }
  finally { button.disabled = false; }
});
refresh().catch(e => { status.textContent = e.message; });
