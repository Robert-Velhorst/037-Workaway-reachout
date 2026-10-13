import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/index.mjs";
import { saveSnapshot } from "../server/snapshots.mjs";
import { recoverWorkspace } from "../server/recovery.mjs";
import {
  initialState,
  applyAction,
  validateBackup,
  calendar,
  followUps,
} from "../server/domain.mjs";

test("offline recovery preserves the source and opens a new complete workspace without replacing existing folders", async () => {
  const root = mkdtempSync(join(tmpdir(), "reach-out-recovery-"));
  const backupPath = join(root, "trusted.json"),
    destination = join(root, "recovered");
  const state = applyAction(initialState(), {
    type: "candidate.save",
    payload: { name: "Bewaarde kandidaat", notes: "Oorspronkelijke notitie" },
  });
  const source = JSON.stringify(state);
  writeFileSync(backupPath, source);
  assert.equal(recoverWorkspace(backupPath, destination).candidates, 1);
  assert.equal(readFileSync(backupPath, "utf8"), source);
  assert.throws(() => recoverWorkspace(backupPath, destination), /bestaat al/);
  const server = createApp({ dataDir: destination, port: 4196 });
  await new Promise((r) => server.listen(4196, "127.0.0.1", r));
  try {
    assert.deepEqual(
      await (await fetch("http://127.0.0.1:4196/api/state")).json(),
      state,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
  writeFileSync(backupPath, "{}");
  const invalidDestination = join(root, "invalid");
  assert.throws(() => recoverWorkspace(backupPath, invalidDestination));
  assert(!existsSync(invalidDestination));
});

test("snapshots publish only complete verified JSON and never overwrite damaged recovery data", () => {
  const directory = mkdtempSync(join(tmpdir(), "reach-out-atomic-"));
  const s = initialState();
  const id = saveSnapshot(directory, s);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, id), "utf8")), s);
  assert.deepEqual(readdirSync(directory), [id]);
  assert.equal(saveSnapshot(directory, s), id);
  writeFileSync(join(directory, id), "incomplete");
  assert.throws(() => saveSnapshot(directory, s), /beschadigd/);
  assert.equal(readFileSync(join(directory, id), "utf8"), "incomplete");
});

test("restored timestamps normalize offsets for calendar export and refuse ambiguous dates or injected IDs", () => {
  let s = applyAction(initialState(), {
    type: "candidate.save",
    payload: { name: "Reiziger" },
  });
  s = applyAction(s, {
    type: "event.save",
    payload: {
      candidateId: s.candidates[0].id,
      title: "Gesprek",
      start: "2026-10-01T12:00:00Z",
      duration: 30,
    },
  });
  s.events[0].start = "2026-10-01T14:00:00+02:00";
  const restored = validateBackup(s);
  assert.equal(restored.events[0].start, "2026-10-01T12:00:00.000Z");
  assert.match(calendar(restored), /DTSTART:20261001T120000Z/);
  for (const invalid of [
    "2026-10-01",
    "2026-02-30T12:00:00Z",
    "2026-10-01T12:00:00",
  ]) {
    s.events[0].start = invalid;
    assert.throws(() => validateBackup(s));
  }
  s = initialState();
  s.profile = Object.fromEntries(Object.entries(s.profile).reverse());
  assert.doesNotThrow(() => validateBackup(s));
});

test("a recorded reply suppresses followups even after status is manually changed to contacted", () => {
  let s = applyAction(initialState(), {
    type: "candidate.save",
    payload: { name: "Reiziger" },
  });
  const candidateId = s.candidates[0].id;
  s = applyAction(
    s,
    {
      type: "journal.add",
      payload: {
        candidateId,
        kind: "outgoing",
        body: "Persoonlijk bericht",
        at: "2026-09-01T12:00:00Z",
        confirmed: true,
      },
    },
    "2026-09-15T12:00:00.000Z",
  );
  s = applyAction(
    s,
    {
      type: "journal.add",
      payload: {
        candidateId,
        kind: "reply",
        body: "Ontvangen reactie",
        at: "2026-09-02T12:00:00Z",
      },
    },
    "2026-09-15T12:00:00.000Z",
  );
  s = applyAction(s, {
    type: "candidate.status",
    payload: { candidateId, status: "contacted" },
  });
  assert.deepEqual(followUps(s), []);
  assert.throws(() =>
    applyAction(s, {
      type: "message.followup",
      payload: {
        candidateId,
        body: "Dit vervolg hoort geblokkeerd te blijven.",
      },
    }),
  );
});

test("production rejects development origins and malformed requests, restores exports larger than 4 MB", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reach-out-production-"));
  const port = 4193,
    base = `http://127.0.0.1:${port}`;
  const server = createApp({ port, dataDir });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const post = (body, extra = {}) =>
    fetch(base + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Reach-Out": "1",
        ...extra,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post(null)).status, 400);
    assert.equal((await fetch(base + "/%zz")).status, 400);
    assert.equal(
      (
        await fetch(base + "/api/state", {
          headers: { Origin: "http://127.0.0.1:5173" },
        })
      ).status,
      403,
    );
    const backup = initialState();
    for (let i = 0; i < 90; i++) {
      const c = applyAction(initialState(), {
        type: "candidate.save",
        payload: { name: `Reiziger ${i}`, sourceText: "a".repeat(50000) },
      }).candidates[0];
      backup.candidates.push(c);
    }
    assert(Buffer.byteLength(JSON.stringify(backup)) > 4 * 1024 * 1024);
    let response = await post({
      revision: 0,
      type: "backup.restore",
      payload: { backup, confirmed: true },
    });
    assert.equal(response.status, 200);
    await response.json();
    const exported = await (await fetch(base + "/api/export")).json();
    response = await post({
      revision: exported.revision,
      type: "backup.restore",
      payload: { backup: exported, confirmed: true },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).candidates.length, 90);
    writeFileSync(join(dataDir, "backups", "interrupted.pending"), "partial");
    const backups = await (await fetch(base + "/api/backups")).json();
    assert.equal(backups.length, 2);
    assert(backups.every((b) => !b.invalid));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("startup refuses corrupt workspace records and preserves the original bytes", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reach-out-corrupt-"));
  const server = createApp({ dataDir, port: 4194 });
  await new Promise((r) => server.listen(4194, "127.0.0.1", r));
  await new Promise((r) => server.close(r));
  const database = new DatabaseSync(join(dataDir, "reach-out.sqlite"));
  database
    .prepare("UPDATE workspace SET body=? WHERE id=1")
    .run('{"invalid":true}');
  database.close();
  assert.throws(() => createApp({ dataDir }), /beschadigd/);
  const preserved = new DatabaseSync(join(dataDir, "reach-out.sqlite"));
  assert.equal(
    preserved.prepare("SELECT body FROM workspace WHERE id=1").get().body,
    '{"invalid":true}',
  );
  preserved.close();
});
