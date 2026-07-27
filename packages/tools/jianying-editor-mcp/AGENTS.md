# JianYing companion contract

- Keep this process headless and independent of Convax source packages.
- Accept only the exact `convax.generation-call/1` host envelope.
- Treat every path as a temporary host-staged input; validate it immediately and
  never persist or return it.
- Observe only process metadata and open draft lock files. Never parse or mutate
  JianYing draft JSON.
- Deep Links must launch by the fixed bundle id without a shell. File transfer
  stays on loopback, is tokenized, bounded, cancellable, and closed after use.
- Unknown or partial native outcomes fail closed and are never retried here.
