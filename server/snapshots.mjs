import { createHash, randomUUID } from "node:crypto";
import {
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  existsSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";

export function saveSnapshot(directory, state) {
  const body = JSON.stringify(state);
  const id = `${state.revision}-${createHash("sha256").update(body).digest("hex")}.json`;
  const destination = resolve(directory, id);
  if (existsSync(destination)) {
    if (readFileSync(destination, "utf8") !== body)
      throw new Error(
        "Het bestaande herstelpunt is beschadigd. De wijziging is niet opgeslagen.",
      );
    return id;
  }
  // Never publish a partial JSON file. Interrupted .pending files are retained
  // for diagnosis and are never offered as a restore point.
  const pending = resolve(directory, `${id}.${randomUUID()}.pending`);
  const descriptor = openSync(pending, "wx", 0o600);
  try {
    writeFileSync(descriptor, body, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(pending, destination);
  return id;
}
