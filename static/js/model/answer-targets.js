const key = (t) => (t.target === "question" ? "@question" : t.targetId);
function targets(q) {
  const result = [];
  function visit(nodes, prefix = "") {
    for (const b of nodes) {
      if (b.type === "options")
        result.push({
          target: "block",
          targetId: b.id,
          type: "choice",
          label: prefix + "选择题",
          mode: b.mode,
          options: b.children,
        });
      else if (b.type === "blank")
        result.push({
          target: "block",
          targetId: b.id,
          type: "fill",
          label: prefix,
        });
      else if (b.type === "subquestions")
        b.children.forEach((s, i) => {
          const before = result.length;
          visit(s.children || [], prefix + `（${i + 1}）`);
          if (before === result.length)
            result.push({
              target: "block",
              targetId: s.id,
              type: "solution",
              label: prefix + `（${i + 1}）解答`,
            });
        });
      else visit(b.children || [], prefix);
    }
  }
  visit(q.blocks);
  if (!result.length)
    result.push({ target: "question", type: "solution", label: "整题解答" });
  const counts = {};
  for (const t of result)
    if (t.type === "fill") {
      const p = t.label;
      counts[p] = (counts[p] || 0) + 1;
      t.label = p + `第${counts[p]}空`;
    }
  return result;
}

export { key, targets };
