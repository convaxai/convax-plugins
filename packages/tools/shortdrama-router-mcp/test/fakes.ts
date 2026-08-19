import type {
  AudioJob,
  ImageJob,
  ProviderAuthorizationStatus,
  ProviderDescriptor,
  ProviderModel,
  VideoJob,
} from "shortdrama-router"

import type {
  GenerationKind,
  ProviderId,
  RouterPort,
} from "../src/contracts.ts"

export const validAuthorization: ProviderAuthorizationStatus = {
  authorized: true,
  configured: true,
  method: "oauth",
  state: "valid",
  verified_at: "2026-08-18T00:00:00.000Z",
}

export function providerDescriptor(
  provider: ProviderId,
  authorization: ProviderAuthorizationStatus = validAuthorization,
): ProviderDescriptor {
  return {
    authorization,
    authorizations: {
      effective_method: authorization.method,
      methods: [authorization],
    },
    capabilities: {
      authorization: authorization.method ? [authorization.method] : [],
      generation: [],
      models: true,
      usage: false,
    },
    description: `${provider} provider`,
    id: provider,
    name: provider,
  }
}

function unexpected(): never {
  throw new Error("Unexpected fake router call")
}

export function fakeRouter(overrides: Partial<RouterPort> = {}): RouterPort {
  return {
    async beginProviderAuthorization() {
      return unexpected()
    },
    async cancelProviderAuthorization() {
      return unexpected()
    },
    async clearProviderAuthorization() {
      return unexpected()
    },
    async completeProviderAuthorization() {
      return unexpected()
    },
    async createAudio() {
      return unexpected()
    },
    async createImage() {
      return unexpected()
    },
    async createVideo() {
      return unexpected()
    },
    async getAudio() {
      return unexpected()
    },
    async getImage() {
      return unexpected()
    },
    async getProvider() {
      return unexpected()
    },
    async getProviderAuthorization() {
      return unexpected()
    },
    async getProviderConfiguration() {
      return unexpected()
    },
    async getVideo() {
      return unexpected()
    },
    async listProviderModels() {
      return unexpected()
    },
    async listProviderResources() {
      return unexpected()
    },
    async configureProvider() {
      return unexpected()
    },
    ...overrides,
  }
}

export function providerModel(
  provider: ProviderId,
  kind: GenerationKind,
  id = `${provider}/${kind}-model`,
  capabilities: ProviderModel["capabilities"] = {},
): ProviderModel {
  return {
    capabilities,
    description: `${kind} model description`,
    id,
    kind,
    name: `${kind} model`,
    provider,
  }
}

export function job(
  kind: GenerationKind,
  status: AudioJob["status"],
  outputs?: readonly { readonly content_type?: string; readonly url: string }[],
): AudioJob | ImageJob | VideoJob {
  return {
    created_at: "2026-08-18T00:00:00.000Z",
    id: `${kind}-job-id`,
    model: `jimeng/${kind}-model`,
    ...(outputs === undefined ? {} : { outputs }),
    provider: "jimeng",
    status,
    updated_at: "2026-08-18T00:00:00.000Z",
  }
}
