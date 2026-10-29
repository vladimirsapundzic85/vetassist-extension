# GOO remote-check pilot (test build 1.0.14)

Paired backend: `vladimirsapundzic85/vetasist-app`, branch `feat/airs-remote-checks`; setup and environment details are in its `docs/airs-remote-checks.md`. Do not enable intake until that backend and its private jobs table are configured.

The existing manual panel is preserved. A new popup toggle enables remote intake for one selected logged-in AIRS tab. Polling uses Chrome alarms (30 seconds, subject to Chrome scheduling). The service worker uses the existing license/device credentials and a fixed HTTPS backend endpoint. No arbitrary tool names, scripts or URLs are accepted from jobs; only local `goveda_pregled_kretanja` in all-movements mode.

Movement tool 1.0.3 adds a job association and skips file download only for remote jobs; 1.0.2 remains in the repository. Results are read from that tool's session state after its done phase, sent to the backend and retained in an outbox until acknowledged. Claim tokens stay inside extension storage/service-worker messages, never in page sessionStorage or DOM. Page data is treated as untrusted and validated again server-side.

Install as an unpacked test extension in a separate Chrome profile (do not run stable and test extensions together). Activate the existing license and note the test Device ID for backend allowlisting. Open AIRS, log in and turn on **GOO probne provere**. The target tab must remain open; do not use it for manual tools during a job. Turning intake off requests cancellation of that job. A closed browser cannot execute checks; an expired session requires human login.

If testing against a preview backend, update the fixed endpoint in `remote-worker.js` and the manifest host permission together. Default endpoint is the existing production VetAssist host. This branch does not publish an extension release or change the backend's advertised latest extension version.

Run mock tests: `node --test tests/*.test.mjs`. Syntax checks: `node --check remote-worker.js` and the other new JavaScript files. These are not a substitute for the real AIRS/Chrome/MCP acceptance checklist in the backend documentation.
