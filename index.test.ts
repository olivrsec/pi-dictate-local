import test from "node:test";
import assert from "node:assert/strict";
import { Input, matchesKey, setKittyProtocolActive } from "@earendil-works/pi-tui";
import dictateExtension, { applyNemotronMessage, cleanDisfluencies, copyTranscriptToClipboard, initialTranscript, isStopButtonClick, resolveHotkey, shouldConsumeRepeatedHotkey, transcriptForDelivery, DICTATE_CANCEL_KEY, DICTATE_TOGGLE_KEY, type TranscriptState } from "./index.ts";
import { JsonlDecoder, parseProtocolLine, ProtocolError } from "./runtime/protocol.ts";

setKittyProtocolActive(true);
const event = (type: string, text: string): any => ({ v: 1, type, text });

test("transcript updates replace previous rolling text", () => {
  let state: TranscriptState = applyNemotronMessage(initialTranscript, event("transcript_update", "Hallo"));
  state = applyNemotronMessage(state, event("transcript_update", "Hallo Welt."));
  assert.equal(state.rolling, "Hallo Welt.");
  assert.equal(state.final, null);
});
test("final transcript latches, including an empty final", () => {
  let state = applyNemotronMessage(initialTranscript, event("transcript_update", "Hallo"));
  state = applyNemotronMessage(state, event("recording_finalized", ""));
  state = applyNemotronMessage(state, event("transcript_update", "late"));
  assert.equal(state.final, "");
  assert.equal(state.rolling, "Hallo");
});
test("unrelated protocol messages do not change transcript", () => {
  assert.equal(applyNemotronMessage(initialTranscript, event("audio_level", "0.2")), initialTranscript);
});
test("opt-in cleanup removes common Brazilian Portuguese and English disfluencies", () => {
  assert.equal(cleanDisfluencies("Hmm, eu, eu quero testar.", "pt-BR"), "Eu quero testar.");
  assert.equal(cleanDisfluencies("Hum, você você pode?", "pt-BR"), "Você pode?");
  assert.equal(cleanDisfluencies("Um, I, I think, uh, we can.", "en-US"), "I think, we can.");
  assert.equal(cleanDisfluencies("Hmm, eu eu quero um arquivo. Hmm, I I can test.", "auto"), "Eu quero um arquivo. I can test.");
});
test("auto and English preserve hum as a verb or noun and auto preserves Portuguese um", () => {
  for (const language of ["auto", "en-US"]) {
    assert.equal(cleanDisfluencies("Please hum a tune. I like the hum of the engine.", language), "Please hum a tune. I like the hum of the engine.");
  }
  assert.equal(cleanDisfluencies("Quero um arquivo.", "auto"), "Quero um arquivo.");
});
test("cleanup preserves repeated negations, emphatic words, and English affirmative uh-huh", () => {
  assert.equal(cleanDisfluencies("não, não apague; no, no delete; very, very good; had had; uh-huh.", "auto"), "não, não apague; no, no delete; very, very good; had had; uh-huh.");
});
test("cleanup applies only to finalized delivery, not rolling fallback or empty final", () => {
  assert.equal(transcriptForDelivery({ rolling: "Hmm, eu eu", final: null }, "pt-BR", true), "Hmm, eu eu");
  assert.equal(transcriptForDelivery({ rolling: "Hmm, eu eu", final: "Hmm. Eu, eu quero." }, "pt-BR", true), "Eu quero.");
  assert.equal(transcriptForDelivery({ rolling: "fallback", final: "Hmm, eu quero." }, "pt-BR", false), "Hmm, eu quero.");
  assert.equal(transcriptForDelivery({ rolling: "fallback", final: "" }, "pt-BR", true), "");
  const code = "```ts\nconst hum = 'hum';\n```\n";
  assert.equal(transcriptForDelivery({ rolling: "", final: code }, "pt-BR", true), code.replace(/\s+/g, " ").trim());
});
test("clipboard fallback reports success only after copying and preserves text on failure", async () => {
  let editor = "draft";
  const messages: string[] = [];
  const ui = {
    getEditorText: () => editor,
    setEditorText: (text: string) => { editor = text; },
    notify: (message: string) => { messages.push(message); },
  };
  await copyTranscriptToClipboard("copied text", ui as any, async () => {});
  assert.equal(editor, "draft");
  assert.match(messages.at(-1)!, /copied to the clipboard/);
  await copyTranscriptToClipboard("recover me", ui as any, async () => { throw new Error("no clipboard"); });
  assert.equal(editor, "draft recover me");
  assert.match(messages.at(-1)!, /added to the main editor/);
  for (const draft of ["", "draft ", "draft\n", "draft\\s"]) {
    editor = draft;
    await copyTranscriptToClipboard("text", ui as any, async () => { throw new Error("no clipboard"); });
    assert.equal(editor, draft + (draft === "draft\\s" ? " " : "") + "text");
  }
});
test("public toggle defaults to original Ctrl+Shift+M Kitty sequence", () => {
  assert.equal(DICTATE_TOGGLE_KEY, "ctrl+shift+m");
  assert.ok(matchesKey("\x1b[109;6u", DICTATE_TOGGLE_KEY));
});
test("public cancel defaults to original Ctrl+Shift+N Kitty sequence", () => {
  assert.equal(DICTATE_CANCEL_KEY, "ctrl+shift+n");
  assert.ok(matchesKey("\x1b[110;6u", DICTATE_CANCEL_KEY));
});
test("personal hotkey overrides accept modifier plus letter values", () => {
  assert.equal(resolveHotkey("ctrl+d", DICTATE_TOGGLE_KEY), "ctrl+d");
  assert.equal(resolveHotkey("ctrl+shift+n", DICTATE_CANCEL_KEY), "ctrl+shift+n");
  assert.equal(resolveHotkey(undefined, DICTATE_TOGGLE_KEY), "ctrl+shift+m");
  assert.throws(() => resolveHotkey("ctrl+ctrl+d", DICTATE_TOGGLE_KEY), /Invalid Pi Dictate hotkey/);
});
test("Ctrl+Shift+M repeats and releases are consumed without retoggling", () => {
  assert.ok(shouldConsumeRepeatedHotkey("\x1b[109;6:2u"));
  assert.ok(shouldConsumeRepeatedHotkey("\x1b[109;6:3u"));
  assert.ok(!shouldConsumeRepeatedHotkey("\x1b[97;1:2u"));
});
test("hotkeys remain distinct", () => {
  assert.ok(!matchesKey("\x1b[109;6u", DICTATE_CANCEL_KEY));
  assert.ok(!matchesKey("\x1b[110;6u", DICTATE_TOGGLE_KEY));
});
test("Stop button handles only left clicks inside its visible bounds", () => {
  const click = { type: "click", button: "left", x: 12, y: 0 };
  assert.ok(isStopButtonClick(click, 10, 8));
  assert.ok(!isStopButtonClick({ ...click, x: 18 }, 10, 8));
  assert.ok(!isStopButtonClick({ ...click, button: "right" }, 10, 8));
  assert.ok(!isStopButtonClick({ ...click, y: 1 }, 10, 8));
  assert.ok(!isStopButtonClick({ ...click, type: "press" }, 10, 8));
});
test("JSONL decoder accepts split lines", () => {
  const decoder = new JsonlDecoder();
  assert.deepEqual(decoder.feed('{"v":1,"type":"ready"}'), []);
  assert.deepEqual(decoder.feed("\n"), [{ v: 1, type: "ready" }]);
  decoder.finish();
});
test("JSONL decoder preserves split UTF-8 characters", () => {
  const decoder = new JsonlDecoder();
  const encoded = Buffer.from('{"v":1,"type":"ready","text":"Hé"}\n');
  const split = encoded.indexOf(0xc3) + 1;
  assert.deepEqual(decoder.feed(encoded.subarray(0, split)), []);
  assert.equal(decoder.feed(encoded.subarray(split))[0]?.text, "Hé");
});
test("protocol rejects wrong version and oversized lines", () => {
  assert.throws(() => parseProtocolLine('{"v":2,"type":"hello"}'), ProtocolError);
  assert.throws(() => parseProtocolLine(" ".repeat(1024 * 1024 + 1)), ProtocolError);
});

