# Storyboard Studio

Storyboard Studio is the official `storyboard-studio` Plugin and its owned Skill.
It turns a one-line premise, pasted script, or directly connected Canvas source
into a durable episodic story package and presents that package in a
video-production workbench.

The production hierarchy is explicit:

```text
Story → Episode → Segment → 1–3 ordered Shots
```

A shot describes one camera setup. A segment is the smallest video-production
unit: it groups one to three shots with a scene setting, asset references,
duration, status, and keyframe/video/audio outputs. Stable segment and shot ids
let later edits or media retries target the narrowest possible scope.

## Package ownership

The concrete packages live here:

```text
packages/plugins/storyboard-studio/
packages/skills/storyboard-studio/
```

The Plugin uses `convax.plugin/8` and the SDK-owned `convax.plugin-host/8`
Web client. It contributes the owned Skill and a Canvas renderer for created
cards, `*.storyboard.json`, and `*.character.card.json`. The packer injects the
Skill and generated capability references into the Plugin ZIP.

The Web surface is an original implementation whose information hierarchy is
informed by established dense video-storyboard editor patterns: an asset library,
focused segment script, media preview, and horizontal segment strip.
No third-party source or asset is distributed in this package.

## Inputs and Agent workflow

The launcher accepts:

- a short premise entered directly in the composer;
- a pasted script or adaptation brief;
- text and Project-file nodes connected directly to the Plugin node;
- directly connected media identities as explicitly scoped visual/audio context.

The sandboxed renderer reads the current Canvas structure and direct inputs using
its declared capabilities. It takes only direct incoming source ids. Project text
is read by Project-relative path; the Plugin never infers a native filesystem
path or searches unrelated nodes.

The primary action calls `agent.prompt`. Convax attaches the Plugin-owned
`storyboard-studio` Skill, which directs the Agent to:

1. snapshot the source and establish the series bible and continuity;
2. create characters, locations, and props with stable identities;
3. split the story into episodes, ordered segments, and one to three ordered shots
   per segment;
4. write child documents before their parent indexes and validate references;
5. optionally materialize verified Project files on the Canvas and group them by
   episode.

The Plugin iframe does not create arbitrary Project files and does not perform
Canvas business mutations itself. Local segment text and dragged asset references
remain an unsaved editing draft until the user asks the Agent to save them. The
Agent must re-read the current files, preserve stable ids and compatible unknown
fields, write the narrow update, and validate it before reporting success.

## Production workbench

Opening a story index switches the renderer into a production-focused
storyboard workbench:

- **Top toolbar:** episode switcher plus planning-model, resolution, visual-style,
  and aspect-ratio preferences. These are generation preferences, not proof that
  a provider or cost has been selected.
- **Left asset library:** episode/story scope and role, location, material, and
  prop tabs. Assets may be inspected or dragged into the current segment as a
  pending reference.
- **Center segment editor:** stable segment identity, scene setting, referenced
  assets, and structured one-to-three-shot script with framing, angle, camera
  movement, action, dialogue, sound, and continuity direction.
- **Right preview:** the current segment's verified keyframe or video state,
  playback controls, and explicit empty, running, failed, or missing-media
  feedback.
- **Bottom segment strip:** every segment in narrative order, with duration,
  selection, and status. The strip is the production sequence; it does not replace
  the episode or shot manifests.

The workbench supports a focused character drawer. A character can be inspected
without leaving the segment and inserted into the local draft. Fullscreen mode is
the same sandboxed Plugin surface expanded by the browser/host; it is not a new
Project-scoped native document type.

Bundled portraits and film frames are used only by `?demo=story` and
`?demo=character`. A real Project story never falls back to those demo images.
Without a host-provided managed media stream, the workbench shows a neutral
placeholder and the confined Project-relative reference; it does not pretend that
the renderer played, downloaded, or re-verified binary media.

## Durable Project file contract

Project files remain the portable source of truth:

```text
Storyboards/<story-slug>/
  story.storyboard.json
  source/
    original-brief.md
    original-script.md
  bible/
    series-bible.md
    continuity.json
  assets/
    characters/<character-id>/
      <character-id>.character.card.json
      images/
      audio/
    locations/<location-id>/
      location.card.json
      images/
    props/<prop-id>/
      prop.card.json
      images/
  episodes/
    ep-001-<episode-slug>/
      episode.storyboard.json
      script.md
      shots/
        shot-001-<shot-slug>.md
      outputs/
        images/
        audio/
        video/
```

Ordered segment records live in `episode.storyboard.json`. Each record owns a
stable `segment-001` style id, one to three known `shotIds`, `sceneSetting`,
`locationAssetId`, `assetRefs`, `durationSeconds`, `status`, and `outputs` for
`keyframe`, `video`, and `audio`. Shot records retain their own stable ids and may
also carry output state for finer-grained workflows.

