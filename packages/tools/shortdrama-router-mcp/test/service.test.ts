import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type {
  ProviderAuthorizationStatus,
  ProviderRuntimeService,
} from "shortdrama-router"

import {
  browserAuthorizationCompletionSchema,
  browserAuthorizationSchema,
  externalAuthorizationCompletionSchema,
  externalAuthorizationSchema,
} from "../src/contracts.ts"
import { ProviderService, serviceTools } from "../src/service.ts"
import { FileXiaoYunqueCredentialSource } from "../src/xiaoyunque-credentials.ts"
import {
  fakeRouter,
  providerDescriptor,
  validAuthorization,
} from "./fakes.ts"

const temporaryDirectories: string[] = []
const now = Date.parse("2026-08-18T00:00:00.000Z")
const authorizationId = "authorization-id-1234567890"
const validApiKeyStatus: ProviderAuthorizationStatus = {
  authorized: true,
  configured: true,
  method: "api_key",
  state: "valid",
  verified_at: "2026-08-18T00:00:01.000Z",
}
const validWebStatus: ProviderAuthorizationStatus = {
  authorized: true,
  configured: true,
  method: "browser_session",
  state: "valid",
  verified_at: "2026-08-18T00:00:01.000Z",
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })),
  )
})

async function credentialSource() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shortdrama-auth-"))
  temporaryDirectories.push(directory)
  return new FileXiaoYunqueCredentialSource(
    path.join(directory, "credentials.json"),
  )
}

function browserCompletion() {
  return {
    authorization_id: authorizationId,
    cookie_origin: "https://xyq.jianying.com",
    cookies: [
      { name: "sessionid_pippitcn_web", value: "cookie-value" },
      { name: "sessionid_ss_pippitcn_web", value: "second-cookie" },
    ],
    schema: browserAuthorizationCompletionSchema,
  }
}

function jimengAuthorizationRequest(loginUrl = "https://jimeng.jianying.com/device") {
  return {
    authorization_id: authorizationId,
    expires_at: new Date(now + 10 * 60_000).toISOString(),
    login_url: loginUrl,
    method: "oauth" as const,
  }
}

function libtvAuthorizationRequest(
  loginUrl = "https://account.liblib.tv/oauth?callback_url=http%3A%2F%2F127.0.0.1%3A3210%2Fcallback",
) {
  return {
    authorization_id: authorizationId,
    expires_at: new Date(now + 10 * 60_000).toISOString(),
    login_url: loginUrl,
    method: "oauth" as const,
  }
}

function jimengCompletion() {
  return {
    authorization_id: authorizationId,
    schema: externalAuthorizationCompletionSchema,
  }
}

