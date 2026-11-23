import { size } from "./size.js";
function svgElement(tag, attrs = {}, text) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}
function chart(b) {
  const n = svgElement("svg", {
    viewBox: "0 0 720 420",
    role: "img",
    "aria-label": b.alt,
    class: "chart-diagram",
  });
  size(n, b);
  n.append(svgElement("title", {}, b.alt));
  const vals = b.series.flatMap((s) => s.values),
    lo = b.yAxis.min ?? Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const left = 75,
    top = 45,
    width = 600,
    height = 280,
    y = (v) => top + height - ((v - lo) / (hi - lo)) * height;
  const add = (tag, attrs, text) => n.append(svgElement(tag, attrs, text));
  for (let i = 0; i <= 5; i++) {
    const value = lo + ((hi - lo) * i) / 5,
      py = y(value);
    add("line", {
      x1: left,
      y1: py,
      x2: left + width,
      y2: py,
      stroke: "#e1e6de",
    });
    add(
      "text",
      { x: left - 12, y: py + 5, "text-anchor": "end", "font-size": 14 },
      Number(value.toPrecision(3)),
    );
  }
  add("line", {
    x1: left,
    y1: y(Math.max(lo, Math.min(hi, 0))),
    x2: left + width,
    y2: y(Math.max(lo, Math.min(hi, 0))),
    stroke: "#465d50",
  });
  const step = width / b.categories.length,
    colors = ["#477961", "#c79447", "#6187a9", "#9a6c89", "#789048"];
  b.categories.forEach((c, i) =>
    add(
      "text",
      {
        x: left + step * (i + 0.5),
        y: 350,
        "text-anchor": "middle",
        "font-size": 14,
      },
      c,
    ),
  );
  b.series.forEach((s, j) => {
    const color = colors[j % colors.length],
      pts = [];
    s.values.forEach((v, i) => {
      const x = left + step * (i + 0.5),
        py = y(v);
      pts.push([x, py]);
      if (b.chartType === "bar") {
        const bw = (step * 0.7) / b.series.length;
        add("rect", {
          x: left + step * i + step * 0.15 + bw * j,
          y: Math.min(y(0), py),
          width: bw * 0.9,
          height: Math.abs(y(0) - py),
          fill: color,
        });
      } else add("circle", { cx: x, cy: py, r: 4, fill: color });
    });
    if (b.chartType === "line")
      add("polyline", {
        points: pts.map((p) => p.join(",")).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 3,
      });
    add("rect", {
      x: 80 + j * 120,
      y: 390,
      width: 12,
      height: 12,
      fill: color,
    });
    add("text", { x: 98 + j * 120, y: 401, "font-size": 13 }, s.name);
  });
  add(
    "text",
    { x: 20, y: 22, "font-size": 15 },
    b.yAxis.title + (b.yAxis.unit ? " / " + b.yAxis.unit : ""),
  );
  add(
    "text",
    { x: 675, y: 375, "text-anchor": "end", "font-size": 14 },
    b.xAxis.title,
  );
  return n;
}

export { chart };
