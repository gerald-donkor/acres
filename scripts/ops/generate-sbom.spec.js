const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  formatPurl,
  generateSbom,
  validateLicenseCompliance,
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_BANNED_LICENSE_PATTERNS,
} = require("./generate-sbom");

test("formatPurl: accurately formats scoped and unscoped packages", () => {
  assert.equal(formatPurl("react", "19.2.8"), "pkg:npm/react@19.2.8");
  assert.equal(
    formatPurl("@nestjs/core", "11.2.1"),
    "pkg:npm/%40nestjs/core@11.2.1",
  );
  assert.equal(
    formatPurl("@acres/shared", "0.1.0"),
    "pkg:npm/%40acres/shared@0.1.0",
  );
});

test("generateSbom: produces valid CycloneDX v1.5 JSON with required metadata and components", () => {
  const result = generateSbom();
  assert.ok(result.bom, "Expected bom object");
  assert.equal(result.bom.bomFormat, "CycloneDX");
  assert.equal(result.bom.specVersion, "1.5");
  assert.ok(result.bom.serialNumber.startsWith("urn:uuid:"));
  assert.equal(result.bom.version, 1);
  assert.equal(result.bom.metadata.component.name, "acres");
  assert.equal(
    result.bom.metadata.tools.components[0].name,
    "acres-sbom-generator",
  );
  assert.ok(Array.isArray(result.bom.components));
  assert.ok(
    result.bom.components.length > 500,
    `Expected >500 components, got ${result.bom.components.length}`,
  );

  // Validate random component structure
  const first = result.bom.components[0];
  assert.equal(first.type, "library");
  assert.ok(first.name);
  assert.ok(first.version);
  assert.ok(first.purl.startsWith("pkg:npm/"));
  assert.ok(Array.isArray(first.licenses));
  assert.ok(first.licenses.length > 0);
});

test("generateSbom: excludes devDependencies like typescript, eslint, and playwright", () => {
  const result = generateSbom();
  const componentNames = new Set(result.bom.components.map((c) => c.name));

  assert.ok(result.devExcludedCount > 0, "Expected devExcludedCount > 0");
  assert.equal(
    componentNames.has("typescript"),
    false,
    "typescript should be excluded from prod SBOM",
  );
  assert.equal(
    componentNames.has("eslint"),
    false,
    "eslint should be excluded from prod SBOM",
  );
  assert.equal(
    componentNames.has("@playwright/test"),
    false,
    "@playwright/test should be excluded from prod SBOM",
  );
  assert.equal(
    componentNames.has("@types/node"),
    false,
    "@types/node should be excluded from prod SBOM",
  );

  // Assert essential production dependencies ARE present
  assert.ok(componentNames.has("react"), "react must be in prod components");
  assert.ok(
    componentNames.has("@nestjs/core"),
    "@nestjs/core must be in prod components",
  );
  assert.ok(
    componentNames.has("class-validator"),
    "class-validator must be in prod components",
  );
});

test("generateSbom: extracts SHA-512 integrity hashes when present", () => {
  const result = generateSbom();
  const componentsWithHashes = result.bom.components.filter(
    (c) => c.hashes && c.hashes.length > 0 && c.hashes[0].alg === "SHA-512",
  );
  assert.ok(
    componentsWithHashes.length > 700,
    `Expected >700 components with SHA-512 hashes, got ${componentsWithHashes.length}`,
  );
  const sampleHash = componentsWithHashes[0].hashes[0].content;
  assert.match(
    sampleHash,
    /^[a-f0-9]{128}$/,
    "SHA-512 content must be a 128-char hex string",
  );
});

test("validateLicenseCompliance: production components comply 100% with permitted permissive licenses", () => {
  const result = generateSbom();
  const compliance = validateLicenseCompliance(result.components);

  assert.equal(
    compliance.compliant,
    true,
    `Expected full compliance, violations: ${JSON.stringify(compliance.violations)}`,
  );
  assert.equal(compliance.violations.length, 0);
  assert.equal(compliance.totalComponents, result.components.length);
});

