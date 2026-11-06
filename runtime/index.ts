import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeProcess } from "./runtime-process.ts";
import type { RuntimeMessage } from "./protocol.ts";

const extensionDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimePath = process.env.DICTATE_RUNTIME_PATH || join(extensionDir, "native", "install", `pi-dictate-runtime${process.platform === "win32" ? ".exe" : ""}`);
const modelPath = process.env.DICTATE_MODEL_PATH || join(homedir(), ".local", "share", "pi-dictate", "nemotron-3.5-asr-streaming-0.6b-q8_0.gguf");

let runtime: RuntimeProcess | undefined;
let starting: Promise<RuntimeProcess> | undefined;
let assetsPrepared = false;

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

async function ensureRuntimeAssets(): Promise<void> {
  if (assetsPrepared && isFile(runtimePath) && isFile(modelPath)) return;
  await new Promise<void>((resolveSetup, rejectSetup) => {
    // Compiled Pi uses its own executable as execPath, not a JS interpreter.
    const node = process.versions.bun ? "node" : process.execPath;
    const child = spawn(node, [join(extensionDir, "scripts", "setup.mjs")], {
      cwd: extensionDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const collect = (chunk: string) => {
      output += chunk;
      if (output.length > 12_000) output = output.slice(-12_000);
    };
    child.stdout.setEncoding("utf8").on("data", collect);
    child.stderr.setEncoding("utf8").on("data", collect);
    child.on("error", (error) => rejectSetup(new Error(`Could not start Pi Dictate setup: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolveSetup();
      else rejectSetup(new Error(`Pi Dictate first-use setup failed (exit ${code ?? "unknown"}).${output ? `\n${output.trim()}` : ""}`));
    });
  });
  if (!isFile(runtimePath) || !isFile(modelPath)) throw new Error("Pi Dictate setup finished without producing the runtime and model files.");
  assetsPrepared = true;
}

export async function startRuntime(): Promise<RuntimeProcess> {
  if (runtime?.isAlive) return runtime;
  if (starting) return starting;
  starting = (async () => {
    await ensureRuntimeAssets();
    const instance = new RuntimeProcess({
      runtimePath,
      modelPath,
      protocolVersion: 1,
      startupTimeoutMs: 120_000,
      expectedEngine: "nemo-speech.cpp",
      minimumEngineAbi: 1,
      maximumEngineAbi: 1,
    });
    await instance.start();
    runtime = instance;
    return instance;
  })().finally(() => { starting = undefined; });
  return starting;
}

export async function shutdownRuntime(): Promise<void> {
  if (starting) {
    try { await starting; } catch { return; }
  }
  const current = runtime;
  runtime = undefined;
  await current?.shutdown();
}

export type { RuntimeMessage };
