import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  ShortDramaRouter,
  type ImageCreateRequest,
  type ProviderAdapter,
  type StoredImageJob,
} from "shortdrama-router"

import { openProviderJobStores } from "../src/sqlite-job-store.ts"

const temporaryDirectories: string[] = []
const digestA = "a".repeat(64)
const digestB = "b".repeat(64)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

async function databasePath() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-jobs-"))
  temporaryDirectories.push(directory)
  return path.join(directory, "jobs.sqlite")
}

function storedImageJob(overrides: Partial<StoredImageJob> = {}): StoredImageJob {
  return {
    idempotency_key: digestA,
    job: {
      created_at: "2026-08-18T00:00:00.000Z",
      id: "router-job-1",
      model: "jimeng/image-model",
      provider: "jimeng",
      status: "submitting",
      updated_at: "2026-08-18T00:00:00.000Z",
    },
    request_hash: digestB,
    ...overrides,
  }
}

describe("durable generation job stores", () => {
  test("atomically recovers an idempotency claim after restart", async () => {
    const filePath = await databasePath()
    const first = await openProviderJobStores(filePath)
    const claimed = await first.image.claim!(storedImageJob())
    expect(claimed.created).toBe(true)
    expect(claimed.value.version).toBe(1)
    first.close()

    const second = await openProviderJobStores(filePath)
    const recovered = await second.image.claim!(storedImageJob({
      job: { ...storedImageJob().job, id: "different-local-id" },
    }))
    expect(recovered.created).toBe(false)
    expect(recovered.value.job.id).toBe("router-job-1")
    await expect(second.image.claim!(storedImageJob({
      request_hash: "c".repeat(64),
    }))).rejects.toThrow("conflicts")
    second.close()
  })

  test("rejects an idempotency claim without its request hash", async () => {
    const stores = await openProviderJobStores(await databasePath())
    const { request_hash: omittedRequestHash, ...malformed } = storedImageJob()
    expect(omittedRequestHash).toBe(digestB)
    await expect(stores.image.claim!(malformed)).rejects.toThrow(
      "Unable to access the durable generation journal",
    )
    stores.close()
  })

  test("lets shortdrama-router resume a provider job without resubmitting", async () => {
    const filePath = await databasePath()
    const request: ImageCreateRequest = {
      idempotency_key: "operation-1",
      model: "jimeng/image-model",
      prompt: "A quiet street",
      provider: "jimeng",
    }
    let firstSubmissions = 0
    const provider = (
      create: NonNullable<ProviderAdapter["createImage"]>,
    ): ProviderAdapter => ({
      metadata: {
        capabilities: {
          authorization: ["oauth"],
          generation: ["image"],
          models: true,
          usage: false,
        },
        description: "test provider",
        id: "jimeng",
        name: "Jimeng",
      },
      async createVideo() {
        throw new Error("unexpected video")
      },
      createImage: create,
      async getAuthorizationStatus() {
        return {
          authorized: true,
          configured: true,
          method: "oauth",
          state: "valid",
        }
      },
      async getImage() {
        return {
          artifacts: [{
            kind: "image",
            media_type: "image/png",
            url: "https://cdn.example/result.png",
          }],
          reference: { provider_job: "provider-job-1" },
          status: "completed",
        }
      },
      async getVideo() {
        throw new Error("unexpected video")
      },
      async listModels() {
        return []
      },
    })

    const firstStores = await openProviderJobStores(filePath)
    const firstRouter = new ShortDramaRouter({
      imageJobStore: firstStores.image,
      providers: [provider(async () => {
        firstSubmissions += 1
        return {
          reference: { provider_job: "provider-job-1" },
          status: "queued",
        }
      })],
      randomId: () => "router-job-1",
    })
    const accepted = await firstRouter.createImage(request)
    expect(accepted.status).toBe("queued")
    expect(firstSubmissions).toBe(1)
    firstStores.close()

    let secondSubmissions = 0
    const secondStores = await openProviderJobStores(filePath)
    const secondRouter = new ShortDramaRouter({
      imageJobStore: secondStores.image,
      providers: [provider(async () => {
        secondSubmissions += 1
        throw new Error("must not resubmit")
      })],
      randomId: () => "router-job-2",
    })
    const recovered = await secondRouter.createImage(request)
    expect(recovered.id).toBe(accepted.id)
    expect(recovered.status).toBe("queued")
    expect(secondSubmissions).toBe(0)
    expect((await secondRouter.getImage(recovered.id)).status).toBe("completed")
    secondStores.close()
  })
})
