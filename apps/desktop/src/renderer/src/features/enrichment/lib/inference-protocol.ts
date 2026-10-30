import type { FlorenceTask } from "./inference-core";

export interface SerializedImage {
  data: ArrayBuffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}

export interface SerializedVideoFrame {
  image: SerializedImage;
  timestamp: number;
}

export type InferenceRequest =
  | { id: number; op: "dispose" }
  | {
      id: number;
      op: "florence";
      image: SerializedImage;
      task: FlorenceTask;
    }
  | { id: number; op: "clipImage"; image: SerializedImage }
  | {
      id: number;
      op: "clipAesthetic";
      image: SerializedImage;
      labels: string[];
    }
  | {
      id: number;
      op: "sensitiveContent";
      images: SerializedImage[];
    }
  | { id: number; op: "embedText"; text: string }
  | { id: number; op: "embedTexts"; texts: string[] }
  | { id: number; op: "embedAudio"; audio: Float32Array }
  | {
      id: number;
      op: "embedVideoFrames";
      frames: SerializedVideoFrame[];
      duration: number;
    }
  | { id: number; op: "transcribe"; audio: Float32Array };

export type InferenceResult =
  | string
  | number[]
  | Float32Array
  | Float32Array[]
  | string[];

export type InferenceResponse =
  | { id: number; ok: true; result: InferenceResult }
  | { id: number; ok: false; error: string };
