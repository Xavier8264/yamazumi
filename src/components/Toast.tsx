// Transient confirmation line, centred over the bottom of the window.
// Styling follows the design's toast: panel-2 fill, hairline border, float
// shadow.
export default function Toast({ text }: { text: string }) {
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
