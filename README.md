# Pi Dictate

Dictate into Pi with NVIDIA's Nemotron streaming speech model. Pi Dictate
transcribes microphone audio on your computer and inserts the result into Pi's
current input. When you submit that input, Pi sends it to the provider selected
for your session.

## Install

```bash
pi install git:github.com/olivrsec/pi-dictate-local
```

Pi installs the extension. The first time you start dictation, Pi Dictate
initializes its pinned native dependencies, builds the runtime, and downloads
the 742 MB model. Setup checks the model's size and SHA-256 digest. That first
start needs network access, disk space, and may take several minutes. The model
stays under `~/.local/share/pi-dictate/`; the runtime stays in Pi's package
checkout. If an update removes the runtime, it is rebuilt the next time you
start dictation. If setup is interrupted and reports a stale lock, remove
`~/.local/share/pi-dictate/setup.lock` and retry. Read
[docs/LICENSING.md](docs/LICENSING.md) before redistributing the model.

## Use it

- **Ctrl+Shift+M** starts and stops recording.
- **Ctrl+Shift+N** cancels and discards the current recording.
- In fullscreen mode, click **[ Stop ]** beside the listening meter to stop.

Focus a text field before recording. Pi Dictate appends text to editor fields.
In other dialogs, it types into the focused field, so press Tab to reach it
first. If no text field has focus when recording stops, Pi Dictate tries to
copy the transcript. If Pi's clipboard helper reports failure, Pi Dictate adds
the transcript to the main editor and shows a warning. Pi may use the terminal's
OSC 52 clipboard support, which cannot confirm that your terminal accepted the
copy.

Pi Dictate shows an audio-level meter while you speak. It inserts text after
Nemotron returns the final transcript. If the runtime fails, Pi Dictate may
have only a rolling transcript, which can be incomplete.

## Requirements

- Pi 1.5.0 or newer and Node.js 24 or newer
- Git with submodule support, CMake 3.26 or newer, a C++17 compiler, and Bash
- On Windows, Git for Windows (Git Bash) and a C++ toolchain
- On macOS, Xcode Command Line Tools and macOS 13 or newer
- An available microphone

The build scripts include Linux, macOS, and Windows targets for x64 and ARM64.
I verified this checkout on Linux x86-64. The x86-64 CPU build requires AVX2,
FMA, F16C, and BMI2 instructions. CPU inference is the default.

## Settings

Set these variables before starting Pi. Use absolute paths for runtime and model
overrides. Hotkey values use Pi key notation with distinct modifiers and one
letter or digit.

| Variable | Default | Purpose |
|---|---|---|
| `DICTATE_TOGGLE_KEY` | `ctrl+shift+m` | Start or stop recording |
| `DICTATE_CANCEL_KEY` | `ctrl+shift+n` | Cancel and discard recording |
| `DICTATE_RUNTIME_PATH` | `native/install/pi-dictate-runtime` (`.exe` on Windows) | Runtime executable |
| `DICTATE_MODEL_PATH` | `~/.local/share/pi-dictate/nemotron-3.5-asr-streaming-0.6b-q8_0.gguf` | Model file |
| `DICTATE_LANGUAGE` | `auto` | Automatic detection, or choose `pt-BR` or `en-US` |
| `DICTATE_CLEANUP` | off | Set to `1` to clean selected fillers and repeated subject pronouns |
| `DICTATE_DEBUG` | off | Set to `1` to write extension events to your system's temporary directory |

Cleanup runs on final transcripts. It removes common filler sounds and immediate
repetitions of selected subject pronouns. It preserves repeated negations,
other repeated words, and live hypotheses. In automatic language mode, it keeps
ambiguous words such as `um` and `hum`. The filter does not repair syllable
stutters or repeated phrases, and it can remove intentional filler or pronoun
repetitions.

## Terminal keys

Ctrl+Shift+M and Ctrl+Shift+N require a terminal that sends the Kitty keyboard
protocol. In tmux, enable extended keys for modified combinations:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

## Build and test

From a development checkout, run:

```bash
npm ci
npm run native:build
npm run check
npm test
npm run native:test
```

The automated tests cover TypeScript behavior, setup planning, protocol
handling, native JSONL parsing, and audio-level calculations. They do not test
microphone recognition. Check your operating system's microphone permissions if
recording cannot start. An illegal-instruction error means your x86-64 CPU may
lack one of the required features above.

## Attribution

The native runtime and JSONL client adapt code from Talk-to-Pi. See
[docs/LICENSING.md](docs/LICENSING.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for dependency licenses, model terms, and attribution.
