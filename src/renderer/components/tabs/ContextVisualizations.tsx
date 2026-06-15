import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Folder, FileCode, CheckCircle, Database, AlertTriangle, Square, Trash, Zap, Clock, Info, ShieldAlert, FileText, ChevronRight, ChevronDown, Layers, HelpCircle } from "lucide-react";

export interface ASTNode {
  name: string;
  node_type: string;
  repo: string;
  path: string;
  start_line: number;
  end_line: number;
}

export interface ComplexityFunction extends ASTNode {
  child_count: number;
  complexity: number;
}

export interface ComplexityFile {
  repo: string;
  path: string;
  functions: ComplexityFunction[];
  total_complexity: number;
}

export interface CodeDoc {
  path: string;
  language: string;
  content: string;
}

export interface Finding {
  severity: "high" | "medium" | "low";
  category: "structural" | "security" | "modernization" | "style" | "dead_code";
  rule_id: string;
  path: string;
  line: number;
  title: string;
  detail: string;
}

export interface AnalysisResults {
  summary: {
    filesAnalyzed: number;
    totalFindings: number;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
  };
  findings: Finding[];
}

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

// ── HEURISTICS ENGINE ──
export function analyzeProjectSource(astNodes: ASTNode[], codeDocs: CodeDoc[]): AnalysisResults {
  const nodesByPath: Record<string, ASTNode[]> = {};
  astNodes.forEach((n) => {
    if (!n || !n.path) return;
    if (!nodesByPath[n.path]) nodesByPath[n.path] = [];
    nodesByPath[n.path].push(n);
  });

  const findings: Finding[] = [];
  const pushFinding = (f: Omit<Finding, "">) => {
    findings.push({
      severity: f.severity || "medium",
      category: f.category || "structural",
      rule_id: f.rule_id || "rule",
      path: f.path || "",
      line: f.line || 1,
      title: f.title || f.rule_id || "Finding",
      detail: f.detail || "",
    });
  };

  codeDocs.forEach((doc) => {
    const path = doc.path || "";
    const content = doc.content || "";
    const lines = content.split(/\r?\n/);
    const fileNodes = (nodesByPath[path] || []).slice().sort((a, b) => a.start_line - b.start_line);

    detectStructural(lines, fileNodes, path, pushFinding);
    detectSecurity(lines, path, pushFinding);
    detectModernization(lines, path, pushFinding);
    detectStyle(lines, fileNodes, path, pushFinding);
    detectDeadCode(lines, path, pushFinding);
  });

  const sevRank = { high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => {
    const ds = (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0);
    if (ds) return ds;
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.line - b.line;
  });

  const byCategory = { structural: 0, security: 0, modernization: 0, style: 0, dead_code: 0 };
  const bySeverity = { high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  });

  return {
    summary: {
      filesAnalyzed: codeDocs.length,
      totalFindings: findings.length,
      by_category: byCategory,
      by_severity: bySeverity,
    },
    findings,
  };
}

function detectStructural(lines: string[], fileNodes: ASTNode[], path: string, pushFinding: any) {
  let braceDepth = 0;
  let maxDepth = 0;
  let maxDepthLine = 1;
  const pyStack: number[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    const lineNo = idx + 1;
    const indent = line.match(/^\s*/)?.[0].length || 0;
    while (pyStack.length && indent <= pyStack[pyStack.length - 1]) pyStack.pop();
    const isControl = /^(if|elif|for|while|try|except|catch|switch)\b/.test(trimmed);
    if (isControl) {
      if (trimmed.endsWith(":")) pyStack.push(indent);
      const depth = pyStack.length + Math.max(0, braceDepth);
      if (depth > maxDepth) {
        maxDepth = depth;
        maxDepthLine = lineNo;
      }
    }
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    braceDepth = Math.max(0, braceDepth + opens - closes);
  });

  if (maxDepth > 4) {
    pushFinding({
      severity: "high",
      category: "structural",
      rule_id: "deep_nesting",
      path,
      line: maxDepthLine,
      title: "Deep control nesting",
      detail: `Detected nesting depth ${maxDepth} (threshold: 4).`,
    });
  }

  fileNodes.forEach((n) => {
    const span = Math.max(1, n.end_line - n.start_line + 1);
    const childCount = fileNodes.filter((c) => c !== n && c.start_line > n.start_line && c.end_line <= n.end_line).length;
    const isClass = n.node_type === "class";
    const spanThreshold = isClass ? 220 : 120;
    const childThreshold = isClass ? 12 : 8;
    if (span >= spanThreshold || childCount >= childThreshold) {
      pushFinding({
        severity: span >= spanThreshold * 1.5 ? "high" : "medium",
        category: "structural",
        rule_id: "large_block_bloat",
        path,
        line: n.start_line || 1,
        title: `${isClass ? "Large class" : "Large function"} bloat`,
        detail: `${n.name || n.node_type} spans ${span} lines with ${childCount} nested typed blocks.`,
      });
    }
  });

  lines.forEach((line, idx) => {
    const py = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/);
    const jsFn = line.match(/^\s*function\s+([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/);
    const jsArrow = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*=>/);
    const hit = py || jsFn || jsArrow;
    if (!hit) return;
    const params = (hit[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (params.length > 5) {
      pushFinding({
        severity: params.length > 8 ? "high" : "medium",
        category: "structural",
        rule_id: "parameter_overload",
        path,
        line: idx + 1,
        title: "Parameter overload",
        detail: `${hit[1] || "Function"} has ${params.length} parameters.`,
      });
    }
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/(if|for|while|try|catch)\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      pushFinding({ severity: "low", category: "structural", rule_id: "empty_block", path, line: i + 1, title: "Empty block", detail: "Control block has an empty body." });
    }
    if (/^(if|for|while|try|except)\b.*:\s*$/.test(line)) {
      const next = (lines[i + 1] || "").trim();
      if (next === "pass" || next === "") {
        pushFinding({ severity: "low", category: "structural", rule_id: "empty_block", path, line: i + 1, title: "Empty block", detail: "Python block appears empty/pass-only." });
      }
    }
  }
}

function detectSecurity(lines: string[], path: string, pushFinding: any) {
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    const lineNo = idx + 1;

    if (/\b(API[_-]?KEY|PASSWORD|SECRET|TOKEN)\b\s*[:=]\s*['"][^'"]{6,}['"]/i.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "hardcoded_secret", path, line: lineNo, title: "Hardcoded secret", detail: "Literal secret-like value assigned in source." });
    }
    if (/\b(eval|exec|os\.system)\s*\(/.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "insecure_call", path, line: lineNo, title: "Insecure function call", detail: "Use of eval/exec/os.system detected." });
    }
    if (/\b(execute|query)\s*\(/i.test(trimmed) && /(f["']|%|\.format\(|\+.*["'])/.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "sql_injection_pattern", path, line: lineNo, title: "Potential SQL injection pattern", detail: "Query call appears to use string interpolation/concatenation." });
    }
  });
}

