# Story package file contract

Use this contract for every new package and every update. The story folder is a
user-visible Project resource; it never lives below `.convax`.

## Canonical tree

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
          segment-001-keyframe.webp
        audio/
          segment-001.wav
        video/
          segment-001.mp4
```

Create media/output directories only when they contain a real artifact. Preserve
the applicable source file even when the other source mode is unused. Do not add
placeholder media bytes or claim an empty directory is an asset.

## Paths and identifiers

- Make `<story-slug>` unique within `Storyboards/` and match
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Reuse it forever after the root manifest exists.
  Prefer a short meaningful Latin slug; when reliable transliteration is not
  available, use an opaque stable suffix rather than inventing a translation.
- Use `story-<story-slug>` for `story.id`.
- Allocate episode ids as `ep-001`, `ep-002`, and so on. Never renumber an existing
  episode. Allocate inserted episodes from the next unused number.
- Allocate segment ids within each episode as `segment-001`, `segment-002`, and so
  on. Keep a segment id when its title, scene setting, or shot membership changes.
  Never reuse a removed segment id.
- Allocate shot ids as `<episode-id>-shot-001` and character/location/prop ids as
  `char-001`, `loc-001`, and `prop-001`. Keep an id when a display name changes.
- Use Project-root-relative POSIX paths beginning with
  `Storyboards/<story-slug>/`. Reject absolute paths, backslashes, `.` or `..`
  traversal, URLs where a file path is expected, and paths outside the story root.
- Sort episode entries by `number`, segments by `number`, shots by `number`, and
  asset entries by `id`. Avoid timestamps and machine-specific fields that make
  unchanged output drift.

## Root story manifest

Write UTF-8 JSON with two-space indentation and this shape:

```json
{
  "schema": "convax.storyboard/1",
  "id": "story-night-mailbox",
  "slug": "night-mailbox",
  "title": "Midnight Mailbox",
  "logline": "A courier receives tomorrow's undelivered letters.",
  "source": {
    "mode": "premise",
    "files": [
      "Storyboards/night-mailbox/source/original-brief.md"
    ],
    "connectedNodeIds": []
  },
  "format": {
    "language": "zh-CN",
    "genre": "mystery",
    "aspectRatio": "9:16",
    "targetEpisodeSeconds": 90
  },
  "biblePath": "Storyboards/night-mailbox/bible/series-bible.md",
  "continuityPath": "Storyboards/night-mailbox/bible/continuity.json",
  "assets": {
    "characters": [
      {
        "id": "char-001",
        "name": "Lin",
        "path": "Storyboards/night-mailbox/assets/characters/char-001/char-001.character.card.json"
      }
    ],
    "locations": [
      {
        "id": "loc-001",
        "name": "Sorting room",
        "path": "Storyboards/night-mailbox/assets/locations/loc-001/location.card.json"
      }
    ],
    "props": [
      {
        "id": "prop-001",
        "name": "Red envelope",
        "path": "Storyboards/night-mailbox/assets/props/prop-001/prop.card.json"
      }
    ]
  },
  "episodes": [
    {
      "id": "ep-001",
      "number": 1,
      "title": "The Letter",
      "path": "Storyboards/night-mailbox/episodes/ep-001-the-letter/episode.storyboard.json",
      "groupLabel": "EP001 · The Letter",
      "shotCount": 1,
      "status": "draft"
    }
  ]
}
```

Allow `source.mode` values `premise`, `script`, `connected`, or `mixed`. Keep only
directly connected Canvas node ids in `connectedNodeIds`; the durable source files
remain authoritative. Keep `groupLabel` stable after the corresponding Canvas
group exists.

## Episode manifest

Use this minimum shape:

```json
{
  "schema": "convax.storyboard-episode/1",
  "id": "ep-001",
  "storyId": "story-night-mailbox",
  "number": 1,
  "title": "The Letter",
  "logline": "Lin tests a letter that predicts a preventable accident.",
  "runtimeSeconds": 90,
  "groupLabel": "EP001 · The Letter",
  "scriptPath": "Storyboards/night-mailbox/episodes/ep-001-the-letter/script.md",
  "continuity": {
    "enters": ["char-001"],
    "exits": [],
    "locks": ["prop-001 remains sealed through shot 004"]
  },
  "segments": [
    {
      "id": "segment-001",
      "number": 1,
      "title": "The address changes",
      "sceneSetting": "Night sorting room under one flickering fluorescent tube",
      "locationAssetId": "loc-001",
      "durationSeconds": 7,
      "status": "planned",
      "shotIds": [
        "ep-001-shot-001"
      ],
      "assetRefs": [
        "char-001",
        "loc-001",
        "prop-001"
      ],
      "outputs": {
        "keyframe": {
          "status": "planned"
        },
        "video": {
          "status": "planned"
        },
        "audio": {
          "status": "planned"
        }
      }
    }
  ],
  "shots": [
    {
      "id": "ep-001-shot-001",
      "number": 1,
      "segmentId": "segment-001",
      "title": "The impossible address",
      "cardPath": "Storyboards/night-mailbox/episodes/ep-001-the-letter/shots/shot-001-impossible-address.md",
      "durationSeconds": 7,
      "framing": "ECU",
      "angle": "top-down",
      "cameraMovement": "slow push-in",
      "subject": "a rain-soaked envelope",
      "action": "the ink rewrites itself",
      "performance": "Lin freezes before touching it",
      "dialogue": "",
      "audio": "rain, paper fibers, distant bicycle bell",
      "locationId": "loc-001",
      "characterIds": ["char-001"],
      "assetRefs": ["prop-001"],
      "continuityLocks": ["envelope seal intact"],
      "imagePrompt": "Top-down macro frame of a wet red envelope...",
      "videoPrompt": "Seven-second slow push-in; ink reforms once...",
      "status": "planned"
    }
  ]
}
```

## Segment and output contract

Treat the hierarchy as story → episode → segment → shot:

- Require at least one segment per episode and exactly one to three `shotIds` per
  segment. Every episode shot id must occur once across all segment `shotIds`;
  reject missing, duplicate, or cross-episode shot ids.
- Make `sceneSetting`, `locationAssetId`, `durationSeconds`, `status`, `shotIds`,
  `assetRefs`, and all three `outputs` entries explicit. The location and every
  asset reference must exist in the root manifest. Use a positive finite segment
  duration.
- Allow segment status values `draft`, `planned`, `queued`, `running`,
  `generating`, `ready`, `failed`, or `missing-media`.
- For each of `keyframe`, `video`, and `audio`, use one output object whose status
  is `planned`, `queued`, `running`, `ready`, `failed`, or `missing-media`.
  Omit `path` unless the status is `ready`.
- Save a ready keyframe below the owning episode's `outputs/images/`, ready video
  below `outputs/video/`, and ready audio below `outputs/audio/`. Use a
  Project-root-relative POSIX path and verify the target is a regular,
  non-symlinked file before recording `ready`. Optional `mimeType` and
  `durationSeconds` describe a confirmed output; they never prove that bytes
  exist.

For example, a confirmed keyframe may replace the planned object with:

```json
{
  "status": "ready",
  "path": "Storyboards/night-mailbox/episodes/ep-001-the-letter/outputs/images/segment-001-keyframe.webp",
  "mimeType": "image/webp"
}
```

Every referenced asset id must exist in the root manifest. Every `cardPath` and
`scriptPath` must exist before the manifest is called valid. A shot card should
repeat its id, owning segment id, duration, framing, action, dialogue/audio, asset
references, continuity locks, and generation prompts in readable Markdown. If
`segmentId` is present on a shot, it must match the segment whose `shotIds` owns
that shot; segment membership remains authoritative.

## Supporting cards and continuity

Location and prop cards may use `convax.location-card/1` and
`convax.prop-card/1`. Include at least `schema`, `id`, `storyId`, `name`,
`description`, visual/reference direction, continuity locks, and `tags`.

In `bible/continuity.json`, store declared facts keyed by stable entity id and
episode/shot range. Distinguish hard locks from proposed choices. Never overwrite a
source fact with a generated alternative; record the conflict for review.

## Update rules

1. Read the root and referenced manifests before writing.
2. Reuse episode, segment, shot, and asset ids, paths, source snapshots, and group
   labels.
3. Preserve unknown fields that another compatible client may own.
4. Apply the narrowest update; do not regenerate unaffected episodes, segments,
   shots, or assets. When upgrading an older episode that has shots but no
   segments, preserve all shot ids and assign them once into new one-to-three-shot
   segments before calling the package valid.
5. Write child files before the root manifest so the root never points at missing
   intended files. Use an available atomic write/replace operation when provided.
6. Re-read every changed JSON file, then validate identity and references.
