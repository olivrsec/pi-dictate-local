import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeProcess } from "./runtime-process.ts";
import type { RuntimeMessage } from "./protocol.ts";

const extensionDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimePath = process.env.DICTATE_RUNTIME_PATH ?? join(extensionDir, "native", "install", `pi-dictate-runtime${process.platform === "win32" ? ".exe" : ""}`);
const modelPath = process.env.DICTATE_MODEL_PATH ?? join(homedir(), ".local", "share", "pi-dictate", "nemotron-3.5-asr-streaming-0.6b-q8_0.gguf");

let runtime: RuntimeProcess | undefined;
let starting: Promise<RuntimeProcess> | undefined;

export async function startRuntime(): Promise<RuntimeProcess> {
  if (runtime?.isAlive) return runtime;
  if (starting) return starting;
  starting = (async () => {
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
