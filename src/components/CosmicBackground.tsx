import { useEffect, useRef } from "react";

/** Animated universe: 3D star warp, drifting nebulae, aurora sky and a perspective ocean with reflections. */
export function CosmicBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr; };
    resize(); addEventListener("resize", resize);
    const stars = Array.from({ length: 700 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), hue: 190 + Math.random() * 90 }));
    const draw = (t: number) => {
      const horizon = h * 0.68;
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#02030d"); sky.addColorStop(0.55, "#0a0f2e"); sky.addColorStop(1, "#1b2a5c");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
      // nebulae
      ctx.globalCompositeOperation = "lighter";
      [[0.25, 0.25, 280, "120,60,255"], [0.75, 0.2, 320, "0,180,255"], [0.55, 0.45, 260, "255,80,180"]].forEach(([fx, fy, r, c], i) => {
        const x = (fx as number) * w + Math.sin(t / 9000 + i) * 60 * dpr, y = (fy as number) * h + Math.cos(t / 11000 + i) * 40 * dpr;
        const g = ctx.createRadialGradient(x, y, 0, x, y, (r as number) * dpr * 1.6);
        g.addColorStop(0, `rgba(${c},0.22)`); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, horizon);
      });
      // aurora ribbons
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12 * dpr) {
          const y = h * (0.2 + k * 0.07) + Math.sin(x / (240 * dpr) + t / 2500 + k) * 30 * dpr + Math.sin(x / (90 * dpr) + t / 1700) * 8 * dpr;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = `hsla(${150 + k * 40},90%,60%,0.10)`; ctx.lineWidth = 40 * dpr; ctx.stroke();
      }
      // 3D star warp
      const cx = w / 2, cy = horizon * 0.5;
      for (const s of stars) {
        if (!reduce) { s.z -= 0.0009; if (s.z <= 0.01) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; } }
        const px = cx + (s.x / s.z) * w * 0.35, py = cy + (s.y / s.z) * h * 0.35;
        if (py > horizon || px < 0 || px > w || py < 0) continue;
        const size = (1 - s.z) * 2.4 * dpr;
        ctx.fillStyle = `hsla(${s.hue},100%,${70 + (1 - s.z) * 30}%,${1 - s.z})`;
        ctx.beginPath(); ctx.arc(px, py, size, 0, 6.283); ctx.fill();
      }
      // planet with glow
      const plx = w * 0.82, ply = horizon * 0.62, plr = 70 * dpr;
      const halo = ctx.createRadialGradient(plx, ply, plr, plx, ply, plr * 2.6);
      halo.addColorStop(0, "rgba(255,190,90,0.35)"); halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo; ctx.fillRect(plx - plr * 3, ply - plr * 3, plr * 6, plr * 6);
      ctx.globalCompositeOperation = "source-over";
      const pg = ctx.createRadialGradient(plx - plr * 0.4, ply - plr * 0.4, plr * 0.1, plx, ply, plr);
      pg.addColorStop(0, "#ffe2a8"); pg.addColorStop(0.6, "#d9822b"); pg.addColorStop(1, "#3a1a08");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(plx, ply, plr, 0, 6.283); ctx.fill();
      // ocean
      const sea = ctx.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, "#14306b"); sea.addColorStop(0.4, "#071a3d"); sea.addColorStop(1, "#01040f");
      ctx.fillStyle = sea; ctx.fillRect(0, horizon, w, h - horizon);
      ctx.globalCompositeOperation = "lighter";
      for (let row = 0; row < 38; row++) {
        const p = row / 38, y = horizon + Math.pow(p, 1.8) * (h - horizon);
        const amp = (2 + p * 14) * dpr;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 10 * dpr) {
          const yy = y + Math.sin(x / ((60 + p * 200) * dpr) + t / (900 - p * 400) + row) * amp;
          x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
        }
        ctx.strokeStyle = `rgba(110,190,255,${0.05 + p * 0.06})`; ctx.lineWidth = (0.6 + p * 1.6) * dpr; ctx.stroke();
      }
      // planet reflection shimmer
      for (let i = 0; i < 26; i++) {
        const y = horizon + i * 9 * dpr + 4 * dpr, len = (60 - i * 1.6) * dpr * (0.6 + 0.4 * Math.sin(t / 300 + i));
        ctx.fillStyle = `rgba(255,180,90,${0.25 - i * 0.008})`;
        ctx.fillRect(plx - len / 2 + Math.sin(t / 500 + i) * 8 * dpr, y, len, 2 * dpr);
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