test("validateLicenseCompliance: fails closed and detects banned copyleft licenses (AGPL, GPL, SSPL)", () => {
  const mockComponents = [
    {
      name: "permissive-lib",
      version: "1.0.0",
      purl: "pkg:npm/permissive-lib@1.0.0",
      licenses: [{ license: { id: "MIT" } }],
    },
    {
      name: "agpl-bad-lib",
      version: "2.0.0",
      purl: "pkg:npm/agpl-bad-lib@2.0.0",
      licenses: [{ license: { id: "AGPL-3.0-only" } }],
    },
    {
      name: "gpl-bad-lib",
      version: "3.0.0",
      purl: "pkg:npm/gpl-bad-lib@3.0.0",
      licenses: [{ license: { id: "GPL-3.0" } }],
    },
    {
      name: "sspl-bad-lib",
      version: "1.0.0",
      purl: "pkg:npm/sspl-bad-lib@1.0.0",
      licenses: [{ license: { id: "SSPL" } }],
    },
  ];

  const compliance = validateLicenseCompliance(mockComponents);
  assert.equal(compliance.compliant, false);
  assert.equal(compliance.violations.length, 3);
  assert.ok(
    compliance.violations.some((v) => v.component === "agpl-bad-lib@2.0.0"),
  );
  assert.ok(
    compliance.violations.some((v) => v.component === "gpl-bad-lib@3.0.0"),
  );
  assert.ok(
    compliance.violations.some((v) => v.component === "sspl-bad-lib@1.0.0"),
  );
});

test("validateLicenseCompliance: validates compound expressions correctly", () => {
  const validCompound = [
    {
      name: "dual-licensed",
      version: "1.0.0",
      purl: "pkg:npm/dual-licensed@1.0.0",
      licenses: [{ expression: "(MIT AND BSD-3-Clause)" }],
    },
  ];
  const complianceValid = validateLicenseCompliance(validCompound);
  assert.equal(complianceValid.compliant, true);

  const invalidCompound = [
    {
      name: "bad-compound",
      version: "1.0.0",
      purl: "pkg:npm/bad-compound@1.0.0",
      licenses: [{ expression: "MIT AND AGPL-3.0" }],
    },
  ];
  const complianceInvalid = validateLicenseCompliance(invalidCompound);
  assert.equal(complianceInvalid.compliant, false);
});

test("generateSbom CLI: --verify-licenses and --output writes licenseCompliance to output file", () => {
  const { execFileSync } = require("node:child_process");
  const tmpDir = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "sbom-test-"),
  );
  try {
    const outPath = path.join(tmpDir, "sbom-inventory.json");
    const scriptPath = path.join(__dirname, "generate-sbom.js");
    execFileSync(
      process.execPath,
      [scriptPath, "--verify-licenses", "--output", outPath],
      {
        cwd: path.resolve(__dirname, "../.."),
        encoding: "utf8",
        env: { PATH: process.env.PATH, LANG: "C", TZ: "UTC" },
        timeout: 10000,
      },
    );

    assert.ok(fs.existsSync(outPath), "SBOM file should be created");
    const content = JSON.parse(fs.readFileSync(outPath, "utf8"));
    assert.equal(content.bomFormat, "CycloneDX");
    assert.equal(content.specVersion, "1.5");
    assert.ok(Array.isArray(content.components));
    assert.ok(
      content.licenseCompliance,
      "licenseCompliance must be present on bom",
    );
    assert.equal(content.licenseCompliance.compliant, true);
    assert.deepEqual(content.licenseCompliance.violations, []);
    assert.equal(
      content.licenseCompliance.totalComponents,
      content.components.length,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const { spawnSync, spawn } = require("node:child_process");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "generate-sbom.js"),
  "utf8",
);
const childEnv = { PATH: process.env.PATH, LANG: "C", TZ: "UTC" };

