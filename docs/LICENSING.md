# Licensing

Pi Dictate remains licensed under the repository's MIT license. The native
runtime and small JSONL client are adapted from
[Talk-to-Pi](https://github.com/Danmoreng/talk-to-pi), also MIT-licensed.
Existing Pi Dictate copyright and attribution are unchanged.

Pinned native dependencies:

- NeMo-Speech.cpp: Apache-2.0, `2e12e2def8a98ed06666f7ee3ca94e7193e04be4`
- NeMo's `ggml` and nested dependencies: revisions pinned by its submodules
- miniaudio: MIT-0, `9634bedb5b5a2ca38c1ee7108a9358a4e233f14d`
- nlohmann/json: MIT, `9cca280a4d0ccf0c08f47a99aa71d1b0e52f8d03`

Applicable dependency licenses and notices are in `licenses/` and
`THIRD_PARTY_NOTICES.md`. The NeMo embedding patch is attributed in
`native/patches/nemo-speech-embed.patch`.

The NVIDIA Nemotron Q8_0 model is a separate download, not included in this
repository. It is fetched from the pinned Hugging Face revision recorded in
`scripts/download-model.mjs`, verified by exact size and SHA-256, and governed
by OpenMDW-1.1 (`licenses/OpenMDW-1.1.txt`). Refer to NVIDIA's model terms before
distributing it. This project is not affiliated with or endorsed by NVIDIA.
