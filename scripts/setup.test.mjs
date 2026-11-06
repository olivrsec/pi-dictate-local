import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSetupLock, setupCommands } from "./setup.mjs";

const runtimeMissing = { runtimeConfigured: false, runtimeExists: false, modelConfigured: false, modelExists: false };

test("first use initializes sources, builds runtime, and verifies the default model", () => {
  const steps = setupCommands(runtimeMissing);
  assert.deepEqual(steps.map(({ label }) => label), [
    "Initializing pinned native dependencies",
    "Building the local Nemotron runtime",
    "Downloading and verifying the Nemotron model",
  ]);
});

test("existing runtime avoids rebuild while default model is still verified", () => {
  const steps = setupCommands({ ...runtimeMissing, runtimeExists: true });
  assert.equal(steps.length, 1);
  assert.equal(steps[0]?.args.at(-1), "scripts/download-model.mjs");
});

test("explicit paths are user-owned and must exist", () => {
  assert.deepEqual(setupCommands({ runtimeConfigured: true, runtimeExists: true, modelConfigured: true, modelExists: true }), []);
  assert.throws(() => setupCommands({ ...runtimeMissing, runtimeConfigured: true }), /DICTATE_RUNTIME_PATH/);
  assert.throws(() => setupCommands({ ...runtimeMissing, modelConfigured: true }), /DICTATE_MODEL_PATH/);
});
test("setup lock serializes simultaneous first-use preparation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-dictate-setup-"));
  const path = join(directory, "setup.lock");
  const releaseFirst = await acquireSetupLock(path, { pollMs: 5, timeoutMs: 1000 });
  let secondAcquired = false;
  const second = acquireSetupLock(path, { pollMs: 5, timeoutMs: 1000 }).then((release) => {
    secondAcquired = true;
    return release;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(secondAcquired, false);
    await releaseFirst();
    const releaseSecond = await second;
    assert.equal(secondAcquired, true);
    await releaseSecond();
    assert.equal(await readFile(path, "utf8").catch(() => ""), "");
  } finally {
    await releaseFirst();
    await rm(directory, { recursive: true, force: true });
  }
});
test("setup lock reports stale owners for safe manual recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-dictate-stale-"));
  const path = join(directory, "setup.lock");
  await writeFile(path, "999999999\n");
  try {
    await assert.rejects(acquireSetupLock(path, { pollMs: 5, timeoutMs: 1000 }), /Stale Pi Dictate setup lock/);
    assert.equal(await readFile(path, "utf8"), "999999999\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
