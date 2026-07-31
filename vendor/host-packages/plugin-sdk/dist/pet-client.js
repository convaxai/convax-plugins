// src/pet.ts
var petHostProtocol = "convax.pet-host/1";
var petHostMaximumMessageBytes = 64 * 1024;
var petHostMaximumPendingRequests = 64;
var petHostOverlayMethods = new Set([
  "activity.getSnapshot",
  "activity.open",
  "collection.get",
  "overlay.move",
  "overlay.setExpanded",
  "preferences.get",
  "preferences.update"
]);
var petHostSettingsMethods = new Set([
  "collection.delete",
  "collection.get",
  "collection.import",
  "lifecycle.setAwake",
  "preferences.get",
  "preferences.update"
]);
function isPetHostMethodForSurface(surface, method) {
  if (typeof method !== "string")
    return false;
  return (surface === "overlay" ? petHostOverlayMethods : petHostSettingsMethods).has(method);
}
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : undefined;
}
function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function text(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}
function pluginId(value) {
  return text(value, 80) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}
function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function emptyParams(value) {
  const object = record(value);
  if (!object || !hasExactKeys(object, []))
    throw new TypeError("Pet Host method requires empty params");
  return object;
}
function parsePetHostParams(method, value) {
  const object = record(value);
  switch (method) {
    case "activity.getSnapshot":
    case "collection.get":
    case "collection.import":
    case "preferences.get":
      return emptyParams(value);
    case "activity.open":
      if (!object || !hasExactKeys(object, ["activityId", "revision"]) || !text(object.activityId, 200) || !safeRevision(object.revision)) {
        throw new TypeError("Pet activity.open params are invalid");
      }
      return value;
    case "collection.delete":
      if (!object || !hasExactKeys(object, ["petId"]) || !text(object.petId, 80) || !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(object.petId)) {
        throw new TypeError("Pet collection.delete params are invalid");
      }
      return value;
    case "lifecycle.setAwake":
      if (!object || !hasExactKeys(object, ["awake"]) || typeof object.awake !== "boolean") {
        throw new TypeError("Pet lifecycle.setAwake params are invalid");
      }
      return value;
    case "overlay.setExpanded":
      if (!object || !hasExactKeys(object, ["expanded"]) || typeof object.expanded !== "boolean") {
        throw new TypeError("Pet overlay.setExpanded params are invalid");
      }
      return value;
    case "preferences.update":
      if (!object || !hasExactKeys(object, ["selectedPetId"]) || !pluginId(object.selectedPetId)) {
        throw new TypeError("Pet preferences.update params are invalid");
      }
      return value;
    case "overlay.move":
      if (!object || !hasExactKeys(object, ["phase", "screenX", "screenY", "sequence", "session"]) || object.phase !== "start" && object.phase !== "move" && object.phase !== "end" || typeof object.screenX !== "number" || !Number.isFinite(object.screenX) || Math.abs(object.screenX) > 1e6 || typeof object.screenY !== "number" || !Number.isFinite(object.screenY) || Math.abs(object.screenY) > 1e6 || !safeRevision(object.sequence) || !text(object.session, 80) || !/^[A-Za-z0-9-]+$/u.test(object.session)) {
        throw new TypeError("Pet overlay.move params are invalid");
      }
      return value;
    default:
      throw new TypeError("Pet Host method is invalid");
  }
}
function utf8Length(value) {
  let bytes = 0;
  for (let index = 0;index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 127)
      bytes += 1;
    else if (unit <= 2047)
      bytes += 2;
    else if (unit >= 55296 && unit <= 56319 && index + 1 < value.length) {
      const trail = value.charCodeAt(index + 1);
      if (trail >= 56320 && trail <= 57343) {
        bytes += 4;
        index += 1;
      } else
        bytes += 3;
    } else
      bytes += 3;
  }
  return bytes;
}
function isPetHostMessageWithinLimit(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && utf8Length(serialized) <= petHostMaximumMessageBytes;
  } catch {
    return false;
  }
}
function parseActivitySummary(value) {
  const object = record(value);
  if (!object)
    throw new TypeError("Pet activity is invalid");
  const required = ["id", "projectId", "projectName", "sessionId", "sessionName", "state", "updatedAt"];
  const keys = object.input === undefined ? required : [...required, "input"];
  if (!hasExactKeys(object, keys) || !text(object.id, 200) || !text(object.projectId, 200) || !text(object.projectName, 500) || !text(object.sessionId, 200) || !text(object.sessionName, 500) || !["needs-input", "blocked", "ready", "running"].includes(object.state) || !Number.isFinite(object.updatedAt) || object.input !== undefined && object.input !== "permission" && object.input !== "question") {
    throw new TypeError("Pet activity is invalid");
  }
  return value;
}
function parsePetActivitySnapshot(value) {
  const object = record(value);
  if (!object || !hasExactKeys(object, ["activities", "revision"]) || !Array.isArray(object.activities)) {
    throw new TypeError("Pet activity snapshot is invalid");
  }
  if (!safeRevision(object.revision) || object.activities.length > 512) {
    throw new TypeError("Pet activity snapshot is invalid");
  }
  object.activities.forEach(parseActivitySummary);
  return value;
}
function parsePetPreferences(value) {
  const object = record(value);
  if (!object)
    throw new TypeError("Pet preferences are invalid");
  const keys = object.selectedPetId === undefined ? ["awake"] : ["awake", "selectedPetId"];
  if (!hasExactKeys(object, keys) || typeof object.awake !== "boolean" || object.selectedPetId !== undefined && !pluginId(object.selectedPetId)) {
    throw new TypeError("Pet preferences are invalid");
  }
  return value;
}
function parsePetCustomPet(value) {
  const object = record(value);
  if (!object || !hasExactKeys(object, ["alt", "description", "displayName", "id", "source", "spritesheetUrl", "spriteVersion"]) || !text(object.alt, 500) || !text(object.description, 2000) || !text(object.displayName, 120) || !text(object.id, 80) || !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(object.id) || object.source !== "custom" || !text(object.spritesheetUrl, 2048) || object.spriteVersion !== 2) {
    throw new TypeError("Custom Pet is invalid");
  }
  return value;
}
function parsePetCustomCollectionSnapshot(value) {
  const object = record(value);
  if (!object || !hasExactKeys(object, ["pets", "revision"]) || !Array.isArray(object.pets) || object.pets.length > 256 || !safeRevision(object.revision)) {
    throw new TypeError("Pet collection is invalid");
  }
  object.pets.forEach(parsePetCustomPet);
  return value;
}
function parsePetHostResult(method, value) {
  switch (method) {
    case "activity.getSnapshot":
      return parsePetActivitySnapshot(value);
    case "collection.delete":
    case "collection.get":
      return parsePetCustomCollectionSnapshot(value);
    case "collection.import":
      return value === null ? null : parsePetCustomPet(value);
    case "lifecycle.setAwake":
    case "preferences.get":
    case "preferences.update":
      return parsePetPreferences(value);
    case "activity.open":
    case "overlay.move":
    case "overlay.setExpanded":
      return value;
  }
}
function parsePetHostEvent(value) {
  if (!isPetHostMessageWithinLimit(value))
    throw new TypeError("Pet Host event exceeds the size limit");
  const object = record(value);
  if (!object || !hasExactKeys(object, ["event", "payload", "protocol", "type"]) || object.protocol !== petHostProtocol || object.type !== "event") {
    throw new TypeError("Pet Host event is invalid");
  }
  switch (object.event) {
    case "activity.changed":
      parsePetActivitySnapshot(object.payload);
      break;
    case "collection.changed":
      parsePetCustomCollectionSnapshot(object.payload);
      break;
    case "preferences.changed":
      parsePetPreferences(object.payload);
      break;
    default:
      throw new TypeError("Pet Host event is invalid");
  }
  return value;
}
function isPetHostConnect(value, surface, expectedPluginId) {
  const object = record(value);
  if (!object || object.protocol !== petHostProtocol || object.type !== "connect" || object.surface !== surface) {
    return false;
  }
  if (!pluginId(object.pluginId) || object.pluginId !== expectedPluginId)
    return false;
  if (surface === "overlay")
    return hasExactKeys(object, ["pluginId", "protocol", "surface", "type"]);
  return hasExactKeys(object, ["connectionId", "generation", "pluginId", "protocol", "surface", "type"]) && text(object.connectionId, 80) && Number.isSafeInteger(object.generation) && object.generation >= 1;
}

