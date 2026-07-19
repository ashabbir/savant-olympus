import { ASTNode, ComplexityFile } from "../types";

export function computeAstComplexity(nodes: ASTNode[]): ComplexityFile[] {
  const TYPED = new Set(["function", "method", "class"]);
  const fnNodes = nodes.filter((n) => TYPED.has(n.node_type));

  const byFile: Record<string, ComplexityFile> = {};
  fnNodes.forEach((n) => {
    const key = `${n.repo}::${n.path}`;
    if (!byFile[key]) {
      byFile[key] = { repo: n.repo, path: n.path, functions: [], total_complexity: 0 };
    }
    byFile[key].functions.push({ ...n, child_count: 0, complexity: 1 });
  });

  Object.values(byFile).forEach((file) => {
    const fns = file.functions;
    fns.forEach((fn) => {
      fn.child_count = fns.filter(
        (g) => g !== fn && g.start_line > fn.start_line && g.end_line <= fn.end_line
      ).length;
      const span = fn.end_line - fn.start_line;
      const lineBonus = Math.ceil(Math.max(0, span - 10) / 15);
      fn.complexity = 1 + fn.child_count + lineBonus;
    });
    file.total_complexity = fns.reduce((s, f) => s + f.complexity, 0);
    file.functions.sort((a, b) => b.complexity - a.complexity);
  });

  return Object.values(byFile).sort((a, b) => b.total_complexity - a.total_complexity);
}

export function complexityColor(score: number) {
  if (score <= 5) return { fg: "#4ade80", bg: "rgba(74,222,128,0.12)", label: "Low" };
  if (score <= 10) return { fg: "#facc15", bg: "rgba(250,204,21,0.12)", label: "Moderate" };
  if (score <= 20) return { fg: "#fb923c", bg: "rgba(251,146,60,0.12)", label: "Risky" };
  return { fg: "#f87171", bg: "rgba(248,113,113,0.12)", label: "High" };
}