function installation(t, license = "MIT", count = 2) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "sbom private paths-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ops = path.join(root, "scripts/ops");
  fs.mkdirSync(ops, { recursive: true });
  const script = path.join(ops, "generate-sbom.js");
  fs.writeFileSync(script, source);
  const packages = {
    "": { name: "acres", version: "0.1.0" },
    client: {},
    server: {},
    "packages/shared": {},
    "node_modules/@acres/shared": {},
  };
  for (let i = 0; i < count; i++)
    packages[`node_modules/pkg-${i}`] = {
      version: "1.2.3",
      license,
      integrity: "sha512-" + Buffer.alloc(64, i % 256).toString("base64"),
    };
  packages["node_modules/dev-only"] = {
    version: "1",
    dev: true,
    license: "GPL-3.0",
  };
  packages["node_modules/optional-dev"] = {
    version: "1",
    devOptional: true,
    license: "GPL-3.0",
  };
  packages["node_modules/@types/decl"] = { version: "1", license: "MIT" };
  fs.writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({ packages }),
  );
  const cwd = path.join(root, "caller");
  fs.mkdirSync(cwd);
  return {
    root,
    cwd,
    script,
    run(args = [], hook) {
      const hookPath = path.join(root, "hook.cjs");
      if (hook) fs.writeFileSync(hookPath, hook);
      return spawnSync(
        process.execPath,
        [...(hook ? ["--require", hookPath] : []), script, ...args],
        {
          cwd,
          env: childEnv,
          encoding: "utf8",
          timeout: 10000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
    },
  };
}

function machinery(overrides = {}, processOverride) {
  const module = { exports: {} };
  const fakeFs = new Proxy(fs, {
    get(target, key) {
      return Object.hasOwn(overrides, key) ? overrides[key] : target[key];
    },
  });
  vm.runInNewContext(
    source +
      "\nmodule.exports.testing={parseArgs,outputPreflight,serializeBom,publishBom,main};",
    {
      require(name) {
        return name === "fs" ? fakeFs : require(name);
      },
      module,
      __dirname,
      Buffer,
      process: processOverride || process,
    },
  );
  return module.exports;
}

function artifactFixture(t, overrides = {}) {
  const f = installation(t);
  const api = machinery(overrides);
  const result = api.generateSbom({ rootDir: f.root });
  const bytes = api.testing.serializeBom(result.bom, false, true);
  const output = path.join(f.cwd, "new", "deep", "receipt.json");
  const parents = api.testing.outputPreflight(output);
  return {
    ...f,
    api,
    bytes,
    output,
    parents,
    publish() {
      api.testing.publishBom(output, parents, bytes, false);
    },
  };
}

for (const args of [
  ["--unknown=private-canary"],
  ["private-canary"],
  ["--json", "--json"],
  ["--verify-licenses", "--verify-licenses"],
  ["--json=true"],
  ["--verify-licenses=true"],
  ["--help", "--json"],
  ["-h", "-h"],
  ["--output"],
  ["-o"],
  ["--output="],
  ["-o="],
  ["--output", " "],
  ["--output=\tprivate-canary"],
  ["--output", "--json"],
  ["-o", "-private-canary"],
  ["--output", "one", "-o=two"],
  ["--output=one", "--output=two"],
  ["--output", "/"],
  ["--output", "new/"],
  ["--output", "private-canary\x7f"],
])
  test(`CLI rejects invalid invocation ${JSON.stringify(args)}`, (t) => {
    const f = installation(t);
    const before = fs.readdirSync(f.cwd);
    const r = f.run(
      args,
      "const fs=require('fs');fs.readFileSync=((original)=>function(p,...a){if(String(p).endsWith('package-lock.json'))throw Error('source private-canary');return original.call(this,p,...a)})(fs.readFileSync);",
    );
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "SBOM invocation failed\n");
    assert.deepEqual(fs.readdirSync(f.cwd), before);
  });

for (const options of [
  null,
  [],
  "private-canary",
  1,
  { rootDir: null },
  { rootDir: " " },
  { rootDir: 42 },
  { lockfilePath: "" },
  { timestamp: [] },
  { appVersion: false },
  { lockfilePath: "x\n" },
])
  test(`direct invalid options fail before reads: ${JSON.stringify(options)}`, () => {
    const api = machinery({
      existsSync() {
        throw Error("read private-canary");
      },
      readFileSync() {
        throw Error("read private-canary");
      },
    });
    assert.throws(() => api.generateSbom(options), /SBOM invocation failed/);
  });

