#!/usr/bin/env node
// Independent, read-only release checks. Never print matching source or secrets.
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, dirname, extname, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [directoryArgument, archiveArgument] = process.argv.slice(2);
if (!directoryArgument || !archiveArgument) {
  console.error('Usage: node verify-release.mjs <unpacked-package-directory> <package.tgz>');
  process.exit(2);
}
const root = resolve(directoryArgument), archivePath = resolve(archiveArgument);
const failures = [], checks = new Set();
const check = (rule, passed, file = 'package.json') => {
  checks.add(rule);
  if (!passed) failures.push({ file, rule });
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = new Map();
const safeRelative = name => name && !name.includes('\\') && !name.includes('\0')
  && !name.startsWith('/') && !/^[A-Za-z]:/.test(name)
  && name.split('/').every(part => part && part !== '.' && part !== '..');
const forbiddenPath = /(?:^|\/)(?:node_modules|evidence|runtime-sources|host-runtime-sources|sample|samples|\.git|\.dsh|\.env(?:\.[^/]*)?|credentials?|secrets?)(?:\/|$)|(?:^|\/)(?:client-build-meta\.json|.*\.(?:log|jsonl|pem|key|p12|pfx))$/i;
const allowedTextExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.json', '.yml', '.yaml', '.md', '.txt', '.html', '.css']);

async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    const name = relative(root, full).split('\\').join('/');
    check('safe-package-path', safeRelative(name), name);
    check('no-private-or-install-artifacts', !forbiddenPath.test(name), name);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) { check('no-symbolic-links', false, name); continue; }
    if (stat.isDirectory()) { await inventory(full); continue; }
    if (!stat.isFile()) { check('regular-files-only', false, name); continue; }
    files.set(name, await readFile(full));
  }
}

