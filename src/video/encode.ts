import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from 'mediabunny';

// SPEC 13.3: frames are rendered OFFLINE, one at a time, into a canvas that
// feeds the WebCodecs VideoEncoder (H.264, avc1.*) through Mediabunny's
// canvas source, muxed to MP4. No live capture, no MediaRecorder, no
// mp4-muxer, no ffmpeg.wasm.

export type DrawFrame = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  frameIndex: number,
) => void;

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  draw: DrawFrame;
  onProgress?: (framesDone: number, totalFrames: number) => void;
}

export interface EncodeSupport {
  supported: boolean;
  reason: string | null;
}

// High profile H.264: level 4.2 covers 1080p60, level 5.2 covers 2160p60.
function codecStringFor(width: number, height: number): string {
  return width * height > 1920 * 1088 ? 'avc1.640034' : 'avc1.64002A';
}

// SPEC 13.3: feature-detect with VideoEncoder.isConfigSupported() so the UI
// can disable the export button with an explanation instead of failing at
// click time.
export async function checkEncodeSupport(
  width: number,
  height: number,
  fps: number,
): Promise<EncodeSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      reason:
        'This browser has no WebCodecs VideoEncoder. MP4 export needs Chrome 94+, Edge 94+, Firefox 130+, or Safari 26+.',
    };
  }
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec: codecStringFor(width, height),
      width,
      height,
      framerate: fps,
      bitrate: 8_000_000,
    });
    if (result.supported === true) return { supported: true, reason: null };
    return {
      supported: false,
      reason:
        'This browser cannot encode H.264 at ' + width + 'x' + height + '@' + fps + '.',
    };
  } catch (err) {
    return { supported: false, reason: 'Encoder check failed: ' + String(err) };
  }
}

export function frameCount(durationMs: number, fps: number): number {
  return Math.max(1, Math.round((durationMs / 1000) * fps));
}

export async function encodeMp4(opts: EncodeOptions): Promise<ArrayBuffer> {
  const total = frameCount(opts.durationMs, opts.fps);
  const canvas = new OffscreenCanvas(opts.width, opts.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for encoding');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: opts.fps });
  await output.start();

  const frameSeconds = 1 / opts.fps;
  for (let i = 0; i < total; i++) {
    const t = total === 1 ? 1 : i / (total - 1);
    opts.draw(ctx, t, i);
    await source.add(i * frameSeconds, frameSeconds);
    opts.onProgress?.(i + 1, total);
  }
  await output.finalize();

  const buffer = target.buffer;
  if (!buffer) throw new Error('Muxing produced no buffer');
  return buffer;
}