test("import and standalone help do no inventory or allocation work", (t) => {
  const blocked = () => {
    throw Error("unexpected source/allocation");
  };
  const api = machinery(
    Object.fromEntries(
      [
        "existsSync",
        "readFileSync",
        "lstatSync",
        "mkdirSync",
        "openSync",
        "linkSync",
      ].map((k) => [k, blocked]),
    ),
  );
  assert.equal(typeof api.generateSbom, "function");
  const f = installation(t);
  const hook = `const fs=require('fs');const original=fs.readFileSync;fs.readFileSync=function(p,...a){if(String(p).includes('package-lock')||String(p).endsWith('package.json'))throw Error('private-canary');return original.call(this,p,...a)};for(const k of ['mkdirSync','openSync','linkSync','lstatSync'])fs[k]=()=>{throw Error('private-canary')};`;
  for (const flag of ["--help", "-h"]) {
    const r = f.run([flag], hook);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Usage:/);
    assert.equal(r.stderr, "");
  }
});

test("installed defaults, no-save, direct options, exclusions, fallback, hashes and ordering retain parity", (t) => {
  const f = installation(t);
  const lock = JSON.parse(
    fs.readFileSync(path.join(f.root, "package-lock.json")),
  );
  delete lock.packages["node_modules/pkg-1"].license;
  fs.mkdirSync(path.join(f.root, "node_modules/pkg-1"), { recursive: true });
  fs.writeFileSync(
    path.join(f.root, "node_modules/pkg-1/package.json"),
    '{"license":"ISC"}',
  );
  fs.writeFileSync(
    path.join(f.root, "package-lock.json"),
    JSON.stringify(lock),
  );
  const r = f.run(
    ["--json"],
    `const fs=require('fs');for(const k of ['mkdirSync','openSync','linkSync','writeFileSync'])fs[k]=()=>{throw Error('allocation private-canary')};`,
  );
  assert.equal(r.status, 0, r.stderr);
  const bom = JSON.parse(r.stdout);
  const result = generateSbom({
    rootDir: f.root,
    lockfilePath: path.join(f.root, "package-lock.json"),
    timestamp: "2026-10-08T00:00:00.000Z",
    appVersion: "1.0.0",
  });
  assert.deepEqual(bom.components, result.components);
  assert.equal(result.devExcludedCount, 3);
  assert.deepEqual(result.licenseCounts, { MIT: 1, ISC: 1 });
  assert.equal(result.components[0].hashes[0].content, "00".repeat(64));
  assert.equal(result.bom.metadata.timestamp, "2026-10-08T00:00:00.000Z");
  assert.equal(result.bom.metadata.component.version, "1.0.0");
  assert.ok(!Object.hasOwn(bom, "licenseCompliance"));
  assert.deepEqual(fs.readdirSync(f.cwd), []);
});

for (const args of [
  ["--output", "ordinary spaces/receipt.json"],
  ["-o", "receipt.json"],
  ["--output=receipt.json"],
  ["-o=receipt.json"],
  ["--output=-dash.json"],
])
  test(`literal output and saved/printed parity ${args[0]}`, (t) => {
    const f = installation(t);
    const value = args[0].includes("=") ? args[0].split("=")[1] : args[1];
    const r = f.run(["--verify-licenses", "--json", ...args]);
    assert.equal(r.status, 0, r.stderr);
    const bytes = fs.readFileSync(path.join(f.cwd, value), "utf8");
    assert.equal(bytes, r.stdout);
    const bom = JSON.parse(bytes);
    assert.deepEqual(bom.licenseCompliance, {
      compliant: true,
      violations: [],
      totalComponents: 2,
    });
    assert.equal(fs.statSync(path.join(f.cwd, value)).mode & 0o777, 0o600);
  });