function tarFiles(compressed) {
  const bytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
  const archiveFiles = new Map();
  const text = (start, length) => bytes.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const sum = [...header].reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    const recordedSum = Number.parseInt(text(offset + 148, 8).trim(), 8);
    check('archive-header-checksum', sum === recordedSum, 'package.tgz');
    const prefix = text(offset + 345, 155), shortName = text(offset, 100);
    const name = prefix ? `${prefix}/${shortName}` : shortName;
    const size = Number.parseInt(text(offset + 124, 12).trim() || '0', 8);
    const kind = text(offset + 156, 1);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length) throw new Error('archive-size');
    check('archive-contained-package-paths', safeRelative(name.replace(/\/$/, '')) && name.startsWith('package/'), 'package.tgz');
    check('archive-regular-files-only', kind === '' || kind === '0' || kind === '5', 'package.tgz');
    if (kind === '' || kind === '0') {
      const localName = name.startsWith('package/') ? name.slice(8) : name;
      check('archive-unique-files', !archiveFiles.has(localName), localName);
      archiveFiles.set(localName, bytes.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return archiveFiles;
}

function importSpecifiers(source) {
  const result = [];
  const patterns = [
    /\bimport\s+(?:[^;'"()]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^;'"()]*?\s+from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) result.push(match[1]);
  return [...new Set(result)];
}

try {
  await inventory(root);
  const archiveFiles = tarFiles(await readFile(archivePath));
  check('archive-has-files', archiveFiles.size > 0, 'package.tgz');
  for (const [name, bytes] of files) check('archive-matches-unpacked-files', archiveFiles.has(name) && sha(archiveFiles.get(name)) === sha(bytes), name);
  for (const name of archiveFiles.keys()) check('archive-has-no-extra-files', files.has(name), name);

  const packageInfo = JSON.parse(files.get('package.json').toString('utf8'));
  check('expected-package-name', packageInfo.name === '@leoparkerou/dsh-seethrough');
  check('expected-beta-version', /^0\.4\.\d+-beta\.\d+$/.test(packageInfo.version));
  check('esm-backend', packageInfo.type === 'module');
  check('backend-export', packageInfo.exports?.['.'] === './index.js');
  check('client-export', packageInfo.exports?.['./client'] === './client.js');
  check('no-runtime-dependencies', !Object.keys(packageInfo.dependencies ?? {}).length && !Object.keys(packageInfo.optionalDependencies ?? {}).length);
  check('no-bundled-runtime-dependencies', !(packageInfo.bundleDependencies?.length || packageInfo.bundledDependencies?.length));
  check('no-install-scripts', !Object.keys(packageInfo.scripts ?? {}).some(name => /^(?:preinstall|install|postinstall|prepare)$/.test(name)));
  check('dsh-bundle-entry', packageInfo.dsh?.bundle?.patch === './cordis.patch.yml');
  const client = packageInfo.dsh?.client;
  check('dsh-client-entry', client?.platform === 'web' && client.immediately === true);
  for (const name of ['@deepseek-ai/dsh-client-ui-sidebar-right', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-api-session-controller']) {
    check('dsh-client-injections', client?.inject?.includes(name));
  }
  const sdkPackages = ['@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-llm'];
  for (const name of sdkPackages) {
    const version = packageInfo.peerDependencies?.[name];
    check('declared-host-sdk-peers', typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version));
    check('host-provided-sdk-peers', packageInfo.peerDependenciesMeta?.[name]?.optional === true);
    check('host-sdk-version-alignment', version === packageInfo.engines?.dsh);
  }
  for (const name of ['index.js', 'graph-agent.mjs', 'client.js', 'AGENT_GUIDE.md', 'cordis.patch.yml', 'THIRD_PARTY_LICENSES.txt']) check('required-release-files', files.has(name), name);

  const texts = new Map();
  const contentRules = [
    ['no-absolute-development-paths', /\/Users\/|\/home\/[^/\s]+\/|[A-Za-z]:[\\/]Users[\\/]|\/(?:private\/)?var\/folders\/|\/Applications\/DeepSeek Harness\.app/],
    ['no-credential-literals', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9_+\/-]{16,}['"]/i],
  ];
  for (const [name, bytes] of files) {
    const textual = allowedTextExtensions.has(extname(name).toLowerCase()) || /^(?:LICENSE|LICENCE|NOTICE)(?:\.[\w.-]+)?$/i.test(posix.basename(name));
    check('text-source-and-notices-only', textual, name);
    if (!textual) continue;
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { check('valid-utf8-files', false, name); continue; }
    texts.set(name, source);
    for (const [rule, pattern] of contentRules) check(rule, !pattern.test(source), name);
  }

  const backendFiles = new Set(), pending = ['index.js'];
  while (pending.length) {
    const name = pending.pop();
    if (backendFiles.has(name)) continue;
    backendFiles.add(name);
    check('runtime-import-closure', texts.has(name), name);
    if (!texts.has(name)) continue;
    for (const specifier of importSpecifiers(texts.get(name))) {
      if (specifier.startsWith('.')) {
        const dependency = posix.normalize(posix.join(posix.dirname(name), specifier));
        check('runtime-imports-contained', safeRelative(dependency), name);
        check('runtime-import-closure', files.has(dependency), name);
        if (files.has(dependency) && safeRelative(dependency)) pending.push(dependency);
      } else check('runtime-external-imports-host-or-node-only', specifier.startsWith('node:') || sdkPackages.includes(specifier), name);
    }
  }
  const worker = texts.get('graph-agent.mjs') ?? '';
  const workerImports = importSpecifiers(worker);
  for (const name of sdkPackages) check('ordinary-host-sdk-imports', workerImports.includes(name), 'graph-agent.mjs');
  check('no-hardcoded-sdk-resolution', !/hostRequire|createRequire|app\.asar|process\.resourcesPath/.test(worker), 'graph-agent.mjs');
  for (const name of backendFiles) {
    const source = texts.get(name) ?? '';
    check('no-test-setup-endpoints', !/['"]\/api\/factory-probe\/(?:setup|eval-setup)['"]/.test(source), name);
    check('no-source-body-tool-logging', !/\brecord\s*\(\s*\{[^;]*?\btype\s*:\s*['"]tool['"][^;]*?\b(?:args|value)\b/s.test(source), name);
    check('no-raw-source-log-payloads', !/(?:appendFile|writeFile)\s*\([^;]*?(?:JSON\.stringify\s*\(\s*(?:args|value|payload|runState)|\bsourceText\b)/s.test(source), name);
  }
  check('bundled-client-module-registration', /window\.__ModuleLoader__\.load\(/.test(texts.get('client.js') ?? ''), 'client.js');
  check('bundled-client-package-name', (texts.get('client.js') ?? '').includes('@leoparkerou/dsh-seethrough'), 'client.js');
  check('three-license-attribution', /three/i.test(texts.get('THIRD_PARTY_LICENSES.txt') ?? '') && /MIT License/.test(texts.get('THIRD_PARTY_LICENSES.txt') ?? ''), 'THIRD_PARTY_LICENSES.txt');

  console.log(JSON.stringify({ ok: failures.length === 0, package: packageInfo.name, version: packageInfo.version,
    fileCount: files.size, archiveFileCount: archiveFiles.size, runtimeClosure: [...backendFiles].sort(),
    ruleCount: checks.size, checks: [...checks].sort(), failures,
    limitation: 'Static checks cover package contents and dependency closure, not live DSH installation, model behavior, or semantic graph quality.' }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} catch {
  console.log(JSON.stringify({ ok: false, failures: [...failures, { file: 'release-input', rule: 'readable-valid-release-input' }] }, null, 2));
  process.exitCode = 1;
}
