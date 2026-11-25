/*
  chart.js — draws a line chart on a <canvas>, by hand.
  Used for both the e1RM chart and the bodyweight chart.

  A canvas is like graph paper: we draw at (x, y) positions where
  (0, 0) is the TOP-left corner and y grows DOWNWARD.

  points = [ { date: "2026-11-24", value: 262.5 }, ... ] (oldest first)
*/

function drawLineChart(canvas, points) {
  const width = canvas.clientWidth;   // size set by CSS
  const height = canvas.clientHeight;
  if (!width || points.length < 2) return;

  // On sharp (retina) screens, draw at higher resolution so it isn't blurry.
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d"); // the "pen"
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Room around the plot for the labels
  const pad = { top: 12, right: 12, bottom: 28, left: 44 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  // --- Value range (with 10% breathing room above and below)
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }  // flat line: avoid zero height
  const extra = (max - min) * 0.1;
  min -= extra;
  max += extra;

  // --- Date range (milliseconds), so points are spaced by real time
  const firstTime = parseDate(points[0].date).getTime();
  const lastTime = parseDate(points[points.length - 1].date).getTime();
  const span = lastTime - firstTime || 1;

  // Convert data into pixel positions
  const xFor = (date) => pad.left + ((parseDate(date).getTime() - firstTime) / span) * plotWidth;
  const yFor = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;

  // Read colors from style.css so the chart matches the theme
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim();
  const border = css.getPropertyValue("--border").trim();
  const muted = css.getPropertyValue("--muted").trim();

  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.lineWidth = 1;

  // --- Horizontal grid lines + value labels on the left
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const value = min + ((max - min) * i) / 3;
    const y = yFor(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    // Small ranges (like bodyweight) need a decimal, or labels repeat
    const label = max - min < 10 ? value.toFixed(1) : Math.round(value);
    ctx.fillText(label, pad.left - 8, y + 4);
  }

  // --- First and last date along the bottom
  ctx.textAlign = "left";
  ctx.fillText(formatShortDate(points[0].date), pad.left, height - 6);
  ctx.textAlign = "right";
  ctx.fillText(formatShortDate(points[points.length - 1].date), width - pad.right, height - 6);

  // --- Soft glow under the line (accent fading to transparent).
  // "#ff3b1f" + "40" = the same color at 25% opacity.
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
  gradient.addColorStop(0, accent + "40");
  gradient.addColorStop(1, accent + "00");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(xFor(points[0].date), pad.top + plotHeight);
  points.forEach((p) => ctx.lineTo(xFor(p.date), yFor(p.value)));
  ctx.lineTo(xFor(points[points.length - 1].date), pad.top + plotHeight);
  ctx.closePath();
  ctx.fill();

  // --- The line itself
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(xFor(p.date), yFor(p.value));
    else ctx.lineTo(xFor(p.date), yFor(p.value));
  });
  ctx.stroke();

  // --- A dot on each point; the latest one is bigger
  ctx.fillStyle = accent;
  points.forEach((p, i) => {
    const radius = i === points.length - 1 ? 5 : 3;
    ctx.beginPath();
    ctx.arc(xFor(p.date), yFor(p.value), radius, 0, Math.PI * 2);
    ctx.fill();
  });
}
