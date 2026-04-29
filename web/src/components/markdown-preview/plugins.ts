import type { HastNode, MdastNode } from "./types";

/* eslint-disable no-param-reassign -- AST transformers mutate nodes by design */

export const remarkSoftBreaks = () => {
  return (tree: MdastNode) => {
    const walk = (node: MdastNode) => {
      if (!node.children) return;
      const next: MdastNode[] = [];
      for (const child of node.children) {
        if (child.type === "code" || child.type === "inlineCode") {
          next.push(child);
          continue;
        }
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
          const parts = child.value.split("\n");
          for (let i = 0; i < parts.length; i += 1) {
            const value = parts[i];
            if (value) next.push({ ...child, value });
            if (i < parts.length - 1) next.push({ type: "break" });
          }
          continue;
        }
        walk(child);
        next.push(child);
      }
      node.children = next;
    };
    walk(tree);
  };
};

export const rehypeCodeMeta = () => (tree: HastNode) => {
  const walk = (node: HastNode) => {
    if (node.type === "element" && node.tagName === "code") {
      if (node.data?.meta) {
        node.properties = node.properties || {};
        node.properties.metastring = node.data.meta;
      }
    }
    if (node.children) {
      node.children.forEach(walk);
    }
  };
  walk(tree);
};
