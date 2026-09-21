type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: unknown;
};

/** Support only paired <u> tags; arbitrary HTML and attributes stay disabled. */
export function remarkUnderline() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children.forEach(visit);
      const children = node.children;
      for (let index = 0; index < children.length; index += 1) {
        if (children[index].type !== "html" || children[index].value !== "<u>")
          continue;
        const end = children.findIndex(
          (child, cursor) =>
            cursor > index && child.type === "html" && child.value === "</u>"
        );
        if (end < 0) continue;
        children.splice(index, end - index + 1, {
          type: "emphasis",
          data: { hName: "u" },
          children: children.slice(index + 1, end),
        });
      }
    };
    visit(tree);
  };
}
