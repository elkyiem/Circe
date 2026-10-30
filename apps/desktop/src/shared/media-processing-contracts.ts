export interface MediaProcessingQueryInputs {
  "media.decodeAudio": {
    src: string;
    maxSamples: number;
    offsetSeconds?: number;
  };
}

export interface MediaProcessingQueryResults {
  "media.decodeAudio": { ok: true; audio: Float32Array; hasMore: boolean };
}
