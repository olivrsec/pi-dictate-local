/**
 * dictate — local Nemotron dictation for pi.
 * Keeps Pi Dictate's focus-aware hotkeys and delivery UI; a local native
 * runtime owns microphone capture and streaming transcription.
 */
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, isKeyRelease, isKeyRepeat, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startRuntime, shutdownRuntime, type RuntimeMessage } from "./runtime/index.ts";

export interface TranscriptState {
  rolling: string;
  final: string | null;
}
export const initialTranscript: TranscriptState = { rolling: "", final: null };
export function applyNemotronMessage(state: TranscriptState, message: RuntimeMessage): TranscriptState {
  if (state.final !== null || typeof message.text !== "string") return state;
  if (message.type === "recording_finalized") return { ...state, final: message.text };
  if (message.type === "transcript_update") return { ...state, rolling: message.text };
  return state;
}

// shortcut: handles common fillers and subject-pronoun stutters only; broaden after real examples.
export function cleanDisfluencies(text: string, language: string): string {
  const locale = language.toLowerCase();
  const fillers = ["h+m+"];
  if (locale === "auto" || locale.startsWith("pt")) fillers.push("a+h+n+", "a+h+m+");
  // "hum" is also an English verb/noun; auto must preserve it.
  if (locale.startsWith("pt")) fillers.push("h+u+m+");
  if (locale === "auto" || locale.startsWith("en")) fillers.push("u+h+", "e+r+m+");
  if (locale.startsWith("en")) fillers.push("u+m+", "e+r+");
  const startsWithFiller = new RegExp(`^\\s*(?:${fillers.join("|")})(?![\\p{L}\\p{N}_]|-[\\p{L}])[,;.!?…]*\\s*`, "iu").test(text);
  let cleaned = text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(?:${fillers.join("|")})(?![\\p{L}\\p{N}_]|-[\\p{L}])[,;.!?…]*\\s*`, "giu"),
    "",
  );
  const pronouns = "I|we|you|he|she|it|they|eu|tu|você|ele|ela|nós|vocês|eles|elas";
  cleaned = cleaned.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(${pronouns})(?![\\p{L}\\p{N}_])(?:(?:\\s*[,;]\\s*|\\s+|-)\\1)+(?![\\p{L}\\p{N}_])`, "giu"),
    "$1",
  );
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
  return startsWithFiller ? cleaned.replace(/^(\p{Ll})/u, (letter) => letter.toUpperCase()) : cleaned;
}
export function transcriptForDelivery(state: TranscriptState, language: string, cleanup: boolean): string {
  const rawText = state.final ?? state.rolling;
  const text = cleanup && state.final !== null ? cleanDisfluencies(rawText, language) : rawText;
  return text.replace(/\s+/g, " ").trim();
}
type ClipboardUI = Pick<ExtensionContext["ui"], "getEditorText" | "setEditorText" | "notify">;
export async function copyTranscriptToClipboard(
  text: string,
  ui: ClipboardUI,
  copy: typeof copyToClipboard = copyToClipboard,
): Promise<void> {
  try {
    await copy(text);
    ui.notify("No input field was focused; dictation was copied to the clipboard.", "warning");
  } catch {
    const current = ui.getEditorText() ?? "";
    ui.setEditorText(current + (current && !/\s$/.test(current) ? " " : "") + text);
    ui.notify("Clipboard unavailable; transcript added to the main editor.", "warning");
  }
}