function detectModernization(lines: string[], path: string, pushFinding: any) {
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/\b\w+\.append\(/.test(trimmed) && /\bpd\b|\bpandas\b|dataframe|df\./i.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "deprecated_append_api", path, line: idx + 1, title: "Deprecated append-style API usage", detail: "Consider replacing append-style flows with concat-style batching." });
    }
  });
}

function detectStyle(lines: string[], fileNodes: ASTNode[], path: string, pushFinding: any) {
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/);
    if (m && !/->\s*[^:]+:/.test(line)) {
      pushFinding({ severity: "low", category: "style", rule_id: "missing_return_type_hint", path, line: idx + 1, title: "Missing return type hint", detail: `${m[1]} has no return type annotation.` });
    }
  });
}

function detectDeadCode(lines: string[], path: string, pushFinding: any) {
  for (let i = 0; i < lines.length - 1; i++) {
    const curr = lines[i].trim();
    if (!/^(return|break|raise|throw)\b/.test(curr)) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const next = lines[j].trim();
      if (!next || next.startsWith("#") || next.startsWith("//") || next === "}") continue;
      pushFinding({ severity: "medium", category: "dead_code", rule_id: "unreachable_code", path, line: j + 1, title: "Potential unreachable code", detail: "Code appears after an early exit statement in the same block." });
      break;
    }
  }
}

// Helper to convert flat AST list to D3 tree data
function buildD3TreeData(nodes: ASTNode[], repoName: string) {
  const root: any = { name: repoName, type: "repo", children: [] };
  const nodeMap: Record<string, any> = { "": root };

  nodes.forEach((node) => {
    const fileDirParts = node.path.split("/");
    const fileName = fileDirParts.pop() || "";
    let currentPath = "";

    // Build directory tree
    fileDirParts.forEach((part) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!nodeMap[currentPath]) {
        const dirNode = { name: part, type: "dir", children: [] };
        nodeMap[currentPath] = dirNode;
        nodeMap[parentPath].children.push(dirNode);
      }
    });

    // Build file node if not exists
    const fileKey = `${currentPath ? currentPath + "/" : ""}${fileName}`;
    if (!nodeMap[fileKey]) {
      const fileNode = { name: fileName, type: "file", children: [] };
      nodeMap[fileKey] = fileNode;
      nodeMap[currentPath].children.push(fileNode);
    }

    // Add AST class/method/function children
    if (["class", "method", "function"].includes(node.node_type)) {
      nodeMap[fileKey].children.push({
        name: node.name,
        type: node.node_type,
        line: node.start_line,
        children: [],
      });
    }
  });

  // Clean empty children arrays recursively
  const cleanChildren = (n: any) => {
    if (n.children && n.children.length === 0) {
      delete n.children;
    } else if (n.children) {
      n.children.forEach(cleanChildren);
    }
  };
  cleanChildren(root);
  return root;
}

interface VisualizerProps {
  nodes: ASTNode[];
  repoName: string;
  analysis: AnalysisResults | null;
}

