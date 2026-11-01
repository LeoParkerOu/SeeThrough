# 0.4.0-beta.1 validation

Validated during release preparation on macOS with Node.js 24.22.1 and DSH 0.2.1-rc.3.

- Clean dependency installation using the committed lockfile completed.
- All 8 Node test-runner tests passed, including geometry checks and saved-graph behavior. The geometry test uses synthetic project-independent data.
- The release verifier passed 38 categories of checks, including archive integrity, runtime import closure, host SDK metadata and credential/local-path checks. The runtime archive contains 19 files.
- The exact `.tgz` was installed with the host plugin manager into a separate temporary DSH profile. Its bundle appeared in the composed configuration and the web host started without plugin errors. The initial browser page loaded without JavaScript exceptions.

This release check did not rerun live model generation in the fresh profile, which has no model credentials. Full desktop interactions, physical trackpad gestures, other operating systems and other DSH versions are not newly certified by these checks. Historical prototype model tests are not represented as release-package end-to-end tests.
