# Third-party notices

The Nemotron runtime and its JSONL process client are adapted from Talk-to-Pi
(MIT; https://github.com/Danmoreng/talk-to-pi). Relevant adapted sources are
under `native/` and `runtime/`. The reference repository is not required at
build or runtime.

Pinned dependencies are Git submodules under `native/vendor/`:

| Dependency | Revision | License |
|---|---|---|
| NeMo-Speech.cpp | `2e12e2def8a98ed06666f7ee3ca94e7193e04be4` | Apache-2.0 |
| NeMo `ggml` and nested dependencies | pinned by NeMo-Speech.cpp | Multiple; see upstream notices |
| miniaudio | `9634bedb5b5a2ca38c1ee7108a9358a4e233f14d` | MIT-0 |
| nlohmann/json | `9cca280a4d0ccf0c08f47a99aa71d1b0e52f8d03` | MIT |

License texts and NVIDIA notices are retained in `licenses/`. The Nemotron
model itself is not included; it has separate OpenMDW-1.1 terms and attribution.
