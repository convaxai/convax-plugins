---
name: storyboard-studio
version: 0.1.1
description: Turn a one-line premise, full script, or directly connected Canvas inputs into a traceable episodic storyboard package with episode scripts, shot cards, character/location/prop assets, image and voice briefs, personality and continuity locks, and an editable episode-grouped Canvas graph. Use when an agent must create, expand, revise, validate, or place a story package owned by the Storyboard Studio Plugin.
---

# Storyboard Studio

Produce durable story files first, then reflect confirmed files on Canvas. Treat
the tools advertised in the current session and their live schemas as the runtime
contract.

See [Convax capabilities](references/convax-capabilities.md) for the generated Host API and Plugin tool availability contract.
See [Plugin capabilities](references/plugin-capabilities.md) for generated Plugin-to-Plugin imports and exports.

## Establish scope and capabilities

1. Determine whether the request came from an owning Storyboard Studio Canvas
   node. If it did, identify the active Project, active Canvas, owning node, and
   latest Canvas revision from authoritative host context. In a standalone Skill
   client, identify the user-scoped workspace and treat Canvas delivery as
   optional; do not require or invent an owning Plugin node.
2. Inspect available public Project/file and Canvas tools. Use compatible names
   actually advertised by the client; installing this Skill grants no tool.
3. Read existing `Storyboards/` content before choosing a story folder or updating
   a package. Never inspect or edit private `.convax` state, infer native paths, or
   bypass a denied host operation.
4. If Project file writes are unavailable, prepare the complete package as a
   bounded handoff and say it was not saved. If Canvas tools are unavailable,
   finish the file package when possible and say Canvas delivery was not performed.

Read [references/agent-workflow.md](references/agent-workflow.md) before mutating
Project files or Canvas. Read
[references/story-file-layout.md](references/story-file-layout.md) before creating
or revising a story package. Read
[references/character-card.md](references/character-card.md) whenever characters
are created, revised, or prepared for image, audio, or video generation.

## Resolve input with provenance

Accept exactly the material the user placed in scope:

- For a one-line premise, preserve the original sentence, state the smallest
  necessary creative assumptions, and expand it into a series promise before
  splitting episodes.
- For a complete or partial script, preserve an immutable source snapshot and
  separate source facts from proposed additions. Do not silently rewrite required
  names, plot facts, dialogue, or ending.
- For connected Canvas inputs, query the owning node and its direct incoming
  neighbors with the available public Canvas query capability. When the standard
  Convax tools are advertised, use `canvas_query_nodes`, inspect
  `incomingNodeIds`, and query only those ids. Resolve content only through public
  host/project reads or content already returned in scope; never use guessed paths
  or unrelated nodes.

Record the source mode and Project-relative source snapshot paths in
`story.storyboard.json`. Record connected node ids only as provenance, not as a
substitute for a source snapshot. If a connected input cannot be read, identify it
and ask for the content instead of inventing it.

## Build the story package

1. Define the story promise, audience, genre, language, aspect ratio, episode
   count, target runtime, content boundary, and production limits. Ask one
   consolidated question only when a missing answer materially changes the story
   or a safety boundary; otherwise record assumptions.
2. Create a series bible with protagonist goal, pressure, flaw, opposition,
   repeatable conflict, relationship engine, continuity locks, locations, props,
   escalation ladder, and ending direction.
3. Split the season into numbered episodes. Give each episode an opening change,
   concrete objective, escalating reversals, decisive turn, consequence, and
   earned handoff to the next episode.
4. Split every requested episode into ordered production segments, then assign
   exactly one to three ordered shots to each segment. Give every segment a stable
   `segment-###` id, scene setting, declared location asset, duration, status,
   aggregate asset references, and keyframe/video/audio output states. Assign every
   shot to exactly one segment.
5. Specify shot duration, framing, angle, camera movement, subject/action,
   performance, dialogue, sound, location, characters, continuity, image prompt,
   and video prompt. Keep segment and shot durations close to the episode target
   and mark intentional exceptions.
6. Create character, location, and prop cards before referencing them from
   segments or shots.
   Character cards must include visual/image direction, voice/audio direction,
   personality, performance behavior, relationships, and continuity locks.
7. Write the package below `Storyboards/<story-slug>/` using stable ids and only
   Project-root-relative POSIX references. Reuse existing ids and paths on update;
   never renumber an existing episode, segment, or shot merely because content
   moved.
8. Validate references and identity consistency. If a JavaScript runtime is
   available, run `scripts/validate-story-package.mjs` against the story directory.
   Otherwise perform the same checks described in the file-layout reference.

The default asset deliverable is structured cards, prompts, reference slots, and
continuity requirements. It does not imply that image, audio, or video bytes were
generated.

## Gate media generation

Before any paid external generation or multi-asset batch, present one compact
generation plan with provider/tool, media types, item counts, variants, expected
cost or an explicit “cost unavailable,” and destination paths. Require the user's
confirmation even when the text package itself was already requested.

After confirmation, call only available tools with the confirmed scope. Write a
media reference as `ready` only after the tool returns a confirmed artifact and the
file is durably saved; otherwise retain `planned` or `failed` with the last known
state. On denial, cancellation, timeout, partial success, or uncertain completion,
stop dependent calls, re-read state when safe, and never claim missing bytes exist.

## Build the Canvas graph

Use the public workflow in the agent-workflow reference. In the standard Convax
surface:

1. Query the live Canvas and latest revision.
2. Add only confirmed Project files with `canvas_add_resources` as `host-file`
   sources. Use stable `sourceId` and `commandId` values, and use returned node ids.
3. Re-query after every revision-changing operation.
4. For each episode, order its shot cards by segment and shot number, then group
   the episode card and shot cards exactly once with
   `canvas_apply_primitive` and `type: "nodes.group"`. Use the persisted
   `groupLabel`, exclude shared character/location/prop cards, and never absorb
   unrelated user nodes.
5. Connect the story card to episode group nodes in order, lay out only owned
   nodes, then reveal the finished graph with `canvas_view` when available.

Treat retries as reconciliation, not replay. If matching nodes or the persisted
episode group already exist, reuse them. Use a command id again only for the exact
same intended operation; after changed intent or an uncertain mutation, re-query
before choosing a safe next command.

## Verify and report

Complete the task only after re-reading the root manifest and, when used, the live
Canvas. Report:

- story root, story id, source mode, episode/segment/shot/asset counts, and
  validation result;
- generated media versus planned media;
- Canvas node/group results verified from current state;
- assumptions, continuity risks, failures, and unfinished steps.

Do not report a saved package, generated asset, Canvas card, group, connection, or
layout unless that result was confirmed. Preserve source files and unrelated
Project/Canvas content throughout.
