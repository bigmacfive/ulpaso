# Meeting worker protocol

Ulpaso deliberately keeps native capture and model inference in separate
processes. The Rust controller owns permissions, audio recovery, and lifecycle;
the Python worker owns model downloads and inference. They communicate only
through stdin/stdout, so alternative workers can be implemented without Tauri.

## Input framing

Every stdin frame is a one-byte kind, a little-endian unsigned 32-bit payload
length, and the payload.

| Kind | Payload | Meaning |
| --- | --- | --- |
| `1` | little-endian float32 mono PCM at 16 kHz | append audio |
| `2` | empty | finish and emit the final transcript |
| `3` | empty | cancel immediately |

Audio is first written to a disk spool. The in-memory queue contains byte
offsets rather than PCM buffers. If a worker exits once, Rust starts another
generation and replays the spool from byte zero before resuming live delivery.

## Output events

The worker writes one compact JSON object per stdout line. Stdout is reserved
for protocol data; diagnostics belong on stderr.

| `type` | Required fields | Purpose |
| --- | --- | --- |
| `download` | `progress`, `message` | artifact preparation progress from 0 to 1 |
| `loading` | `message` | model initialization |
| `ready` | none | worker can accept PCM |
| `transcript` | `stableText`, `unstableText`, `speakerId` | replaceable live text |
| `finalizing` | `progress`, `message` | final accuracy/diarization pass |
| `final` | `text`, `segments` | authoritative completed transcript |
| `error` | `code`, `message` | terminal worker failure |

Final segments use `{ speaker, text, start, end }`. Speakers are one-based and
may be null; timestamps are seconds. Unknown fields must be ignored so the
protocol can grow compatibly.

## Test without models

The checked-in worker provides a deterministic mock implementation:

```sh
PYTHONPATH=scripts python3 -m unittest scripts/test_worker_protocol_e2e.py
```

This test starts the real worker process, exchanges binary frames, and verifies
the complete event sequence. Rust-side framing and crash replay are tested in
`src-tauri/src/meeting/worker_protocol.rs`.
