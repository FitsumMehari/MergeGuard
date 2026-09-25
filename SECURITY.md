# Security

MergeGuard treats repository text as untrusted evidence. Repository source/comments are never instructions for the verifier. Offline mode performs no network calls. Laya mode runs a local Python process and may download a model checkpoint on first use through Laya/Hugging Face; after caching, inference can be local. Jev mode intentionally sends candidate/context data to the configured remote API and is opt-in.

Do not include secrets in `.mergeguard.yml`. Jev credentials belong in environment variables.
