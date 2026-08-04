import { type PluginApiContractId } from "./method-contracts";
export declare const pluginApiCatalog: import("./contracts").PluginApiCatalog<(Omit<Readonly<{
    readonly id: "host.context.get";
    readonly completion: "cancelable";
    readonly grant: null;
    readonly scope: "connection";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }];
    readonly docs: {
        readonly summary: "Read the bounded context attached to the current Plugin connection.";
        readonly description: "Returns only renderer-safe identifiers and feature metadata for the exact live connection; it grants no additional authority.";
        readonly request: "No parameters.";
        readonly response: "The current Plugin, Project, Canvas, node, and negotiated Host API context when present.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.inputs.list";
    readonly completion: "cancelable";
    readonly grant: "canvas.connectedInputs.read";
    readonly scope: "own-node";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "List direct incoming inputs of the owning Plugin node.";
        readonly description: "Derives pathless input metadata from authoritative direct incoming Canvas edges and never reads resource bytes.";
        readonly request: "No parameters; the owning node comes from the bound connection.";
        readonly response: "A bounded list of direct incoming input descriptors and opaque input keys.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.inputs.open";
    readonly completion: "cancelable";
    readonly grant: "canvas.connectedMedia.stream";
    readonly scope: "own-node";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }, {
        readonly code: "resource-unavailable";
        readonly description: "The authoritative Project resource is missing, changed, or cannot be read safely.";
        readonly recoverable: true;
    }];
    readonly docs: {
        readonly summary: "Open a bounded stream for one previously listed direct input.";
        readonly description: "Opens host-owned access to the exact authoritative input after topology and resource identity are revalidated.";
        readonly request: "`{ inputKey }`, using an opaque key returned by canvas.inputs.list.";
        readonly response: "A connection-bound stream descriptor and safe media metadata.";
        readonly remarks: "Call canvas.inputs.close when the stream is no longer needed.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.inputs.close";
    readonly completion: "cancelable";
    readonly grant: "canvas.connectedMedia.stream";
    readonly scope: "own-node";
    readonly sideEffect: "write";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Close one connection-bound input stream.";
        readonly description: "Releases a stream created by canvas.inputs.open without changing Canvas or Project state.";
        readonly request: "The stream handle returned by canvas.inputs.open.";
        readonly response: "An acknowledgement; closing an already closed handle is idempotent.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.node.get";
    readonly completion: "cancelable";
    readonly grant: "canvas.node.read";
    readonly scope: "own-node";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Read the owning Plugin node projection.";
        readonly description: "Returns a bounded renderer-safe projection of the exact node bound to the connection.";
        readonly request: "No parameters; the owning node comes from the bound connection.";
        readonly response: "The owning node identity, geometry, and Plugin state projection.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.node.state.replace";
    readonly completion: "commit-preserving";
    readonly grant: "canvas.node.write";
    readonly scope: "own-node";
    readonly sideEffect: "write";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }, {
        readonly code: "resource-unavailable";
        readonly description: "The authoritative Project resource is missing, changed, or cannot be read safely.";
        readonly recoverable: true;
    }];
    readonly docs: {
        readonly summary: "Replace the owning node's bounded Plugin state.";
        readonly description: "Commits only the namespaced Plugin state through one Canvas-owned semantic intent guarded by the current node incarnation.";
        readonly request: "`{ state }`, where state is a bounded JSON value.";
        readonly response: "The durable operation receipt and current owning-node projection after the replacement commits.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.resource.image.create";
    readonly completion: "commit-preserving";
    readonly grant: "canvas.image.write";
    readonly scope: "own-node";
    readonly sideEffect: "write";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }, {
        readonly code: "partial-success";
        readonly description: "A user-visible Project file was published, but the requested Canvas commit did not complete; retry is unsafe.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Create a Project-backed Canvas image through the host lifecycle.";
        readonly description: "Admits bounded image content as a user-visible Project resource and commits its Canvas reference without exposing native paths.";
        readonly request: "`{ dataUrl, name }`, containing a bounded validated image data URL and safe file name.";
        readonly response: "The created renderer-safe image result after Project publication and Canvas commit.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "project.file.text.read";
    readonly completion: "cancelable";
    readonly grant: "project.files.read";
    readonly scope: "project";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Read one bounded UTF-8 Project file.";
        readonly description: "Reads through the scoped Project Files capability using a normalized Project-relative path and never exposes a native path.";
        readonly request: "`{ path }`, using a normalized Project-relative portable path.";
        readonly response: "The bounded UTF-8 file text.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "agent.prompt";
    readonly completion: "commit-preserving";
    readonly grant: "agent.prompt";
    readonly scope: "connection";
    readonly sideEffect: "execute";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Submit a bounded prompt through the host Agent capability.";
        readonly description: "Uses the current host-owned Agent context; it does not grant direct OpenCode, filesystem, model, or credential access.";
        readonly request: "`{ text }`, containing the bounded prompt text.";
        readonly response: "`{ text }`, containing the bounded host acknowledgement.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "generation.tools.list";
    readonly completion: "cancelable";
    readonly grant: "generation.execute";
    readonly scope: "plugin";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "List generation tools available to the installed Plugin principal.";
        readonly description: "Returns normalized tool metadata derived from active verified contributions without exposing executable paths or credentials.";
        readonly request: "Optional `{ output }` modality filter; omitting params lists every admitted modality.";
        readonly response: "A bounded list of available generation tools and their public input contracts.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "generation.execute";
    readonly completion: "commit-preserving";
    readonly grant: "generation.execute";
    readonly scope: "plugin";
    readonly sideEffect: "execute";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }, {
        readonly code: "resource-unavailable";
        readonly description: "The authoritative Project resource is missing, changed, or cannot be read safely.";
        readonly recoverable: true;
    }, {
        readonly code: "partial-success";
        readonly description: "A user-visible Project file was published, but the requested Canvas commit did not complete; retry is unsafe.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Execute one selected generation tool through the shared host executor.";
        readonly description: "Revalidates the active Plugin, authorized executable, inputs, cancellation, and live resource guards immediately before execution.";
        readonly request: "`{ output?, prompt, references?: Array<{ inputKey, role }>, resultMode?, toolId? }`; every opaque input key must come from the current owning node's canvas.inputs.list result.";
        readonly response: "The bounded selected tool result, created node ids, optional committed operation receipt/projection, and warnings.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "projects.list";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "projects.read";
    readonly scope: "plugin";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "List Projects visible to the installed Plugin principal.";
        readonly description: "Returns portable Project identities and display metadata without native paths or private Project state.";
        readonly request: "No parameters.";
        readonly response: "A bounded list of renderer-safe Project summaries.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.catalog.list";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.catalog.read";
    readonly scope: "project";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "List Canvas catalog entries for one authorized Project.";
        readonly description: "Reads the Project-owned Canvas catalog without selecting a Project or Canvas in the Workbench.";
        readonly request: "`{ projectId }`, naming one explicit portable Project.";
        readonly response: "A bounded list of portable Canvas catalog entries.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.document.get";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.document.read";
    readonly scope: "canvas";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Read one authorized Canvas document projection.";
        readonly description: "Returns a bounded portable structure or geometry projection from Main's authoritative Canvas application service.";
        readonly request: "`{ ref, projection }`, using an explicit portable Project/Canvas reference and supported projection.";
        readonly response: "The requested pathless document projection.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.nodes.query";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.document.read";
    readonly scope: "canvas";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Query bounded node projections in one authorized Canvas.";
        readonly description: "Executes a host-defined bounded query without exposing native paths or resource bytes.";
        readonly request: "`{ ref, query }`, using an explicit portable Project/Canvas reference and bounded query.";
        readonly response: "Matching node summaries and the current pathless Canvas projection.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.transaction.execute";
    readonly completion: "commit-preserving";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.document.write";
    readonly scope: "canvas";
    readonly sideEffect: "write";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Commit one closed Canvas command through the authoritative application service.";
        readonly description: "Maps one bounded command to a Canvas-owned semantic intent, commits it atomically, and returns its durable operation identity.";
        readonly request: "`{ ref, command, commandId }` with one bounded closed command and an idempotency key.";
        readonly response: "The durable operation receipt, current pathless projection, and bounded command result.";
    };
} & {
    readonly contractSince: "3.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.events.subscribe";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.events.subscribe";
    readonly scope: "canvas";
    readonly sideEffect: "subscribe";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Subscribe to bounded events for one authorized Canvas.";
        readonly description: "Creates a connection-scoped subscription; events carry operation receipts as invalidations or safe projections, never native data.";
        readonly request: "`{ ref }`, using an explicit portable Project/Canvas reference.";
        readonly response: "A connection-bound subscription identifier.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.events.unsubscribe";
    readonly completion: "cancelable";
    readonly audience: readonly ["web-plugin", "companion"];
    readonly grant: "canvas.events.subscribe";
    readonly scope: "canvas";
    readonly sideEffect: "subscribe";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Close one connection-bound Canvas event subscription.";
        readonly description: "Releases a subscription created by canvas.events.subscribe without changing Canvas state.";
        readonly request: "The subscription identifier returned by canvas.events.subscribe.";
        readonly response: "An acknowledgement; closing an already closed subscription is idempotent.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "1.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.inputs.image.open";
    readonly completion: "cancelable";
    readonly grant: "canvas.connectedImages.read";
    readonly scope: "own-node";
    readonly sideEffect: "read";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }, {
        readonly code: "resource-unavailable";
        readonly description: "The authoritative Project resource is missing, changed, or cannot be read safely.";
        readonly recoverable: true;
    }];
    readonly docs: {
        readonly summary: "Open one directly connected image through the owning Plugin node.";
        readonly description: "Issues a revocable Host-owned session for signature-validated JPEG, PNG, or WebP content after validating the Plugin principal, owning node, direct edge, resource identity, and image limits. Every protocol read revalidates the issued principal and direct edge against current Host state.";
        readonly request: "`{ inputKey }`, using an opaque image key returned by canvas.inputs.list.";
        readonly response: "A connection-issued, revocable session with an opaque 128-bit bearer URL, bounded image probe, and lowercase SHA-256 content revision.";
        readonly remarks: "Electron protocol GET/HEAD requests have no trusted sender or frame principal. Possession of the convax-connected-media URL therefore carries bearer authority until the Host revokes the session or its principal/edge revalidation fails; the URL must be kept secret and closed promptly. The response contains no image bytes, native path, or unrestricted URL. The Host rejects images above 16 MiB, dimensions above 8192 pixels, or more than 33,554,432 pixels.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "2.0.0";
}) | (Omit<Readonly<{
    readonly id: "canvas.inputs.image.close";
    readonly completion: "cancelable";
    readonly grant: "canvas.connectedImages.read";
    readonly scope: "own-node";
    readonly sideEffect: "write";
    readonly errors: readonly [{
        readonly code: "stale-context";
        readonly description: "The bound Project, Canvas, node, or connection changed before the call completed.";
        readonly recoverable: true;
    }, {
        readonly code: "permission-denied";
        readonly description: "The installed Plugin principal does not currently hold the required grant.";
        readonly recoverable: false;
    }];
    readonly docs: {
        readonly summary: "Close one revocable connected-image bearer session.";
        readonly description: "Revokes a session and bearer URL created by canvas.inputs.image.open after validating the calling Plugin principal, without changing Canvas or Project state.";
        readonly request: "`{ sessionId }`, using the opaque handle returned by canvas.inputs.image.open.";
        readonly response: "An acknowledgement that the caller's image session is closed; repeated close calls are idempotent.";
    };
} & {
    readonly contractSince: "2.0.0";
} & {
    audience: readonly import("./contracts").PluginApiAudience[];
}>, "audience"> & {
    readonly audience: readonly import("./contracts").PluginApiAudience[];
    readonly since: "2.0.0";
})>;
export type PluginApiId = PluginApiContractId;
export declare const PLUGIN_API_CATALOG_VERSION: `${number}.${number}.${number}`;
export declare const PLUGIN_API_CATALOG_MAJOR: number;
/**
 * Returns true when an untrusted value is a stable id in the current Host API catalog.
 *
 * @public
 */
export declare function isPluginApiId(value: unknown): value is PluginApiId;
/**
 * Returns the immutable definition for one stable Host API id.
 *
 * @public
 */
export declare function getPluginApiDefinition(id: PluginApiId): (typeof pluginApiCatalog.apis)[number];
/** Returns whether cancellation must preserve delivery of an already committed result. */
export declare function isPluginApiCommitPreserving(id: PluginApiId): boolean;
//# sourceMappingURL=catalog.d.ts.map