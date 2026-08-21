import {
  createBuiltInRuntimeService,
  createShortDramaRouter,
  MemoryXiaoYunqueCredentials,
  ShortDramaRouter,
  XiaoYunqueProvider,
} from "shortdrama-router"
import path from "node:path"

import type { ProviderId, RouterPort } from "./contracts.ts"
import { GenerationEngine } from "./generation.ts"
import { GenerationOperationJournal } from "./generation-journal.ts"
import { ShortDramaGenerationLro } from "./generation-lro.ts"
import { FileLibTvConfigurationSource } from "./libtv-configuration.ts"
import { McpServer } from "./mcp-server.ts"
import { ProviderService } from "./service.ts"
import { openProviderJobStores } from "./sqlite-job-store.ts"
import { defaultProviderStateDirectory } from "./state-paths.ts"
import {
  defaultCredentialFile,
  FileXiaoYunqueCredentialSource,
} from "./xiaoyunque-credentials.ts"

export async function createServer(
  provider: ProviderId,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const stateDirectory = defaultProviderStateDirectory(provider, environment)
  const jobStores = await openProviderJobStores(
    path.join(stateDirectory, "generation-jobs.sqlite"),
  )
  try {
    const routerOptions = {
      audioJobStore: jobStores.audio,
      imageJobStore: jobStores.image,
      jobStore: jobStores.video,
    }
    if (provider === "xiaoyunque") {
      const credentials = new FileXiaoYunqueCredentialSource(
        defaultCredentialFile(environment),
      )
      const adapter = new XiaoYunqueProvider({ credentials })
      const router: RouterPort = new ShortDramaRouter({
        ...routerOptions,
        providers: [adapter],
      })
      const service = new ProviderService(provider, router, {
        credentials,
        webSessionProbe: async (snapshot, signal) => {
          if (!snapshot.web_session) {
            return {
              authorized: false,
              configured: false,
              method: null,
              state: "not_configured",
            }
          }
          const webOnlyProvider = new XiaoYunqueProvider({
            credentials: new MemoryXiaoYunqueCredentials({
              web_session: snapshot.web_session,
            }),
          })
          return webOnlyProvider.getAuthorizationStatus({
            probe: true,
            ...(signal === undefined ? {} : { signal }),
          })
        },
      })
      const generation = new GenerationEngine(provider, router, {
        prepare: (signal) => service.prepareModels(signal),
      })
      const recovery = generationRecovery(
        provider,
        generation,
        router,
        environment,
      )
      return new McpServer(
        provider,
        router,
        generation,
        service,
        {
          dispose: () => jobStores.close(),
          ...(recovery === undefined ? {} : { recovery }),
        },
      )
    }
    const managedRuntimeRoot = path.join(stateDirectory, "provider-runtimes")
    const runtimeService = createBuiltInRuntimeService({
      rootDir: managedRuntimeRoot,
    })
    const libtvConfigDirectory = path.join(stateDirectory, "libtv-cli")
    const router: RouterPort = createShortDramaRouter({
      ...routerOptions,
      jimeng: provider === "jimeng" ? {} : false,
      libtv: provider === "libtv"
        ? {
            configDir: libtvConfigDirectory,
            configuration: new FileLibTvConfigurationSource(
              path.join(stateDirectory, "libtv-configuration.json"),
            ),
          }
        : false,
      runtimeRootDir: managedRuntimeRoot,
      xiaoyunque: false,
    })
    const service = new ProviderService(provider, router, { runtimeService })
    const generation = new GenerationEngine(provider, router, {
      prepare: (signal) => service.prepareModels(signal),
      // LibTV's public adapter waits for `node create --run` and bounds that
      // official CLI process at 30 minutes.
      ...(provider === "libtv"
        ? { submissionTimeoutMs: 31 * 60_000 }
        : {}),
    })
    const recovery = generationRecovery(
      provider,
      generation,
      router,
      environment,
    )
    return new McpServer(
      provider,
      router,
      generation,
      service,
      {
        dispose: () => jobStores.close(),
        ...(recovery === undefined ? {} : { recovery }),
      },
    )
  } catch (error) {
    jobStores.close()
    throw error
  }
}

function generationRecovery(
  provider: ProviderId,
  generation: GenerationEngine,
  router: RouterPort,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const directory = environment.CONVAX_GENERATION_LRO_DIRECTORY
  if (!directory) return undefined
  return new ShortDramaGenerationLro(
    provider,
    generation,
    router,
    new GenerationOperationJournal(provider, directory),
  )
}