test("unverified save omits compliance and human output is complete without private paths", (t) => {
  const f = installation(t);
  const r = f.run(["-o", "receipt.json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Total production components: 2/);
  assert.match(r.stdout, /SBOM artifact published/);
  assert.ok(!r.stdout.includes(f.root));
  assert.ok(!r.stdout.includes("receipt.json"));
  assert.ok(
    !Object.hasOwn(
      JSON.parse(fs.readFileSync(path.join(f.cwd, "receipt.json"))),
      "licenseCompliance",
    ),
  );
});

for (const json of [true, false])
  test(`evaluated license failure saves real verdict and drains ${json ? "JSON" : "human"} output`, (t) => {
    const f = installation(t, "GPL-3.0", 1000);
    const r = f.run([
      "--verify-licenses",
      "-o",
      "failed.json",
      ...(json ? ["--json"] : []),
    ]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr, "");
    const saved = JSON.parse(fs.readFileSync(path.join(f.cwd, "failed.json")));
    assert.equal(saved.licenseCompliance.compliant, false);
    assert.equal(saved.licenseCompliance.violations.length, 1000);
    assert.equal(saved.licenseCompliance.totalComponents, 1000);
    if (json) assert.deepEqual(JSON.parse(r.stdout), saved);
    else {
      assert.match(r.stdout, /License Compliance: FAILED/);
      assert.ok(!r.stdout.includes("PASSED"));
    }
  });

for (const kind of [
  "file",
  "directory",
  "symlink",
  "dangling",
  "ancestor-link",
  "ancestor-file",
  "trailing",
])
  test(`preserves retained ${kind}`, (t) => {
    const f = installation(t);
    let output = path.join(f.cwd, "private-canary");
    const target = path.join(f.cwd, "target");
    fs.writeFileSync(target, "retained private-canary");
    if (kind === "file" || kind === "ancestor-file")
      fs.writeFileSync(output, "retained private-canary");
    if (kind === "directory" || kind === "trailing") fs.mkdirSync(output);
    if (["symlink", "dangling", "ancestor-link"].includes(kind))
      fs.symlinkSync(
        kind === "dangling"
          ? target + ".missing"
          : kind === "ancestor-link"
            ? f.cwd
            : target,
        output,
      );
    const before = fs.lstatSync(output);
    const originalOutput = output;
    if (kind.startsWith("ancestor"))
      output = path.join(output, "new/receipt.json");
    if (kind === "trailing") output += "/";
    const r = f.run(["--json", "-o", output]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, "");
    assert.ok(!r.stderr.includes("private-canary"));
    assert.equal(fs.lstatSync(originalOutput).ino, before.ino);
    assert.equal(fs.readFileSync(target, "utf8"), "retained private-canary");
  });

test("creates private parents, leaves existing parent modes and uses same-directory staging", (t) => {
  const f = artifactFixture(t);
  const oldMode = fs.statSync(f.cwd).mode;
  f.publish();
  assert.equal(fs.statSync(f.cwd).mode, oldMode);
  for (const p of [path.join(f.cwd, "new"), path.dirname(f.output)])
    assert.equal(fs.statSync(p).mode & 0o777, 0o700);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ["receipt.json"]);
});

test("short writes complete and exclusive link preserves deterministic late competitor", (t) => {
  let linkCalled = false;
  const f = artifactFixture(t, {
    writeSync(fd, bytes, offset, length, position) {
      return fs.writeSync(fd, bytes, offset, Math.min(length, 17), position);
    },
    linkSync(from, to) {
      linkCalled = true;
      assert.equal(path.dirname(from), path.dirname(to));
      assert.equal(fs.readFileSync(from).equals(f.bytes), true);
      fs.writeFileSync(to, "competing private-canary");
      fs.linkSync(from, to);
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  assert.equal(linkCalled, true);
  assert.equal(fs.readFileSync(f.output, "utf8"), "competing private-canary");
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ["receipt.json"]);
});

for (const operation of [
  "openSync",
  "writeSync",
  "readSync",
  "closeSync",
  "linkSync",
  "unlinkSync",
])
  test(`controlled ${operation} faults preserve published evidence and owned cleanup`, (t) => {
    let calls = 0;
    const f = artifactFixture(t, {
      [operation](...args) {
        calls++;
        if (calls === 1) throw Error("private-canary");
        return fs[operation](...args);
      },
    });
    assert.throws(() => f.publish(), /SBOM (publication|cleanup) failed/);
    const published = operation === "unlinkSync";
    assert.equal(fs.existsSync(f.output), published);
    if (published) assert.ok(fs.readFileSync(f.output).equals(f.bytes));
    assert.equal(
      fs
        .readdirSync(path.dirname(f.output))
        .some((n) => n.startsWith(".sbom-")),
      false,
    );
  });

for (const fault of [
  "zero-write",
  "incomplete-read",
  "tampered-read",
  "foreign-staging",
])
  test(`readback and ownership fail closed: ${fault}`, (t) => {
    const overrides = {};
    if (fault === "zero-write") overrides.writeSync = () => 0;
    if (fault === "incomplete-read") overrides.readSync = () => 0;
    if (fault === "tampered-read")
      overrides.readSync = (fd, buf, ...args) => {
        const n = fs.readSync(fd, buf, ...args);
        if (n) buf[0] ^= 1;
        return n;
      };
    if (fault === "foreign-staging")
      overrides.linkSync = (from) => {
        fs.unlinkSync(from);
        fs.writeFileSync(from, "foreign private-canary");
        throw Error("private-canary");
      };
    const f = artifactFixture(t, overrides);
    assert.throws(() => f.publish(), /SBOM (publication|cleanup) failed/);
    assert.ok(!fs.existsSync(f.output));
    const files = fs.readdirSync(path.dirname(f.output));
    if (fault === "foreign-staging") {
      assert.equal(files.length, 1);
      assert.equal(
        fs.readFileSync(path.join(path.dirname(f.output), files[0]), "utf8"),
        "foreign private-canary",
      );
    } else assert.deepEqual(files, []);
  });

test("failed exclusive open never removes foreign staging", (t) => {
  const f = artifactFixture(t, {
    openSync(file, flags, mode) {
      fs.writeFileSync(file, "foreign");
      return fs.openSync(file, flags, mode);
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  const files = fs.readdirSync(path.dirname(f.output));
  assert.equal(files.length, 1);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(f.output), files[0]), "utf8"),
    "foreign",
  );
});

test("oversized UTF-8 receipt fails before allocation, with complete no-save stdout", (t) => {
  const f = installation(t, "MIT", 1);
  const lock = JSON.parse(
    fs.readFileSync(path.join(f.root, "package-lock.json")),
  );
  const name = "pkg-" + "é".repeat(5 * 1024 * 1024);
  lock.packages["node_modules/pkg-0"].name = name;
  fs.writeFileSync(
    path.join(f.root, "package-lock.json"),
    JSON.stringify(lock),
  );
  const failed = f.run(["--json", "-o", "absent/receipt.json"]);
  assert.equal(failed.status, 1);
  assert.equal(failed.stderr, "SBOM serialization failed\n");
  assert.ok(!fs.existsSync(path.join(f.cwd, "absent")));
  const passed = f.run(["--json"]);
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).components[0].name, name);
});

for (const stage of ["generation", "serialization", "output"])
  test(`fixed ${stage} CLI diagnostics exclude parser/path/exception canaries`, (t) => {
    const f = installation(t);
    let hook;
    if (stage === "generation")
      fs.writeFileSync(
        path.join(f.root, "package-lock.json"),
        "{ private-canary",
      );
    if (stage === "serialization")
      hook = "JSON.stringify=()=>{throw Error('private-canary')};";
    if (stage === "output")
      hook = "process.stdout.write=()=>{throw Error('private-canary')};";
    const r = f.run(["--json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, `SBOM ${stage} failed\n`);
  });

test("actual broken pipe is controlled and retains published receipt", async (t) => {
  const f = installation(t, "MIT", 4000);
  const child = spawn(
    process.execPath,
    [f.script, "--json", "-o", "receipt.json"],
    { cwd: f.cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c));
  child.stdout.destroy();
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  const result = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  assert.deepEqual(result, { code: 1, signal: null });
  assert.equal(stderr, "SBOM output failed\n");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.cwd, "receipt.json"))).components
      .length,
    4000,
  );
});

