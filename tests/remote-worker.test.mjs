import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Data URL loads the browser module without changing the extension package type.
const code = await readFile(new URL('../remote-worker.js', import.meta.url), 'utf8');
const { installRemoteWorker } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const KEY = 'vetassist_remote_worker_v1';
function harness() {
  const job = { id: 'job-1', tool_code: 'goveda_pregled_kretanja', animal_ids: ['7100000001'], reportMode: 'all', claim_token: 'private-claim', expires_at: new Date(Date.now() + 600000).toISOString() };
  const data = { [KEY]: { enabled: true, tabId: 1 }, license_key: 'test-license' };
  const requests = [], messages = [];
  let view = { status: 'ready' }, tabClosed = false, failReport = false;
  globalThis.chrome = {
    storage: { local: { get: async key => typeof key === 'string' ? { [key]: structuredClone(data[key]) } : structuredClone(data), set: async v => Object.assign(data, structuredClone(v)) } },
    tabs: { get: async () => { if (tabClosed) throw new Error('closed'); return { url: 'https://airsso.vet.minpolj.gov.rs/pls/test' }; }, sendMessage: async (id, msg) => { messages.push(msg); return structuredClone(view); } },
    alarms: { create() {}, onAlarm: { addListener() {} } }, runtime: { onMessage: { addListener() {} } },
  };
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body); requests.push(body);
    if (body.action === 'report' && failReport) throw new Error('network_lost');
    return { ok: true, status: 200, json: async () => body.action === 'claim' ? { ok: true, job } : { ok: true, accepted: true } };
  };
  const worker = installRemoteWorker({ ensureDeviceId: async () => 'test-device', ensureDeviceFingerprint: async () => 'test-fp' });
  return { data, job, requests, messages, tick: worker.tick, setView: v => { view = v; }, close: () => { tabClosed = true; }, fail: v => { failReport = v; } };
}
test('one claim, structured result, no claim token/license sent to page', async () => {
  const h = harness(); await h.tick();
  assert.equal(h.data[KEY].active.id, 'job-1');
  const start = h.messages.find(m => m.type === 'VA_REMOTE_START');
  // Checked below: worker strips the claim capability before passing the task to content.
  assert.equal(start.job.claim_token, undefined);
  assert.equal(JSON.stringify(h.messages).includes('test-license'), false);
  h.setView({ status: 'completed', rows: [{ example: 'result' }] }); await h.tick();
  assert.deepEqual(h.requests.map(r => r.action), ['claim', 'report']);
  assert.equal(h.data[KEY].active, null);
});
test('lost response retains outbox and retries report without another AIRS start', async () => {
  const h = harness(); await h.tick(); h.setView({ status: 'completed', rows: [{ example: 'result' }] }); h.fail(true); await h.tick();
  assert.ok(h.data[KEY].outbox); h.fail(false); await h.tick();
  assert.deepEqual(h.requests.map(r => r.action), ['claim', 'report', 'report']);
  assert.equal(h.messages.filter(m => m.type === 'VA_REMOTE_START').length, 1);
});
test('login wall/busy state prevents claiming', async () => {
  for (const status of ['login', 'busy']) { const h = harness(); h.setView({ status }); await h.tick(); assert.equal(h.requests.length, 0); }
});
test('closed tab and operator stop are failures, never empty success', async () => {
  for (const reason of ['tab_closed', 'operator_stopped']) {
    const h = harness(); await h.tick();
    if (reason === 'tab_closed') h.close(); else h.data[KEY].enabled = false;
    await h.tick(); assert.equal(h.requests[1].status, 'failed'); assert.equal(h.requests[1].error, reason);
  }
});
