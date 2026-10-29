import { z } from "zod";

const AnimationSchema = z.looseObject({ layers: z.array(z.json()) });

/** Both transports export the same portable animation envelope. */
export function parseLottieAnimation(source: Buffer) {
  let parsed: z.infer<ReturnType<typeof z.json>>;
  try {
    parsed = JSON.parse(source.toString("utf8"));
  } catch {
    throw new Error("This file does not contain valid JSON.");
  }
  const animation = AnimationSchema.safeParse(parsed);
  if (!animation.success)
    throw new Error("This JSON file is not a Lottie animation.");
  return animation.data;
}

export async function encodeDotLottie(
  animation: ReturnType<typeof parseLottieAnimation>,
): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const archive = new JSZip();
  archive.file(
    "manifest.json",
    JSON.stringify({
      version: "1.0",
      generator: "Pond",
      animations: [{ id: "animation", loop: true, speed: 1 }],
    }),
  );
  archive.file("animations/animation.json", JSON.stringify(animation));
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function createDotLottie(source: Buffer): Promise<Buffer> {
  return encodeDotLottie(parseLottieAnimation(source));
}
