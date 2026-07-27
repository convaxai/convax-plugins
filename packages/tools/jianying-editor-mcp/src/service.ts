import { randomUUID } from "node:crypto"

import type {
  DraftObservation,
  ExportResult,
  GenerationCall,
  PublicDraftStatus,
} from "./contracts.ts"
import { JianyingDraftInspector } from "./inspector.ts"
import { JianyingTransport } from "./transport.ts"

const tokenLifetimeMs = 5 * 60_000
const actionable = new Set(["active", "no_active_draft", "not_running"])

function sameObservation(left: DraftObservation, right: DraftObservation) {
  return (
    left.status === right.status &&
    left.processIds.join(",") === right.processIds.join(",") &&
    left.draft?.path === right.draft?.path &&
    left.draft?.pid === right.draft?.pid
  )
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Operation cancelled", "AbortError")
}

export interface DraftInspector {
  inspect(signal?: AbortSignal): Promise<DraftObservation>
}

export interface MediaTransport {
  createDraft(signal?: AbortSignal): Promise<void>
  import(references: GenerationCall["references"], signal?: AbortSignal): Promise<{ completed: number }>
}

export class JianyingService {
  readonly #tokens = new Map<string, { expiresAt: number; observation: DraftObservation }>()
  #queue = Promise.resolve()

  constructor(
    private readonly inspector: DraftInspector = new JianyingDraftInspector(),
    private readonly transport: MediaTransport = new JianyingTransport(),
  ) {}

  async status(signal?: AbortSignal): Promise<PublicDraftStatus> {
    const observation = await this.inspector.inspect(signal)
    const result: PublicDraftStatus = {
      ...(observation.draft ? { draftName: observation.draft.name } : {}),
      ...(observation.reason ? { reason: observation.reason } : {}),
      schema: "convax.jianying-draft-status/1",
      status: observation.status,
    }
    if (!actionable.has(observation.status)) return result
    this.prune()
    while (this.#tokens.size >= 1_000) this.#tokens.delete(this.#tokens.keys().next().value!)
    const draftToken = `jianying_${randomUUID()}`
    this.#tokens.set(draftToken, { expiresAt: Date.now() + tokenLifetimeMs, observation })
    return { ...result, draftToken }
  }

  export(call: GenerationCall, signal?: AbortSignal): Promise<ExportResult> {
    const operation = this.#queue.then(() => this.exportLocked(call, signal))
    this.#queue = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async exportLocked(call: GenerationCall, signal?: AbortSignal): Promise<ExportResult> {
    if (signal?.aborted) throw abortReason(signal)
    const expected = call.target === "auto"
      ? await this.requireActionable(await this.inspector.inspect(signal))
      : this.consume(call.draftToken!)
    if (call.target === "current" && !expected.draft) {
      throw new Error("The inspected JianYing draft is no longer active.")
    }
    if (call.target === "new" && expected.draft) {
      throw new Error("Return JianYing to its home screen before creating a new draft.")
    }
    const before = await this.requireActionable(await this.inspector.inspect(signal))
    if (!sameObservation(expected, before)) {
      throw new Error("JianYing draft state changed before import. Inspect it again.")
    }

    const target = call.target === "auto" ? (before.draft ? "current" : "new") : call.target
    let draft = before.draft
    let createdDraft = false
    if (target === "new") {
      await this.transport.createDraft(signal)
      draft = await this.waitForNewDraft(before, signal)
      createdDraft = true
    }
    if (!draft) throw new Error("JianYing did not activate a draft before import.")

    const stable = await this.requireActionable(await this.inspector.inspect(signal))
    if (stable.status !== "active" || stable.draft?.path !== draft.path || stable.draft.pid !== draft.pid) {
      throw new Error("JianYing draft changed before media transfer. Inspect it again.")
    }
    const transfer = await this.transport.import(call.references, signal)
    if (transfer.completed !== call.references.length) {
      throw new Error("JianYing media transfer could not be verified.")
    }
    return {
      createdDraft,
      draftName: draft.name,
      importedMediaCount: call.references.length,
      schema: "convax.jianying-export-result/1",
      transferStatus: "verified",
    }
  }

  private consume(token: string) {
    this.prune()
    const record = this.#tokens.get(token)
    this.#tokens.delete(token)
    if (!record) throw new Error("The JianYing draft observation expired. Inspect it again.")
    return record.observation
  }

  private prune() {
    const now = Date.now()
    for (const [token, record] of this.#tokens) if (record.expiresAt <= now) this.#tokens.delete(token)
  }

  private async requireActionable(observation: DraftObservation) {
    if (actionable.has(observation.status)) return observation
    throw new Error(observation.reason ?? "JianYing draft state could not be determined safely.")
  }

  private async waitForNewDraft(previous: DraftObservation, signal?: AbortSignal) {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (signal?.aborted) throw abortReason(signal)
      const observation = await this.inspector.inspect(signal)
      if (
        observation.status === "active" &&
        observation.draft &&
        (observation.draft.path !== previous.draft?.path || observation.draft.pid !== previous.draft?.pid)
      ) {
        return observation.draft
      }
      await Bun.sleep(150)
    }
    throw new Error("JianYing did not expose a stable new draft in time.")
  }
}
