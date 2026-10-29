// Opt-in, single-tab pilot. AIRS cookies stay in the browser.
const KEY = 'vetassist_remote_worker_v1';
const ALARM = 'vetassist_remote_worker_tick';
const ENDPOINT = 'https://vetasist-app.vercel.app/api/automation/worker';
const AIRS = 'https://airsso.vet.minpolj.gov.rs/';

export function installRemoteWorker({ ensureDeviceId, ensureDeviceFingerprint }) {
  let locked = false;
  async function read() { return (await chrome.storage.local.get(KEY))[KEY] || { enabled: false }; }
  async function save(value) { await chrome.storage.local.set({ [KEY]: value }); }
  async function request(body) {
    const { license_key } = await chrome.storage.local.get('license_key');
    if (!license_key) throw new Error('missing_license_key');
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, license_key, device_id: await ensureDeviceId(), device_fp: await ensureDeviceFingerprint() }),
      signal: AbortSignal.timeout(15000),
    });
    const value = await response.json();
    if (!response.ok || !value.ok) throw Object.assign(new Error(value.error || 'server_error'), { status: response.status });
    return value;
  }
  async function tell(tabId, message) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith(AIRS)) throw new Error('tab_closed');
    return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  }
  async function tick() {
    if (locked) return;
    locked = true;
    try {
      let state = await read();
      if (state.active) {
        const job = state.active;
        let report = state.outbox;
        if (!report) {
          if (!state.enabled) report = { status: 'failed', error: 'operator_stopped' };
          else if (Date.now() > Date.parse(job.expires_at) - 10000) report = { status: 'failed', error: 'run_timeout' };
          else {
            try {
              const view = await tell(state.tabId, { type: 'VA_REMOTE_STATUS', job_id: job.id });
              if (view?.status === 'completed') report = { status: 'completed', rows: view.rows };
              else if (view?.status === 'login') report = { status: 'failed', error: 'airs_login_required' };
              else if (view?.status === 'interrupted' && Date.now() - state.claimedAt > 30000) report = { status: 'failed', error: 'execution_interrupted' };
            } catch {
              // Navigation briefly disconnects content scripts. Only a closed tab fails immediately.
              const tab = await chrome.tabs.get(state.tabId).catch(() => null);
              if (!tab || !tab.url?.startsWith(AIRS)) report = { status: 'failed', error: 'tab_closed' };
            }
          }
          if (report) {
            state.outbox = report;
            await save(state); // persist before HTTP; retry after a lost response
            await tell(state.tabId, { type: 'VA_REMOTE_CLEAR', job_id: job.id }).catch(() => {});
          }
        }
        if (report) {
          try {
            await request({ action: 'report', job_id: job.id, claim_token: job.claim_token, ...report });
            state = { ...state, active: null, outbox: null, last: report.status, error: null };
            await save(state);
          } catch (e) {
            // Permanent conflict is visible and disables new work. Never silently drop an outbox.
            await save({ ...state, enabled: e.status >= 400 && e.status < 500 ? false : state.enabled, error: e.message });
          }
        }
        return;
      }
      if (!state.enabled) return;
      const view = await tell(state.tabId, { type: 'VA_REMOTE_STATUS' });
      if (view?.status !== 'ready') {
        await save({ ...state, last: view?.status || 'waiting' });
        return;
      }
      const { job } = await request({ action: 'claim' });
      if (!job) { await save({ ...state, last: 'waiting', error: null }); return; }
      if (job.tool_code !== 'goveda_pregled_kretanja' || job.reportMode !== 'all') throw new Error('unsupported_job');
      state = { ...state, active: job, claimedAt: Date.now(), outbox: null, error: null, last: 'running' };
      await save(state);
      // A lost start response is not retried: the browser may already be executing the job.
      const { id, animal_ids, tool_code, reportMode } = job;
      await tell(state.tabId, { type: 'VA_REMOTE_START', job: { id, animal_ids, tool_code, reportMode } }).catch(() => {});
    } catch (e) {
      const state = await read();
      await save({ ...state, error: e.message });
    } finally { locked = false; }
  }
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void tick(); });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!['VA_REMOTE_GET', 'VA_REMOTE_SET', 'VA_REMOTE_WAKE'].includes(msg?.type)) return;
    if (sender.id !== chrome.runtime.id) return;
    (async () => {
      if (msg.type === 'VA_REMOTE_SET') {
        // Only the extension popup can turn this on/off; AIRS page scripts cannot.
        if (sender.tab || sender.url !== chrome.runtime.getURL('popup.html')) throw new Error('popup_required');
        const state = await read();
        if (locked) throw new Error('worker_busy_try_again');
        if (msg.enabled) {
          if (state.active || state.outbox) throw new Error('previous_job_unresolved');
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tab = tabs[0];
          if (!tab?.id || !tab.url?.startsWith(AIRS)) throw new Error('open_airs_tab');
          const view = await tell(tab.id, { type: 'VA_REMOTE_STATUS' });
          if (view?.status !== 'ready') throw new Error('airs_not_ready_or_busy');
          await save({ enabled: true, tabId: tab.id, last: 'waiting' });
        } else await save({ ...state, enabled: false });
        void tick();
      }
      if (msg.type === 'VA_REMOTE_WAKE') { void tick(); respond({ ok: true }); return; }
      const state = await read();
      // Do not expose claim capabilities or stored result rows to the popup.
      respond({ ok: true, enabled: !!state.enabled, job_id: state.active?.id || null, last: state.last || '', error: state.error || '' });
    })().catch(e => respond({ ok: false, error: e.message }));
    return true;
  });
  return { tick };
}
