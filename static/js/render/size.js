function size(n, b, defaultWidth = 60) {
  n.style.width = (b.display?.widthPercent ?? defaultWidth) + "%";
  n.style.maxWidth = "100%";
  n.style.marginLeft = b.display?.align === "left" ? "0" : "auto";
  n.style.marginRight = "auto";
}

export { size };
