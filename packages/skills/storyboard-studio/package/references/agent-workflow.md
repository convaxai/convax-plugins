# Project and Canvas workflow

Use only public capabilities currently advertised in the active host scope. Tool
names below describe the standard Convax surface; follow the live schema exactly.
When no Canvas context or public Canvas tools exist, skip the Canvas-specific
sections and deliver only the verified Project/workspace package; never invent an
owning node to satisfy this reference.

## 1. Reconcile before writing

1. Resolve the active Canvas with `canvas_list` when needed.
2. Query the owning Storyboard Studio node with `canvas_query_nodes`.
3. For connected input, inspect the owner's `incomingNodeIds`, query only those
   nodes, and resolve their content through an available public read capability.
4. Query existing nodes whose resource metadata points below the target story root.
   Record the latest revision, existing file-to-node mapping, parent group ids, and
   direct connections.
5. Read existing story manifests from the Project. Treat their stable episode,
   segment, shot, and asset ids and paths as authoritative unless the user
   explicitly requests a migration. Reconcile segment `shotIds` before changing
   any segment or shot.

Do not use native paths surfaced accidentally by another layer. Do not read
unconnected Canvas nodes merely because they seem relevant.

## 2. Save durable files

Use an available public Project-scoped file write or the explicitly scoped
workspace editor. Keep every write below `Storyboards/<story-slug>/`. Write and
verify child files before `story.storyboard.json`.

If only `canvas_add_resources` with `new-text` is available, it cannot establish
the canonical Storyboards tree because it publishes Markdown through the host's
normal Notes workflow. Return the package as a handoff or stop and name the missing
Project file-write capability; do not rewrite private Canvas JSON or pretend Notes
are the story package.

## 3. Add file-backed cards

Call `canvas_add_resources` with:

- the active `canvasId` and latest `expectedRevision`;
- one stable `sourceId` per Project path;
- `kind: "host-file"` and the Project-relative path;
- an operation-specific `commandId`;
- an anchor and relation that match the live tool schema.

Add the root story manifest, episode manifests, shot Markdown cards, and asset card
JSON files needed for review. The episode manifest is the durable segment
timeline; do not invent private segment node types or host behavior. Avoid adding
every generated media file by default. Re-query after the mutation and map
returned/live node ids back to paths.

Use a command id again only when replaying the exact same request after a confirmed
non-application. If the result is uncertain, re-query before retrying. If the
desired sources already exist, do not add duplicates.

## 4. Group episodes idempotently

For each episode in number order:

1. Select only the episode manifest node and its shot-card nodes. Order shot cards
   by segment number and then shot number so the Canvas projection preserves the
   episode's production sequence. Never include the root story node or shared
   character, location, prop, or media nodes.
2. Inspect current `parentId` values and group nodes. If the complete intended set
   is already the child set of one group with the persisted `groupLabel`, keep it
   unchanged.
3. If some intended nodes belong to an unrelated or user-created group, stop and
   report the conflict. Do not ungroup it automatically.
4. If a stale group clearly belongs to this story but membership differs, re-read
   the Canvas. Change it only when the user requested reconciliation and the live
   primitive schema supports a safe ungroup/regroup sequence.
5. Otherwise call `canvas_apply_primitive` with a `nodes.group` command containing
   the intended returned node ids and persisted label.
6. Re-query immediately. Confirm one group, exact intended child membership, and
   the new revision before continuing.

This rule makes a repeated run converge on one group per episode instead of nesting
or duplicating groups.

## 5. Connect and lay out

Use only ids from confirmed tool results or a fresh query.

1. Connect the root story node to the first episode group and connect episode
   groups in number order with `nodes.connect` when those edges do not already
   exist.
2. Arrange only story-owned nodes/groups. Within an episode group, keep the
   segment sequence readable and keep each segment's one-to-three shots adjacent.
   Use `nodes.layout` for a small bounded selection or `canvas_auto_layout` with a
   selected node set when the live schema supports it.
3. Keep asset cards on a separate review shelf. Do not move or relayout unrelated
   user content.
4. Use `canvas_view` once to reveal/select/fit the verified result. A view failure
   does not invalidate saved files or confirmed mutations.

## 6. Recover from partial results

- On stale revision, conflict, timeout, cancellation, or uncertain mutation,
  re-query before deciding whether another call is safe.
- On partial file write, keep the last valid root manifest unchanged when possible
  and list orphaned child files for review. Never mark a segment output `ready`
  until its corresponding episode output file exists.
- On partial card addition, reconcile paths against live nodes and add only missing
  cards.
- On partial grouping, finish only groups whose intended nodes remain unambiguous.
- Never delete or overwrite unrelated user content to make reconciliation pass.

Finish by re-reading the root manifest and the smallest useful Canvas projection.
Report verified files, episode/segment/shot counts, groups, edges, generated media,
planned media, and unfinished steps separately.
