# Video Timeline

Video Timeline is a static Convax Canvas Plugin. It appears on Canvas as a live
Composition video card rather than an expanded editor. Create an empty
Composition from the Plugin catalog, or choose **Create Video Timeline** on one
managed Canvas video. Connect video and audio cards directly to the Composition
card to bind sources. Disconnecting a source keeps its edited Clips and marks
them offline.

The card keeps a compact multi-track overview visible below the monitor. It can
be clicked or dragged to scrub the Composition without opening the editor.
When a Canvas source lacks duration metadata, the initial one-second placeholder
is replaced automatically by the browser-detected media duration as soon as the
Composition card loads its metadata. Playback is not required.

Choose **Edit Timeline** on the card to open the dedicated fullscreen editing
tool. The card and editor use one preview controller, so playback, scrubbing,
track order, trim, fit, opacity, and gain changes are reflected by the
Composition monitor without creating a rendered file.

The Timeline Composition is stored only in the Plugin node's namespaced state.
Preview media is opened on demand through a short-lived host stream; source
paths and session URLs are never persisted. OTIO remains a pure exchange
adapter. Exporting the virtual Composition does not claim that a rendered video
asset already exists.
