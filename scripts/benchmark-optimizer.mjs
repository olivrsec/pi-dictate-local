import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { optimizeTranscript, normalizeTranscript } from "../optimization.ts";

const cases = JSON.parse(await readFile(new URL("../benchmarks/prompt-cases.json", import.meta.url), "utf8"));
const speechCaseCount = cases.length;
const longInput = cases.find((item) => item.id === "long-conversation").input;
cases.push({ id: "synthetic-10k-stress", language: "pt-BR", input: longInput.repeat(Math.ceil(10_000 / longInput.length)).slice(0, 10_000) });
const iterations = 500;
const warmup = 50;
const estimatedTokens = (text) => Math.ceil(text.length / 4);
const percentile = (values, p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const round = (value) => Math.round(value * 1000) / 1000;
let sink = 0;

console.log(`Pi Dictate prompt benchmark | Node ${process.version} | ${cases.length} hand-authored text fixtures | ${iterations} iterations/fixture | ${warmup} warm-up rounds`);
console.log("Token counts are Pi-compatible chars/4 estimates, not model-tokenizer counts.\n");

for (const mode of ["off", "clean"]) {
  const baseline = cases.map((item) => normalizeTranscript(item.input));
  const outputs = cases.map((item) => optimizeTranscript(item.input, mode, item.language));
  const expectedChars = baseline.reduce((sum, text) => sum + text.length, 0);
  const outputChars = outputs.reduce((sum, result) => sum + result.text.length, 0);
  const expectedTokens = baseline.reduce((sum, text) => sum + estimatedTokens(text), 0);
  const outputTokens = outputs.reduce((sum, result) => sum + estimatedTokens(result.text), 0);
  const fallbacks = outputs.filter((result) => result.fallback).length;
  const speechInputChars = baseline.slice(0, speechCaseCount).reduce((sum, text) => sum + text.length, 0);
  const speechOutputChars = outputs.slice(0, speechCaseCount).reduce((sum, result) => sum + result.text.length, 0);
  const speechInputTokens = baseline.slice(0, speechCaseCount).reduce((sum, text) => sum + estimatedTokens(text), 0);
  const speechOutputTokens = outputs.slice(0, speechCaseCount).reduce((sum, result) => sum + estimatedTokens(result.text), 0);
  for (let i = 0; i < warmup; i++) {
    for (const item of cases) sink += optimizeTranscript(item.input, mode, item.language).text.length;
  }
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const timings = [];
  const stressTimings = [];
  for (let i = 0; i < iterations; i++) {
    for (const item of cases) {
      const start = performance.now();
      const result = optimizeTranscript(item.input, mode, item.language);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      if (item.id === "synthetic-10k-stress") stressTimings.push(elapsed);
      sink += result.text.length;
    }
  }
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  timings.sort((a, b) => a - b);
  stressTimings.sort((a, b) => a - b);
  const saved = expectedChars ? (1 - outputChars / expectedChars) * 100 : 0;
  const tokenSaved = expectedTokens ? (1 - outputTokens / expectedTokens) * 100 : 0;
  const speechTokenSaved = speechInputTokens ? (1 - speechOutputTokens / speechInputTokens) * 100 : 0;
  console.log(`${mode} speech fixtures: chars ${speechInputChars} -> ${speechOutputChars} (${round((1 - speechOutputChars / speechInputChars) * 100)}% saved); ` +
    `estimated tokens ${speechInputTokens} -> ${speechOutputTokens} (${round(speechTokenSaved)}% saved)`);
  console.log(`${mode} with 10k stress: chars ${expectedChars} -> ${outputChars} (${round(saved)}% saved); estimated tokens ${expectedTokens} -> ${outputTokens} (${round(tokenSaved)}% saved); ` +
    `latency median/p95 all ${round(percentile(timings, 0.5))}/${round(percentile(timings, 0.95))} ms, stress p95 ${round(percentile(stressTimings, 0.95))} ms; ` +
    `CPU ${(cpu.user + cpu.system) / 1000} ms total; RSS delta ${round((memoryAfter.rss - memoryBefore.rss) / 1024 / 1024)} MiB; ` +
    `heap delta ${round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)} MiB; fallbacks ${fallbacks}/${cases.length}`);
  console.log(`  per-fixture chars: ${cases.map((item, index) => `${item.id} ${baseline[index].length}->${outputs[index].text.length}`).join(", ")}`);
}
console.log(`benchmark sink: ${sink}`);
