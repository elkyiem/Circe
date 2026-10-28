# @pond/video

Pond's announcement videos, built as code. Each video lives in
`videos/<slug>/` and draws every frame as a pure function of time. The CLI
captures those frames in an offscreen Electron window, synthesizes the score,
and muxes a 1080p, 30fps MP4.

## Commands

Run these from the repo root:

```sh
pnpm video new <slug>                  # copy videos/starter into videos/<slug>
pnpm video dev <slug>                  # preview at /?t=<ms> or /?play
pnpm video stills <slug> 0,4100,9300   # frames plus 2x2 review sheets
pnpm video render <slug>               # the full cut
pnpm video music <slug>                # compose music.json into music.mp3
```

Everything lands in `out/<slug>/`. `render` writes `<slug>.mp4` and the poster
`<slug>.jpg`. It fails if the frame count is off, or if the first or last frame
isn't white.

## A video

`videos/<slug>/` holds:

- `index.tsx` exports `video = defineVideo({ title, duration, poster, media, Composition })`.
  `Composition` gets `t` in ms and returns one frame.
- `timeline.ts` names the scenes and cues. Keep times here so the composition
  and score agree.
- `score.py` builds the score with `audio/pond_score.py`. It's optional, and
  needs `numpy` and `scipy`.
- `music.json` is an optional ElevenLabs composition plan. `pnpm video music`
  turns it into `music.mp3`, reading `ELEVENLABS_API_KEY` from your shell or the
  repo's `.env.local`. `render` mixes the music under the score and ducks it
  while the score plays.
- `public/` holds images served from `/`. It's gitignored, since the media comes
  from a local library.

## The kit

Import from `@pond/video`:

- **Motion:** `ease`, `progress`, `mix`, `envelope`, `styled`, `keyed`, `scatter`.
- **Frame:** `Frame` is the white 1920×1080 canvas, with CSS transitions disabled.
- **Camera:** `Camera` eases between `keyed` stage crops.
- **Caption:** `Caption` sets one line of type. `[word]` makes a chip and
  `{word}` an accent chip. `brands` gives a chip an icon and color.
- **Lockup:** `Lockup` is the standard end card. Start it `LOCKUP_LENGTH`
  before the end, so it fades to white on the last frame.
- **App:** `App.Window`, `App.Sidebar`, `App.Panel`, `App.Grid`, and
  `App.Menu` rebuild Pond's window at its real size. Children use app
  coordinates. `NEW_ITEMS`, `IMPORT_ITEMS`, and `libraryPlaces` hold the real
  labels.
- **Pointer** and **Fade:** the macOS arrow, and a white wash over the top or
  bottom edge.

The score kit gives you `Score`, with `pads`, `arpeggio`, `drums`, `bass`, the
cue sounds (`pluck`, `click`, `pop`, `bell`, `air`, `tick`), `lockup` for the
end card, and `master`. Every noise source draws from one seeded generator, so
a render is repeatable.
