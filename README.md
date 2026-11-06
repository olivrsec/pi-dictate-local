# Pi Dictate

Dictate into Pi with NVIDIA's Nemotron streaming speech model. Pi Dictate runs
transcription on your computer and inserts the recognized text into Pi's current
input. When you submit that text, Pi sends it to the provider configured for
your session.

## Use it

1. Focus a Pi text input and press **Ctrl+D** to start recording.
2. Press **Ctrl+D** again, or click **[ Stop ]** beside the listening meter in
   fullscreen mode, to finish.
3. Press **Ctrl+Shift+N** to cancel and discard the recording.

Pi Dictate appends text to editor fields. In other dialogs, it types into the
focused field, so press Tab to reach that field first. If no text field has
focus when recording stops, Pi Dictate tries to copy the transcript. If Pi's
clipboard helper reports failure, Pi Dictate adds the transcript to the main
editor and shows a warning. Pi may use the terminal's OSC 52 clipboard support,
which cannot confirm that your terminal accepted the copy.

During recording, you see an audio-level meter, not a live transcript. Pi Dictate
inserts text after you stop.

**Ctrl+D overrides Pi's delete-forward and exit-on-empty actions while this
extension is loaded.**

## Install from source

Pi Dictate needs a native runtime and a separate model download. Clone the
repository with its pinned dependencies, then build both:

```bash
git clone --recurse-submodules https://github.com/olivrsec/pi-dictate-local.git
cd pi-dictate-local
npm ci
npm run native:build
npm run model:download
pi install .
```

Pi loads this local package from the checkout, so keep the directory in place.
Start Pi from any directory after installation. The build puts the runtime in
`native/install/`. The download script saves the 742 MB model under
`~/.local/share/pi-dictate/` and checks its size and SHA-256 digest. Read
[docs/LICENSING.md](docs/LICENSING.md) and the NVIDIA notice before you
redistribute the model.

## Requirements

- Pi 1.5.0 or newer
- Node.js 24 or newer
- Git with submodule support, CMake 3.26 or newer, a C++17 compiler, and Bash
- On Windows, Git for Windows (Git Bash) and a C++ toolchain
- On macOS, Xcode Command Line Tools and macOS 13 or newer
- An available microphone

The build scripts include Linux, macOS, and Windows targets for x64 and ARM64.
I verified this checkout on Linux x86-64. The x86-64 CPU build requires AVX2,
FMA, F16C, and BMI2 instructions. CPU inference is the default.

## Settings

Set these variables before starting Pi:

| Variable | Default | Purpose |
|---|---|---|
| `DICTATE_RUNTIME_PATH` | `native/install/pi-dictate-runtime` (`.exe` on Windows) | Path to the native runtime |
| `DICTATE_MODEL_PATH` | `~/.local/share/pi-dictate/nemotron-3.5-asr-streaming-0.6b-q8_0.gguf` | Model path; also used by the download script |
| `DICTATE_LANGUAGE` | `auto` | Use automatic detection or select `pt-BR` or `en-US` |
| `DICTATE_CLEANUP` | off | Set to `1` to remove selected fillers and repeated subject pronouns from final transcripts |
| `DICTATE_DEBUG` | off | Set to `1` to log extension events to your system's temporary directory |

The cleanup is a text heuristic. It removes common filler sounds and immediate
repetitions of selected subject pronouns. It preserves repeated negations,
other repeated words, and live hypotheses. In automatic language mode, it keeps
ambiguous words such as `um` and `hum`; use an explicit locale to remove those
fillers. It does not repair syllable stutters or repeated phrases, and it can
remove intentional filler or pronoun repetitions.

## Terminal keys

Ctrl+D works with the standard terminal encoding, but it takes over the Pi
shortcuts noted above. Ctrl+Shift+N requires a terminal that sends the Kitty
keyboard protocol. In tmux, add:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

## Build and test

```bash
npm run check
npm test
npm run native:test
```

`npm run native:test` runs after `npm run native:build`. The automated tests
cover TypeScript behavior, protocol handling, native JSONL parsing, and audio
level calculations. They do not test microphone recognition. Check your
operating system's microphone permissions if recording cannot start. If the
runtime reports an illegal instruction, your x86-64 CPU may lack one of the
required features above.

A runtime failure may leave only a rolling transcript, which can be incomplete.
The normal stop path waits for Nemotron's final transcript before inserting
text.

## Attribution

The native runtime and JSONL client adapt code from Talk-to-Pi. See
[docs/LICENSING.md](docs/LICENSING.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for dependency licenses, model terms, and attribution.
