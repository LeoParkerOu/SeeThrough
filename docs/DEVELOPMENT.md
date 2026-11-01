# Development

SeeThrough targets DSH 0.2.1-rc.3. This beta uses host APIs that may change.

## Files

- `index.js`: host tools, graph selection, canvas actions and acknowledgements.
- `graph-agent.mjs`: original-agent / graph-agent coordination.
- `graph-agent-files.mjs`, `graph-library.mjs`: bounded source snapshots, graph storage and safe writes.
- `graph-store.mjs`, `source-bindings.mjs`: graph validation and source associations.
- `client-source.jsx`: host UI, component menus and saved question views.
- `factory-scene.js`, `factory-assets.js`, layout/routing modules: Three.js rendering.
- `AGENT_GUIDE.md`: graph format and semantic authoring instructions.

The browser bundle uses the host's React instance. Three.js is bundled; esbuild is a build-only dependency. The backend imports the host-provided `@deepseek-ai/dsh-subagent` and `@deepseek-ai/dsh-llm` SDKs. Do not bundle copies of the host.

## Build and test

Use `npm ci --omit=peer`, then `npm test` and `npm run release`.
The release script creates an allowlisted, precompiled DSH package with no install scripts or third-party runtime downloads. Its verifier checks archive integrity, backend import closure, host metadata and accidental inclusion of local paths, credentials or development artifacts. These checks are not live model or semantic-quality tests.

Install the resulting archive through DSH's plugin UI. Use a small disposable repository for first-generation and edit/sync checks. Do not enable the legacy factory probe alongside SeeThrough: internal tool names, routes and storage remain compatible with that prototype.

## Release checklist

1. Update the version and the release command's archive filename in `package.json`, README and changelog.
2. Run a clean dependency installation, tests, build and release verification.
3. Inspect package contents, notices and checksums.
4. Check installation and generation in a compatible DSH host; report the exact limits of testing.
5. Attach the `.tgz`, ZIP and checksums to a GitHub release.

The source tree intentionally excludes saved graphs, conversations, model configuration and project-specific evaluation data. Please submit minimal synthetic examples with bug reports; redact secrets and local paths.