const DEBUG = !!process.env.DICTATE_DEBUG;
const dbg = (message: string) => {
  if (!DEBUG) return;
  try { appendFileSync(join(tmpdir(), "dictate-debug.log"), `${new Date().toISOString()} ${message}\n`); } catch {}
};
const LIVE_PREVIEW = false;
const DICTATE_LANGUAGE = process.env.DICTATE_LANGUAGE ?? "auto";
const CLEAN_DISFLUENCIES = process.env.DICTATE_CLEANUP === "1";
const PREVIEW_MAX_CHARS = 96;
type State = "idle" | "starting" | "recording" | "stopping";
interface EditorLike { getText(): string; setText(text: string): void }
type Target = { kind: "editor"; editor: EditorLike } | { kind: "typable"; component: { handleInput(data: string): void } };
const asEditorLike = (value: any): EditorLike | null => value && typeof value.getText === "function" && typeof value.setText === "function" ? value : null;
export const DICTATE_TOGGLE_KEY = Key.ctrl("d");
export const DICTATE_CANCEL_KEY = Key.ctrlShift("n");
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const METER_CELLS = 6;
const METER_TICK_MS = 60;
const PEAK_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const METER_FLOOR_DB = -50;
const METER_CEILING_DB = -10;
type MouseClick = { type: string; button: string; x: number; y: number };
export function isStopButtonClick(event: MouseClick, start: number, width: number): boolean {
  return event.type === "click" && event.button === "left" && event.y === 0 && event.x >= start && event.x < start + width;
}
export function shouldConsumeRepeatedHotkey(data: string): boolean {
  return (isKeyRelease(data) || isKeyRepeat(data)) &&
    (matchesKey(data, DICTATE_TOGGLE_KEY) || matchesKey(data, DICTATE_CANCEL_KEY));
}
function rmsToBlock(rms: number): string {
  if (rms <= 0) return PEAK_BLOCKS[0]!;
  const db = 20 * Math.log10(rms);
  const t = Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB)));
  return PEAK_BLOCKS[Math.floor(t * (PEAK_BLOCKS.length - 1))]!;
}

