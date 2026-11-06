# Dictation prompt preparation

## Status

`clean` applies a short list of deterministic rules to finalized ASR text. It
removes recognized fillers and immediate repetitions of subject pronouns. It
does not shorten, rephrase, or translate sentences, and it cannot correct ASR
recognition errors. The cleanup can still remove an intentional filler.

The extension uses only the local Nemotron ASR model. It does not use the active
Pi model or another text model for cleanup. Dictated text stays in the spoken
language.

## Modes and controls

- `off` (default): existing behavior; normalize all whitespace to single
  spaces.
- `clean`: on finalized transcripts, remove selected fillers and immediate
  repetitions of subject pronouns. If text is multiline or appears to contain
  code, paths, filenames, commands, quoted literals, identifiers, or structured
  data, skip cleanup and preserve its line breaks and spacing.

Set `DICTATE_OPTIMIZE=off|clean` before starting Pi or use
`/dictate-optimize off|clean`. The slash command changes only the next
recording and does not trigger an agent turn. `DICTATE_CLEANUP=1` remains a
legacy alias for `clean` if `DICTATE_OPTIMIZE` is unset. Invalid explicit mode
values warn and use `off`.

Processing happens synchronously in `index.ts`'s finalized-transcript delivery
path, before text is inserted. Rolling fallback text is not cleaned and keeps
the existing whitespace normalization. The existing editor insertion,
clipboard fallback, and stop/cancel behavior remain in place; no message is
submitted automatically. Manually typed Pi messages are
not intercepted. The extension does not store transcript text or make
preprocessing network requests.

## Existing transcription path and performance

Pi Dictate starts the native Nemotron process at the first recording and keeps
it alive for subsequent recordings in that Pi process; model loading is not
repeated for each recording. Native capture is mono 16 kHz, the inference worker
feeds 1,600-sample blocks (100 ms), and the streaming model is configured with
160 ms chunks. The finalized-text optimization is synchronous and runs after
ASR finalization, before insertion. This increment changes no audio or native
inference code because no transcription bottleneck was measured. The text
benchmark below measures Node-side transformation only; its memory numbers do
not include Pi, the ASR process, or the 741 MB ASR model file.

The cleanup rules are intentionally narrow and cannot guarantee semantic
equivalence. They leave other wording, negations, conditions, uncertainty, and
repeated emphasis alone; tests cover these cases. The structured-content guard
is heuristic, so an unrecognized literal could still be cleaned. The `off`
mode retains the previous whitespace-flattening behavior. `clean` preserves
line breaks and spacing for multiline or recognizable structured text. If
cleanup throws or would erase a nonempty transcript, the original transcript is
inserted instead.

## Benchmark

Run `npm run benchmark`. It measures the same pure text transformation called
before insertion, separately from audio capture and ASR. Fixtures are
hand-authored Portuguese/technical transcripts, not recordings from a
microphone. The additional 10,000-character fixture repeats a conversational
sample to stress the regex path. Each mode uses 50 warm-up rounds and 500
iterations per fixture. Memory deltas are end-of-run RSS/heap snapshots and are
noisy; they are not peak measurements.

Environment: 2026-11-06, Node v24.18.0, Linux x86-64, Intel Core i5-13420H,
12 online CPUs, 15.3 GiB RAM (5.1 GiB available during inspection).

| Mode / set | Characters | Estimated tokens | Latency | Notes |
|---|---:|---:|---:|---|
| off, 8 speech fixtures | 1,132 → 1,132 (0%) | 286 → 286 (0%) | — | Baseline |
| clean, 8 speech fixtures | 1,132 → 1,101 (2.74%) | 286 → 278 (2.80%) | — | 31 characters removed |
| off, including 10k stress | 11,132 → 11,132 (0%) | 2,786 → 2,786 (0%) | p95 0.177 ms | All 9 fixtures |
| clean, including 10k stress | 11,132 → 11,005 (1.14%) | 2,786 → 2,754 (1.15%) | p95 0.397 ms | 127 characters removed |

The 10,000-character stress case alone measured 0.472 ms p95 in `clean` and
removed 96 characters (0.96%). The full `clean` run used about 242 ms CPU over
4,500 transformations; its RSS delta was +2 MiB and heap delta -1.551 MiB.
Those memory deltas are transient process snapshots, not retained-memory or
peak measurements. The optimizer adds no model weights.

Token figures are estimates using Pi's chars/4 heuristic, not the destination
LLM's tokenizer. The configured provider's tokenizer is not available in this
extension, so these counts cannot establish actual token or cost savings. The
rule-based pass makes no paid API calls; it uses local CPU and downloads no
models.

The long conversational fixture was unchanged by `clean`; savings came from
removing recognized disfluencies in other fixtures. The pass uses no translation
model and downloads no optimization models.
