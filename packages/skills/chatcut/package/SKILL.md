---
name: chatcut
version: 0.3.2
description: Import directly connected Convax Canvas media and operate authenticated ChatCut video projects through the ChatCut MCP server, including selecting or creating projects, editing timelines, captions, or audio, verifying results, and exporting only on request. Use for video editing or creation work that should remain editable in ChatCut.
---

# ChatCut

Use the ChatCut MCP tools advertised in the current session to make reviewable,
editable project changes. Treat the current tool schemas and returned project state
as the runtime contract.

See [Convax capabilities](references/convax-capabilities.md) for the generated Host API and Plugin tool availability contract.
See [Plugin capabilities](references/plugin-capabilities.md) for generated Plugin-to-Plugin imports and exports.

## Establish the connection

1. Inspect the available tools for the ChatCut server contributed by the installed
   Plugin. OpenCode normally prefixes them with a namespace derived from
   `plugin_chatcut`; use the names actually advertised by the client.
2. If the tools are absent or ChatCut requires authentication, ask the user to
   install ChatCut when needed, select **Connect** for ChatCut in
   **Settings → Skills and Plugins**, and complete the ChatCut-hosted authorization
   flow. Inspect the tool list again only after the user confirms connection.
3. If the tools remain absent, identify the unavailable integration and stop. Do
   not imitate it with direct HTTP requests, private database access, local
   rendering, or guessed tool calls.
4. Never request, display, copy, persist, or pass a ChatCut password, API key,
   OAuth code, access token, refresh token, or browser Cookie. Authentication stays
   between ChatCut and the host's standard MCP OAuth client.
5. Treat the local `convax_plugin_chatcut_import_connected_media` operation separately
   from the remote ChatCut MCP server. The local operation receives host-staged
   copies of explicitly connected Canvas media; it does not receive the user's
   ChatCut account credential or OAuth token.

## Target a project

Determine whether the request refers to a new project, a named existing project,
or a project identified by a ChatCut editor URL.

- Use the available project discovery, creation, targeting, or editor-link tools.
- Do not select a plausible project by name when the target remains ambiguous.
- Use only project and timeline identifiers returned by ChatCut or explicitly
  supplied in a trusted editor URL. Never invent or infer hidden identifiers.
- Surface the returned clean editor URL after selecting or creating a project. Open
  it with an available browser capability when appropriate; otherwise provide the
  named link without claiming it was opened.

## Import connected Canvas media

Use this workflow when the user asks to import media directly connected to a
ChatCut Canvas node or presses that node's **Import connected media** button.
Merely adding or changing a Canvas edge refreshes the pending-input list; it is not
authorization to upload and must never trigger this workflow automatically.

1. Require a host-provided ChatCut Plugin `ownerNodeId` and ordered list of direct
   incoming media inputs. Each item must contain a host-provided opaque `inputKey`
   and one role from `reference_image`, `reference_video`, or `audio`. Never parse
   an `inputKey`, treat it as a Canvas node id, replace it, or reuse it with another
   tool. Do not discover, substitute, or add unrelated Canvas inputs. If either the
   owner or list is absent, ask the user to connect the desired media to the ChatCut
   node and start the import there.
2. Resolve the exact ChatCut project and target timeline before transferring any
   bytes. The user's explicit import request authorizes transfer of only the listed
   inputs to that target; clarify an ambiguous target, but do not repeat a
   confirmation the user already supplied.
3. Preserve direct-edge order. Partition the list into batches of at most four
   references. Never put more than four local media references in one import
   operation.
4. For each batch, call the currently advertised remote ChatCut `import_media`
   operation with `action: "create_session"` exactly once using its live schema.
   Require the returned short-lived `token` and exact `endpoint`; do not invent,
   normalize, or replace either value.
5. Immediately call the installed local operation
   `convax_plugin_chatcut_import_connected_media`. Pass the host-provided ChatCut
   `ownerNodeId` at the operation's top level. Its fixed legacy-shaped schema names
   the opaque input field `references[].nodeId`; copy each host-provided `inputKey`
   into that field verbatim, preserve order and role, and do not interpret it as a
   Canvas node id. Pass only `session_token` (set to the exact remote `token`) and
   `endpoint` as scalar `toolInput` fields.
   Never create a second import session for that batch in the same Agent turn. If
   the local operation is absent or fails, stop and report the failure instead of
   looping through more `create_session` calls.
   The host verifies that the owner
   node belongs to this installed Plugin, stages only references that are still
   directly connected to it, and rechecks their live Canvas sources; never pass a
   native path, data URL, file bytes, or arbitrary URL.
6. Treat the import session token as a narrowly scoped temporary authorization.
   Send it only from the trusted ChatCut `create_session` result to the installed
   local import operation. Never quote it in prose, logs, a project field, another
   tool call, or the final answer. Do not retain or reuse it after that batch.
7. Read the local operation's returned ChatCut asset identifiers in order. Use the
   advertised remote ChatCut `edit_item` operation to add those assets to the
   selected timeline in the original direct-edge order. Follow the current tool
   schema for placement and duration; do not guess unsupported media properties.
8. After all batches, call the advertised `read_project` operation and verify the
   imported assets and timeline items. Report the clean editor link and verified
   order without exposing the import token or local staging details.

If the remote session operation or local import operation is absent, identify the
missing capability and stop; do not replace it with direct HTTP, shell, filesystem,
or iframe network access. On denial, cancellation, changed edges, expired session,
partial upload, timeout, or uncertain result, do not automatically retry a batch
that may have transferred bytes. Read the project when possible, report the last
verified assets and items, and ask before a safe retry.

## Read before writing

1. Read the live project, relevant timeline, tracks, items, assets, transcript, or
   caption state needed for the requested operation.
2. Resolve exact asset, item, track, timeline, and project identifiers from that
   state. Check timing units, revision or conflict fields, and locked or overlapping
   content before changing anything.
3. Clarify only choices that materially affect the result. Require explicit user
   intent before paid generation, destructive or irreversible actions, large
   batches, publication, or export; do not ask again when the current request
   already provides that intent and every material choice is clear.
4. Call the narrow ChatCut tool whose current schema matches the operation. Keep
   edits inside the targeted ChatCut project; never edit `.convax` data or a
   ChatCut database directly.
5. On a stale revision, conflict, timeout, cancellation, or uncertain result,
   re-read the affected state before deciding whether a retry is safe. Never report
   an unverified mutation as complete.

Preserve source assets and unrelated timeline content unless the user explicitly
requests their removal. Do not silently add captions, music, effects, generated
media, or other creative changes outside the agreed task.

## Verify and deliver

After a mutation, read back the smallest relevant project projection and confirm
the intended identifiers, timing, placement, and state. When the available ChatCut
surface provides composed frame evidence and visual correctness matters, inspect
that evidence before claiming the result looks correct.

Keep the editable ChatCut project and editor link as the normal delivery. Do not
infer export intent from requests such as “edit,” “trim,” “clean up,” or “make a
version.” Export only when the user explicitly requests a rendered or downloadable
deliverable. For an export, use the current submit/status tools, wait for confirmed
completion when requested, and report the returned delivery URL without exposing
credentials.

On denial, cancellation, partial failure, or missing capability, report the last
confirmed project state and the unfinished step. Do not replace a failed ChatCut
workflow with a local flattened edit or claim that the editor reflects an
unconfirmed result.
