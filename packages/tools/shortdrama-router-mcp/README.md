# Short-drama router companion

`convax-shortdrama-router-mcp` is the reviewed MCP adapter for
`shortdrama-router@0.6.0`. One process owns exactly one provider:

```sh
convax-shortdrama-router-mcp --provider=xiaoyunque
convax-shortdrama-router-mcp --provider=jimeng
convax-shortdrama-router-mcp --provider=libtv
```

The process speaks newline-delimited MCP `2025-03-26`. `tools/list` probes the
selected provider and advertises only currently available models. Model selectors
are bounded to 32 entries per media class; enum and numeric range constraints are
projected into the tool schema and enforced again against the selected model.
Malformed, unknown, unavailable, unconfigured, or dependency-blocked models fail
closed rather than degrading to free text.

Every generation `operation_id` is passed to `shortdrama-router` as its public
idempotency key. Audio, image, and video records are stored in a private SQLite
journal using atomic claim and compare-and-set. A restart resumes the same
provider reference; an uncertain submit becomes `submission_unknown` and is never
automatically resubmitted. Because 0.6.0 can otherwise let a concurrent observer
turn another live submitter's fresh claim into `submission_unknown`, this adapter
re-observes fresh `submitting` records through the idempotent create path and uses
get only after the package's 30-minute provider-submit window has expired.

XiaoYunque authorization atomically persists the package-created Access Key and
the allowlisted browser session, then probes both methods independently. Jimeng
maps the managed Dreamina device flow to external browser authorization. LibTV
maps the package-managed Web OAuth URL, pending completion and cancellation to the
same external-browser contract. It stores its selected project through the public
configuration source. If exactly one project is available it is selected
automatically; zero or multiple projects keep generation unavailable instead of
choosing an ambiguous resource.

Local media references remain hidden because all three upstream providers
currently advertise no ingestion support. Provider cancellation is likewise not
advertised. This companion intentionally exposes media generation only and has no
`llm.gateway`; media Services are not required to provide an LLM.

Jimeng and LibTV authorization call the package's provider runtime service before
beginning the managed browser flow. The adapter gives `createShortDramaRouter()` and
`createBuiltInRuntimeService()` one private runtime root; it never resolves or
passes a CLI path. Version 0.6.0 owns platform selection, installation and the
managed absolute executable, pins both archive and extracted-executable SHA-256,
and re-verifies the executable before every command. An integrity-invalid or
legacy 0.5 runtime is reinstalled through the public runtime API. LibTV also gets
one private `LIBTV_CONFIG_DIR` for login, status, discovery, generation and logout.

Generated outputs are downloaded only from public standard-HTTPS endpoints into
the caller-provided absolute output directory. The companion accepts a closed
audio/image/video MIME set, verifies a matching container signature, publishes
only a relative artifact name, and removes partial or mixed-success output.
Provider failures, CLI output, credentials, native paths, and response bodies are
never returned or logged.