for (const operation of ["mkdirSync", "fstatSync", "lstatSync"])
  test(`injected ${operation} publication fault has no passing receipt`, (t) => {
    let active = false,
      calls = 0;
    const f = artifactFixture(t, {
      [operation](...args) {
        if (active && ++calls === 1) throw Error("private-canary");
        return fs[operation](...args);
      },
    });
    active = true;
    assert.throws(() => f.publish(), /SBOM (publication|cleanup) failed/);
    assert.ok(!fs.existsSync(f.output));
    if (fs.existsSync(path.dirname(f.output)))
      assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
  });

test("ordinary ancestor substitution after preflight fails safely", (t) => {
  const f = artifactFixture(t);
  fs.renameSync(f.cwd, f.cwd + ".retained");
  fs.symlinkSync(f.cwd + ".retained", f.cwd);
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(path.join(f.cwd + ".retained", "new")));
});

test("persistent cleanup failure is nonzero and preserves published evidence and owned staging", (t) => {
  const f = artifactFixture(t, {
    unlinkSync() {
      throw Error("private-canary");
    },
  });
  assert.throws(() => f.publish(), /cleanup failed/);
  assert.ok(fs.readFileSync(f.output).equals(f.bytes));
  assert.equal(fs.readdirSync(path.dirname(f.output)).length, 2);
});