export function ContextVisualizations({ nodes, repoName, analysis }: VisualizerProps) {
  const [activeSubTab, setActiveSubTab] = useState<"analysis" | "heatmap" | "tree" | "radial" | "cluster">("analysis");
  const [complexityFiles, setComplexityFiles] = useState<ComplexityFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ComplexityFile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchDropOpen, setIsSearchDropOpen] = useState(false);

  // For D3 collapsing state logic
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const radialContainerRef = useRef<HTMLDivElement>(null);
  const clusterContainerRef = useRef<HTMLDivElement>(null);
  const [showTreeLabels, setShowTreeLabels] = useState(true);

  // Node search lists
  const searchOptions = nodes
    .filter((n) => n.name)
    .map((n) => ({
      label: `${n.name} · ${n.node_type} · ${n.path} · L${n.start_line}`,
      node: n,
    }))
    .slice(0, 100);

  const filteredSearchOptions = searchQuery
    ? searchOptions.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : searchOptions;

  useEffect(() => {
    const files = computeAstComplexity(nodes);
    setComplexityFiles(files);
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, [nodes]);

  // 1. D3 Tree Renderer
  useEffect(() => {
    if (activeSubTab !== "tree" || !treeContainerRef.current || nodes.length === 0) return;
    const container = treeContainerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;

    const data = buildD3TreeData(nodes, repoName);
    const svg: any = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g");

    const zoom: any = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    const treeLayout = d3.tree().size([height - 60, width - 200]);
    const hierRoot: any = d3.hierarchy(data);

    // Default collapse logic
    const collapseAll = (d: any) => {
      if (d.children && d.depth > 2) {
        d._children = d.children;
        d.children = null;
      }
      if (d.children) d.children.forEach(collapseAll);
      if (d._children) d._children.forEach(collapseAll);
    };
    collapseAll(hierRoot);

    const update = (source: any) => {
      treeLayout(hierRoot);
      const descendants = hierRoot.descendants();
      const links = hierRoot.links();

      descendants.forEach((d: any) => {
        d.y = d.depth * 140;
      });

      const nodeSel = g.selectAll("g.node").data(descendants, (d: any) => d.id || (d.id = Math.random()));

      const nodeEnter = nodeSel.enter().append("g")
        .attr("class", "node")
        .attr("transform", () => `translate(${source.y || 0},${source.x || 0})`)
        .style("cursor", "pointer")
        .on("click", (event: any, d: any) => {
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else if (d._children) {
            d.children = d._children;
            d._children = null;
          }
          update(d);
        });

      nodeEnter.append("circle")
        .attr("r", 5)
        .attr("fill", (d: any) => nodeColor(d.data.type))
        .attr("stroke", "#111")
        .attr("stroke-width", 1);

      nodeEnter.append("text")
        .attr("dy", "0.31em")
        .attr("x", (d: any) => (d.children || d._children ? -8 : 8))
        .attr("text-anchor", (d: any) => (d.children || d._children ? "end" : "start"))
        .text((d: any) => d.data.name)
        .attr("fill", "#e2e8f0")
        .style("font-size", "10px")
        .style("font-family", "monospace");

      const nodeUpdate = nodeSel.merge(nodeEnter as any);
      nodeUpdate.transition().duration(250)
        .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

      nodeUpdate.select("circle")
        .attr("fill", (d: any) => nodeColor(d.data.type))
        .attr("fill-opacity", (d: any) => (d._children ? 0.35 : 0.9));

      nodeSel.exit().transition().duration(200)
        .attr("transform", () => `translate(${source.y},${source.x})`)
        .remove();

      const diagonal = d3.linkHorizontal().x((d: any) => d.y).y((d: any) => d.x);
      const linkSel = g.selectAll("path.link").data(links, (d: any) => d.target.id);

      linkSel.enter().insert("path", "g")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "rgba(148,163,184,0.2)")
        .attr("stroke-width", 1.2)
        .attr("d", () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o } as any);
        })
        .merge(linkSel as any)
        .transition().duration(250)
        .attr("d", diagonal as any);

      linkSel.exit().transition().duration(200)
        .attr("d", () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o } as any);
        })
        .remove();
    };

    update(hierRoot);
    svg.call(zoom.transform, d3.zoomIdentity.translate(40, height / 2).scale(0.85));
  }, [activeSubTab, nodes, repoName]);

  // 2. D3 Radial Sunburst Renderer
  useEffect(() => {
    if (activeSubTab !== "radial" || !radialContainerRef.current || nodes.length === 0) return;
    const container = radialContainerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;
    const radius = Math.min(width, height) / 2 - 10;

    const files = computeAstComplexity(nodes);
    const rootData = {
      name: repoName,
      children: files.slice(0, 50).map((f) => ({
        name: f.path.split("/").pop() || "",
        path: f.path,
        total: f.total_complexity,
        children: f.functions.slice(0, 8).map((fn) => ({
          name: fn.name,
          value: Math.max(1, fn.complexity),
          complexity: fn.complexity,
        })),
      })),
    };

    const partition = (data: any) => {
      const root = d3.hierarchy(data)
        .sum((d: any) => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      return d3.partition().size([2 * Math.PI, root.height + 1])(root);
    };

    const partitionRoot = partition(rootData);
    partitionRoot.each((d: any) => {
      d.current = d;
    });

    const svg: any = d3.select(container).append("svg")
      .attr("viewBox", [0, 0, width, height] as any)
      .style("font", "10px sans-serif");

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const arc: any = d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .padAngle((d: any) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius / 3)
      .innerRadius((d: any) => d.y0 * (radius / 3))
      .outerRadius((d: any) => Math.max(d.y0 * (radius / 3), d.y1 * (radius / 3) - 1));

    const path = g.selectAll("path")
      .data(partitionRoot.descendants().slice(1))
      .join("path")
      .attr("fill", (d: any) => {
        if (d.depth === 1) {
          const tier = complexityColor(d.data.total || 0);
          return tier.fg;
        }
        const fnTier = complexityColor(d.data.complexity || 0);
        return fnTier.fg;
      })
      .attr("fill-opacity", (d: any) => (d.children ? 0.6 : 0.4))
      .attr("d", arc)
      .style("cursor", "pointer");

    path.append("title")
      .text((d: any) => `${d.ancestors().map((d: any) => d.data.name).reverse().join("/")}\nComplexity: ${d.data.total || d.data.complexity || 0}`);

    g.append("circle")
      .datum(partitionRoot)
      .attr("r", radius / 3)
      .attr("fill", "transparent")
      .style("cursor", "pointer");
  }, [activeSubTab, nodes, repoName]);

  // 3. D3 Radial Cluster Renderer
  useEffect(() => {
    if (activeSubTab !== "cluster" || !clusterContainerRef.current || nodes.length === 0) return;
    const container = clusterContainerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;
    const cx = width / 2;
    const cy = height / 2;

    const data = buildD3TreeData(nodes, repoName);
    const svg: any = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const gRoot = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const zoom: any = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => gRoot.attr("transform", e.transform));
    svg.call(zoom);

    const hierRoot = d3.hierarchy(data);
    const radius = Math.min(width, height) / 2 - 40;

    d3.cluster().size([2 * Math.PI, radius])(hierRoot);

    const radialPoint = (angle: number, r: number) => {
      return [r * Math.cos(angle - Math.PI / 2), r * Math.sin(angle - Math.PI / 2)];
    };

    const diagonal = d3.linkRadial().angle((d: any) => d.x).radius((d: any) => d.y);

    gRoot.append("g")
      .attr("fill", "none")
      .attr("stroke", "rgba(148,163,184,0.15)")
      .attr("stroke-width", 1.2)
      .selectAll("path")
      .data(hierRoot.links())
      .join("path")
      .attr("d", diagonal as any);

    const nodeSel = gRoot.append("g")
      .selectAll("g")
      .data(hierRoot.descendants())
      .join("g")
      .attr("transform", (d: any) => {
        const [x, y] = radialPoint(d.x, d.y);
        return `translate(${x},${y})`;
      });

    nodeSel.append("circle")
      .attr("r", 4)
      .attr("fill", (d: any) => nodeColor(d.data.type))
      .attr("stroke", "#111")
      .attr("stroke-width", 1);

    nodeSel.append("text")
      .attr("dy", "0.31em")
      .attr("x", (d: any) => (d.x < Math.PI ? 6 : -6))
      .attr("text-anchor", (d: any) => (d.x < Math.PI ? "start" : "end"))
      .attr("transform", (d: any) => `rotate(${(d.x * 180) / Math.PI - 90})`)
      .text((d: any) => d.data.name)
      .attr("fill", "#94a3b8")
      .style("font-size", "8px")
      .style("font-family", "monospace");
  }, [activeSubTab, nodes, repoName]);

  const nodeColor = (type: string) => {
    const colors: Record<string, string> = {
      repo: "var(--cp-cyan)",
      dir: "var(--cp-purple)",
      file: "var(--cp-green)",
      class: "var(--cp-yellow)",
      method: "var(--cp-orange)",
      function: "var(--cp-orange)",
    };
    return colors[type] || "#94a3b8";
  };

  return (
    <div className="flex-1 flex flex-col min-height-0 overflow-hidden font-mono space-y-3">
      {/* Sub Tabs + Search */}
      <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2 shrink-0">
        <div className="flex gap-1.5">
          {(["analysis", "heatmap", "tree", "radial", "cluster"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-3 py-1 text-xs uppercase border ${
                activeSubTab === tab
                  ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                  : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground hover:border-[rgba(0,229,255,0.2)]"
              } cursor-pointer transition-colors`}
            >
              {tab === "heatmap" ? "complexity heatmap" : tab}
            </button>
          ))}
        </div>

        {/* Sanctum Parity Search box */}
        <div className="relative flex items-center gap-1.5">
          <input
            id="ast-view-search"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchDropOpen(true);
            }}
            onFocus={() => setIsSearchDropOpen(true)}
            onBlur={() => setTimeout(() => setIsSearchDropOpen(false), 200)}
            placeholder="Search nodes..."
            className="w-48 bg-[var(--cp-bg-3)] text-foreground border border-[var(--cp-border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--cp-cyan)]"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setIsSearchDropOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground text-xs px-1 cursor-pointer"
            >
              ✕
            </button>
          )}

          {isSearchDropOpen && filteredSearchOptions.length > 0 && (
            <div className="absolute top-full right-0 mt-1 w-80 max-h-60 overflow-y-auto bg-[var(--cp-bg-3)] border border-[var(--cp-border)] shadow-xl z-50 rounded">
              {filteredSearchOptions.map((opt, i) => (
                <div
                  key={i}
                  onMouseDown={() => {
                    setSearchQuery(opt.node.name);
                    setIsSearchDropOpen(false);
                  }}
                  className="px-3 py-2 border-b border-[var(--cp-border)]/40 hover:bg-[var(--cp-cyan)]/10 text-[10px] text-foreground cursor-pointer truncate"
                  title={opt.label}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visualizer Areas */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3">
        {activeSubTab === "analysis" && (
          <div className="h-full overflow-y-auto space-y-4 pr-1">
            {analysis ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(analysis.summary.by_category).map(([cat, count]) => (
                    <div key={cat} className="border border-[var(--cp-border)] p-2.5 bg-[var(--cp-bg-3)] rounded">
                      <span className="block text-[9px] text-muted-foreground uppercase">{cat.replace("_", " ")}</span>
                      <span className="text-md font-bold text-foreground">{count}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider flex items-center gap-1.5">
                    <ShieldAlert size={14} /> HEURISTIC FINDINGS ({analysis.findings.length})
                  </h4>
                  <div className="space-y-2">
                    {analysis.findings.map((f, idx) => {
                      const isHigh = f.severity === "high";
                      const isMed = f.severity === "medium";
                      return (
                        <div
                          key={idx}
                          className={`p-3 border rounded text-xs leading-relaxed ${
                            isHigh ? "border-red-900 bg-red-950/10" : isMed ? "border-amber-900 bg-amber-950/10" : "border-[var(--cp-border)] bg-[var(--cp-bg-3)]"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? "bg-red-500 animate-pulse" : isMed ? "bg-amber-500" : "bg-green-500"}`} />
                              {f.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {f.path}:{f.line}
                            </span>
                          </div>
                          <p className="text-muted-foreground">{f.detail}</p>
                          <div className="mt-1.5 flex gap-2 text-[9px] font-mono text-muted-foreground opacity-60">
                            <span>CATEGORY: {f.category.toUpperCase()}</span>
                            <span>RULE: {f.rule_id}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                <Info size={32} className="text-[var(--cp-cyan)] mb-2 animate-pulse" />
                <span className="text-xs font-mono uppercase tracking-widest text-[var(--cp-cyan)]">
                  running_analysis_rules
                </span>
                <p className="text-[10px] text-muted-foreground max-w-xs mt-1.5">
                  Analyzing repository source code AST metrics and structural rules...
                </p>
              </div>
            )}
          </div>
        )}

        {activeSubTab === "heatmap" && (
          <div className="h-full flex gap-3 overflow-hidden">
            {/* Left explorer list */}
            <div className="w-72 border-r border-[var(--cp-border)] pr-2 overflow-y-auto space-y-2 select-none shrink-0">
              {complexityFiles.map((file) => {
                const c = complexityColor(file.total_complexity);
                const isSelected = selectedFile?.path === file.path;
                return (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`p-2 border transition-all cursor-pointer flex justify-between items-center ${
                      isSelected
                        ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                        : "border-[var(--cp-border)] bg-[var(--cp-bg-3)] hover:border-[rgba(0,229,255,0.2)]"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <span className="text-[11px] font-bold text-foreground block truncate">{file.path.split("/").pop()}</span>
                      <span className="text-[9px] text-muted-foreground block truncate">{file.path}</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded" style={{ backgroundColor: c.bg, color: c.fg }}>
                      {file.total_complexity}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right breakdown table */}
            <div className="flex-1 overflow-y-auto">
              {selectedFile ? (
                <div className="space-y-4 p-1">
                  <div className="border-b border-[var(--cp-border)] pb-2">
                    <h4 className="text-xs font-bold text-foreground truncate">{selectedFile.path}</h4>
                    <span className="text-[10px] text-muted-foreground">Complexity Score: {selectedFile.total_complexity}</span>
                  </div>

                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--cp-border)] text-muted-foreground text-[10px] uppercase font-mono">
                        <th className="py-2">Type</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Lines</th>
                        <th className="py-2 text-center">Span</th>
                        <th className="py-2 text-center">Nested</th>
                        <th className="py-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFile.functions.map((fn, idx) => {
                        const fc = complexityColor(fn.complexity);
                        return (
                          <tr key={idx} className="border-b border-[var(--cp-border)]/40 hover:bg-[var(--cp-bg-3)]/30">
                            <td className="py-2 text-muted-foreground font-bold">{fn.node_type}</td>
                            <td className="py-2 font-mono text-[11px] text-foreground truncate max-w-[150px]" title={fn.name}>{fn.name}</td>
                            <td className="py-2 text-muted-foreground">L{fn.start_line}–{fn.end_line}</td>
                            <td className="py-2 text-center text-muted-foreground">{fn.end_line - fn.start_line}</td>
                            <td className="py-2 text-center text-muted-foreground">{fn.child_count}</td>
                            <td className="py-2 text-right font-bold" style={{ color: fc.fg }}>{fn.complexity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-xs text-muted-foreground">No file selected.</div>
              )}
            </div>
          </div>
        )}


        {activeSubTab === "tree" && (
          <TreeVisualizer nodes={nodes} repoName={repoName} showLabels={showTreeLabels} setShowLabels={setShowTreeLabels} />
        )}

        {activeSubTab === "radial" && (
          <RadialVisualizer nodes={nodes} repoName={repoName} />
        )}

        {activeSubTab === "cluster" && (
          <ClusterVisualizer nodes={nodes} repoName={repoName} />
        )}
      </div>
    </div>
  );
}

