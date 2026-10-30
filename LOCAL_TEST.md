# Local-only extension test build

This build is for the local VetAssist backend pilot. It does not edit the source extension. The generated unpacked package is named `VetAssist LOCAL TEST`, rewrites backend requests to `http://127.0.0.1:3000`, allows only the local app and Supabase Storage API, and removes the production VetAssist backend from `host_permissions`.

## Build

From the extension repository root, run:

```powershell
node scripts/build-local-test.mjs
```

Load `dist-local-test` as an unpacked extension in a separate Chrome profile. Do not load the normal extension folder for this test. Keep GOO task intake disabled until the local license, tool download, and worker routes have all been verified. The local test package still has access to AIRS because AIRS is the target system; enabling intake can cause a real AIRS query.

The script fails if a production backend URL remains in runtime JavaScript or JSON. The generated directory is ignored by Git. Never put production credentials in the local fixture or test profile.
