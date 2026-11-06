import test from "node:test";
import assert from "node:assert/strict";
import { hasStructuredContent, optimizeTranscript, resolveOptimizationMode } from "./optimization.ts";

const optimize = (text: string) => optimizeTranscript(text, "clean", "pt-BR").text;

test("off preserves baseline text and clean removes only known fillers", () => {
  const text = "Hmm, eu, eu quero validar a função de inicialização.";
  assert.equal(optimizeTranscript(text, "off", "pt-BR").text, text);
  assert.equal(optimize(text), "Eu quero validar a função de inicialização.");
});

test("mode settings prefer explicit values and retain the legacy cleanup alias", () => {
  assert.deepEqual(resolveOptimizationMode(undefined, undefined), { mode: "off", invalid: false });
  assert.deepEqual(resolveOptimizationMode(undefined, "1"), { mode: "clean", invalid: false });
  assert.deepEqual(resolveOptimizationMode("clean", "1"), { mode: "clean", invalid: false });
  assert.deepEqual(resolveOptimizationMode("english", "1"), { mode: "off", invalid: true });
  assert.deepEqual(resolveOptimizationMode("unknown", "1"), { mode: "off", invalid: true });
});

test("off retains legacy whitespace normalization while clean preserves multiline content", () => {
  const multiline = "first line\nsecond line";
  assert.equal(optimizeTranscript(multiline, "off", "pt-BR").text, "first line second line");
  assert.equal(optimizeTranscript(multiline, "clean", "pt-BR").text, multiline);
  const code = "```ts\nconst value = 'hum';\n```";
  assert.equal(optimizeTranscript(code, "off", "pt-BR").text, code.replace(/\s+/g, " ").trim());
  assert.equal(optimizeTranscript(code, "clean", "pt-BR").text, code);
});

test("technical literals, paths, commands, and structured data bypass cleanup", () => {
  const samples = [
    'Hmm, eu, eu altere `src/index.ts` e preserve "hum".',
    "Hmm, eu, eu confira /home/guest/src/index.ts.",
    "Hmm, eu, eu rode:\n$ npm test",
    '{"command":"npm test","path":"src/index.ts"}',
    "Hmm, eu, eu atualize getUserInput().",
    "Hmm, eu, eu preserve NodeRegistry and this unclosed ```typescript block.",
    "Hmm, eu, eu mantenha:\n```ts\nconst hum = 'hum';\n```\n",
  ];
  for (const text of samples) {
    assert.ok(hasStructuredContent(text), text);
    assert.equal(optimize(text), hasStructuredContent(text) ? text.trim() : text.replace(/\s+/g, " ").trim());
  }
});

test("negations, conditions, corrections, uncertainty, and emphasis are retained", () => {
  assert.equal(optimize("Não exclua o arquivo se o teste falhar."), "Não exclua o arquivo se o teste falhar.");
  assert.equal(optimize("Hmm, eu, eu não apague dados; talvez eu esteja enganado."), "Eu não apague dados; talvez eu esteja enganado.");
  assert.equal(optimize("não, não delete; é muito, muito importante."), "não, não delete; é muito, muito importante.");
  assert.equal(optimize("Não, corrijo: não apague o arquivo, só o renomeie."), "Não, corrijo: não apague o arquivo, só o renomeie.");
});

test("ambiguous fillers remain, including Portuguese um in automatic language mode", () => {
  assert.equal(optimizeTranscript("Um, quero um arquivo.", "clean", "auto").text, "Um, quero um arquivo.");
  assert.equal(optimize("Hum, quero um arquivo."), "Quero um arquivo.");
});

test("long conversational and already-concise prompts are unchanged except known disfluencies", () => {
  const long = "Então, eu queria que você desse uma olhada naquele arquivo que a gente estava trabalhando antes, porque eu acho que talvez tenha algum problema na função de inicialização, mas por enquanto não precisa modificar nada.";
  assert.equal(optimize(long), long);
  const concise = "Revise a função de inicialização. Não altere arquivos.";
  assert.equal(optimize(concise), concise);
});

test("mixed Portuguese and English preserves technical terms and punctuation", () => {
  assert.equal(optimize("Hmm, eu, eu preciso revisar o API response e manter o timeout."), "Eu preciso revisar o API response e manter o timeout.");
  const codeMixed = "Hmm, eu, eu compare o API response com `expectedValue`.";
  assert.equal(optimize(codeMixed), codeMixed);
});

test("filler-only cleanup and processing errors cannot silently erase a nonempty transcript", () => {
  const text = "Hmm, ahm.";
  assert.deepEqual(optimizeTranscript(text, "clean", "pt-BR"), { text, fallback: "empty-result" });
  const technicalText = "Use port 8080 and retain version 1.2.3.";
  assert.deepEqual(optimizeTranscript(technicalText, "clean", "pt-BR", () => { throw new Error("test"); }), {
    text: technicalText,
    fallback: "error",
  });
});
