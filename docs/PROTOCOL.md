# Local runtime protocol

The TypeScript extension starts `pi-dictate-runtime` as a child process. Commands
are UTF-8 JSON Lines on stdin; events are UTF-8 JSON Lines on stdout. Runtime
logs go to stderr. Protocol version is `1` and maximum line size is 1 MiB.

Commands are `start` (`sessionId`, `language`), `stop` (`sessionId`), `cancel`
(`sessionId`), and `shutdown`. Each command has a unique `id` and receives a
`command_ack` or correlated `error`. Events carry monotonically increasing
`seq` values. Startup sends `hello`, `loading_model`, and `ready` before any
recording command is sent.

Session events include `recording_started`, `transcript_update` (cumulative,
replace the previous hypothesis), `audio_level` (`rms` from 0 to 1), and one
terminal event: `recording_finalized` or `recording_cancelled`. The meter event
is sampled at roughly 20 Hz and is independent of ASR inference. The extension
ignores events from any other session.

This is a minimal adaptation of Talk-to-Pi's version-1 JSONL protocol; see
[licensing and attribution](LICENSING.md).
