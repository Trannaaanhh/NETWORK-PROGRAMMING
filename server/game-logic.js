function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = cx - x1, fy = cy - y1;
  const t = (fx * dx + fy * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const px = x1 + tt * dx, py = y1 + tt * dy;
  return dist(px, py, cx, cy) <= r;
}
function lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  function ccw(ax, ay, bx, by, cx, cy) { return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax); }
  return (ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4)) &&
         (ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4));
}
module.exports = { dist, lineCircleIntersect, lineLineIntersect };
