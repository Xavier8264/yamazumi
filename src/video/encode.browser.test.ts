import { describe, expect, it } from 'vitest';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { checkEncodeSupport, encodeMp4, frameCount } from './encode';
import { buildAnimation, renderAnimationFrame } from '../render/interpolate';
import type { Block, ChartState } from '../model/types';

function block(id: string, bay: string, minutes: number, category: string | null): Block {
  return { id, bay, process: 'P ' + id, minutes, category };
}

function chartState(blocks: Block[]): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2', 'Bay 3'],
    blocks,
    categories: [
      { name: 'VA', color: '#2E7D32' },
      { name: 'NVA', color: '#F9A825' },
    ],
    taktMinutes: 60,
    axisMaxMinutes: 120,
    axisIntervalMinutes: 30,
  };
}

// Walks top-level MP4 boxes; a structurally valid file tiles the buffer
// exactly with boxes.
function topLevelBoxes(bytes: Uint8Array): { types: string[]; clean: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    types.push(type);
    if (size === 1) size = Number(view.getBigUint64(offset + 8));
    if (size === 0) return { types, clean: offset + 8 <= bytes.length };
    if (size < 8) return { types, clean: false };
    offset += size;
  }
  return { types, clean: offset === bytes.length };
}

describe('MP4 encoding via VideoEncoder + Mediabunny', () => {
  it('feature detection reports support in headless Chromium', async () => {
    const support = await checkEncodeSupport(640, 360, 60);
    expect(support).toEqual({ supported: true, reason: null });
  });

  it('encodes 150 offline frames to a valid MP4 buffer', async () => {
    // 2500ms at 60fps = exactly 150 frames (SPEC 13.3's reference clip).
    expect(frameCount(2500, 60)).toBe(150);

    const before = chartState([
      block('a', 'Bay 1', 45, 'VA'),
      block('b', 'Bay 1', 30, 'NVA'),
      block('c', 'Bay 2', 20, 'VA'),
    ]);
    const after = chartState([
      block('a', 'Bay 2', 45, 'VA'),
      block('b', 'Bay 1', 55, 'NVA'),
      block('d', 'Bay 3', 25, null),
    ]);

    const measure = document.createElement('canvas').getContext('2d')!;
    const anim = buildAnimation(before, after, { width: 640, height: 360 }, measure);

    const progress: number[] = [];
    const buffer = await encodeMp4({
      width: 640,
      height: 360,
      fps: 60,
      durationMs: 2500,
      draw: (ctx, t) => renderAnimationFrame(ctx, anim, t, 'easeInOutCubic'),
      onProgress: (done) => progress.push(done),
    });

    // All 150 frames were drawn and submitted, one at a time, in order.
    expect(progress.length).toBe(150);
    expect(progress[0]).toBe(1);
    expect(progress[149]).toBe(150);

    // Structural validity: the buffer is tiled by top-level MP4 boxes and
    // carries the required ftyp, moov, and mdat.
    expect(buffer.byteLength).toBeGreaterThan(10_000);
    const bytes = new Uint8Array(buffer);
    const { types, clean } = topLevelBoxes(bytes);
    expect(clean).toBe(true);
    expect(types[0]).toBe('ftyp');
    expect(types).toContain('moov');
    expect(types).toContain('mdat');

    // Semantic validity: Mediabunny can demux it back: one H.264 video
    // track at the right dimensions with 150 packets and ~2.5s duration.
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(buffer) });
    const videoTrack = await input.getPrimaryVideoTrack();
    expect(videoTrack).not.toBeNull();
    expect(videoTrack!.codedWidth).toBe(640);
    expect(videoTrack!.codedHeight).toBe(360);
    expect(videoTrack!.codec).toBe('avc');
    const duration = await input.computeDuration();
    expect(duration).toBeCloseTo(2.5, 1);
    const stats = await videoTrack!.computePacketStats();
    expect(stats.packetCount).toBe(150);
  }, 120000);
});
