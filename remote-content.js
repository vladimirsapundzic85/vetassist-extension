(() => {
  if (window.top !== window) return;
  const TOOL = 'goveda_pregled_kretanja';
  const STATE = 'vetassist_goveda_pregled_kretanja_v103';
  const ACTIVE = 'vetassist_active_tool_v1';
  const PENDING = 'vetassist_tool_start_payloads_v1';
  const MARKER = 'vetassist_remote_job_v1';
  const read = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  function loggedIn() {
    const docs = [];
    function walk(w) {
      try { docs.push(w.document); for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]); } catch {}
    }
    walk(window);
    return docs.some(d => /log\s*out|odjav[ai]/i.test(d.body?.innerText || '') || Array.from(d.querySelectorAll('a')).some(a => /logout/i.test(a.href)));
  }
  function inspect(jobId) {
    if (!loggedIn()) return { status: 'login' };
    const st = read(STATE);
    if (jobId) {
      if (st?.remoteJobId !== jobId) return { status: 'interrupted' };
      if (st.phase === 'done') return { status: 'completed', rows: st.results };
      return { status: st.active ? 'running' : 'interrupted' };
    }
    if (sessionStorage.getItem(ACTIVE) || st?.active || sessionStorage.getItem(MARKER)) return { status: 'busy' };
    return { status: 'ready' };
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === 'VA_REMOTE_STATUS') { respond(inspect(msg.job_id)); return; }
    if (msg?.type === 'VA_REMOTE_CLEAR') {
      if (sessionStorage.getItem(MARKER) === msg.job_id) {
        // Tool reset events are also used by the existing manual panel.
        window.dispatchEvent(new CustomEvent('vetassist-tool-control', { detail: { tool: TOOL, action: 'reset' } }));
        const pending = read(PENDING) || {};
        if (pending[TOOL]?.remoteJobId === msg.job_id) { delete pending[TOOL]; sessionStorage.setItem(PENDING, JSON.stringify(pending)); }
        sessionStorage.removeItem(MARKER);
        if (sessionStorage.getItem(ACTIVE) === TOOL) sessionStorage.removeItem(ACTIVE);
      }
      respond({ ok: true }); return;
    }
    if (msg?.type !== 'VA_REMOTE_START') return;
    (async () => {
      const job = msg.job;
      if (inspect().status !== 'ready') throw new Error('airs_not_ready_or_busy');
      if (job?.tool_code !== TOOL || job.reportMode !== 'all' || !Array.isArray(job.animal_ids) || !job.animal_ids.length || job.animal_ids.length > 20 || !job.animal_ids.every(id => typeof id === 'string' && /^\d{10}$/.test(id)) || typeof job.id !== 'string') throw new Error('invalid_job');
      const pending = read(PENDING) || {};
      pending[TOOL] = { rawInput: job.animal_ids.join('\n'), reportMode: 'all', timeoutSec: 8, remoteJobId: job.id };
      sessionStorage.setItem(MARKER, job.id);
      sessionStorage.setItem(PENDING, JSON.stringify(pending));
      sessionStorage.setItem(ACTIVE, TOOL);
      const result = await chrome.runtime.sendMessage({ type: 'RUN_TOOL', tool_code: TOOL });
      if (!result?.ok) throw new Error('launch_failed');
      respond({ ok: true });
    })().catch(e => respond({ ok: false, error: e.message }));
    return true;
  });
  // Wakes the service worker after AIRS navigation; task state remains in sessionStorage.
  chrome.runtime.sendMessage({ type: 'VA_REMOTE_WAKE' }).catch(() => {});
})();
