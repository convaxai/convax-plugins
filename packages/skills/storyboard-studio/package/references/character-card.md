# Character card contract

Create one card at
`Storyboards/<story-slug>/assets/characters/<character-id>/<character-id>.character.card.json`.
Use it as the single continuity source for later image, voice, performance, and
video work.

## Required document

```json
{
  "schema": "convax.character-card/1",
  "id": "char-001",
  "storyId": "story-night-mailbox",
  "name": "Lin",
  "role": "protagonist",
  "summary": "A precise courier who fears being responsible for another loss.",
  "personality": {
    "archetype": "reluctant guardian",
    "traits": ["observant", "dryly funny", "control-seeking"],
    "contradiction": "She solves strangers' crises but avoids intimacy.",
    "desire": "Prove every warning can be acted on.",
    "fear": "Choosing who deserves to be saved.",
    "secret": "She ignored a warning connected to her brother.",
    "moralLine": "Will not knowingly sacrifice an uninvolved person.",
    "speechPattern": "Short factual clauses; jokes only under pressure.",
    "gestures": ["aligns edges before deciding", "touches bicycle bell when lying"]
  },
  "visual": {
    "description": "Lean urban courier, weathered yellow rain shell, alert posture.",
    "agePresentation": "late twenties",
    "silhouette": "narrow shoulders under an oversized angular shell",
    "face": "oval face, straight brows, small scar under left eye",
    "hair": "black chin-length bob, wet strands tucked behind right ear",
    "wardrobe": ["yellow shell", "charcoal cargo trousers", "red courier strap"],
    "palette": ["#E5B72F", "#30353B", "#8C2633"],
    "imagePrompt": "Consistent full-body character reference...",
    "negativePrompt": "different scar placement, wardrobe color drift...",
    "referenceImages": [
      {
        "id": "char-001-image-001",
        "status": "planned",
        "description": "neutral turnaround on a gray background"
      }
    ]
  },
  "voice": {
    "description": "Low, dry alto with compressed emotion and clear consonants.",
    "language": "zh-CN",
    "timbre": "dry alto",
    "pitch": "low-mid",
    "pace": "measured, accelerates when cornered",
    "energy": "contained",
    "accent": "light northern Mandarin",
    "sampleText": "地址不会撒谎，写地址的人会。",
    "referenceAudio": [
      {
        "id": "char-001-audio-001",
        "status": "planned",
        "description": "neutral voice reference, 8–12 seconds"
      }
    ]
  },
  "performance": {
    "baseline": "still body, eyes scan before head moves",
    "underPressure": "speech accelerates while gestures become more precise",
    "emotionalRange": "guarded concern to decisive anger",
    "videoNotes": "Preserve small eye movements; avoid broad comedic reactions."
  },
  "continuity": {
    "locks": ["scar remains under left eye", "courier strap remains red"],
    "allowedVariations": ["shell may be open indoors"],
    "forbiddenChanges": ["eye color change", "scar mirrored", "strap removed"]
  },
  "relationships": [
    {
      "characterId": "char-002",
      "dynamic": "protective distrust",
      "publicState": "new client",
      "privateState": "suspects shared history"
    }
  ],
  "tags": ["courier", "lead", "rain"]
}
```

## Media reference states

Use `planned`, `running`, `ready`, or `failed`.

- A `planned` item contains an id and description; it may include a generation
  prompt but must not include a fictitious file path.
- A `running` item may include a provider job id only when it is safe to persist and
  useful for status checks. Do not persist credentials or signed URLs.
- A `ready` item must include a Project-root-relative `path` below the character's
  `images/` or `audio/` directory and may include non-secret provenance, duration,
  dimensions, or content digest.
- A `failed` item records a short non-secret failure reason and no nonexistent
  path.

Never mark a generated preview, temporary URL, or accepted asynchronous job as
`ready`. Poll accepted jobs with bounded status requests and no arbitrary overall
deadline; stop on explicit cancellation or a terminal state.

## Authoring checks

- Make traits observable in dialogue, decisions, posture, and gestures.
- Separate immutable recognition locks from wardrobe or mood variations.
- Write image direction for repeatable identity, not only aesthetic adjectives.
- Write voice direction in perceivable terms and include a consent-safe sample
  line. Do not request imitation of a real person's voice without authorization.
- Connect every relationship to another declared character id or flag it as an
  unresolved placeholder.
- Update the card before generating new media when a continuity choice changes.
