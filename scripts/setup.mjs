import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelDefault = join(homedir(), ".local", "share", "pi-dictate", "nemotron-3.5-asr-streaming-0.6b-q8_0.gguf");
const runtimeDefault = join(root, "native", "install", `pi-dictate-runtime${process.platform === "win32" ? ".exe" : ""}`);

export async function acquireSetupLock(lockPath, { timeoutMs = 30 * 60_000, pollMs = 500 } = {}) {
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
      return async () => {
        const owner = Number((await readFile(lockPath, "utf8").catch(() => "")).trim());
        if (owner === process.pid) await unlink(lockPath).catch(() => {});
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = Number((await readFile(lockPath, "utf8").catch(() => "")).trim());
      // shortcut: stale locks need manual removal; use OS advisory locks if automatic recovery is required.
      if (owner) {
        try { process.kill(owner, 0); } catch (processError) {
          if (processError.code === "ESRCH") throw new Error(`Stale Pi Dictate setup lock for process ${owner}; remove ${lockPath} and retry.`);
        }
      } else {
        try {
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > 5_000) throw new Error(`Pi Dictate setup lock has no owner; remove ${lockPath} and retry.`);
        } catch (statError) {
          if (statError.code !== "ENOENT") throw statError;
        }
      }
      if (Date.now() >= deadline) throw new Error(`Another Pi Dictate setup is still running; wait for it to finish or remove ${lockPath} if it is stale.`);
      await new Promise((resolveSleep) => setTimeout(resolveSleep, pollMs));
    }
  }
}

export function setupCommands({ runtimeConfigured, runtimeExists, modelConfigured, modelExists }) {
  if (runtimeConfigured && !runtimeExists) throw new Error("DICTATE_RUNTIME_PATH must point to an existing runtime file.");
  if (modelConfigured && !modelExists) throw new Error("DICTATE_MODEL_PATH must point to an existing model file.");
  const commands = [];
  if (!runtimeConfigured && !runtimeExists) {
    commands.push({ label: "Initializing pinned native dependencies", command: "git", args: ["submodule", "update", "--init", "--recursive"] });
    commands.push({ label: "Building the local Nemotron runtime", command: process.execPath, args: ["scripts/build-native.mjs", "--release"] });
  }
  if (!modelConfigured) commands.push({ label: "Downloading and verifying the Nemotron model", command: process.execPath, args: ["scripts/download-model.mjs"] });
  return commands;
}

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

function configuredPath(name, value, fallback) {
  if (!value) return fallback;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  return resolve(value);
}

async function main() {
  const releaseLock = await acquireSetupLock(join(homedir(), ".local", "share", "pi-dictate", "setup.lock"));
  try {
    const runtimeConfigured = Boolean(process.env.DICTATE_RUNTIME_PATH);
    const modelConfigured = Boolean(process.env.DICTATE_MODEL_PATH);
    const runtimePath = configuredPath("DICTATE_RUNTIME_PATH", process.env.DICTATE_RUNTIME_PATH, runtimeDefault);
    const modelPath = configuredPath("DICTATE_MODEL_PATH", process.env.DICTATE_MODEL_PATH, modelDefault);
    const commands = setupCommands({
      runtimeConfigured,
      runtimeExists: isFile(runtimePath),
      modelConfigured,
      modelExists: isFile(modelPath),
    });
    for (const step of commands) {
      console.log(`\nPi Dictate: ${step.label}`);
      execFileSync(step.command, step.args, { cwd: root, stdio: "inherit" });
    }
  } finally {
    await releaseLock();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
