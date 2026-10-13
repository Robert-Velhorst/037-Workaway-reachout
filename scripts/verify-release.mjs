import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const releaseRoot = resolve(process.argv[2] || ".");
assert(
  !existsSync(join(releaseRoot, "node_modules")),
  "Controleer een schoon uitgepakt pakket zonder node_modules.",
);
for (const excluded of ["data", "source-archive", ".env", ".git"])
  assert(
    !existsSync(join(releaseRoot, excluded)),
    `Privébestand in pakket: ${excluded}`,
  );
const manifest = JSON.parse(
  readFileSync(join(releaseRoot, "release-manifest.json"), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);
for (const file of manifest.files) {
  const path = resolve(releaseRoot, file.path);
  assert(path.startsWith(releaseRoot + sep), "Onveilig manifestpad.");
  const body = readFileSync(path);
  assert.equal(body.length, file.bytes, file.path);
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    file.sha256,
    file.path,
  );
}
if (process.platform === "win32") {
  const launcher = spawn(
    "cmd.exe",
    ["/d", "/c", "Start Reach Out.cmd", "--check"],
    { cwd: releaseRoot, stdio: "inherit" },
  );
  const [exitCode] = await once(launcher, "exit");
  assert.equal(exitCode, 0, "Launcher-startcontrole mislukt.");
}
const dataDir = mkdtempSync(join(tmpdir(), "reach-out-release-proof-"));
const port = 4195,
  base = `http://127.0.0.1:${port}`;
let child;
let diagnostic = "";
async function start(workspaceDirectory = dataDir) {
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: releaseRoot,
    env: {
      ...process.env,
      PORT: String(port),
      REACH_OUT_DATA_DIR: workspaceDirectory,
      REACH_OUT_DEVELOPMENT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diagnostic = "";
  child.stdout.on("data", (value) => (diagnostic += value));
  child.stderr.on("data", (value) => (diagnostic += value));
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null)
      throw new Error(diagnostic || "Server gestopt.");
    if (!diagnostic.includes(`Reach Out is ready at ${base}`)) {
      await delay(250);
      continue;
    }
    try {
      const response = await fetch(base + "/api/state", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return await response.json();
    } catch {
      /* Wait for the new process to bind its local port. */
    }
    await delay(250);
  }
  throw new Error("Server niet bereikbaar: " + diagnostic);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}
try {
  let state = await start();
  assert.equal(state.revision, 0);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const html = await page.text();
  assert.match(html, /<title>Workaway Reach Out<\/title>/);
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  const saved = await fetch(base + "/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Reach-Out": "1" },
    body: JSON.stringify({
      revision: state.revision,
      type: "profile.save",
      payload: {
        name: "Releasecontrole",
        location: "Nederland",
        description: "Tijdelijke opslagcontrole.",
      },
    }),
  });
  assert.equal(saved.status, 200);
  state = await saved.json();
  await stop();
  const reopened = await start();
  assert.deepEqual(reopened, state);
  const backup = await (await fetch(base + "/api/export")).json();
  assert.deepEqual(backup, state);
  assert.equal((await (await fetch(base + "/api/backups")).json()).length, 1);
  await stop();
  const backupFile = join(dataDir, "release-backup.json");
  const recoveredDirectory = join(dataDir, "recovered");
  writeFileSync(backupFile, JSON.stringify(backup));
  const recovery = spawn(
    process.execPath,
    ["scripts/recover.mjs", backupFile, recoveredDirectory],
    { cwd: releaseRoot, stdio: "inherit" },
  );
  const [recoveryExitCode] = await once(recovery, "exit");
  assert.equal(recoveryExitCode, 0);
  assert.deepEqual(await start(recoveredDirectory), state);
  console.log(
    `Release ${manifest.version}: ${manifest.files.length} bestandshashes, launcher, statische assets, opslag, herstart, export, herstelpunt en offline herstel gecontroleerd.`,
  );
  console.log(`Tijdelijke controlegegevens: ${dataDir}`);
} finally {
  await stop();
}