export default function (pi: ExtensionAPI) {
  let state: State = "idle";
  let transcript = initialTranscript;
  let activeCtx: ExtensionContext | null = null;
  let flushed = false;
  let cancelled = false;
  let generation = 0;
  let sessionId = "";
  let removeSessionHandlers: (() => void)[] = [];
  let spinnerTimer: NodeJS.Timeout | null = null;
  let finalizationTimeout: NodeJS.Timeout | null = null;
  let spinnerFrame = 0;
  let meterTimer: NodeJS.Timeout | null = null;
  let meter: number[] = new Array(METER_CELLS).fill(0);
  let currentLevel = 0;
  let tuiHandle: any = null;
  let removeInputListener: (() => void) | null = null;
  let lastCtx: ExtensionContext | null = null;

  const setStatus = (msg: string | undefined) => activeCtx?.ui.setStatus("dictate", msg);
  const stopSpinner = () => { if (spinnerTimer) clearInterval(spinnerTimer); spinnerTimer = null; };
  const stopMeter = () => { if (meterTimer) clearInterval(meterTimer); meterTimer = null; };
  const startSpinner = (suffix: string) => {
    stopSpinner(); spinnerFrame = 0; setStatus(`${SPINNER_FRAMES[0]} ${suffix}`);
    spinnerTimer = setInterval(() => { spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length; setStatus(`${SPINNER_FRAMES[spinnerFrame]} ${suffix}`); }, SPINNER_INTERVAL_MS);
  };
  const startMeter = () => {
    stopMeter(); meter = new Array(METER_CELLS).fill(0); currentLevel = 0;
    const statusText = (dot: string) => {
      const bars = meter.map(rmsToBlock).join("");
      if (!LIVE_PREVIEW) return `${dot} ${bars} listening…`;
      let text = transcript.rolling.replace(/\s+/g, " ").trim();
      if (text.length > PREVIEW_MAX_CHARS) text = `…${text.slice(-(PREVIEW_MAX_CHARS - 1))}`;
      return text ? `${dot} ${bars} ${text}` : `${dot} ${bars} listening…`;
    };
    if (tuiHandle && activeCtx) {
      activeCtx.ui.setStatus("dictate", undefined);
      activeCtx.ui.setWidget("dictate-stop", (tui: any, theme: any) => ({
        render: (width: number) => {
          const prefix = `${statusText(theme.fg("error", "●"))} `;
          const button = theme.fg("warning", "[ Stop ]");
          return [truncateToWidth(prefix + button, width)];
        },
        handleMouse: (event: MouseClick) => {
          const prefix = `${statusText(theme.fg("error", "●"))} `;
          const buttonWidth = visibleWidth("[ Stop ]");
          if (!isStopButtonClick(event, visibleWidth(prefix), buttonWidth)) return undefined;
          void stopDictation();
          return { handled: true, render: true };
        },
        invalidate() {},
      }) as any, { placement: "belowEditor" });
    } else {
      const render = () => setStatus(statusText(activeCtx?.ui.theme.fg("error", "●") ?? "●"));
      render();
    }
    meterTimer = setInterval(() => {
      meter.shift(); meter.push(currentLevel);
      if (tuiHandle) tuiHandle.requestRender?.();
      else setStatus(statusText(activeCtx?.ui.theme.fg("error", "●") ?? "●"));
    }, METER_TICK_MS);
  };
  const resolveTarget = (): Target | null => {
    const focused = tuiHandle?.focusedComponent;
    if (!focused) return null;
    const editor = asEditorLike(focused) ?? asEditorLike(focused.editor);
    if (editor) return { kind: "editor", editor };
    if (typeof focused.handleInput === "function") return { kind: "typable", component: focused };
    return null;
  };
  const flush = () => {
    if (flushed || !activeCtx) return;
    flushed = true;
    if (cancelled) return;
    const text = transcriptForDelivery(transcript, DICTATE_LANGUAGE, CLEAN_DISFLUENCIES);
    if (!text) return;
    if (!tuiHandle) {
      const current = activeCtx.ui.getEditorText() ?? "";
      activeCtx.ui.setEditorText(current + (current && !/\s$/.test(current) ? " " : "") + text);
      return;
    }
    const target = resolveTarget();
    if (target?.kind === "editor") {
      const current = target.editor.getText() ?? "";
      const sep = current && !/\s$/.test(current) ? " " : "";
      target.editor.setText(current + sep + text); tuiHandle.requestRender?.(); return;
    }
    if (target?.kind === "typable") { target.component.handleInput(text); tuiHandle.requestRender?.(); return; }
    void copyTranscriptToClipboard(text, activeCtx.ui);
  };
  const cleanupSession = (deliver: boolean) => {
    generation++;
    for (const off of removeSessionHandlers) off();
    removeSessionHandlers = [];
    stopSpinner(); stopMeter();
    activeCtx?.ui.setWidget("dictate-stop", undefined);
    if (finalizationTimeout) clearTimeout(finalizationTimeout);
    finalizationTimeout = null;
    if (deliver) flush();
    transcript = initialTranscript; state = "idle"; setStatus(undefined); activeCtx = null;
    flushed = false; cancelled = false; sessionId = "";
  };
  const failSession = (ctx: ExtensionContext, error: unknown, myGeneration: number) => {
    if (myGeneration !== generation) return;
    ctx.ui.notify(`Nemotron runtime error: ${error instanceof Error ? error.message : String(error)}`, "error");
    cleanupSession(true);
    void shutdownRuntime();
  };
  const startDictation = async (ctx: ExtensionContext) => {
    activeCtx = ctx; transcript = initialTranscript; flushed = false; cancelled = false;
    const myGeneration = ++generation;
    state = "starting"; startSpinner("loading Nemotron…");
    try {
      const runtime = await startRuntime();
      if (myGeneration !== generation || cancelled) return;
      sessionId = randomUUID();
      const activeSession = sessionId;
      removeSessionHandlers = [
        runtime.onMessage((message) => {
          if (myGeneration !== generation || message.sessionId !== activeSession) return;
          if (message.type === "recording_started") { state = "recording"; stopSpinner(); startMeter(); }
          if (message.type === "audio_level" && typeof message.rms === "number" && Number.isFinite(message.rms)) currentLevel = Math.max(0, Math.min(1, message.rms));
          transcript = applyNemotronMessage(transcript, message);
          if (message.type === "recording_finalized") cleanupSession(true);
          if (message.type === "error") failSession(ctx, new Error(typeof message.message === "string" ? message.message : "runtime error"), myGeneration);
        }),
        runtime.onFailure((error) => failSession(ctx, error, myGeneration)),
      ];
      await runtime.sendCommand({ type: "start", sessionId: activeSession, language: DICTATE_LANGUAGE });
      if (myGeneration !== generation || cancelled) return;
      if (state !== "starting") return;
      state = "recording";
      stopSpinner();
      // recording_started is normally emitted with the command acknowledgement;
      // retain this fallback for runtimes that deliver it just after the ack.
      if (!meterTimer) startMeter();
    } catch (error) {
      if (myGeneration === generation) {
        ctx.ui.notify(`Could not start Nemotron dictation: ${error instanceof Error ? error.message : String(error)}`, "error");
        cleanupSession(false);
      }
    }
  };
  const stopDictation = async () => {
    if (state !== "recording") return;
    state = "stopping"; stopMeter(); activeCtx?.ui.setWidget("dictate-stop", undefined); startSpinner("finalizing…");
    const myGeneration = generation;
    const ctx = activeCtx!;
    finalizationTimeout = setTimeout(() => failSession(ctx, new Error("Nemotron finalization timed out."), myGeneration), 30_000);
    const id = sessionId;
    try {
      const runtime = await startRuntime();
      if (myGeneration !== generation) return;
      await runtime.sendCommand({ type: "stop", sessionId: id }, 15_000);
    } catch (error) { failSession(ctx, error, myGeneration); }
  };
  const cancelDictation = async () => {
    if (state === "idle" || cancelled) return;
    cancelled = true; transcript = initialTranscript;
    const oldGeneration = generation;
    if (!sessionId) { cleanupSession(false); return; }
    state = "stopping"; stopMeter(); activeCtx?.ui.setWidget("dictate-stop", undefined); startSpinner("cancelling…");
    try {
      const runtime = await startRuntime();
      if (oldGeneration !== generation) return;
      await runtime.sendCommand({ type: "cancel", sessionId }, 15_000);
      if (oldGeneration === generation) cleanupSession(false);
    } catch (error) { if (oldGeneration === generation) failSession(activeCtx!, error, oldGeneration); }
  };
  const toggleDictation = (ctx: ExtensionContext) => {
    lastCtx = ctx;
    if (state === "idle") {
      if (tuiHandle && !resolveTarget()) { ctx.ui.notify("No input field is focused — dictation not started", "warning"); return; }
      void startDictation(ctx);
    } else if (state === "recording") void stopDictation();
  };
  const onGlobalInput = (data: string) => {
    if (isKeyRelease(data) || isKeyRepeat(data)) {
      return shouldConsumeRepeatedHotkey(data) ? { consume: true } : undefined;
    }
    if (matchesKey(data, DICTATE_TOGGLE_KEY)) { dbg(`ctrl+d state=${state}`); if (lastCtx) toggleDictation(lastCtx); return { consume: true }; }
    if (matchesKey(data, DICTATE_CANCEL_KEY)) { dbg(`ctrl+shift+n state=${state}`); void cancelDictation(); return { consume: true }; }
    return undefined;
  };
  pi.on("session_start", (_event, ctx) => {
    lastCtx = ctx;
    if (ctx.mode !== "tui" || tuiHandle) return;
    ctx.ui.setWidget("dictate-tui-handle", (tui: any) => {
      tuiHandle = tui; removeInputListener = tui.addInputListener(onGlobalInput);
      return { render: () => [], invalidate: () => {} };
    });
  });
  pi.registerShortcut(DICTATE_TOGGLE_KEY, { description: "Toggle voice dictation (Ctrl+D, local Nemotron)", handler: async (ctx) => toggleDictation(ctx) });
  pi.registerShortcut(DICTATE_CANCEL_KEY, { description: "Cancel voice dictation (discard transcript)", handler: async () => { await cancelDictation(); } });
  pi.on("session_shutdown", () => {
    cancelled = true;
    if (state !== "idle") cleanupSession(false);
    removeInputListener?.(); removeInputListener = null;
    void shutdownRuntime();
  });
}