describe("provider Service projection", () => {
  test("atomically persists XiaoYunque Access Key and browser session", async () => {
    const credentials = await credentialSource()
    let beginMethod: string | undefined
    let completionMethod: string | undefined
    const router = fakeRouter({
      async beginProviderAuthorization(_provider, method) {
        beginMethod = method
        return {
          authorization_id: authorizationId,
          cookie_names: [
            "sessionid_pippitcn_web",
            "sessionid_ss_pippitcn_web",
          ],
          cookie_origin: "https://xyq.jianying.com",
          expires_at: new Date(now + 10 * 60_000).toISOString(),
          login_url: "https://xyq.jianying.com/login?redirect_url=%2F",
          method,
        }
      },
      async completeProviderAuthorization(_provider, completion) {
        completionMethod = completion.method
        await credentials.setAccessKey!(
          "new-access-key",
          "2026-09-18T00:00:00.000Z",
        )
        return validApiKeyStatus
      },
      async getProviderAuthorization() {
        return validApiKeyStatus
      },
    })
    const service = new ProviderService("xiaoyunque", router, {
      credentials,
      now: () => now,
      async webSessionProbe(snapshot) {
        expect(snapshot.web_session?.cookies).toHaveLength(2)
        return validWebStatus
      },
    })

    const request = await service.authorize()
    expect(request.schema).toBe(browserAuthorizationSchema)
    expect(beginMethod).toBe("api_key")
    const result = await service.completeAuthorization(browserCompletion())
    expect(completionMethod).toBe("api_key")
    expect(result.state).toBe("connected")

    const restarted = new FileXiaoYunqueCredentialSource(credentials.filePath)
    const snapshot = await restarted.read()
    expect(snapshot.access_key).toBe("new-access-key")
    expect(snapshot.web_session?.cookies.map(({ name }) => name)).toEqual([
      "sessionid_pippitcn_web",
      "sessionid_ss_pippitcn_web",
    ])
    expect((await stat(credentials.filePath)).mode & 0o077).toBe(0)
  })

  test("retains the old complete snapshot when enrollment fails before commit", async () => {
    const credentials = await credentialSource()
    await credentials.setAccessKey!("old-access-key")
    await credentials.setWebSession!({
      authorized_at: "2026-08-17T00:00:00.000Z",
      cookies: [{ name: "sessionid_pippitcn_web", value: "old-cookie" }],
    })
    const before = await credentials.read()

    await expect(credentials.completeWithWebSession(
      {
        authorized_at: "2026-08-18T00:00:00.000Z",
        cookies: [{ name: "sessionid_pippitcn_web", value: "new-cookie" }],
      },
      async () => {
        throw new Error("upstream enrollment failed with secret material")
      },
    )).rejects.toThrow()

    expect(await credentials.read()).toEqual(before)
  })

  test("rejects a late Access Key write after combined enrollment times out", async () => {
    const credentials = await credentialSource()
    await credentials.setAccessKey!("old-access-key")
    await credentials.setWebSession!({
      authorized_at: "2026-08-17T00:00:00.000Z",
      cookies: [{ name: "sessionid_pippitcn_web", value: "old-cookie" }],
    })
    const before = await credentials.read()
    let releaseEnrollment!: () => void
    const enrollmentGate = new Promise<void>((resolve) => {
      releaseEnrollment = resolve
    })
    let markLateWriteFinished!: () => void
    const lateWriteFinished = new Promise<void>((resolve) => {
      markLateWriteFinished = resolve
    })
    let lateWriteRejected = false
    const router = fakeRouter({
      async beginProviderAuthorization(_provider, method) {
        return {
          authorization_id: authorizationId,
          cookie_names: [
            "sessionid_pippitcn_web",
            "sessionid_ss_pippitcn_web",
          ],
          cookie_origin: "https://xyq.jianying.com",
          expires_at: new Date(now + 10 * 60_000).toISOString(),
          login_url: "https://xyq.jianying.com/login",
          method,
        }
      },
      async completeProviderAuthorization() {
        await enrollmentGate
        try {
          await credentials.setAccessKey!("late-access-key")
        } catch {
          lateWriteRejected = true
          throw new Error("late enrollment was retired")
        } finally {
          markLateWriteFinished()
        }
        return validApiKeyStatus
      },
    })
    const service = new ProviderService("xiaoyunque", router, {
      credentials,
      now: () => now,
      requestTimeoutMs: 5,
      async webSessionProbe() {
        return validWebStatus
      },
    })

    await service.authorize()
    await expect(
      service.completeAuthorization(browserCompletion()),
    ).rejects.toThrow("timed out")
    releaseEnrollment()
    await lateWriteFinished

    expect(lateWriteRejected).toBe(true)
    expect(await credentials.read()).toEqual(before)
  })

  test("does not report all XiaoYunque modalities connected when Web auth fails", async () => {
    const credentials = await credentialSource()
    await credentials.setAccessKey!("access-key")
    await credentials.setWebSession!({
      authorized_at: "2026-08-18T00:00:00.000Z",
      cookies: [{ name: "sessionid_pippitcn_web", value: "cookie" }],
    })
    const router = fakeRouter({
      async getProviderAuthorization() {
        return validApiKeyStatus
      },
    })
    const service = new ProviderService("xiaoyunque", router, {
      credentials,
      async webSessionProbe() {
        return {
          authorized: false,
          configured: true,
          method: "browser_session",
          state: "expired",
        }
      },
    })

    const result = await service.status()
    expect(result.state).toBe("attention")
    expect(result.credential.verification).toBe("failed")
  })

  test("maps Jimeng device login to external authorization", async () => {
    let beginMethod: string | undefined
    let completedMethod: string | undefined
    const router = fakeRouter({
      async beginProviderAuthorization(_provider, method) {
        beginMethod = method
        return { ...jimengAuthorizationRequest(), method }
      },
      async completeProviderAuthorization(_provider, completion) {
        completedMethod = completion.method
        return { ...validApiKeyStatus, method: "oauth" }
      },
      async getProviderAuthorization() {
        return { ...validApiKeyStatus, method: "oauth" }
      },
      async getProvider() {
        return providerDescriptor("jimeng", {
          ...validApiKeyStatus,
          method: "oauth",
        })
      },
    })
    const service = new ProviderService("jimeng", router, { now: () => now })

    const request = await service.authorize()
    expect(request.schema).toBe(externalAuthorizationSchema)
    expect(beginMethod).toBe("oauth")
    const result = await service.completeAuthorization(jimengCompletion())
    expect(completedMethod).toBe("oauth")
    expect(result.state).toBe("connected")
  })

  test("installs the managed Jimeng runtime before beginning authorization", async () => {
    const calls: string[] = []
    const runtimes: ProviderRuntimeService = {
      async getStatus() {
        calls.push("status")
        return {
          compatible: false,
          id: "jimeng",
          managed: true,
          platform: "darwin-arm64",
          state: "not_installed",
        }
      },
      async install() {
        calls.push("install")
        return {
          compatible: true,
          executable_path: "/managed/runtimes/jimeng/dreamina",
          id: "jimeng",
          integrity_verified: true,
          managed: true,
          platform: "darwin-arm64",
          state: "installed",
          version: "1.2.3",
        }
      },
      supports(provider) {
        return provider === "jimeng"
      },
    }
    const router = fakeRouter({
      async beginProviderAuthorization() {
        calls.push("begin")
        return jimengAuthorizationRequest()
      },
    })
    const service = new ProviderService("jimeng", router, {
      now: () => now,
      runtimeService: runtimes,
    })

    expect((await service.authorize()).schema).toBe(
      externalAuthorizationSchema,
    )
    expect(calls).toEqual(["status", "install", "begin"])
  })

  test("accepts only the official standard-HTTPS Jimeng authorization origin", async () => {
    const invalidUrls = [
      "http://jimeng.jianying.com/device",
      "https://attacker.example/device",
      "https://jimeng.jianying.com.attacker.example/device",
      "https://user:password@jimeng.jianying.com/device",
      "https://jimeng.jianying.com:8443/device",
    ]

    for (const loginUrl of invalidUrls) {
      const service = new ProviderService(
        "jimeng",
        fakeRouter({
          async beginProviderAuthorization() {
            return jimengAuthorizationRequest(loginUrl)
          },
        }),
        { now: () => now },
      )
      await expect(service.authorize()).rejects.toThrow(
        "Jimeng authorization URL is invalid",
      )
    }

    const service = new ProviderService(
      "jimeng",
      fakeRouter({
        async beginProviderAuthorization() {
          return jimengAuthorizationRequest(
            "https://jimeng.jianying.com:443/device",
          )
        },
      }),
      { now: () => now },
    )
    expect((await service.authorize()).authorization_url).toBe(
      "https://jimeng.jianying.com/device",
    )
  })

  test("cancels the exact upstream authorization flow", async () => {
    let cancelledId: string | undefined
    const router = fakeRouter({
      async beginProviderAuthorization() {
        return jimengAuthorizationRequest()
      },
      async cancelProviderAuthorization(_provider, id) {
        cancelledId = id
      },
      async getProviderAuthorization() {
        return {
          authorized: false,
          configured: false,
          method: null,
          state: "not_configured",
        }
      },
    })
    const service = new ProviderService("jimeng", router, { now: () => now })
    await service.authorize()

    expect((await service.cancelAuthorization({})).state).toBe("disconnected")
    expect(cancelledId).toBe(authorizationId)
  })

  test("bounds begin, complete, and clear when provider promises ignore abort", async () => {
    let beginSignal: AbortSignal | undefined
    const beginService = new ProviderService(
      "jimeng",
      fakeRouter({
        beginProviderAuthorization(_provider, _method, signal) {
          beginSignal = signal
          return new Promise(() => {})
        },
      }),
      { requestTimeoutMs: 5 },
    )
    await expect(beginService.authorize()).rejects.toThrow(
      "Bounded provider call timed out",
    )
    expect(beginSignal?.aborted).toBe(true)

    let completeSignal: AbortSignal | undefined
    const completeService = new ProviderService(
      "jimeng",
      fakeRouter({
        async beginProviderAuthorization() {
          return jimengAuthorizationRequest()
        },
        completeProviderAuthorization(_provider, _completion, signal) {
          completeSignal = signal
          return new Promise(() => {})
        },
      }),
      { now: () => now, requestTimeoutMs: 5 },
    )
    await completeService.authorize()
    await expect(
      completeService.completeAuthorization(jimengCompletion()),
    ).rejects.toThrow("Bounded provider call timed out")
    expect(completeSignal?.aborted).toBe(true)

    let clearSignal: AbortSignal | undefined
    const clearService = new ProviderService(
      "jimeng",
      fakeRouter({
        clearProviderAuthorization(_provider, signal) {
          clearSignal = signal
          return new Promise(() => {})
        },
      }),
      { requestTimeoutMs: 5 },
    )
    await expect(clearService.signOut({})).rejects.toThrow(
      "Bounded provider call timed out",
    )
    expect(clearSignal?.aborted).toBe(true)
  })

  test("cancels a non-cooperative authorization mutation", async () => {
    let started!: () => void
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    let attemptSignal: AbortSignal | undefined
    const service = new ProviderService(
      "jimeng",
      fakeRouter({
        beginProviderAuthorization(_provider, _method, signal) {
          attemptSignal = signal
          started()
          return new Promise(() => {})
        },
      }),
    )
    const controller = new AbortController()
    const authorization = service.authorize(controller.signal)
    await providerStarted
    controller.abort()

    await expect(authorization).rejects.toHaveProperty("name", "AbortError")
    expect(attemptSignal?.aborted).toBe(true)
  })

  test("LibTV exposes the complete managed OAuth action set", () => {
    expect(serviceTools("libtv").map(({ name }) => name)).toEqual([
      "service.status",
      "service.authorize",
      "service.reauthorize",
      "service.authorization.cancel",
      "service.authorization.complete",
      "service.sign_out",
    ])
  })

  test("installs an integrity-invalid LibTV runtime and preserves pending OAuth", async () => {
    const calls: string[] = []
    let completions = 0
    const runtimes: ProviderRuntimeService = {
      async getStatus(provider) {
        calls.push(`runtime.status:${provider}`)
        return {
          compatible: false,
          id: provider,
          integrity_verified: false,
          managed: true,
          platform: "darwin-arm64",
          reason_code: "runtime_integrity_failed",
          state: "invalid",
        }
      },
      async install(provider) {
        calls.push(`runtime.install:${provider}`)
        return {
          compatible: true,
          executable_path: "/managed/runtimes/libtv/libtv",
          id: provider,
          integrity_verified: true,
          managed: true,
          platform: "darwin-arm64",
          state: "installed",
          version: "1.0.2",
        }
      },
      supports(provider) {
        return provider === "libtv"
      },
    }
    const router = fakeRouter({
      async beginProviderAuthorization(provider, method) {
        calls.push(`authorization.begin:${provider}:${method}`)
        return libtvAuthorizationRequest()
      },
      async completeProviderAuthorization() {
        completions += 1
        if (completions === 1) {
          return {
            authorized: null,
            configured: false,
            expires_at: new Date(now + 10 * 60_000).toISOString(),
            method: "oauth",
            reason_code: "authorization_pending",
            state: "pending",
          }
        }
        return validAuthorization
      },
      async getProviderAuthorization() {
        return validAuthorization
      },
      async getProviderConfiguration() {
        return {
          configured: true,
          resource: { id: "project-1", name: "Project", type: "project" },
          state: "configuration_valid",
        }
      },
      async getProvider() {
        return providerDescriptor("libtv")
      },
    })
    const service = new ProviderService("libtv", router, {
      now: () => now,
      runtimeService: runtimes,
    })

    expect((await service.authorize()).schema).toBe(externalAuthorizationSchema)
    expect(calls).toEqual([
      "runtime.status:libtv",
      "runtime.install:libtv",
      "authorization.begin:libtv:oauth",
    ])
    expect((await service.completeAuthorization(jimengCompletion())).state)
      .toBe("unknown")
    expect((await service.completeAuthorization(jimengCompletion())).state)
      .toBe("connected")
  })

  test("accepts only the official standard-HTTPS LibTV authorization domains", async () => {
    const invalidUrls = [
      "http://account.liblib.tv/oauth",
      "https://attacker.example/oauth",
      "https://liblib.tv.attacker.example/oauth",
      "https://user:password@liblib.art/oauth",
      "https://account.liblib.tv:8443/oauth",
    ]

    for (const loginUrl of invalidUrls) {
      const service = new ProviderService(
        "libtv",
        fakeRouter({
          async beginProviderAuthorization() {
            return libtvAuthorizationRequest(loginUrl)
          },
        }),
        { now: () => now },
      )
      await expect(service.authorize()).rejects.toThrow(
        "LibTV authorization URL is invalid",
      )
    }

    const service = new ProviderService(
      "libtv",
      fakeRouter({
        async beginProviderAuthorization() {
          return libtvAuthorizationRequest()
        },
      }),
      { now: () => now },
    )
    expect((await service.authorize()).authorization_url).toStartWith(
      "https://account.liblib.tv/oauth",
    )
  })

  test("LibTV auto-selects only one unambiguous project", async () => {
    const selections: Array<Record<string, string>> = []
    const router = fakeRouter({
      async getProviderAuthorization() {
        return validAuthorization
      },
      async getProviderConfiguration() {
        return {
          configured: false,
          state: "configuration_required",
        }
      },
      async listProviderResources() {
        return [{ id: "project-1", name: "Only project", type: "project" }]
      },
      async configureProvider(_provider, selection) {
        selections.push(selection as unknown as Record<string, string>)
        return {
          configured: true,
          resource: { id: "project-1", name: "Only project", type: "project" },
          state: "configuration_valid",
        }
      },
    })
    const service = new ProviderService("libtv", router)

    await service.prepareModels(new AbortController().signal)
    expect(selections).toEqual([
      { resource_id: "project-1", resource_type: "project" },
    ])
  })

  test("LibTV does not choose among multiple projects", async () => {
    let configured = false
    const router = fakeRouter({
      async getProviderConfiguration() {
        return { configured: false, state: "configuration_required" }
      },
      async listProviderResources() {
        return [
          { id: "project-1", name: "First", type: "project" },
          { id: "project-2", name: "Second", type: "project" },
        ]
      },
      async configureProvider() {
        configured = true
        throw new Error("must not choose")
      },
    })
    const service = new ProviderService("libtv", router)

    await expect(
      service.prepareModels(new AbortController().signal),
    ).rejects.toThrow("unambiguous")
    expect(configured).toBe(false)
  })

  test("LibTV sign-out delegates only to its public clear action", async () => {
    let clears = 0
    const router = fakeRouter({
      async clearProviderAuthorization() {
        clears += 1
      },
      async getProviderAuthorization() {
        return {
          authorized: false,
          configured: false,
          method: null,
          state: "not_configured",
        }
      },
    })
    const service = new ProviderService("libtv", router)
    expect((await service.signOut({})).state).toBe("disconnected")
    expect(clears).toBe(1)
  })

  test("a missing or stalled CLI fails status closed instead of connected", async () => {
    const router = fakeRouter({
      async getProviderAuthorization(_provider, options) {
        if (options?.probe) {
          return new Promise(() => {})
        }
        return {
          authorized: null,
          configured: true,
          method: "oauth",
          state: "configured",
        }
      },
    })
    const service = new ProviderService("jimeng", router, {
      requestTimeoutMs: 5,
    })

    const result = await service.status()
    expect(result.state).toBe("attention")
    expect(result.credential.verification).toBe("failed")
  })
})
