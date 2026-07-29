// Build-time stub. jsPDF optionally imports html2canvas, canvg, and
// dompurify for its pdf.html() and SVG features. We only use addImage with
// canvas-rendered PNG data, and SPEC section 15 bans DOM rasterization
// libraries, so those optional imports resolve here and ship nothing.
export default {};
