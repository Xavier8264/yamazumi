import { renderStill } from './canvasRenderer';
import type { ChartState } from '../model/types';

// SPEC 12.2: PNG at 3x pixel ratio; PDF wraps the same image via jsPDF.
// Both go through renderStill, the single still-image code path. No DOM
// rasterization anywhere.

const PNG_PIXEL_RATIO = 3;

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPng(
  state: ChartState,
  viewport: { width: number; height: number },
  includeParking: boolean,
): Promise<void> {
  const canvas = document.createElement('canvas');
  renderStill(canvas, state, viewport, {
    pixelRatio: PNG_PIXEL_RATIO,
    includeParking,
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('PNG export failed');
  download(blob, 'yamazumi.png');
}

export async function exportPdf(
  state: ChartState,
  viewport: { width: number; height: number },
  includeParking: boolean,
): Promise<void> {
  const canvas = document.createElement('canvas');
  const size = renderStill(canvas, state, viewport, {
    pixelRatio: PNG_PIXEL_RATIO,
    includeParking,
  });
  // Dynamic import keeps jsPDF out of the initial editor chunk.
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: size.width >= size.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [size.width, size.height],
    hotfixes: ['px_scaling'],
  });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, size.width, size.height);
  pdf.save('yamazumi.pdf');
}