// ── Tree Visualizer Component ──
function TreeVisualizer({ nodes, repoName, showLabels, setShowLabels }: { nodes: ASTNode[]; repoName: string; showLabels: boolean; setShowLabels: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDepth, setActiveDepth] = useState<string>("class");

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;

    const data = buildD3TreeData(nodes, repoName);
    const svg: any = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g");

    const zoom: any = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    const treeLayout = d3.tree().size([height - 60, width - 200]);
    const hierRoot: any = d3.hierarchy(data);

    const collapseToDepth = (rootNode: any, targetType: string) => {
      const TYPE_LEVELS: any = { repo: 0, dir: 1, file: 2, class: 3, function: 4, method: 4 };
      const targetLvl = TYPE_LEVELS[targetType] ?? 99;

      rootNode.descendants().forEach((d: any) => {
        const lvl = TYPE_LEVELS[d.data.type] ?? 99;
        if (lvl >= targetLvl && d.children) {
          d._children = d.children;
          d.children = null;
        } else if (lvl < targetLvl && d._children) {
          d.children = d._children;
          d._children = null;
        }
      });
    };

    collapseToDepth(hierRoot, activeDepth);

    const update = (source: any) => {
      treeLayout(hierRoot);
      const descendants = hierRoot.descendants();
      const links = hierRoot.links();

      descendants.forEach((d: any) => {
        d.y = d.depth * 150;
      });

      const nodeSel = g.selectAll("g.node").data(descendants, (d: any) => d.id || (d.id = Math.random()));

      const nodeEnter = nodeSel.enter().append("g")
        .attr("class", "node")
        .attr("transform", () => `translate(${source.y || 0},${source.x || 0})`)
        .style("cursor", "pointer")
        .on("click", (event: any, d: any) => {
          setSelectedNode(d);
          setIsDrawerOpen(true);
        });

      nodeEnter.append("circle")
        .attr("r", 5)
        .attr("fill", (d: any) => nodeColor(d.data.type))
        .attr("stroke", "#111")
        .attr("stroke-width", 1);

      nodeEnter.append("text")
        .attr("class", "node-label")
        .attr("dy", "0.31em")
        .attr("x", (d: any) => (d.children || d._children ? -8 : 8))
        .attr("text-anchor", (d: any) => (d.children || d._children ? "end" : "start"))
        .text((d: any) => d.data.name)
        .attr("fill", "#e2e8f0")
        .style("font-size", "9px")
        .style("font-family", "monospace");

      const nodeUpdate = nodeSel.merge(nodeEnter as any);
      nodeUpdate.transition().duration(250)
        .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

      nodeUpdate.select("circle")
        .attr("fill", (d: any) => nodeColor(d.data.type))
        .attr("fill-opacity", (d: any) => (d._children ? 0.35 : 0.9));

      nodeUpdate.select("text.node-label")
        .style("display", showLabels ? null : "none");

      nodeSel.exit().transition().duration(200)
        .attr("transform", () => `translate(${source.y},${source.x})`)
        .remove();

      const diagonal = d3.linkHorizontal().x((d: any) => d.y).y((d: any) => d.x);
      const linkSel = g.selectAll("path.link").data(links, (d: any) => d.target.id);

      linkSel.enter().insert("path", "g")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "rgba(148,163,184,0.2)")
        .attr("stroke-width", 1.2)
        .attr("d", () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o } as any);
        })
        .merge(linkSel as any)
        .transition().duration(250)
        .attr("d", diagonal as any);

      linkSel.exit().transition().duration(200)
        .attr("d", () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o } as any);
        })
        .remove();
    };

    update(hierRoot);
    svg.call(zoom.transform, d3.zoomIdentity.translate(40, height / 2).scale(0.85));
  }, [nodes, repoName, activeDepth, showLabels]);

  const nodeColor = (type: string) => {
    const colors: Record<string, string> = {
      repo: "#22d3ee",
      dir: "#a78bfa",
      file: "#4ade80",
      class: "#f43f5e",
      method: "#fb923c",
      function: "#fb923c",
    };
    return colors[type] || "#94a3b8";
  };

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* Interactive Legend / Depth Filter */}
      <div className="flex gap-4 p-2 bg-[var(--cp-bg-3)] border-b border-[var(--cp-border)] text-[10px] items-center shrink-0">
        <span className="text-muted-foreground font-bold">DEPTH FILTER:</span>
        {(["repo", "dir", "file", "class", "function"] as const).map((type) => {
          const colors: Record<string, string> = {
            repo: "#22d3ee",
            dir: "#a78bfa",
            file: "#4ade80",
            class: "#f43f5e",
            function: "#fb923c",
          };
          const isActive = activeDepth === type;
          return (
            <button
              key={type}
              onClick={() => setActiveDepth(type)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer border ${
                isActive ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.08)]" : "border-transparent"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[type] }} />
              <span className="uppercase">{type}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowLabels(!showLabels)}
          className={`ml-auto px-2 py-0.5 text-[9px] uppercase border cursor-pointer ${
            showLabels ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]" : "border-[var(--cp-border)] text-muted-foreground"
          }`}
        >
          Labels
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div ref={containerRef} className="flex-1 h-full w-full overflow-hidden" />
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      </div>
    </div>
  );
}

// ── Radial Visualizer Component ──
function RadialVisualizer({ nodes, repoName }: { nodes: ASTNode[]; repoName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;
    const radius = Math.min(width, height) / 2 - 20;

    const files = computeAstComplexity(nodes);
    const rootData = {
      name: repoName,
      type: "repo",
      children: files.slice(0, 50).map((f) => ({
        name: f.path.split("/").pop() || "",
        path: f.path,
        type: "file",
        total: f.total_complexity,
        children: f.functions.slice(0, 8).map((fn) => ({
          name: fn.name,
          type: fn.node_type,
          value: Math.max(1, fn.complexity),
          complexity: fn.complexity,
          line: fn.start_line,
          endLine: fn.end_line,
        })),
      })),
    };

    const partition = (data: any) => {
      const root = d3.hierarchy(data)
        .sum((d: any) => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      return d3.partition().size([2 * Math.PI, root.height + 1])(root);
    };

    const partitionRoot = partition(rootData);
    partitionRoot.each((d: any) => {
      d.current = d;
    });

    const svg: any = d3.select(container).append("svg")
      .attr("viewBox", [0, 0, width, height] as any);

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const arc: any = d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .padAngle((d: any) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius / 3)
      .innerRadius((d: any) => d.y0 * (radius / 3))
      .outerRadius((d: any) => Math.max(d.y0 * (radius / 3), d.y1 * (radius / 3) - 1));

    const path = g.selectAll("path")
      .data(partitionRoot.descendants().slice(1))
      .join("path")
      .attr("fill", (d: any) => {
        if (d.depth === 1) {
          const tier = complexityColor(d.data.total || 0);
          return tier.fg;
        }
        const fnTier = complexityColor(d.data.complexity || 0);
        return fnTier.fg;
      })
      .attr("fill-opacity", (d: any) => (d.children ? 0.6 : 0.8))
      .attr("d", arc)
      .style("cursor", "pointer")
      .on("click", (event: any, d: any) => {
        event.stopPropagation();
        setSelectedNode(d);
        setIsDrawerOpen(true);
      });

    path.append("title")
      .text((d: any) => `${d.ancestors().map((d: any) => d.data.name).reverse().join("/")}\nComplexity: ${d.data.total || d.data.complexity || 0}`);

    g.append("circle")
      .datum(partitionRoot)
      .attr("r", radius / 3)
      .attr("fill", "rgba(10,10,20,0.7)")
      .attr("stroke", "rgba(255,255,255,0.1)")
      .style("cursor", "pointer");

    const totalScore = files.reduce((s, f) => s + f.total_complexity, 0);
    g.append("text").attr("text-anchor", "middle").attr("dy", "-0.2em")
      .attr("fill", "#22d3ee").attr("font-size", "14px").attr("font-weight", "700").text(totalScore);
    g.append("text").attr("text-anchor", "middle").attr("dy", "1em")
      .attr("fill", "rgba(255,255,255,0.4)").attr("font-size", "8px").text("total score");
  }, [nodes, repoName]);

  return (
    <div className="h-full w-full flex min-h-0 overflow-hidden relative">
      <div ref={containerRef} className="flex-1 h-full w-full overflow-hidden flex items-center justify-center bg-[rgba(0,0,0,0.12)]" />
      <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}

// ── Cluster Visualizer Component ──
function ClusterVisualizer({ nodes, repoName }: { nodes: ASTNode[]; repoName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDepth, setActiveDepth] = useState<string>("class");

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 800;
    const height = 500;
    const cx = width / 2;
    const cy = height / 2;

    const data = buildD3TreeData(nodes, repoName);
    const svg: any = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const gRoot = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const zoom: any = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => gRoot.attr("transform", e.transform));
    svg.call(zoom);

    const hierRoot: any = d3.hierarchy(data);
    const radius = Math.min(width, height) / 2 - 40;

    const collapseToDepth = (rootNode: any, targetType: string) => {
      const TYPE_LEVELS: any = { repo: 0, dir: 1, file: 2, class: 3, function: 4, method: 4 };
      const targetLvl = TYPE_LEVELS[targetType] ?? 99;

      rootNode.descendants().forEach((d: any) => {
        const lvl = TYPE_LEVELS[d.data.type] ?? 99;
        if (lvl >= targetLvl && d.children) {
          d._children = d.children;
          d.children = null;
        } else if (lvl < targetLvl && d._children) {
          d.children = d._children;
          d._children = null;
        }
      });
    };

    collapseToDepth(hierRoot, activeDepth);

    d3.cluster().size([2 * Math.PI, radius])(hierRoot);

    const radialPoint = (angle: number, r: number) => {
      return [r * Math.cos(angle - Math.PI / 2), r * Math.sin(angle - Math.PI / 2)];
    };

    const diagonal = d3.linkRadial().angle((d: any) => d.x).radius((d: any) => d.y);

    gRoot.append("g")
      .attr("fill", "none")
      .attr("stroke", "rgba(148,163,184,0.15)")
      .attr("stroke-width", 1.2)
      .selectAll("path")
      .data(hierRoot.links())
      .join("path")
      .attr("d", diagonal as any);

    const nodeSel = gRoot.append("g")
      .selectAll("g")
      .data(hierRoot.descendants())
      .join("g")
      .attr("transform", (d: any) => {
        const [x, y] = radialPoint(d.x, d.y);
        return `translate(${x},${y})`;
      })
      .style("cursor", "pointer")
      .on("click", (event: any, d: any) => {
        setSelectedNode(d);
        setIsDrawerOpen(true);
      });

    nodeSel.append("circle")
      .attr("r", 4)
      .attr("fill", (d: any) => nodeColor(d.data.type))
      .attr("stroke", "#111")
      .attr("stroke-width", 1);

    nodeSel.append("text")
      .attr("dy", "0.31em")
      .attr("x", (d: any) => (d.x < Math.PI ? 6 : -6))
      .attr("text-anchor", (d: any) => (d.x < Math.PI ? "start" : "end"))
      .attr("transform", (d: any) => `rotate(${(d.x * 180) / Math.PI - 90})`)
      .text((d: any) => d.data.name)
      .attr("fill", "#94a3b8")
      .style("font-size", "8px")
      .style("font-family", "monospace");
  }, [nodes, repoName, activeDepth]);

  const nodeColor = (type: string) => {
    const colors: Record<string, string> = {
      repo: "#22d3ee",
      dir: "#a78bfa",
      file: "#4ade80",
      class: "#f43f5e",
      method: "#fb923c",
      function: "#fb923c",
    };
    return colors[type] || "#94a3b8";
  };

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* Interactive Legend / Depth Filter */}
      <div className="flex gap-4 p-2 bg-[var(--cp-bg-3)] border-b border-[var(--cp-border)] text-[10px] items-center shrink-0">
        <span className="text-muted-foreground font-bold">DEPTH FILTER:</span>
        {(["repo", "dir", "file", "class", "function"] as const).map((type) => {
          const colors: Record<string, string> = {
            repo: "#22d3ee",
            dir: "#a78bfa",
            file: "#4ade80",
            class: "#f43f5e",
            function: "#fb923c",
          };
          const isActive = activeDepth === type;
          return (
            <button
              key={type}
              onClick={() => setActiveDepth(type)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer border ${
                isActive ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.08)]" : "border-transparent"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[type] }} />
              <span className="uppercase">{type}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div ref={containerRef} className="flex-1 h-full w-full overflow-hidden flex items-center justify-center" />
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      </div>
    </div>
  );
}

// ── Shared Node Detail Drawer Component ──
function DetailDrawer({ selectedNode, isOpen, onClose }: { selectedNode: any; isOpen: boolean; onClose: () => void }) {
  if (!isOpen || !selectedNode) return null;

  const nodeData = selectedNode.data || selectedNode;
  const name = nodeData.name || "Unknown";
  const type = nodeData.type || nodeData.node_type || "node";
  const line = nodeData.line || nodeData.start_line;
  const endLine = nodeData.endLine || nodeData.end_line;
  const descCount = selectedNode.descendants ? selectedNode.descendants().length - 1 : 0;

  const typeColors: Record<string, string> = {
    repo: "#22d3ee",
    dir: "#a78bfa",
    file: "#4ade80",
    class: "#f43f5e",
    function: "#fb923c",
    method: "#fb923c",
  };
  const color = typeColors[type] || "#94a3b8";

  // Build hierarchy path list
  const pathParts: string[] = [];
  let curr = selectedNode;
  while (curr) {
    if (curr.data && curr.data.name && curr.data.name !== "root") {
      pathParts.unshift(curr.data.name);
    }
    curr = curr.parent;
  }

  return (
    <div className="w-80 border-l border-[var(--cp-border)] bg-[var(--cp-bg-3)] p-4 overflow-y-auto shrink-0 flex flex-col space-y-4 text-xs font-mono text-foreground">

      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">NODE DETAIL</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer font-bold">
          [CLOSE]
        </button>
      </div>

      <div className="space-y-1">
        <span
          className="inline-block px-2 py-0.5 text-[9px] uppercase border rounded-full font-bold"
          style={{ borderColor: `${color}55`, backgroundColor: `${color}22`, color }}
        >
          {type}
        </span>
        <h3 className="text-sm font-bold text-foreground break-all" style={{ color }}>
          {name}
        </h3>
        {line && (
          <p className="text-[10px] text-muted-foreground">
            L{line}
            {endLine ? `–${endLine}` : ""}
          </p>
        )}
      </div>

      {pathParts.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-[10px] text-muted-foreground uppercase font-bold">// HIERARCHY PATH</h5>
          <div className="p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] leading-relaxed text-[10px] opacity-85">
            {pathParts.join(" ➔ ")}
          </div>
        </div>
      )}

      {descCount > 0 && (
        <div className="space-y-1">
          <h5 className="text-[10px] text-muted-foreground uppercase font-bold">// SCOPE DETAILS</h5>
          <p className="text-muted-foreground text-[10px]">
            Contains <strong className="text-foreground">{descCount}</strong> nested child block nodes.
          </p>
        </div>
      )}
    </div>
  );
}

