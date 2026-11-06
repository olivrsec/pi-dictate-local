# pi-dictate

Pi extension that transcribes speech into the focused text field via a local
Nemotron native runtime, triggered by hotkeys.

## Language

**Runtime**:
The local native Nemotron process that captures microphone audio and emits
transcription events over JSONL stdin/stdout.
_Avoid_: cloud backend (the former Deepgram integration), Sherpa server

**Rolling text**:
The runtime's current best-effort transcript for the open stream. Each update
replaces the previous one; it is not appended.
_Avoid_: partial, interim

**Final**:
The runtime's definitive transcript for a stream, emitted after the client
signals end of audio.
_Avoid_: result

**Transcript**:
The delivered dictation output: the final text of a session, inserted into
the focused text field on stop.
_Avoid_: output, text

**Live preview**:
Optional status-line rendering of the rolling text while recording.
_Avoid_: partials display
