import { useEffect, useRef } from "react";


export default function StreamChart({
  ringRef,
  height = 260,
  lineWidth = 1.25,
}: {
  ringRef: React.MutableRefObject<{ ring: Float32Array; rp: number }>;
  height?: number;
  lineWidth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;
    let running = true;

    const paint = () => {
      if (!running) return;
      const { ring, rp } = ringRef.current;
      const ringN = ring.length;

      // ensure width follows element CSS width (HiDPI aware)
      const cssW = cvs.clientWidth || 800;
      const cssH = height;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const needResize = cvs.width !== Math.floor(cssW * dpr) || cvs.height !== Math.floor(cssH * dpr);
      if (needResize) {
        cvs.width = Math.floor(cssW * dpr);
        cvs.height = Math.floor(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const w = cssW, h = cssH;

      // autoscale (like viewer.html)
      let vmin = Number.POSITIVE_INFINITY, vmax = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < ringN; i++) {
        const v = ring[i];
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
      if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmin === vmax) {
        vmin = -1; vmax = 1;
      }

      ctx.clearRect(0, 0, w, h);

      // midline
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // waveform
      ctx.strokeStyle = "#06f";
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const idx = (rp - 1 - Math.floor(x * (ringN / w)) + ringN * 10) % ringN;
        const v = ring[idx];
        const y = h - (v - vmin) * (h - 8) / (vmax - vmin) - 4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      rafRef.current = requestAnimationFrame(paint);
    };

    rafRef.current = requestAnimationFrame(paint);
    return () => {
      running = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [height, lineWidth, ringRef]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-800 bg-black/30">
      <canvas ref={canvasRef} style={{ width: "100%", height }} />
    </div>
  );
}