// src/pet-client.ts
var defaultHandshakeTimeoutMs = 5000;
var defaultRequestTimeoutMs = 1e4;
var maximumTimeoutMs = 60000;
var minimumTimeoutMs = 25;

class PetHostClientError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PetHostClientError";
    this.code = code;
  }
}
function timers() {
  const value = globalThis;
  if (typeof value.setTimeout !== "function" || typeof value.clearTimeout !== "function") {
    throw new PetHostClientError("transport-error", "Pet Host client requires browser timers");
  }
  return value;
}
function browserWindow() {
  const value = globalThis;
  if (!value.location || typeof value.location.hostname !== "string" || typeof value.location.protocol !== "string" || typeof value.addEventListener !== "function" || typeof value.removeEventListener !== "function") {
    throw new PetHostClientError("transport-error", "Pet Host client requires a browser Plugin surface");
  }
  return value;
}
function timeoutFor(value, fallback) {
  if (value === undefined)
    return fallback;
  if (!Number.isFinite(value))
    throw new TypeError("Pet Host timeout is invalid");
  return Math.min(maximumTimeoutMs, Math.max(minimumTimeoutMs, Math.trunc(value)));
}
function record2(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : undefined;
}
function clientForPort(port, requestTimeoutMs, surface) {
  const timerHost = timers();
  const listeners = new Map;
  const pending = new Map;
  let closed = false;
  let nextId = 0;
  const close = () => {
    if (closed)
      return;
    closed = true;
    port.onmessage = null;
    for (const request of pending.values()) {
      timerHost.clearTimeout(request.timeout);
      request.abort?.();
      request.reject(new PetHostClientError("closed", "Pet Host connection closed"));
    }
    pending.clear();
    listeners.clear();
    try {
      port.close();
    } catch {}
  };
  port.onmessage = ({ data }) => {
    if (closed)
      return;
    if (!isPetHostMessageWithinLimit(data)) {
      close();
      return;
    }
    const message = record2(data);
    if (!message || message.protocol !== petHostProtocol) {
      close();
      return;
    }
    if (message.type === "event") {
      try {
        const event = parsePetHostEvent(data);
        for (const listener of listeners.get(event.event) ?? [])
          listener(event.payload);
      } catch {
        close();
      }
      return;
    }
    if (message.type !== "response" || typeof message.id !== "string") {
      close();
      return;
    }
    const request = pending.get(message.id);
    if (!request) {
      close();
      return;
    }
    pending.delete(message.id);
    timerHost.clearTimeout(request.timeout);
    request.abort?.();
    const keys = Object.keys(message);
    if (message.ok === false && typeof message.error === "string" && keys.length === 5 && keys.every((key) => ["error", "id", "ok", "protocol", "type"].includes(key))) {
      request.reject(new PetHostClientError("remote-error", message.error.slice(0, 500) || "Pet Host request failed"));
      return;
    }
    if (message.ok !== true || keys.length !== 5 || !keys.every((key) => ["id", "ok", "protocol", "result", "type"].includes(key)) || !Object.prototype.hasOwnProperty.call(message, "result")) {
      request.reject(new PetHostClientError("invalid-message", "Pet Host response is invalid"));
      close();
      return;
    }
    try {
      request.resolve(parsePetHostResult(request.method, message.result));
    } catch {
      request.reject(new PetHostClientError("invalid-message", "Pet Host result is invalid"));
      close();
    }
  };
  port.start?.();
  return Object.freeze({
    get closed() {
      return closed;
    },
    surface,
    close,
    request(method, params, options) {
      if (closed)
        return Promise.reject(new PetHostClientError("closed", "Pet Host connection closed"));
      if (options?.signal?.aborted) {
        return Promise.reject(new PetHostClientError("aborted", "Pet Host request was aborted"));
      }
      if (pending.size >= petHostMaximumPendingRequests) {
        return Promise.reject(new PetHostClientError("overloaded", "Pet Host pending request limit reached"));
      }
      if (!isPetHostMethodForSurface(surface, method)) {
        return Promise.reject(new PetHostClientError("invalid-message", "Pet Host method is invalid for this surface"));
      }
      let parsedParams;
      try {
        parsedParams = parsePetHostParams(method, params);
      } catch {
        return Promise.reject(new PetHostClientError("invalid-message", "Pet Host request params are invalid"));
      }
      const request = {
        id: `${surface}-${++nextId}`,
        method,
        params: parsedParams,
        protocol: petHostProtocol,
        type: "request"
      };
      if (!isPetHostMessageWithinLimit(request)) {
        return Promise.reject(new PetHostClientError("invalid-message", "Pet Host request is invalid"));
      }
      return new Promise((resolve, reject) => {
        const abort = options?.signal ? () => {
          options.signal?.removeEventListener("abort", abortListener);
        } : undefined;
        const abortListener = () => {
          if (!pending.delete(request.id))
            return;
          timerHost.clearTimeout(timeout);
          abort?.();
          reject(new PetHostClientError("aborted", "Pet Host request was aborted"));
        };
        const timeout = timerHost.setTimeout(() => {
          if (!pending.delete(request.id))
            return;
          abort?.();
          reject(new PetHostClientError("timeout", "Pet Host request timed out"));
        }, requestTimeoutMs);
        pending.set(request.id, {
          abort,
          method,
          reject,
          resolve,
          timeout
        });
        options?.signal?.addEventListener("abort", abortListener, { once: true });
        try {
          port.postMessage(request);
        } catch (error) {
          timerHost.clearTimeout(timeout);
          pending.delete(request.id);
          abort?.();
          reject(new PetHostClientError("transport-error", error instanceof Error ? error.message : "Pet Host request transport failed"));
        }
      });
    },
    subscribe(event, listener) {
      if (closed)
        return () => {
          return;
        };
      const eventListeners = listeners.get(event) ?? new Set;
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return () => {
        eventListeners.delete(listener);
        if (eventListeners.size === 0)
          listeners.delete(event);
      };
    }
  });
}
function connectPetHost(options) {
  const source = options.source ?? browserWindow();
  if (source.location.protocol !== "convax-plugin:" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.location.hostname)) {
    return Promise.reject(new PetHostClientError("transport-error", "Pet Host Plugin origin is invalid"));
  }
  const handshakeTimeoutMs = timeoutFor(options.handshakeTimeoutMs, defaultHandshakeTimeoutMs);
  const requestTimeoutMs = timeoutFor(options.requestTimeoutMs, defaultRequestTimeoutMs);
  const timerHost = timers();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      source.removeEventListener("message", connect);
      timerHost.clearTimeout(timeout);
    };
    const connect = (event) => {
      if (settled || event.source !== source.parent || event.ports?.length !== 1 || !isPetHostConnect(event.data, options.surface, source.location.hostname)) {
        return;
      }
      settled = true;
      cleanup();
      resolve(clientForPort(event.ports[0], requestTimeoutMs, options.surface));
    };
    source.addEventListener("message", connect);
    const timeout = timerHost.setTimeout(() => {
      if (settled)
        return;
      settled = true;
      cleanup();
      reject(new PetHostClientError("timeout", "Pet Host connection timed out"));
    }, handshakeTimeoutMs);
  });
}
export {
  petHostProtocol,
  petHostMaximumPendingRequests,
  petHostMaximumMessageBytes,
  parsePetPreferences,
  parsePetHostResult,
  parsePetHostParams,
  parsePetHostEvent,
  parsePetCustomPet,
  parsePetCustomCollectionSnapshot,
  parsePetActivitySnapshot,
  isPetHostMethodForSurface,
  isPetHostMessageWithinLimit,
  isPetHostConnect,
  connectPetHost,
  PetHostClientError
};

//# debugId=12E586A48F38DE7164756E2164756E21
//# sourceMappingURL=pet-client.js.map
