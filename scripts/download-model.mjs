import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const url = "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/1c8deaecc64b91f034d73e08dd8b64625eb3395d/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf?download=true";
const sizeExpected = 741548352;
const shaExpected = "a5c435f294eea8f88ce68dd27b8c3bfea7f777cb2fbba04fcd30eaa555f429ae";
const destination = resolve(process.env.DICTATE_MODEL_PATH ?? join(homedir(), ".local", "share", "pi-dictate", "nemotron-3.5-asr-streaming-0.6b-q8_0.gguf"));

async function validFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size !== sizeExpected) return false;
    const hash = createHash("sha256");
    const { createReadStream } = await import("node:fs");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex") === shaExpected;
  } catch { return false; }
}

if (await validFile(destination)) {
  console.log(`Nemotron model already verified: ${destination}`);
  process.exit(0);
}
await mkdir(dirname(destination), { recursive: true });
const temporary = `${destination}.${process.pid}.part`;
try {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Model download failed: HTTP ${response.status}`);
  const hash = createHash("sha256");
  let received = 0;
  const source = Readable.from((async function* () {
    for await (const chunk of response.body) {
      const data = Buffer.from(chunk);
      received += data.length;
      hash.update(data);
      if (received > sizeExpected) throw new Error("Model download exceeds expected size.");
      yield data;
    }
  })());
  await pipeline(source, createWriteStream(temporary, { flags: "wx" }));
  if (received !== sizeExpected || hash.digest("hex") !== shaExpected) throw new Error("Downloaded model failed size or SHA-256 verification.");
  await rename(temporary, destination);
  console.log(`Verified Nemotron model installed: ${destination}`);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
