import {
  App,
  Caption,
  defineVideo,
  ease,
  Fade,
  Frame,
  Lockup,
  libraryPlaces,
  progress,
} from "@pond/video";
import { CUES, DURATION, end, start } from "./timeline";

function Composition({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.windowRise, 1150));
  const hide = ease.inOut(progress(t, end("app") - 450, 350));
  const opacity =
    (t < CUES.windowRise ? 0 : Math.min(1, rise * 3)) * (1 - hide);
  return (
    <Frame>
      <App.Window
        style={{
          opacity,
          visibility: opacity <= 0.002 ? "hidden" : undefined,
          transform: `translateY(${(1 - rise) * 700}px)`,
        }}
      >
        <App.Sidebar t={t} places={libraryPlaces(0, 0)} />
        <App.Panel />
      </App.Window>
      <Fade edge="top" height={230} opacity={opacity} />
      <Fade edge="bottom" opacity={opacity} />
      <Lockup t={t} enter={CUES.logo} />
      <Caption
        t={t}
        y={540}
        size={56}
        text="Pond now does [something new]."
        enter={start("hook") + 200}
        exit={CUES.windowRise - 420}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Say what you can do now."
        enter={start("app") + 600}
        exit={end("app") - 500}
      />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: starter",
  duration: DURATION,
  poster: 4500,
  media: [],
  Composition,
});
