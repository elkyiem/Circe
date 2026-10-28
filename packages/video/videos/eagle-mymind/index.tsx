import {
  Camera,
  Caption,
  defineVideo,
  ease,
  Fade,
  Frame,
  Lockup,
  mix,
  progress,
  WHOLE,
} from "@pond/video";
import { ALL_MEDIA, BRANDS, media } from "./data";
import { Detail } from "./detail";
import { Mymind } from "./mymind";
import { CUES, DURATION, end, start } from "./timeline";
import { ImportWindow } from "./window";

/** Stage-space crops the camera eases between. */
const CAMERA = [
  { at: 0, ...WHOLE, move: 1 },
  { at: CUES.plusClick - 50, x: 150, y: 248, width: 1000, move: 700 },
  { at: start("eagle") + 700, ...WHOLE, move: 900 },
];

function Composition({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.windowRise, 1150));
  const recede = ease.inOut(progress(t, start("detail"), 450));
  const hide = ease.inOut(progress(t, end("detail") - 450, 350));
  const away = Math.max(recede * 0.86, hide);
  const worldOpacity =
    (t < CUES.windowRise ? 0 : Math.min(1, rise * 3)) * (1 - away);
  const blur = recede * 10;
  const fades =
    worldOpacity * ease.inOut(progress(t, start("eagle") + 200, 500));

  return (
    <Frame>
      <Camera t={t} keys={CAMERA} opacity={worldOpacity}>
        <ImportWindow
          t={t}
          style={{
            transform: `translateY(${(1 - rise) * 700}px) scale(${mix(1, 0.96, recede)})`,
            filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
          }}
        />
      </Camera>
      <Fade edge="top" height={230} opacity={fades} />
      <Fade edge="bottom" opacity={fades} />
      <Detail t={t} />
      <Mymind t={t} />
      <Lockup t={t} enter={CUES.logo} />
      <Caption
        t={t}
        y={540}
        size={56}
        text="Pond now supports importing from [eagle] and [mymind]."
        brands={BRANDS}
        enter={start("hook") + 200}
        exit={CUES.windowRise - 420}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Folders, tags, ratings, and [Smart Folders] come with it."
        enter={start("eagle") + 600}
        exit={end("eagle") - 500}
      />
      <Caption
        t={t}
        y={170}
        size={54}
        text="Annotations, ratings, and palettes stay put."
        enter={start("detail") + 250}
        exit={end("detail") - 250}
      />
      <Caption
        t={t}
        y={170}
        size={54}
        text="[mymind] notes, tags, and dates come too."
        brands={BRANDS}
        enter={start("mymind") + 250}
        exit={end("mymind") - 450}
      />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: Eagle and mymind import",
  duration: DURATION,
  poster: 9300,
  media: [
    ...ALL_MEDIA.map(media),
    ...Object.values(BRANDS).map((brand) => brand.logo),
  ],
  Composition,
});
