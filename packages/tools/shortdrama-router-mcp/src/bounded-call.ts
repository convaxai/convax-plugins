import { abortError } from "./contracts.ts"

export class BoundedCallTimeoutError extends Error {
  override name = "BoundedCallTimeoutError"
}

export async function boundedCall<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  action: (attemptSignal: AbortSignal) => Promise<T>,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Bounded call timeout is invalid")
  }
  if (signal?.aborted) throw abortError()
  const controller = new AbortController()
  let rejectInterruption!: (error: Error) => void
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterruption = reject
  })
  const onAbort = () => {
    controller.abort(signal?.reason)
    rejectInterruption(abortError())
  }
  signal?.addEventListener("abort", onAbort, { once: true })
  if (signal?.aborted) onAbort()
  const timer = setTimeout(() => {
    controller.abort("Bounded provider call timed out")
    rejectInterruption(
      new BoundedCallTimeoutError("Bounded provider call timed out"),
    )
  }, timeoutMs)
  timer.unref?.()
  // Start through a Promise callback so a synchronous provider throw is also
  // captured by the race. Promise.race installs rejection handlers on both
  // inputs, so a non-cooperative losing action cannot later become unhandled.
  const operation = Promise.resolve().then(() => action(controller.signal))
  try {
    return await Promise.race([operation, interrupted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}