test("staging content changed on disk before readback fails without publishing", (t) => {
  let writeFd;
  const f = artifactFixture(t, {
    writeSync(fd, ...args) {
      writeFd = fd;
      return fs.writeSync(fd, ...args);
    },
    closeSync(fd) {
      fs.closeSync(fd);
      if (fd === writeFd) {
        writeFd = null;
        const temp = fs
          .readdirSync(path.dirname(f.output))
          .find((n) => n.startsWith(".sbom-"));
        fs.writeFileSync(path.join(path.dirname(f.output), temp), "{}");
      }
    },
  });
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(f.output));
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
});

for (const operation of [
  "writeSync",
  "openSync",
  "readSync",
  "closeSync",
  "linkSync",
  "unlinkSync",
])
  test(`CLI ${operation} fault never prints passing completion`, (t) => {
    const f = installation(t);
    const hook = `const fs=require('fs');const old=fs.${operation};fs.${operation}=function(...a){${operation === "openSync" ? "if(!String(a[0]).includes('.sbom-'))return old.apply(this,a);" : ""}throw Error('private-canary');};`;
    const r = f.run(["--verify-licenses", "-o", "new/receipt.json"], hook);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^SBOM (publication|cleanup) failed\n$/);
    assert.ok(!r.stderr.includes("private-canary"));
    assert.equal(
      fs.existsSync(path.join(f.cwd, "new/receipt.json")),
      operation === "unlinkSync",
    );
  });

test("stdout callback errors and stderr errors set controlled nonzero status", (t) => {
  const f = installation(t);
  for (const hook of [
    "process.stdout.write=(_v,cb)=>{cb(Error('private-canary'));return false};",
    "process.stdout.write=()=>{process.stdout.emit('error',Error('private-canary'));return false};",
    "process.stdout.write=()=>{process.stderr.emit('error',Error('private-canary'));return false};",
  ]) {
    const r = f.run(["--json"], hook);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes("private-canary"));
  }
});

test("serialization independently rejects invalid generated and inconsistent compliance projections", (t) => {
  const f = installation(t);
  const result = generateSbom({ rootDir: f.root });
  const api = machinery();
  result.bom.licenseCompliance = {
    compliant: true,
    violations: [],
    totalComponents: 999,
  };
  assert.throws(
    () => api.testing.serializeBom(result.bom, true, true),
    /serialization failed/,
  );
  result.bom.licenseCompliance = validateLicenseCompliance(result.components);
  assert.ok(api.testing.serializeBom(result.bom, true, true).length > 0);
  assert.throws(
    () => api.testing.serializeBom(result.bom, false, true),
    /serialization failed/,
  );
  result.bom.components[0].version = null;
  assert.throws(
    () => api.testing.serializeBom(result.bom, true, true),
    /serialization failed/,
  );
});

test("removed recorded ancestor fails without recreating it", (t) => {
  const f = artifactFixture(t);
  fs.rmdirSync(f.cwd);
  assert.throws(() => f.publish(), /publication failed/);
  assert.ok(!fs.existsSync(f.cwd));
});