test("normalized dictation inserts as text without submitting", () => {
  const input = new Input();
  let submitted = false;
  input.onSubmit = () => { submitted = true; };
  const transcript = transcriptForDelivery({ rolling: "first line\nsecond line", final: null }, "auto", false);
  input.handleInput(transcript);
  assert.equal(input.getValue(), "first line second line");
  assert.equal(submitted, false);
});
test("dictate optimization command is extension-local and does not submit an agent turn", async () => {
  const commands = new Map<string, any>();
  const events: string[] = [];
  let submitted = 0;
  dictateExtension({
    on: (event: string) => { events.push(event); },
    registerCommand: (name: string, options: any) => { commands.set(name, options); },
    registerShortcut: () => {},
    sendUserMessage: () => { submitted++; },
  } as any);
  const notices: string[] = [];
  const ctx = { ui: { notify: (message: string) => notices.push(message) } } as any;
  const command = commands.get("dictate-optimize");
  assert.ok(command);
  assert.deepEqual(command.getArgumentCompletions("").map((item: any) => item.value), ["off", "clean"]);
  assert.deepEqual(command.getArgumentCompletions("e"), []);
  await command.handler("clean", ctx);
  await command.handler("english", ctx);
  await command.handler("", ctx);
  assert.ok(notices.some((message) => message.includes("Use /dictate-optimize off or clean.")));
  assert.ok(notices.some((message) => message.includes("next recording")));
  assert.equal(submitted, 0);
  assert.ok(!events.includes("input"));
});
test("first dictation runs setup even when asset files already exist; import stays lazy", async () => {
  const { mkdtemp, mkdir, cp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { execFileSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "dictate-first-use-"));
  try {
    await cp(new URL("./runtime/", import.meta.url), join(directory, "runtime"), { recursive: true });
    await mkdir(join(directory, "scripts"));
    await writeFile(join(directory, "scripts", "setup.mjs"), 'console.error("setup reached"); process.exit(23);');
    await writeFile(join(directory, "asset"), "unverified asset");
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      const { startRuntime } = await import(${JSON.stringify(pathToFileURL(join(directory, "runtime", "index.ts")).href)});
      await assert.rejects(startRuntime(), /setup reached/);
    `], { env: { ...process.env, DICTATE_RUNTIME_PATH: join(directory, "asset"), DICTATE_MODEL_PATH: join(directory, "asset") } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
