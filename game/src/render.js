// render.js — everything the player sees in LANGIT NUSANTARA.
// One job: project the 3D world onto the 2D canvas and paint the HUD.
// Chase camera, terrain mesh, scenery, the Merpati-7 sprite, instruments.
'use strict';

const LNRender = (() => {
  const C = LN_CONFIG;
  const P = C.palette;
  const W = C.canvasWidth;
  const H = C.canvasHeight;
  const CX = W / 2;
  const CY = H / 2;

  // ---- Camera basis, rebuilt every frame. ----
  const cam = {
    pos: { x: 0, y: 0, z: 0 },
    f: { x: 0, y: 0, z: 1 },
    r: { x: 1, y: 0, z: 0 },
    u: { x: 0, y: 1, z: 0 },
    horizonY: CY,
  };

  function norm(v) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }

  function setupCamera(plane, look, distance, height) {
    const f = LNFlight.forwardVector(plane);
    cam.pos = {
      x: plane.x - f.x * distance,
      y: plane.y - f.y * distance + height,
      z: plane.z - f.z * distance,
    };
    if (cam.pos.y < 4) cam.pos.y = 4;
    const lookAt = {
      x: plane.x + f.x * 40,
      y: plane.y + f.y * 40 + 1.5,
      z: plane.z + f.z * 40,
    };
    // Free-look nudges the look direction, never the plane.
    const yaw = look.yaw || 0;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const lx = lookAt.x - cam.pos.x;
    const lz = lookAt.z - cam.pos.z;
    const rx = lx * cy - lz * sy;
    const rz = lx * sy + lz * cy;
    cam.f = norm({ x: rx, y: lookAt.y - cam.pos.y + (look.pitch || 0) * 30, z: rz });
    cam.r = norm(cross(cam.f, { x: 0, y: 1, z: 0 }));
    cam.u = cross(cam.r, cam.f);
    // Horizon: where the sea plane meets the sky, for this camera.
    const hz = projectPoint({ x: cam.pos.x + cam.f.x * 3000, y: 0, z: cam.pos.z + cam.f.z * 3000 });
    cam.horizonY = hz ? hz.y : CY - 40;
  }

  // Project a world point to screen space. Null when behind the camera.
  function projectPoint(p) {
    const vx = p.x - cam.pos.x;
    const vy = p.y - cam.pos.y;
    const vz = p.z - cam.pos.z;
    const d = vx * cam.f.x + vy * cam.f.y + vz * cam.f.z;
    if (d < 2) return null;
    const lat = vx * cam.r.x + vy * cam.r.y + vz * cam.r.z;
    const ver = vx * cam.u.x + vy * cam.u.y + vz * cam.u.z;
    const s = C.focalLength / d;
    return { x: CX + lat * s, y: CY - ver * s, d, s };
  }

  function groundColor(kind, h, slope) {
    let base;
    if (kind === 'sand') base = [242, 212, 146];
    else if (kind === 'rice') base = [143, 209, 79];
    else if (kind === 'forest') base = [46, 125, 50];
    else if (kind === 'rock') base = [125, 116, 104];
    else base = [79, 174, 74];
    // Slope shading: steeper faces read darker, valleys read warm.
    const sh = Math.max(0.72, Math.min(1.12, 1 - slope * 0.9 + (h > 60 ? -0.06 : 0.04)));
    return 'rgb(' + Math.round(base[0] * sh) + ',' + Math.round(base[1] * sh) + ',' + Math.round(base[2] * sh) + ')';
  }

  function drawSky(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.skyTop);
    g.addColorStop(0.45, P.skyMid);
    g.addColorStop(0.62, P.skyHorizon);
    g.addColorStop(1, '#9fd4f5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun, high and warm, fixed in the sky for a readable noon scene.
    const sx = W * 0.78;
    const sy = H * 0.16;
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sg.addColorStop(0, 'rgba(255,243,176,0.95)');
    sg.addColorStop(0.25, 'rgba(255,243,176,0.55)');
    sg.addColorStop(1, 'rgba(255,243,176,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 100, sy - 100, 200, 200);
    ctx.fillStyle = P.sun;
    ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
    // Horizon haze so the sea never meets the sky as a hard line.
    ctx.fillStyle = 'rgba(207,233,255,0.55)';
    ctx.fillRect(0, cam.horizonY - 14, W, 26);
  }

  function drawSea(ctx) {
    const g = ctx.createLinearGradient(0, cam.horizonY, 0, H);
    g.addColorStop(0, P.seaShallow);
    g.addColorStop(1, P.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, cam.horizonY, W, H - cam.horizonY);
    // Sun glitter: a bright lane under the sun.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const laneX = W * 0.78;
    ctx.beginPath();
    ctx.moveTo(laneX - 30, cam.horizonY);
    ctx.lineTo(laneX + 30, cam.horizonY);
    ctx.lineTo(laneX + 130, H);
    ctx.lineTo(laneX - 130, H);
    ctx.closePath(); ctx.fill();
  }

  // Terrain mesh in camera space: rows far -> near, painter's order.
  function drawTerrain(ctx) {
    const step = C.meshStep;
    const half = C.meshLateral;
    const rows = Math.floor(C.drawDistance / step);
    let prev = null;
    for (let ri = rows; ri >= 0; ri--) {
      const d = ri * step + 30;
      const row = [];
      for (let li = -half; li <= half; li += step) {
        const wx = cam.pos.x + cam.f.x * d + cam.r.x * li;
        const wz = cam.pos.z + cam.f.z * d + cam.r.z * li;
        const h = LNWorld.terrainHeight(wx, wz);
        const p = projectPoint({ x: wx, y: Math.max(h, 0.4), z: wz });
        row.push({ p, h, wx, wz });
      }
      if (prev) {
        for (let i = 0; i < row.length - 1; i++) {
          const a = prev[i]; const b = prev[i + 1];
          const c = row[i + 1]; const e = row[i];
          if (!a.p || !b.p || !c.p || !e.p) continue;
          if (Math.max(a.h, b.h, c.h, e.h) < 0.6) continue; // open water
          const slope = Math.abs(a.h - c.h) / step;
          const kind = LNWorld.groundKind((a.wx + c.wx) / 2, (a.wz + c.wz) / 2);
          const avgH = (a.h + b.h + c.h + e.h) / 4;
          ctx.fillStyle = groundColor(kind, avgH, slope);
          ctx.beginPath();
          ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y);
          ctx.lineTo(c.p.x, c.p.y); ctx.lineTo(e.p.x, e.p.y);
          ctx.closePath(); ctx.fill();
        }
      }
      prev = row;
    }
  }

  function drawRunway(ctx, rw, t) {
    const hd = rw.heading;
    const fx = Math.sin(hd); const fz = Math.cos(hd);
    const rx = Math.cos(hd); const rz = -Math.sin(hd);
    const L = rw.length / 2; const Wd = rw.width / 2;
    const corner = (a, b) => ({
      x: rw.x + fx * a + rx * b, y: rw.elevation + 0.6, z: rw.z + fz * a + rz * b,
    });
    const p1 = projectPoint(corner(-L, -Wd));
    const p2 = projectPoint(corner(L, -Wd));
    const p3 = projectPoint(corner(L, Wd));
    const p4 = projectPoint(corner(-L, Wd));
    if (!p1 || !p2 || !p3 || !p4) return;
    ctx.fillStyle = P.runway;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath(); ctx.fill();
    // Centreline dashes.
    ctx.strokeStyle = P.runwayLine;
    ctx.lineWidth = Math.max(1.5, p1.s * 0.9);
    ctx.setLineDash([Math.max(6, p1.s * 6), Math.max(6, p1.s * 6)]);
    const c1 = projectPoint(corner(-L + 12, 0));
    const c2 = projectPoint(corner(L - 12, 0));
    if (c1 && c2) {
      ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Threshold bars at both ends.
    ctx.fillStyle = '#ffffff';
    for (const end of [-1, 1]) {
      const t1 = projectPoint(corner(end * (L - 8), -Wd * 0.6));
      const t2 = projectPoint(corner(end * (L - 8), Wd * 0.6));
      if (t1 && t2) {
        ctx.fillRect(Math.min(t1.x, t2.x), Math.min(t1.y, t2.y) - 2, Math.abs(t2.x - t1.x), 4);
      }
    }
    // Edge lights: warm dots, blinking gently so the strip reads "lit".
    const blink = 0.65 + 0.35 * Math.sin(t * 2.4);
    for (let i = 0; i <= 10; i++) {
      const a = -L + (2 * L * i) / 10;
      for (const side of [-1, 1]) {
        const lp = projectPoint(corner(a, side * (Wd + 3)));
        if (!lp) continue;
        ctx.fillStyle = 'rgba(255,214,64,' + blink.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(lp.x, lp.y, Math.max(1.5, lp.s * 1.6), 0, Math.PI * 2); ctx.fill();
      }
    }
    // Runway name board, floating just past the threshold. Capped in
    // size and hidden on short final, so it never swallows the runway.
    const nb = projectPoint({ x: rw.x - fx * (L + 40), y: rw.elevation + 16, z: rw.z - fz * (L + 40) });
    if (nb && nb.d < 900 && nb.d > 240) {
      ctx.font = 'bold ' + Math.max(11, Math.min(20, Math.round(nb.s * 11))) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,24,48,0.7)';
      const tw = ctx.measureText(rw.name).width + 16;
      ctx.fillRect(nb.x - tw / 2, nb.y - 14, tw, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(rw.name, nb.x, nb.y + 3);
    }
  }

  function drawRing(ctx, ring, active, t) {
    const c = projectPoint(ring);
    if (!c) return;
    const r = C.ringRadius * c.s;
    if (r < 2) return;
    const pulse = active ? 1 + 0.06 * Math.sin(t * 5) : 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(pulse, pulse);
    // Glow halo, then the gold torus, then the dark inner edge.
    ctx.strokeStyle = 'rgba(255,223,107,0.35)';
    ctx.lineWidth = r * 0.34;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = active ? P.ringGold : '#c9a227';
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,72,0,0.8)';
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2); ctx.stroke();
    // Beacon on top.
    ctx.fillStyle = active ? '#ffffff' : '#ffe9a8';
    ctx.beginPath(); ctx.arc(0, -r, Math.max(2, r * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCloud(ctx, cl, t) {
    const p = projectPoint(cl);
    if (!p || p.d > 3200) return;
    const s = cl.s * p.s * 0.9;
    if (s < 4) return;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < cl.puffs; i++) {
      const ox = Math.sin(cl.seed + i * 2.1) * s * 0.55;
      const oy = Math.cos(cl.seed + i * 1.7) * s * 0.18;
      const r = s * (0.32 + 0.1 * Math.sin(cl.seed + i));
      ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBird(ctx, b, t) {
    const bx = b.x + Math.sin(t * b.speed + b.phase) * 60;
    const bz = b.z + Math.cos(t * b.speed * 0.7 + b.phase) * 60;
    const p = projectPoint({ x: bx, y: b.y + Math.sin(t * 1.3 + b.phase) * 6, z: bz });
    if (!p || p.d > 900) return;
    const s = Math.max(2, b.size * p.s * 0.6);
    const flap = Math.sin(t * 7 + b.phase) * s * 0.5;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - flap);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + s, p.y - flap);
    ctx.stroke();
  }

  function drawShip(ctx, sh, t) {
    const p = projectPoint({ x: sh.x, y: 1, z: sh.z });
    if (!p || p.d > 1400) return;
    const s = sh.size * p.s;
    if (s < 3) return;
    const hx = Math.cos(sh.heading); const hz = -Math.sin(sh.heading);
    // Wake: a pale V trailing behind.
    const w1 = projectPoint({ x: sh.x - hx * s * 1.6, y: 0.6, z: sh.z - hz * s * 1.6 });
    if (w1) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(w1.x - s * 0.4, w1.y + s * 0.2);
      ctx.lineTo(w1.x + s * 0.4, w1.y + s * 0.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = sh.ferry ? '#e4572e' : '#334155';
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.5, p.y);
    ctx.lineTo(p.x + s * 0.5, p.y);
    ctx.lineTo(p.x + s * 0.35, p.y - s * 0.35);
    ctx.lineTo(p.x - s * 0.35, p.y - s * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - s * 0.2, p.y - s * 0.6, s * 0.4, s * 0.28);
  }

  function drawTree(ctx, tr) {
    const p = projectPoint({ x: tr.x, y: tr.h, z: tr.z });
    if (!p || p.d > 1000) return;
    const s = tr.s * p.s;
    if (s < 2) return;
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - s * 0.5); ctx.stroke();
    ctx.fillStyle = tr.shade > 0.5 ? '#2e7d32' : '#43a047';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 1.5);
    ctx.lineTo(p.x - s * 0.55, p.y - s * 0.45);
    ctx.lineTo(p.x + s * 0.55, p.y - s * 0.45);
    ctx.closePath(); ctx.fill();
  }

  function drawHouse(ctx, ho) {
    const p = projectPoint({ x: ho.x, y: ho.h, z: ho.z });
    if (!p || p.d > 1100) return;
    const s = ho.w * p.s;
    if (s < 2.5) return;
    ctx.fillStyle = P.townWall;
    ctx.fillRect(p.x - s / 2, p.y - s * 0.55, s, s * 0.55);
    ctx.fillStyle = ho.roof > 0.5 ? P.townRoof : '#2e86ab';
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.6, p.y - s * 0.55);
    ctx.lineTo(p.x, p.y - s * 0.95);
    ctx.lineTo(p.x + s * 0.6, p.y - s * 0.55);
    ctx.closePath(); ctx.fill();
  }

  function drawSmoke(ctx, t) {
    const v = LNWorld.volcano;
    if (!v) return;
    for (const sm of LNWorld.smoke) {
      const rise = ((t * 0.03 + sm.t) % 1);
      const y = v.h + rise * 160;
      const p = projectPoint({ x: v.x + sm.drift + rise * 30, y, z: v.z });
      if (!p || p.d > 2400) continue;
      const s = sm.s * (0.6 + rise) * p.s;
      ctx.fillStyle = 'rgba(90,85,80,' + (0.55 * (1 - rise)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, s), 0, Math.PI * 2); ctx.fill();
    }
    // Lava glow at the crater.
    const lp = projectPoint({ x: v.x, y: v.h + 2, z: v.z });
    if (lp && lp.d < 2400) {
      ctx.fillStyle = 'rgba(255,107,26,0.85)';
      ctx.beginPath(); ctx.arc(lp.x, lp.y, Math.max(2, 14 * lp.s), 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- The Merpati-7, drawn in screen space, banked by its roll. ----
  function drawPlane(ctx, plane, t) {
    const px = CX;
    const py = CY + 88 - plane.pitch * 90;
    const bank = plane.roll;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank * 0.9);
    const S = 1.05; // sprite scale
    ctx.scale(S, S);
    // Shadow on the ground far below, when low: a soft ellipse that
    // tells the pilot how high they really are.
    // (Drawn in world space by the caller; here is the airframe.)
    // Wings: broad, slightly swept, orange tips.
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-14, 6); ctx.lineTo(-118, 26); ctx.lineTo(-122, 34); ctx.lineTo(-12, 16);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 6); ctx.lineTo(118, 26); ctx.lineTo(122, 34); ctx.lineTo(12, 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath(); ctx.moveTo(-118, 26); ctx.lineTo(-122, 34); ctx.lineTo(-104, 33); ctx.lineTo(-102, 27); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(118, 26); ctx.lineTo(122, 34); ctx.lineTo(104, 33); ctx.lineTo(102, 27); ctx.closePath(); ctx.fill();
    // Engines on the wings + spinning prop blur.
    for (const side of [-1, 1]) {
      const ex = side * 62;
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.ellipse(ex, 18, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      const blur = 0.35 + 0.25 * Math.sin(t * 40 + side);
      ctx.fillStyle = 'rgba(148,163,184,' + blur.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(ex, 18, 7, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(ex, 18, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Fuselage: nose at top (we look at the tail), tapered body.
    const fg = ctx.createLinearGradient(0, -58, 0, 42);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.6, '#e8f1fb');
    fg.addColorStop(1, '#c7d8ea');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.quadraticCurveTo(15, -40, 16, -8);
    ctx.quadraticCurveTo(16, 26, 10, 42);
    ctx.quadraticCurveTo(0, 48, -10, 42);
    ctx.quadraticCurveTo(-16, 26, -16, -8);
    ctx.quadraticCurveTo(-15, -40, 0, -62);
    ctx.closePath(); ctx.fill();
    // Orange cheatline + Merpati-7 titles.
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(-15, -18, 30, 5);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MERPATI-7', 0, -26);
    // Tail fin + stabilisers.
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(-4, 58); ctx.lineTo(4, 58); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.moveTo(-8, 44); ctx.lineTo(-46, 54); ctx.lineTo(-44, 60); ctx.lineTo(-6, 52); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, 44); ctx.lineTo(46, 54); ctx.lineTo(44, 60); ctx.lineTo(6, 52); ctx.closePath(); ctx.fill();
    // Nav lights: red left, green right, white strobe blinking.
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(-122, 30, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(122, 30, 3.5, 0, Math.PI * 2); ctx.fill();
    if (Math.sin(t * 6) > 0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 58, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGroundShadow(ctx, plane) {
    const ground = LNWorld.terrainHeight(plane.x, plane.z);
    const agl = plane.y - ground;
    if (agl > 260) return;
    const p = projectPoint({ x: plane.x, y: ground + 0.5, z: plane.z });
    if (!p) return;
    const alpha = Math.max(0.04, 0.30 - agl / 900);
    const s = Math.max(4, 90 * p.s * (1 - agl / 500));
    ctx.fillStyle = 'rgba(15,23,42,' + alpha.toFixed(2) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- HUD ----
  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = P.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function label(ctx, text, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px sans-serif';
    ctx.fillStyle = color || P.hudInk;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
  function bar(ctx, x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, frac))), h, 4); ctx.fill();
  }

  function drawCompass(ctx, headingDeg, t) {
    const cx = CX;
    const cy = 30;
    const w = 340;
    panel(ctx, cx - w / 2, cy - 16, w, 32);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, cy - 16, w, 32); ctx.clip();
    const pts = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    for (let d = 0; d < 360; d += 15) {
      let rel = ((d - headingDeg + 540) % 360) - 180;
      const x = cx + rel * 1.6;
      if (Math.abs(rel) > 105) continue;
      const major = d % 90 === 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, cy + 4); ctx.lineTo(x, cy + (major ? 12 : 9)); ctx.stroke();
      if (major) {
        const name = pts.find((p) => p[1] === d)[0];
        label(ctx, name, x, cy - 5, 13, '#ffffff', 'center');
      }
    }
    ctx.restore();
    ctx.fillStyle = P.hudAccent;
    ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx - 6, cy - 24); ctx.lineTo(cx + 6, cy - 24); ctx.closePath(); ctx.fill();
    label(ctx, String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, cy + 26, 12, '#ffffff', 'center');
  }

  function drawAttitude(ctx, plane, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-plane.roll);
    const off = plane.pitch * r * 1.6;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-r, -r + off, r * 2, r);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-r, off, r * 2, r);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-r, off - 1, r * 2, 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = P.hudAccent;
    ctx.beginPath(); ctx.moveTo(x - 5, y - r + 4); ctx.lineTo(x + 5, y - r + 4); ctx.lineTo(x, y - r + 11); ctx.closePath(); ctx.fill();
    // Fixed wings of the symbol.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - r + 6, y); ctx.lineTo(x - 12, y); ctx.moveTo(x + 12, y); ctx.lineTo(x + r - 6, y); ctx.stroke();
  }

  function drawHUD(ctx, plane, run, t) {
    const altFt = Math.round(LNFlight.altitudeFt(plane));
    const spdKt = Math.round(LNFlight.knots(plane));
    const hdg = Math.round(LNFlight.headingDeg(plane));
    const ground = LNWorld.terrainHeight(plane.x, plane.z);
    const aglFt = Math.round((plane.y - ground) * 3.28084);

    drawCompass(ctx, hdg, t);

    // Left: primary instruments.
    panel(ctx, 16, 56, 218, 148);
    label(ctx, 'ALT', 30, 76, 12, '#9ecbff');
    label(ctx, altFt.toLocaleString('en-US') + ' ft', 30, 98, 24, '#ffffff');
    label(ctx, 'AGL ' + aglFt.toLocaleString('en-US') + ' ft', 30, 120, 12, '#cbd5e1');
    label(ctx, 'SPD', 30, 146, 12, '#9ecbff');
    label(ctx, spdKt + ' kt', 30, 168, 24, '#ffffff');
    label(ctx, 'HDG ' + String(hdg).padStart(3, '0') + '°', 30, 190, 12, '#cbd5e1');

    // Attitude ball under the instruments.
    drawAttitude(ctx, plane, 125, 258, 46);
    label(ctx, 'ATTITUDE', 125, 316, 11, '#cbd5e1', 'center');

    // Right: score, fuel, damage, throttle.
    panel(ctx, W - 234, 56, 218, 148);
    label(ctx, 'SKOR', W - 220, 76, 12, '#9ecbff');
    label(ctx, run.score.toLocaleString('en-US'), W - 220, 98, 24, '#ffffff');
    if (run.combo > 1) label(ctx, 'COMBO x' + run.combo, W - 220, 120, 13, P.hudAccent);
    const mins = Math.floor(run.elapsed / 60);
    const secs = Math.floor(run.elapsed % 60);
    label(ctx, 'WAKTU ' + mins + ':' + String(secs).padStart(2, '0'), W - 220, 146, 12, '#cbd5e1');
    label(ctx, 'RING ' + run.ringsHit + '   MENDARAT ' + run.landings, W - 220, 168, 12, '#cbd5e1');
    label(ctx, 'THR ' + Math.round(plane.throttle * 100) + '%', W - 220, 190, 12, '#cbd5e1');

    panel(ctx, W - 234, 216, 218, 112);
    label(ctx, 'BAHAN BAKAR', W - 220, 234, 12, '#9ecbff');
    const fuelColor = plane.fuel > 40 ? P.hudGood : plane.fuel > 15 ? P.hudWarn : P.hudBad;
    bar(ctx, W - 220, 246, 190, 12, plane.fuel / 100, fuelColor);
    label(ctx, Math.round(plane.fuel) + '%', W - 220, 272, 12, fuelColor);
    label(ctx, 'KERUSAKAN', W - 220, 292, 12, '#9ecbff');
    const dmgColor = plane.damage < 30 ? P.hudGood : plane.damage < 70 ? P.hudWarn : P.hudBad;
    bar(ctx, W - 220, 304, 190, 12, plane.damage / 100, dmgColor);
    label(ctx, Math.round(plane.damage) + '%', W - 220, 322, 12, dmgColor);

    // Throttle bar, left edge.
    panel(ctx, 16, 340, 46, 190);
    label(ctx, 'THR', 39, 358, 11, '#9ecbff', 'center');
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(28, 372, 22, 140, 5); ctx.fill();
    ctx.fillStyle = '#38bdf8';
    const th = 140 * plane.throttle;
    ctx.beginPath(); ctx.roundRect(28, 372 + 140 - th, 22, th, 5); ctx.fill();
    label(ctx, Math.round(plane.throttle * 100) + '', 39, 524, 11, '#ffffff', 'center');

    // Objective banner, top centre under the compass. The panel is
    // wider than the text by a full margin on both sides.
    const obj = LNMissions.objectiveText(run);
    ctx.font = 'bold 15px sans-serif';
    const ow = ctx.measureText(obj).width + 56;
    panel(ctx, CX - ow / 2, 66, ow, 30);
    ctx.fillStyle = P.hudAccent;
    ctx.beginPath(); ctx.arc(CX - ow / 2 + 15, 81, 5, 0, Math.PI * 2); ctx.fill();
    label(ctx, obj, CX - ow / 2 + 28, 82, 15, '#ffffff');

    // Next-ring distance readout.
    const target = LNMissions.nextRingTarget(run);
    if (target) {
      const d = Math.hypot(plane.x - target.x, plane.y - target.y, plane.z - target.z);
      label(ctx, 'RING BERIKUTNYA  ' + Math.round(d) + ' m', CX, 112, 13, '#ffe9a8', 'center');
    } else if (run.status === 'flying') {
      const step = LNMissions.currentStep(run);
      if (step && step.type === 'land') {
        const rw = LNWorld.RUNWAYS[step.runway];
        const d = Math.hypot(plane.x - rw.x, plane.z - rw.z);
        label(ctx, 'LANDASAN ' + rw.name.toUpperCase() + '  ' + Math.round(d) + ' m', CX, 112, 13, '#ffe9a8', 'center');
      }
    }

    // Flash message, centre screen.
    if (run.message && run.messageTimer > 0) {
      ctx.font = 'bold 26px sans-serif';
      const mw = ctx.measureText(run.message).width + 36;
      panel(ctx, CX - mw / 2, H - 168, mw, 44);
      label(ctx, run.message, CX, H - 145, 20, '#ffffff', 'center');
    }

    // Speed streaks at high speed.
    if (plane.speed > 52 && run.status === 'flying') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const y = 120 + i * 62 + ((t * 300 + i * 97) % 62);
        ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(46, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W - 46, y); ctx.lineTo(W - 6, y); ctx.stroke();
      }
    }
  }

  function drawOverlay(ctx, plane, run, t, shotName) {
    if (run.status === 'briefing') {
      ctx.fillStyle = 'rgba(4,12,28,0.55)';
      ctx.fillRect(0, 0, W, H);
      panel(ctx, CX - 330, CY - 150, 660, 300);
      label(ctx, 'LANGIT NUSANTARA', CX, CY - 118, 34, P.hudAccent, 'center');
      label(ctx, 'Sky Courier — Merpati-7', CX, CY - 82, 18, '#ffffff', 'center');
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      const lines = [
        'Antar kargo antar pulau: lewati ring emas, mendarat di landasan tujuan.',
        'W / S — throttle   •   Panah Atas/Bawah — pitch   •   A / D — belok',
        'Q / E — rudder   •   F — flaps   •   B — rem   •   R — ulangi',
        'Jaga bahan bakar dan jangan hantam terrain — kerusakan 100% = hancur.',
      ];
      lines.forEach((ln, i) => ctx.fillText(ln, CX, CY - 44 + i * 26));
      const blink = Math.sin(t * 4) > -0.2;
      if (blink) label(ctx, 'TEKAN ENTER UNTUK TERBANG', CX, CY + 108, 18, P.hudAccent, 'center');
    } else if (run.status === 'complete') {
      ctx.fillStyle = 'rgba(4,12,28,0.45)';
      ctx.fillRect(0, 0, W, H);
      panel(ctx, CX - 300, CY - 140, 600, 280);
      label(ctx, 'SORTIE SELESAI!', CX, CY - 104, 32, P.hudAccent, 'center');
      label(ctx, 'Skor akhir  ' + run.score.toLocaleString('en-US'), CX, CY - 62, 22, '#ffffff', 'center');
      label(ctx, 'Ring ' + run.ringsHit + '   •   Mendarat ' + run.landings + '   •   Combo terbaik x' + run.bestCombo, CX, CY - 28, 15, '#e2e8f0', 'center');
      const mins = Math.floor(run.elapsed / 60);
      const secs = Math.floor(run.elapsed % 60);
      label(ctx, 'Waktu ' + mins + ':' + String(secs).padStart(2, '0') + '   •   Bahan bakar sisa ' + Math.round(plane.fuel) + '%', CX, CY + 2, 15, '#e2e8f0', 'center');
      label(ctx, 'Tekan R untuk terbang lagi', CX, CY + 52, 15, '#9ecbff', 'center');
    } else if (run.status === 'crashed') {
      ctx.fillStyle = 'rgba(40,4,4,0.5)';
      ctx.fillRect(0, 0, W, H);
      panel(ctx, CX - 300, CY - 90, 600, 180);
      label(ctx, 'PESAWAT HANCUR', CX, CY - 48, 32, P.hudBad, 'center');
      label(ctx, 'Kerusakan mencapai 100%. Kargo selamat, pilot selamat.', CX, CY - 8, 15, '#e2e8f0', 'center');
      label(ctx, 'Tekan R untuk terbang lagi', CX, CY + 32, 15, '#9ecbff', 'center');
    }
  }

  // Full frame. `t` is seconds since load (frozen in shot mode).
  function draw(ctx, plane, run, look, t, shotName) {
    const camDist = shotName === 'cockpit' ? 7.5 : 16;
    const camH = shotName === 'cockpit' ? 2.2 : 4.5;
    setupCamera(plane, look, camDist, camH);
    drawSky(ctx, t);
    drawSea(ctx);
    drawTerrain(ctx);
    drawGroundShadow(ctx, plane);

    // Scenery, far -> near.
    const items = [];
    for (const cl of LNWorld.clouds) items.push({ d: Math.hypot(cl.x - cam.pos.x, cl.z - cam.pos.z), f: () => drawCloud(ctx, cl, t) });
    for (const sh of LNWorld.ships) items.push({ d: Math.hypot(sh.x - cam.pos.x, sh.z - cam.pos.z), f: () => drawShip(ctx, sh, t) });
    for (const tr of LNWorld.trees) items.push({ d: Math.hypot(tr.x - cam.pos.x, tr.z - cam.pos.z), f: () => drawTree(ctx, tr) });
    for (const ho of LNWorld.houses) items.push({ d: Math.hypot(ho.x - cam.pos.x, ho.z - cam.pos.z), f: () => drawHouse(ctx, ho) });
    for (const b of LNWorld.birds) items.push({ d: Math.hypot(b.x - cam.pos.x, b.z - cam.pos.z), f: () => drawBird(ctx, b, t) });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.f();

    drawSmoke(ctx, t);
    for (const rw of LNWorld.RUNWAYS) drawRunway(ctx, rw, t);
    const step = LNMissions.currentStep(run);
    if (step && step.type === 'ring') {
      for (let i = 0; i < step.rings.length; i++) {
        drawRing(ctx, step.rings[i], i === run.ringIndex, t);
      }
    }
    drawPlane(ctx, plane, t);
    drawHUD(ctx, plane, run, t);
    drawOverlay(ctx, plane, run, t, shotName);
  }

  return { draw, projectPoint, setupCamera };
})();
