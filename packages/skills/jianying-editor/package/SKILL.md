---
name: jianying-editor
description: Import directly connected Convax Canvas images and videos into JianYing, either into the stable current draft or a safely created new draft. Use when the user asks to send, import, or export Canvas media to 剪映 or JianYing.
---

# JianYing Canvas import

Use only the installed JianYing Plugin operations advertised in the current
session. Do not inspect native paths, edit JianYing draft JSON, run shell
commands, call a Deep Link directly, or recreate the local companion.

## Resolve the source

1. Require the host-provided JianYing Plugin `ownerNodeId` and an ordered list of
   direct incoming image or video node ids. If these are missing, ask the user to
   connect the desired media to a JianYing Plugin node and start the import there.
2. Preserve direct-edge order. Never add a disconnected or merely selected Canvas
   node. Never pass a native path, file URL, data URL, bytes, Project path, or
   Canvas id.
3. Invoke the currently advertised local status operation corresponding to
   `draft.status`. It accepts no media references or custom fields.

## Select the draft

Handle the returned JSON state exactly:

- `active`: tell the user the returned `draftName` and ask whether to import into
  that current draft or create a new draft. Wait for the answer.
- `no_active_draft` or `not_running`: select `new` without asking an unnecessary
  extra question.
- `ambiguous`, `unavailable`, or `unsupported`: stop and report the returned
  reason. Never reinterpret the state as no active draft.

The returned `draftToken` is a short-lived, single-use observation receipt. Pass
it only as `draft_token` to the installed export operation. Never quote it in
prose, logs, node state, another tool, or the final answer.

Creating a new draft while another draft remains active fails closed. If the user
chooses new from an active state, ask them to return JianYing to its home screen,
inspect again, and proceed only after the status becomes `no_active_draft` or
`not_running`.

## Import and verify

Call the advertised operation corresponding to `media.export` with:

- the Plugin node as `ownerNodeId`;
- the ordered direct incoming references, using only `reference_image` or
  `reference_video`;
- `toolInput.target` set to the explicit `current` or `new` decision;
- `toolInput.draft_token` set to the exact latest token.

The host revalidates Plugin ownership and direct incoming edges, stages bounded
copies, and rechecks the sources immediately before launching the companion. Do
not bypass that boundary or call an operation from another Plugin.

Report the returned draft name, imported media count, whether a new draft was
created, and the verified transfer status. On cancellation, expired observation,
changed draft, timeout, partial transfer, or unknown native outcome, do not retry
automatically because another attempt may duplicate materials.