Empty media directories and placeholder bytes are not part of a valid package.
Every durable reference is a Project-root-relative POSIX path below the same
`Storyboards/<story-slug>/` root. Child artifacts are written and verified before
an episode or story index points at them.

Three public documents drive the renderer:

- `convax.storyboard/1` for `story.storyboard.json`;
- `convax.storyboard-episode/1` for each episode index;
- `convax.character-card/1` for each special character card.

The authoritative field contract and validators are owned by the Skill in
`packages/skills/storyboard-studio/package/`.

## Honest media state

Media output state is tracked separately for keyframes, video, and audio:

- `planned`: described but not submitted;
- `queued`: accepted for later processing;
- `running`: actively being processed;
- `ready`: a durable Project artifact has been verified;
- `failed`: the operation reached a terminal failure;
- `missing-media`: metadata claimed an output, but no valid in-story Project path
  can currently be used.

Segments additionally use `draft` and `generating` as editing/production summary
states. A `ready` output must have a portable path confined to the story root;
otherwise the renderer downgrades it to `missing-media`. An accepted remote job,
temporary preview, demo frame, or signed URL is never proof of a ready artifact.

The demo workbench simulates status transitions and keyframe playback only. It
does not claim that demo images are generated Project media or that a real video
service ran.

Planning mode, resolution, style, and aspect ratio are persisted as UI
preferences and included in the narrow segment-generation request. They are
creative constraints only: they do not select a provider, prove that a model
supports the requested setting, approve cost, or turn a registered path into a
playable media stream.

Clicking **Generate segment** asks the Agent to identify the actual available
media tool/provider, output types, variant count, duration, and cost-relevant
scope. Paid, bulk, or otherwise consequential generation requires explicit user
confirmation before the tool is called. Episode composition follows the same
rule and cannot be reported complete until its durable output is verified.

## Character card

`*.character.card.json` is rendered by a Plugin file-renderer extension; it is not
a new private core Canvas node type. The same character can therefore be inspected
as a dedicated card or in the workbench drawer.

A character card is the continuity source for later image, voice, and video work:

- identity, role, biography, aliases, tags, and episode appearances;
- personality archetype, observable traits, contradiction, desire, fear, secret,
  moral line, speech pattern, and gestures;
- visual appearance, silhouette, face, hair, wardrobe, palette, image and negative
  prompts, and image references;
- voice description, language, timbre, pitch, pace, energy, accent, sample text,
  and consent-safe audio references;
- baseline, under-pressure, emotional-range, and video performance notes;
- immutable locks, allowed variations, forbidden changes, and relationships.

Character image/audio references use explicit `planned`, `running`, `ready`, or
`failed` states. Only a verified durable Project artifact may be marked `ready`.

## Canvas materialization and grouping

The workbench's **Expand to Canvas** action sends a scoped request to the Agent.
Using only public tools advertised in the session, the Agent:

1. re-reads and validates the story package;
2. adds verified story, episode, shot, and shared asset files as Project-backed
   Canvas resources;
3. creates or reuses one episode group keyed by stable `storyId + episodeId`;
4. preserves the stored `groupLabel`, orders shot cards narratively, and reuses
   shared assets rather than duplicating them;
5. re-queries after mutations and reports only verified results.

Segments are the workbench production units; the current Canvas materialization
continues to use episode and shot file cards. The multi-step expansion is not
claimed to be atomic.

## Current host ABI boundary

The manifest declares only these public capabilities:

```text
agent.prompt
canvas.document.read
canvas.connectedInputs.read
canvas.node.read
canvas.node.write
project.files.read
ui.fullscreen
```

`canvas.node.write` is used for Plugin-owned UI state such as the selected episode,
selected segment, library scope, and preferences. Project authoring, media work,
and story-wide Canvas arrangement remain Agent operations using whatever public
tools are actually available in the session. The package contributes no local
executable, hidden sidecar, or private host implementation.

The current ABI has no generic declaration for:

- a third native Project sidebar section beside Files and Canvases;
- a Project-scoped Plugin document surface outside a Canvas renderer;
- dropping one story and atomically materializing a full card/group graph.

Release `0.1.1` therefore uses honest equivalents:

- `Storyboards/` is a top-level user-visible Project directory;
- the complete story/episode/segment tree appears in the Plugin workbench and its
  fullscreen form;
- dragging a supported story or character file to Canvas opens its registered
  renderer;
- **Expand to Canvas** asks the Agent to perform checked, non-atomic
  materialization.

Any future native sidebar, document-workbench, or declarative materialization
support belongs in the generic `microvoid/convax` ABI. This repository must not
branch host behavior on the concrete `storyboard-studio` id.

## Local preview

The package can be reviewed without a host connection:

```text
index.html?demo=story
index.html?demo=character
```

Demo content is marked as an interaction/card preview. Agent-backed authoring
remains unavailable until the exact Convax capability port is connected.
