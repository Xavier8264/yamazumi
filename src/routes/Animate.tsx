import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseCsv } from '../model/csv';
import type { ChartState } from '../model/types';
import {
  buildAnimation,
  categoryWarnings,
  renderAnimationFrame,
  summarizeMatch,
  summaryText,
} from '../render/interpolate';
import type { Animation, EasingName } from '../render/interpolate';
import { checkEncodeSupport, encodeMp4 } from '../video/encode';
import type { EncodeSupport } from '../video/encode';
import Button from '../components/Button';
import '../animate.css';

// SPEC 13: the transition animator. Lazy-loaded so nothing here (including
// mediabunny, loaded dynamically by the exporter) enters the editor bundle.

interface LoadedFile {
  name: string;
  state: ChartState;
}

const RESOLUTIONS = {
  '1920x1080': { width: 1920, height: 1080 },
  '3840x2160': { width: 3840, height: 2160 },
} as const;

type ResolutionKey = keyof typeof RESOLUTIONS;

function DropZone({
  label,
  file,
  onText,
}: {
  label: string;
  file: LoadedFile | null;
  onText: (text: string, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const readFile = (f: File | undefined) => {
    if (!f) return;
    void f.text().then((text) => onText(text, f.name));
  };

  return (
    <div
      className={'dropzone' + (over ? ' over' : '') + (file ? ' loaded' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        readFile(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <strong>{label}</strong>
      <span>{file ? file.name : 'Drop a CSV here or click to browse'}</span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          readFile(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

export default function Animate() {
  const [before, setBefore] = useState<LoadedFile | null>(null);
  const [after, setAfter] = useState<LoadedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(2500);
  const [easing, setEasing] = useState<EasingName>('easeInOutCubic');
  const [fps, setFps] = useState(60);
  const [resolution, setResolution] = useState<ResolutionKey>('1920x1080');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const loadSide = (side: 'before' | 'after') => (text: string, name: string) => {
    const result = parseCsv(text);
    if (!result.ok) {
      setParseError(name + ': ' + result.error);
      return;
    }
    setParseError(null);
    const loaded = { name, state: result.state };
    if (side === 'before') setBefore(loaded);
    else setAfter(loaded);
    setT(0);
    setPlaying(false);
  };

  const anim = useMemo(() => {
    if (!before || !after) return null;
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return null;
    return buildAnimation(before.state, after.state, RESOLUTIONS[resolution], measure);
  }, [before, after, resolution]);

  const summary = anim ? summarizeMatch(anim.setup.match) : null;
  const warnings =
    before && after ? categoryWarnings(before.state, after.state) : [];

  // Preview playback. This is UI-only; the exporter renders frames offline.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = prev + dt / durationMs;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);

  // The preview is the frame at half size, not the chosen resolution at some
  // fraction: resolution only changes pixel density, so previewing it would
  // show the same picture twice.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !anim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderAnimationFrame(ctx, anim, t, easing, canvas.width);
  }, [anim, t, easing]);

  return (
    <div className="animate">
      <div className="animate-top">
        <h1>Transition animator</h1>
        <Link to="/">Back to editor</Link>
      </div>

      <div className="dropzones">
        <DropZone label="Before" file={before} onText={loadSide('before')} />
        <DropZone label="After" file={after} onText={loadSide('after')} />
      </div>

      {parseError && <div className="banner error">{parseError}</div>}
      {warnings.map((w) => (
        <div key={w} className="banner warning">
          {w}
        </div>
      ))}

      <div className="animate-controls">
        <label className="field">
          <span>Duration (ms)</span>
          <input
            type="number"
            min={200}
            step={100}
            value={durationMs}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v) && v >= 200) setDurationMs(v);
            }}
          />
        </label>
        <label className="field">
          <span>Easing</span>
          <select
            value={easing}
            onChange={(e) => setEasing(e.currentTarget.value as EasingName)}
          >
            <option value="easeInOutCubic">easeInOutCubic</option>
            <option value="easeInOutQuad">easeInOutQuad</option>
            <option value="linear">linear</option>
          </select>
        </label>
        <label className="field">
          <span>FPS</span>
          <select value={fps} onChange={(e) => setFps(Number(e.currentTarget.value))}>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="field">
          <span>Resolution</span>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.currentTarget.value as ResolutionKey)}
          >
            <option value="1920x1080">1920 x 1080</option>
            <option value="3840x2160">3840 x 2160</option>
          </select>
        </label>
      </div>

      {summary && (
        <div className="match-summary">{summaryText(summary)}</div>
      )}

      {anim ? (
        <div className="preview-wrap">
          <canvas
            ref={previewRef}
            width={anim.frame.width / 2}
            height={anim.frame.height / 2}
            className="preview-canvas"
          />
          <div className="player-row">
            <Button
              size="sm"
              onClick={() => {
                if (!playing && t >= 1) setT(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <input
              className="scrubber"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={t}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.currentTarget.value));
              }}
            />
            <ExportMp4Button anim={anim} durationMs={durationMs} fps={fps} easing={easing} />
          </div>
        </div>
      ) : (
        <p className="animate-hint">
          Load a before CSV and an after CSV to preview the transition.
        </p>
      )}
    </div>
  );
}

function ExportMp4Button({
  anim,
  durationMs,
  fps,
  easing,
}: {
  anim: Animation;
  durationMs: number;
  fps: number;
  easing: EasingName;
}) {
  const [support, setSupport] = useState<EncodeSupport | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { width, height } = anim.resolution;
  useEffect(() => {
    let alive = true;
    void checkEncodeSupport(width, height, fps).then((s) => {
      if (alive) setSupport(s);
    });
    return () => {
      alive = false;
    };
  }, [width, height, fps]);

  const run = async () => {
    setError(null);
    setProgress(0);
    try {
      // Offline render: one frame at a time into the encoder (SPEC 13.3).
      const buffer = await encodeMp4({
        width,
        height,
        fps,
        durationMs,
        draw: (ctx, t) => renderAnimationFrame(ctx, anim, t, easing),
        onProgress: (done, total) => setProgress(done / total),
      });
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yamazumi.mp4';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('MP4 export failed: ' + String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        disabled={!support || !support.supported || progress !== null}
        onClick={() => void run()}
      >
        {progress !== null
          ? 'Encoding ' + Math.round(progress * 100) + '%'
          : 'Export MP4'}
      </Button>
      {support && !support.supported && (
        <span className="export-unsupported">{support.reason}</span>
      )}
      {error && <span className="export-unsupported">{error}</span>}
    </>
  );
}
