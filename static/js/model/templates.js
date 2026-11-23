export const templates = {
  geometry: {
    type: "geometry",
    version: 1,
    alt: "直角三角形 ABC，AB=4，AC=3",
    coordinateSystem: "screen",
    viewBox: [0, 0, 320, 260],
    display: { align: "center", widthPercent: 60 },
    points: {
      A: { x: 60, y: 200, label: "A", dx: -18, dy: 18 },
      B: { x: 260, y: 200, label: "B", dx: 8, dy: 18 },
      C: { x: 60, y: 50, label: "C", dx: -18, dy: -8 },
    },
    segments: [
      { id: "AB", from: "A", to: "B" },
      { id: "AC", from: "A", to: "C" },
      { id: "BC", from: "B", to: "C" },
    ],
    rightAngles: [{ vertex: "A", arms: ["B", "C"], size: 12 }],
    labels: [
      { x: 160, y: 225, text: "4" },
      { x: 35, y: 125, text: "3" },
    ],
    givens: [
      { type: "length", segment: "AB", value: 4 },
      { type: "length", segment: "AC", value: 3 },
    ],
    id: "q12_b2",
  },
  chart: {
    type: "chart",
    version: 1,
    chartType: "bar",
    alt: "四个阅读小组人数统计",
    display: { align: "center", widthPercent: 100 },
    categories: ["第一组", "第二组", "第三组", "第四组"],
    series: [{ id: "count", name: "人数", values: [6, 8, 5, 9] }],
    xAxis: { title: "小组" },
    yAxis: { title: "人数", unit: "人", min: 0 },
    id: "q10_b2",
  },
};
