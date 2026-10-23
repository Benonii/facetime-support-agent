# SupportCam image quality

The browser requests 1920×1080 at 15 fps, with a 6 Mbps video ceiling and
`maintain-resolution` degradation preference. Camera switching keeps these settings.
These are capture preferences, not a guarantee: hardware and network conditions can
still supply less detail. The browser logs actual width/height/fps in `[camera] capture`.
The LiveKit client stays pinned at 2.15.0; these options are supported by that version.

FrameGrabber preserves up to 1920 pixels on the longest edge and encodes JPEG at
quality 95, 4:4:4 chroma. The live agent returns that same frame at up to 1920 pixels,
quality 92, rather than the former 640-pixel preview. The optimistic local preview
also retains up to 1920 pixels. Images are not upscaled. Coordinates continue to
refer to the exact upright analyzed frame, preserving aspect ratio.

`[frames] captured` logs received dimensions, rotation, JPEG dimensions, byte size,
and quality without logging image contents. Use this alongside `[intelligence]`
model timings and `[visual] published_*` to distinguish a low-resolution input,
model failure, and successful publication. Larger images use more bandwidth and
may add inference latency; this change is aimed at legibility, not response speed.

Verification: a decoded 1920×1080 RTC fixture survived JPEG encoding and display
thumbnailing at full size in both landscape and portrait, with 4:4:4 chroma. Stale
frames still return null. Browser scripts parsed; TypeScript checked. The next
handheld call must confirm actual capture dimensions and text readability.

Last-call audit before this change: camera capture completed in 404–412 ms. All six
CLI model calls succeeded. First turn published needs_view in 23.7s; second published
guidance in 26.7s; both skipped search. The browser retained the second snapshot at
640×480 plus an instruction to lay the notebook flat and expose the torn binding.
This confirms intelligence and frontend delivery, not that the text was legible or
that the repair succeeded. Previous source-frame dimensions were not logged.
