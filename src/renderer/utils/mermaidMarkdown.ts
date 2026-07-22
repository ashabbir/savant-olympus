const MERMAID_START = /^\s*(?:graph\s+(?:TD|TB|BT|RL|LR)|flowchart\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i;

function isFlowchartLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return /^(?:%%|subgraph\b|end\b|direction\b|classDef\b|class\b|style\b|linkStyle\b|click\b)/i.test(trimmed)
    || /(?:-->|---|==>|-.->|--o|--x|<--|~~~)/.test(trimmed)
    || /^[A-Za-z0-9_.:-]+\s*(?:\[[\s\S]*\]|\([\s\S]*\)|\{[\s\S]*\}|>[^>]+\])\s*$/.test(trimmed);
}

/** Wraps bare Mermaid emitted by an LLM so ReactMarkdown can render it as a diagram. */
export function normalizeMermaidMarkdown(markdown: string) {
  if (/```\s*mermaid/i.test(markdown)) return markdown;
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => MERMAID_START.test(line));
  if (start < 0) return markdown;

  let end = start + 1;
  const flowchart = /^\s*(?:graph|flowchart)\b/i.test(lines[start]);
  while (end < lines.length) {
    const line = lines[end];
    if (flowchart && !isFlowchartLine(line)) break;
    if (!flowchart && line.trim() && /^[A-Z][^:;{}[\]()]+[.!?]?$/.test(line.trim())) break;
    end += 1;
  }
  while (end > start + 1 && !lines[end - 1].trim()) end -= 1;
  if (end <= start + 1) return markdown;

  return [
    ...lines.slice(0, start),
    "```mermaid",
    ...lines.slice(start, end),
    "```",
    ...lines.slice(end),
  ].join("\n");
}
