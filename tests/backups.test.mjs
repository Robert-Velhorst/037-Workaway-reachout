import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";
test("automatic snapshots and full restore are recoverable, revision-safe and fail closed on damaged files", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reach-out-backup-")),
    port = 4189,
    base = `http://127.0.0.1:${port}`,
    server = createApp({ dataDir, port });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const read = async (path) => await (await fetch(base + path)).json();
  const post = (revision, type, payload) =>
    fetch(base + "/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Reach-Out": "1" },
      body: JSON.stringify({ revision, type, payload }),
    });
  try {
    let r = await post(0, "profile.save", { name: "Eerste host" });
    assert.equal(r.status, 200);
    const first = await r.json();
    r = await post(first.revision, "profile.save", { name: "Tweede host" });
    const second = await r.json();
    let snapshots = await read("/api/backups");
    assert.equal(snapshots.length, 2);
    const id = snapshots.find((b) => b.revision === 1).id;
    r = await post(second.revision, "backup.restore", {
      backupId: id,
      confirmed: false,
    });
    assert.equal(r.status, 400);
    assert.equal((await read("/api/state")).profile.name, "Tweede host");
    r = await post(second.revision, "backup.restore", {
      backupId: id,
      confirmed: true,
    });
    assert.equal(r.status, 200);
    const restored = await r.json();
    assert.equal(restored.profile.name, "Eerste host");
    assert.equal(restored.revision, 3);
    assert.equal((await read("/api/backups")).length, 3);
    r = await post(second.revision, "backup.restore", {
      backupId: id,
      confirmed: true,
    });
    assert.equal(r.status, 409);
    writeFileSync(join(dataDir, "backups", id), "{}");
    r = await post(restored.revision, "backup.restore", {
      backupId: id,
      confirmed: true,
    });
    assert.equal(r.status, 400);
    assert.equal((await read("/api/state")).revision, 3);
    r = await post(restored.revision, "backup.restore", {
      backup: first,
      confirmed: true,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).profile.name, "Eerste host");
    assert(readdirSync(join(dataDir, "backups")).length >= 3);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
