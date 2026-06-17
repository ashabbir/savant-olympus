import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Folder, FileCode, CheckCircle, Database, AlertTriangle, Square, Trash, Zap, Clock, Info, ShieldAlert, FileText, ChevronRight, ChevronDown, Layers, HelpCircle, MessageSquare, Send, Sparkles, Trash2, Loader2, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { buildAthenaPromptSections, fetchAthenaCodeContext, fetchAthenaKnowledgeContext, fetchAthenaMcpTools, formatAthenaContextHits } from "@/lib/athenaContext";

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
  category: "structural" | "security" | "modernization" | "style" | "dead_code" | "performance";
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
    detectPerformance(lines, path, pushFinding);
  });

  const sevRank = { high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => {
    const ds = (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0);
    if (ds) return ds;
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.line - b.line;
  });

  const byCategory: Record<string, number> = { structural: 0, security: 0, modernization: 0, style: 0, dead_code: 0, performance: 0 };
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
    // CORS wildcard
    if (/cors.*\*|Access-Control-Allow-Origin.*\*/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "cors_wildcard", path, line: lineNo, title: "CORS wildcard origin", detail: "Wildcard CORS allows any domain to access resources. Restrict to known origins." });
    }
    // Debug mode in production config
    if (/\b(DEBUG|debug)\s*[:=]\s*(True|true|1)\b/.test(trimmed) && !/(test|spec|mock)/i.test(path)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "debug_enabled", path, line: lineNo, title: "Debug mode enabled", detail: "Debug mode should be disabled in production configurations." });
    }
    // Unsafe deserialization
    if (/\b(pickle\.load|yaml\.load|yaml\.unsafe_load|marshal\.loads?)\s*\(/.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "unsafe_deserialization", path, line: lineNo, title: "Unsafe deserialization", detail: "pickle/yaml.load/marshal can execute arbitrary code from untrusted data. Use safe alternatives." });
    }
    // Weak crypto / hashing
    if (/\b(md5|sha1)\s*\(|hashlib\.(md5|sha1)/i.test(trimmed) && !/hmac/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "weak_hash", path, line: lineNo, title: "Weak hash algorithm", detail: "MD5/SHA1 are cryptographically broken. Use SHA-256 or stronger for security-sensitive hashing." });
    }
    // innerHTML / dangerouslySetInnerHTML
    if (/\.innerHTML\s*=|dangerouslySetInnerHTML/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "xss_innerHTML", path, line: lineNo, title: "Potential XSS via innerHTML", detail: "Direct innerHTML assignment can lead to cross-site scripting. Sanitize content or use safe DOM APIs." });
    }
    // Subprocess shell=True
    if (/subprocess\.(call|run|Popen)\s*\(.*shell\s*=\s*True/i.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "shell_injection", path, line: lineNo, title: "Shell injection risk", detail: "subprocess with shell=True is vulnerable to shell injection. Pass command as a list without shell=True." });
    }
    // Disabled SSL verification
    if (/verify\s*=\s*False|SSL_CERT_NONE|CERT_NONE/i.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "ssl_disabled", path, line: lineNo, title: "SSL verification disabled", detail: "Disabling SSL verification exposes connections to man-in-the-middle attacks." });
    }
  });
}

function detectModernization(lines: string[], path: string, pushFinding: any) {
  let callbackDepth = 0;
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const lineNo = idx + 1;
    // Deprecated pandas append
    if (/\b\w+\.append\(/.test(trimmed) && /\bpd\b|\bpandas\b|dataframe|df\./i.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "deprecated_append_api", path, line: lineNo, title: "Deprecated append-style API usage", detail: "Consider replacing append-style flows with concat-style batching." });
    }
    // var usage in JS/TS
    if (/^\s*var\s+/.test(line) && /\.(js|ts|jsx|tsx)$/.test(path)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "var_usage", path, line: lineNo, title: "Legacy var declaration", detail: "Use const/let instead of var. var has function-scoping that causes subtle bugs." });
    }
    // require() instead of import
    if (/\brequire\s*\(\s*['"]/.test(trimmed) && /\.(ts|tsx|mjs)$/.test(path)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "commonjs_require", path, line: lineNo, title: "CommonJS require in ESM file", detail: "Use ES module import syntax instead of require() for better tree-shaking and type safety." });
    }
    // Callback hell detection (nested callbacks)
    if (/\bcallback\b|function\s*\(err/.test(trimmed) || /\.then\s*\(.*\.then\s*\(/.test(trimmed)) {
      callbackDepth++;
      if (callbackDepth >= 3) {
        pushFinding({ severity: "medium", category: "modernization", rule_id: "callback_hell", path, line: lineNo, title: "Callback nesting / promise chain", detail: "Deep callback nesting or chained .then() calls. Refactor to async/await for readability." });
        callbackDepth = 0;
      }
    }
    // String concatenation instead of template literals
    if (/\.(js|ts|jsx|tsx)$/.test(path) && /["']\s*\+\s*\w+\s*\+\s*["']/.test(trimmed) && !/require|import/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "string_concat", path, line: lineNo, title: "String concatenation", detail: "Use template literals (`${var}`) instead of string concatenation for cleaner code." });
    }
    // Old-style Python string formatting
    if (/\.(py)$/.test(path) && /%\s*\(/.test(trimmed) && !/^\s*#/.test(line)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "old_string_format", path, line: lineNo, title: "Legacy % string formatting", detail: "Use f-strings or .format() instead of %-style string formatting." });
    }
    // Class-based React component
    if (/class\s+\w+\s+extends\s+(React\.Component|Component|PureComponent)/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "class_component", path, line: lineNo, title: "Class-based React component", detail: "Consider migrating to functional components with hooks for simpler state management and better performance." });
    }
    // Any usage (TypeScript)
    if (/\.(ts|tsx)$/.test(path) && /:\s*any\b/.test(trimmed) && !/eslint-disable|@ts-ignore/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "typescript_any", path, line: lineNo, title: "TypeScript 'any' type", detail: "Explicit 'any' defeats type safety. Use a specific type, unknown, or a generic instead." });
    }
  });
}

function detectStyle(lines: string[], fileNodes: ASTNode[], path: string, pushFinding: any) {
  let consecutiveBlankLines = 0;
  let consoleLogCount = 0;
  const importLines: string[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNo = idx + 1;

    // Python missing return type hint
    const m = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/);
    if (m && !/->\s*[^:]+:/.test(line)) {
      pushFinding({ severity: "low", category: "style", rule_id: "missing_return_type_hint", path, line: lineNo, title: "Missing return type hint", detail: `${m[1]} has no return type annotation.` });
    }

    // Magic numbers (numeric literals > 1 used outside const/define context)
    if (/\.(js|ts|jsx|tsx|py)$/.test(path)) {
      const magicMatch = trimmed.match(/(?:^|[^\w.])(\d{2,})(?:[^\w.]|$)/);
      if (magicMatch && !/^\s*(const|let|var|#define|import|from|export)\b/.test(line)
          && !/\b(port|timeout|status|code|version|0x|0b|0o)\b/i.test(trimmed)
          && parseInt(magicMatch[1]) > 1 && !/^\s*[#\/]/.test(line)) {
        const num = magicMatch[1];
        if (num !== "100" && num !== "1000" && !/^\d{4}$/.test(num)) { // skip years/round numbers
          pushFinding({ severity: "low", category: "style", rule_id: "magic_number", path, line: lineNo, title: "Magic number", detail: `Numeric literal ${num} should be extracted to a named constant for clarity.` });
        }
      }
    }

    // Long lines (> 150 chars)
    if (line.length > 150 && !/^\s*(import|from|require|\*|url|href|src)/.test(line)) {
      pushFinding({ severity: "low", category: "style", rule_id: "long_line", path, line: lineNo, title: "Long line", detail: `Line is ${line.length} characters. Consider breaking it up for readability (threshold: 150).` });
    }

    // Excessive blank lines
    if (!trimmed) {
      consecutiveBlankLines++;
      if (consecutiveBlankLines >= 4) {
        pushFinding({ severity: "low", category: "style", rule_id: "excessive_blank_lines", path, line: lineNo, title: "Excessive blank lines", detail: "4+ consecutive blank lines reduce readability. Use 1-2 blank lines to separate sections." });
        consecutiveBlankLines = 0;
      }
    } else {
      consecutiveBlankLines = 0;
    }

    // console.log / print statements left in code
    if (/\b(console\.log|console\.debug|print)\s*\(/.test(trimmed) && !/(test|spec|debug|log)/i.test(path)) {
      consoleLogCount++;
    }

    // Missing error handling - empty catch blocks
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed) || /except\s*:?\s*$/.test(trimmed)) {
      pushFinding({ severity: "medium", category: "style", rule_id: "empty_catch", path, line: lineNo, title: "Swallowed exception", detail: "Empty catch/except block silently swallows errors. At minimum, log the error." });
    }

    // Inconsistent naming: camelCase function in Python or snake_case in JS
    if (/\.(py)$/.test(path)) {
      const pyFn = trimmed.match(/^def\s+([a-z][a-zA-Z0-9]*)\s*\(/);
      if (pyFn && /[a-z][A-Z]/.test(pyFn[1])) {
        pushFinding({ severity: "low", category: "style", rule_id: "naming_convention", path, line: lineNo, title: "Non-PEP8 function name", detail: `${pyFn[1]} uses camelCase. Python convention is snake_case.` });
      }
    }

    // Collect imports for duplicate detection
    if (/^\s*(import|from)\s+/.test(line)) {
      importLines.push(trimmed);
    }
  });

  // console.log spam
  if (consoleLogCount >= 5) {
    pushFinding({ severity: "medium", category: "style", rule_id: "console_log_spam", path, line: 1, title: "Excessive logging statements", detail: `${consoleLogCount} console.log/print statements found. Use a proper logger or clean up debug output.` });
  }

  // Duplicate imports
  const importSet = new Set<string>();
  importLines.forEach((imp) => {
    if (importSet.has(imp)) {
      pushFinding({ severity: "low", category: "style", rule_id: "duplicate_import", path, line: 1, title: "Duplicate import", detail: `"${imp.slice(0, 60)}" is imported more than once.` });
    }
    importSet.add(imp);
  });

  // God file detection (total line count)
  if (lines.length > 500) {
    pushFinding({ severity: lines.length > 1000 ? "high" : "medium", category: "style", rule_id: "god_file", path, line: 1, title: "God file", detail: `File has ${lines.length} lines. Consider breaking it into smaller, focused modules.` });
  }
}

function detectDeadCode(lines: string[], path: string, pushFinding: any) {
  let commentedCodeBlock = 0;
  let commentedCodeStart = 0;
  let todoCount = 0;
  let fixmeCount = 0;
  let hackCount = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const curr = lines[i].trim();
    // Unreachable code after exit statements
    if (/^(return|break|raise|throw)\b/.test(curr)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith("#") || next.startsWith("//") || next === "}") continue;
        pushFinding({ severity: "medium", category: "dead_code", rule_id: "unreachable_code", path, line: j + 1, title: "Potential unreachable code", detail: "Code appears after an early exit statement in the same block." });
        break;
      }
    }

    // Commented-out code blocks (heuristic: consecutive comment lines that look like code)
    const isCommentedCode = /^\s*(#|\/{2})\s*(if|for|while|def|class|function|const|let|var|return|import|from)\b/.test(lines[i]);
    if (isCommentedCode) {
      if (commentedCodeBlock === 0) commentedCodeStart = i + 1;
      commentedCodeBlock++;
    } else {
      if (commentedCodeBlock >= 3) {
        pushFinding({ severity: "medium", category: "dead_code", rule_id: "commented_code_block", path, line: commentedCodeStart, title: "Commented-out code block", detail: `${commentedCodeBlock} consecutive lines of commented-out code. Remove or restore it — commented code rots and confuses readers.` });
      }
      commentedCodeBlock = 0;
    }

    // TODO / FIXME / HACK annotations
    if (/\bTODO\b/i.test(curr) && (curr.startsWith("#") || curr.startsWith("//"))) todoCount++;
    if (/\bFIXME\b/i.test(curr)) fixmeCount++;
    if (/\bHACK\b/i.test(curr)) hackCount++;
  }

  // Report accumulated annotations
  if (todoCount >= 3) {
    pushFinding({ severity: "low", category: "dead_code", rule_id: "todo_accumulation", path, line: 1, title: "TODO accumulation", detail: `${todoCount} TODO comments found. Track these in a task system rather than leaving them in code.` });
  }
  if (fixmeCount >= 1) {
    pushFinding({ severity: "medium", category: "dead_code", rule_id: "fixme_present", path, line: 1, title: "FIXME markers present", detail: `${fixmeCount} FIXME comment(s) found indicating known broken code that needs attention.` });
  }
  if (hackCount >= 1) {
    pushFinding({ severity: "medium", category: "dead_code", rule_id: "hack_present", path, line: 1, title: "HACK markers present", detail: `${hackCount} HACK comment(s) found indicating workarounds that should be properly addressed.` });
  }
}

function detectPerformance(lines: string[], path: string, pushFinding: any) {
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    const lineNo = idx + 1;

    // N+1 query pattern: DB call inside a loop
    if (/\b(for|while|forEach|map)\b/.test(trimmed)) {
      // Look ahead for query patterns in next 10 lines
      for (let j = idx + 1; j < Math.min(lines.length, idx + 10); j++) {
        const nextLine = lines[j].trim();
        if (/\b(execute|query|find|findOne|findAll|select|fetch|get)\s*\(/i.test(nextLine)
            && /\b(db|cursor|session|model|collection|table|repository|repo)\b/i.test(nextLine)) {
          pushFinding({ severity: "high", category: "performance", rule_id: "n_plus_one", path, line: j + 1, title: "Potential N+1 query", detail: "Database query detected inside a loop. Batch-fetch data before the loop to avoid N+1 performance degradation." });
          break;
        }
        if (/^\s*(}|\])/.test(nextLine) || !nextLine) break;
      }
    }

    // Sync I/O in async context
    if (/\basync\b/.test(trimmed)) {
      for (let j = idx + 1; j < Math.min(lines.length, idx + 20); j++) {
        const nextLine = lines[j].trim();
        if (/\b(readFileSync|writeFileSync|execSync|spawnSync)\b/.test(nextLine)) {
          pushFinding({ severity: "medium", category: "performance", rule_id: "sync_in_async", path, line: j + 1, title: "Sync I/O in async function", detail: "Synchronous file/process operations in async functions block the event loop. Use async alternatives." });
          break;
        }
        if (/^\s*}/.test(nextLine) && !/\bif\b|\bfor\b|\bwhile\b/.test(nextLine)) break;
      }
    }

    // Regex compilation in hot path (inside loop body)
    if (/new RegExp\(|re\.compile\(/.test(trimmed)) {
      // Check if we're inside a loop
      for (let k = idx - 1; k >= Math.max(0, idx - 10); k--) {
        if (/\b(for|while|forEach|map)\b/.test(lines[k].trim())) {
          pushFinding({ severity: "low", category: "performance", rule_id: "regex_in_loop", path, line: lineNo, title: "Regex compilation in loop", detail: "Compiling regex inside a loop is wasteful. Compile once outside the loop and reuse." });
          break;
        }
      }
    }

    // Unbounded list/array growth
    if (/\bwhile\s*(True|true|1)/.test(trimmed)) {
      for (let j = idx + 1; j < Math.min(lines.length, idx + 15); j++) {
        const nextLine = lines[j].trim();
        if (/\.push\(|\.append\(/.test(nextLine)) {
          pushFinding({ severity: "medium", category: "performance", rule_id: "unbounded_growth", path, line: j + 1, title: "Unbounded collection growth", detail: "Appending to a collection inside an infinite loop without bounds can cause memory exhaustion." });
          break;
        }
        if (/break|return/.test(nextLine)) break;
      }
    }

    // Missing pagination on list endpoints
    if (/\.(py)$/.test(path) && /\.query\s*\(|Session\.query|objects\.all\(|find\(\{\}\)/i.test(trimmed)) {
      if (!/limit|paginate|slice|\[:.*\]|offset|page/i.test(trimmed)) {
        pushFinding({ severity: "medium", category: "performance", rule_id: "missing_pagination", path, line: lineNo, title: "Missing pagination", detail: "Querying all records without limit/pagination can overwhelm memory and response times on large datasets." });
      }
    }

    // Large JSON.parse / JSON.stringify without size check
    if (/JSON\.(parse|stringify)\s*\(/.test(trimmed) && /\b(body|data|payload|content|response)\b/i.test(trimmed)) {
      if (!/try|catch/i.test(trimmed)) {
        pushFinding({ severity: "low", category: "performance", rule_id: "unguarded_json_parse", path, line: lineNo, title: "Unguarded JSON parsing", detail: "JSON.parse/stringify on untrusted or large data without try/catch can crash the process." });
      }
    }
  });
}

// Helper to convert flat AST list to D3 tree data
function buildD3TreeData(nodes: ASTNode[], repoName: string) {
  const root: any = { id: repoName, name: repoName, type: "repo", children: [] };
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
        const dirNode = { id: currentPath, name: part, type: "dir", children: [] };
        nodeMap[currentPath] = dirNode;
        nodeMap[parentPath].children.push(dirNode);
      }
    });

    // Build file node if not exists
    const fileKey = `${currentPath ? currentPath + "/" : ""}${fileName}`;
    if (!nodeMap[fileKey]) {
      const fileNode = { id: fileKey, name: fileName, type: "file", children: [] };
      nodeMap[fileKey] = fileNode;
      nodeMap[currentPath].children.push(fileNode);
    }

    // Add AST class/method/function children
    if (["class", "method", "function"].includes(node.node_type)) {
      const astNodeId = `${fileKey}#${node.name}#${node.node_type}#${node.start_line}`;
      nodeMap[fileKey].children.push({
        id: astNodeId,
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
  activeModel?: { provider: string; model: string };
  serverUrl: string;
  apiKey: string;
}

interface ChatMessage {
  id?: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

function AnalysisChatPanel({
  analysis,
  repoName,
  onClose,
  activeModel,
  serverUrl,
  apiKey,
  filePath // Optional scope
}: {
  analysis: AnalysisResults;
  repoName: string;
  onClose: () => void;
  activeModel?: { provider: string; model: string };
  serverUrl: string;
  apiKey: string;
  filePath?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Resizing state
  const [width, setWidth] = useState(384); 
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < window.innerWidth * 0.8) {
        setWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const getStorageKey = () => filePath 
    ? `savant_analysis_chat_${repoName}_file_${filePath.replace(/\//g, '_')}`
    : `savant_analysis_chat_${repoName}`;

  useEffect(() => {
    async function load() {
      const stored = await window.system.getChatHistory(getStorageKey());
      if (stored) setMessages(stored);
      else setMessages([]);
    }
    load();
  }, [repoName, filePath]);

  const saveMessages = (newMsgs: ChatMessage[]) => {
    setMessages(newMsgs);
    window.system.saveChatHistory(getStorageKey(), newMsgs);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = (textOverride || inputValue).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const updated = [...messages, userMsg];
    saveMessages(updated);
    setInputValue("");
    setIsLoading(true);

    try {
      const s = await window.system.getSettings();
      const chain = s["provider:chain"] || [];
      const provider = activeModel?.provider || chain[0]?.provider || "gemini";
      const model = activeModel?.model || chain[0]?.model || "3.5";

      const baseUrl = serverUrl.replace(/\/+$/, "");

      const analysisSummary = `
ANALYSIS OVERVIEW for ${repoName}:
- Files Analyzed: ${analysis.summary.filesAnalyzed}
- Total Findings: ${analysis.summary.totalFindings}
- Severity Breakdown: High: ${analysis.summary.by_severity.high}, Medium: ${analysis.summary.by_severity.medium}, Low: ${analysis.summary.by_severity.low}
- Category Breakdown: ${Object.entries(analysis.summary.by_category).map(([c, count]) => `${c}: ${count}`).join(", ")}

DETAILED FINDINGS (Truncated to first 100):
${analysis.findings.slice(0, 100).map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} in ${f.path}:${f.line} - ${f.detail}`).join("\n")}
      `;

      const buildAthenaAugmentedPrompt = async (basePrompt: string, query: string) => {
        const [codeHits, knowledgeHits, tools] = await Promise.all([
          fetchAthenaCodeContext(baseUrl, apiKey, query, repoName),
          fetchAthenaKnowledgeContext(baseUrl, apiKey, query),
          fetchAthenaMcpTools(baseUrl, apiKey),
        ]);

        return buildAthenaPromptSections([
          ["BASE PROMPT", basePrompt],
          ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
          ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
          ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
        ]);
      };

      const prompt = `You are ATHENA, an expert software architect and security auditor integrated into the Savant Olympus dashboard.
The user is investigating static analysis results for the repository "${repoName}".

[FULL ANALYSIS DATA]
${analysisSummary}

[CHAT HISTORY]
${updated.map(m => `${m.sender === "user" ? "USER" : "ATHENA"}: ${m.text}`).join("\n")}

[TASK]
Respond to the user's latest query using the provided analysis data. 
Provide deep technical insights, prioritize the most dangerous or structural issues, and suggest concrete refactoring plans.
Maintain a professional, helpful, and highly technical tone.

[INSTRUCTIONS FOR MCP USAGE]
You have access to a variety of Savant MCP tools. Use them to investigate code, query knowledge, or perform actions as needed. 
Always prefer using a tool if it can provide more accurate or deep information.
`;

      const response = await window.ipcRenderer.invoke("run-agent", {
        provider,
        model,
        prompt: await buildAthenaAugmentedPrompt(prompt, `${repoName} ${textToSend} ${analysisSummary}`),
      });

      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: response || "No response from ATHENA.",
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updated, aiMsg]);
    } catch (error: any) {
      console.error("Analysis Chat Error:", error);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Error calling ATHENA agent: ${error.message || "Unknown error"}`,
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updated, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className={`relative flex flex-col border-l border-[var(--cp-border)] bg-[var(--cp-bg-3)] p-4 overflow-hidden max-h-full shrink-0 space-y-4 text-xs font-mono text-foreground ${
        isResizing ? "select-none" : ""
      }`}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-50 transition-colors ${
          isResizing ? "bg-[var(--cp-cyan)]" : "bg-transparent hover:bg-[var(--cp-cyan)]/30"
        }`}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold font-mono">Analysis Discussion</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] transition-colors font-mono uppercase">
          ‹ CLOSE
        </button>
      </div>

      {/* Settings / Model Info (Read-Only) */}
      <div className="flex items-center gap-2 justify-between bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] rounded shrink-0">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">ATHENA Mode</span>
          <span className="text-[10px] font-bold text-[var(--cp-cyan)] uppercase truncate">
            {activeModel ? `${activeModel.provider.toUpperCase()}: ${activeModel.model}` : "GEMINI: 3.5"}
          </span>
        </div>
        <button
          onClick={() => { if(confirm("Clear analysis chat history?")) saveMessages([]); }}
          title="Clear Chat History"
          className="p-1 hover:bg-red-500/10 hover:text-red-400 text-muted-foreground rounded transition-colors cursor-pointer shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 space-y-3 min-h-0 flex flex-col pr-1">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
            <Sparkles className="w-8 h-8 text-[var(--cp-cyan)] animate-pulse" />
            <div className="space-y-1">
              <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider font-mono">ATHENA</h4>
              <p className="text-[9px] text-muted-foreground max-w-[200px] leading-relaxed font-sans">
                Ask ATHENA to explain analysis findings, identify the highest priority refactoring targets, or suggest architectural improvements across the whole project.
              </p>
            </div>

            {/* Quick actions */}
            <div className="w-full flex flex-col gap-1.5 pt-2">
              <button
                onClick={() => handleSend("Which of these security findings is the most critical to fix first?")}
                className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
              >
                🔒 What are the top security priorities?
              </button>
              <button
                onClick={() => handleSend("Give me a refactoring plan to improve the overall health score of this project.")}
                className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
              >
                🛠️ Refactoring plan for project health
              </button>
              <button
                onClick={() => handleSend("Summarize the structural issues across this project.")}
                className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
              >
                🏗️ Summarize structural issues
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col space-y-1 group relative ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-2 text-[8px] text-muted-foreground opacity-60">
                  <span>{msg.sender === "user" ? "USER" : "ATHENA"}</span>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.text)}
                      title="Copy message text"
                      className="hover:text-[var(--cp-cyan)] cursor-pointer"
                    >
                      <Copy size={9} />
                    </button>
                    <button
                      onClick={() => {
                        const newMessages = messages.filter((_, idx) => idx !== i);
                        saveMessages(newMessages);
                      }}
                      title="Delete message"
                      className="hover:text-red-400 cursor-pointer"
                    >
                      <Trash size={9} />
                    </button>
                  </div>
                </div>
                <div
                  className={`p-2 rounded border max-w-full overflow-hidden font-mono text-[10px] leading-relaxed break-words text-foreground ${
                    msg.sender === "user"
                      ? "bg-[rgba(0,229,255,0.06)] border-[rgba(0,229,255,0.25)] text-right"
                      : "bg-[rgba(167,139,250,0.06)] border-[rgba(167,139,250,0.2)] text-left"
                  }`}
                >
                  {msg.sender === "user" ? (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  ) : (
                    <div className="prose prose-invert max-w-none text-[10px] leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>pre]:bg-[var(--cp-bg-1)] [&>pre]:p-1.5 [&>pre]:rounded [&>pre]:my-1.5 [&>pre]:border [&>pre]:border-[var(--cp-border)] [&>pre>code]:text-[9px] [&>pre]:overflow-x-auto [&>pre]:max-w-full [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:mb-2 [&_code]:break-all [&_code]:whitespace-pre-wrap font-sans">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex flex-col space-y-1 items-start">
                <span className="text-[8px] text-[var(--cp-cyan)] uppercase tracking-wider animate-pulse">ATHENA IS THINKING...</span>
                <div className="p-2 rounded border border-[var(--cp-border)] bg-[var(--cp-bg-3)] flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-[var(--cp-cyan)]" />
                  <span className="text-muted-foreground text-[10px] font-sans">Synthesizing findings...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 shrink-0"
      >
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (inputValue.trim() && !isLoading) {
                handleSend();
              }
            }
          }}
          placeholder="Ask ATHENA about the analysis..."
          disabled={isLoading}
          rows={1}
          className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
        >
          ASK
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => { if(confirm("Clear analysis chat history?")) saveMessages([]); }}
            className="px-2 py-1.5 border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-mono"
          >
            CLEAR
          </button>
        )}
      </form>
    </div>
  );
}

export function ContextVisualizations({ nodes, repoName, analysis, activeModel, serverUrl, apiKey }: VisualizerProps) {
  const [activeSubTab, setActiveSubTab] = useState<"analysis" | "heatmap" | "tree" | "radial" | "cluster">("analysis");
  const [isAnalysisChatOpen, setIsAnalysisChatOpen] = useState(false);
  const [isHeatmapChatOpen, setIsHeatmapChatOpen] = useState(false);
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
        <div className="flex items-center gap-3">
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

          {(activeSubTab === "analysis" || activeSubTab === "heatmap") && analysis && (
            <button
              onClick={() => {
                if (activeSubTab === "analysis") setIsAnalysisChatOpen(!isAnalysisChatOpen);
                else setIsHeatmapChatOpen(!isHeatmapChatOpen);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase border transition-all cursor-pointer ${
                (activeSubTab === "analysis" ? isAnalysisChatOpen : isHeatmapChatOpen)
                  ? "bg-[var(--cp-cyan)] text-[var(--cp-bg-1)] border-[var(--cp-cyan)] shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                  : "bg-[rgba(0,229,255,0.06)] text-[var(--cp-cyan)] border-[var(--cp-cyan)]/40 hover:border-[var(--cp-cyan)] hover:bg-[var(--cp-cyan)]/10"
              }`}
            >
              <MessageSquare size={12} />
              {(activeSubTab === "analysis" ? isAnalysisChatOpen : isHeatmapChatOpen) ? "CLOSE CHAT" : "ASK ATHENA"}
            </button>
          )}
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
          <div className="h-full flex overflow-hidden">
            <div className={`flex-1 overflow-y-auto space-y-4 pr-1 ${isAnalysisChatOpen ? "mr-3" : ""}`}>
              {analysis ? (() => {
              const total = analysis.summary?.totalFindings || 0;
              const high = analysis.summary?.by_severity?.high || 0;
              const med = analysis.summary?.by_severity?.medium || 0;
              const low = analysis.summary?.by_severity?.low || 0;
              const filesCount = analysis.summary?.filesAnalyzed || 0;
              // Health score: 100 minus weighted penalties
              const rawScore = Math.max(0, 100 - (high * 15) - (med * 5) - (low * 1));
              const grade = rawScore >= 90 ? "A" : rawScore >= 75 ? "B" : rawScore >= 60 ? "C" : rawScore >= 40 ? "D" : "F";
              const gradeColor = rawScore >= 90 ? "#4ade80" : rawScore >= 75 ? "#a3e635" : rawScore >= 60 ? "#facc15" : rawScore >= 40 ? "#fb923c" : "#f87171";
              const categoryColors: Record<string, { border: string; bg: string; icon: string }> = {
                security: { border: "border-red-800", bg: "bg-red-950/20", icon: "🔒" },
                structural: { border: "border-orange-800", bg: "bg-orange-950/20", icon: "🏗️" },
                performance: { border: "border-purple-800", bg: "bg-purple-950/20", icon: "⚡" },
                modernization: { border: "border-blue-800", bg: "bg-blue-950/20", icon: "🔄" },
                style: { border: "border-slate-700", bg: "bg-slate-950/20", icon: "🎨" },
                dead_code: { border: "border-zinc-700", bg: "bg-zinc-950/20", icon: "💀" },
              };
              return (
              <div className="space-y-4">
                {/* Health Score + Severity Summary */}
                <div className="flex gap-3 items-stretch">
                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-3)] rounded p-4 flex flex-col items-center justify-center min-w-[100px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Health</span>
                    <span className="text-3xl font-black font-[Orbitron,monospace]" style={{ color: gradeColor }}>{grade}</span>
                    <span className="text-[10px] font-mono" style={{ color: gradeColor }}>{rawScore}/100</span>
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="border border-red-900/50 bg-red-950/10 rounded p-3 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-red-400 uppercase tracking-wider">Critical</span>
                      <span className="text-2xl font-bold text-red-400">{high}</span>
                    </div>
                    <div className="border border-amber-900/50 bg-amber-950/10 rounded p-3 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-amber-400 uppercase tracking-wider">Warning</span>
                      <span className="text-2xl font-bold text-amber-400">{med}</span>
                    </div>
                    <div className="border border-green-900/50 bg-green-950/10 rounded p-3 flex flex-col items-center justify-center">
                      <span className="text-[9px] text-green-400 uppercase tracking-wider">Info</span>
                      <span className="text-2xl font-bold text-green-400">{low}</span>
                    </div>
                  </div>
                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-3)] rounded p-4 flex flex-col items-center justify-center min-w-[100px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Files</span>
                    <span className="text-2xl font-bold text-[var(--cp-cyan)]">{filesCount}</span>
                    <span className="text-[9px] text-muted-foreground">{total} findings</span>
                  </div>
                </div>

                {/* Category Breakdown Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Object.entries(analysis?.summary?.by_category || {}).map(([cat, count]) => {
                    const cc = categoryColors[cat] || { border: "border-[var(--cp-border)]", bg: "bg-[var(--cp-bg-3)]", icon: "📋" };
                    return (
                    <div key={cat} className={`${cc.border} ${cc.bg} border p-2.5 rounded transition-all hover:scale-[1.02]`}>
                      <span className="block text-[9px] text-muted-foreground uppercase">{cc.icon} {cat.replace("_", " ")}</span>
                      <span className="text-lg font-bold text-foreground">{count as number}</span>
                    </div>
                    );
                  })}
                </div>

                {/* Findings List */}
                <div className="space-y-2">
                  <h4 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider flex items-center gap-1.5">
                    <ShieldAlert size={14} /> PAIN POINTS &amp; FINDINGS ({total})
                  </h4>
                  <div className="space-y-2">
                    {(analysis.findings || []).map((f, idx) => {
                      const isHigh = f.severity === "high";
                      const isMed = f.severity === "medium";
                      const cc = categoryColors[f.category] || { border: "border-[var(--cp-border)]", bg: "bg-[var(--cp-bg-3)]", icon: "📋" };
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
                              <span className="opacity-70 mr-0.5">{cc.icon}</span>
                              {f.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {f.path}:{f.line}
                            </span>
                          </div>
                          <p className="text-muted-foreground">{f.detail}</p>
                          <div className="mt-1.5 flex gap-3 text-[9px] font-mono text-muted-foreground opacity-60">
                            <span className="px-1.5 py-0.5 rounded" style={{ background: isHigh ? "rgba(239,68,68,0.15)" : isMed ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)" }}>
                              {f.severity.toUpperCase()}
                            </span>
                            <span>CATEGORY: {f.category?.toUpperCase() || ""}</span>
                            <span>RULE: {f.rule_id}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })() : (
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
            {isAnalysisChatOpen && analysis && (
              <AnalysisChatPanel 
                analysis={analysis} 
                repoName={repoName} 
                onClose={() => setIsAnalysisChatOpen(false)} 
                activeModel={activeModel}
                serverUrl={serverUrl}
                apiKey={apiKey}
              />
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

            {/* Right breakdown detail */}
            <div className="flex-1 overflow-y-auto">
              {selectedFile ? (() => {
                const fileName = selectedFile.path.split("/").pop() || "";
                const totalCx = selectedFile.total_complexity;
                const cxColor = complexityColor(totalCx);
                const grade = totalCx <= 5 ? "Low" : totalCx <= 10 ? "Moderate" : totalCx <= 20 ? "Risky" : "High";
                const fnCount = selectedFile.functions.length;
                const highFns = selectedFile.functions.filter(fn => fn.complexity > 20).length;
                const medFns = selectedFile.functions.filter(fn => fn.complexity > 5 && fn.complexity <= 20).length;
                const lowFns = selectedFile.functions.filter(fn => fn.complexity <= 5).length;

                // Get file-specific findings from analysis
                const fileFindings = (analysis?.findings || []).filter(f => f.path === selectedFile.path);
                const findingsByCategory: Record<string, number> = {};
                const findingsBySeverity = { high: 0, medium: 0, low: 0 };
                fileFindings.forEach(f => {
                  findingsByCategory[f.category] = (findingsByCategory[f.category] || 0) + 1;
                  findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] || 0) + 1;
                });

                const typeIcons: Record<string, string> = { function: "λ", method: "⚙️", class: "🏛️" };

                return (
                <div className="space-y-4 p-2">
                  {/* File Header */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <h4 className="text-sm font-black text-foreground truncate">{fileName}</h4>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase border rounded font-bold tracking-wider"
                      style={{ borderColor: "#4ade8055", backgroundColor: "#4ade8015", color: "#4ade80" }}
                    >
                      📄 FILE
                    </span>
                    {/* Hierarchy breadcrumb */}
                    <div className="p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded text-[10px] text-muted-foreground">
                      <span className="text-[var(--cp-cyan)]">📦</span> {selectedFile.repo || repoName}
                      <span className="mx-1 text-muted-foreground">›</span>
                      <span className="text-[var(--cp-cyan)]">📁</span> {selectedFile.path}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">{grade}</span>
                      <span className="text-xl font-black" style={{ color: cxColor.fg }}>{totalCx}</span>
                    </div>
                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Functions</span>
                      <span className="text-xl font-black text-foreground">{fnCount}</span>
                    </div>
                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">High</span>
                      <span className="text-xl font-black text-red-400">{highFns}</span>
                    </div>
                  </div>

                  {/* Severity Breakdown */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-amber-900/40 bg-amber-950/10 rounded p-2 text-center">
                      <span className="block text-[8px] text-amber-400 uppercase tracking-wider">Medium</span>
                      <span className="text-lg font-bold text-amber-400">{medFns}</span>
                    </div>
                    <div className="border border-green-900/40 bg-green-950/10 rounded p-2 text-center">
                      <span className="block text-[8px] text-green-400 uppercase tracking-wider">Low</span>
                      <span className="text-lg font-bold text-green-400">{lowFns}</span>
                    </div>
                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Grade</span>
                      <span className="text-lg font-bold" style={{ color: cxColor.fg }}>{cxColor.label}</span>
                    </div>
                  </div>

                  {/* Function Breakdown Table */}
                  <div className="space-y-1">
                    <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Function Breakdown</h5>
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--cp-border)] text-muted-foreground text-[9px] uppercase font-mono">
                          <th className="py-1.5">Name</th>
                          <th className="py-1.5">Lines</th>
                          <th className="py-1.5 text-center">Span</th>
                          <th className="py-1.5 text-center">Nested</th>
                          <th className="py-1.5 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFile.functions.map((fn, idx) => {
                          const fc = complexityColor(fn.complexity);
                          const icon = typeIcons[fn.node_type] || "◉";
                          return (
                            <tr key={idx} className="border-b border-[var(--cp-border)]/30 hover:bg-[var(--cp-bg-3)]/40 transition-colors">
                              <td className="py-1.5 font-mono text-[10px] text-foreground truncate max-w-[140px]" title={fn.name}>
                                <span className="mr-1 opacity-70">{icon}</span>{fn.name}
                              </td>
                              <td className="py-1.5 text-[10px] text-muted-foreground">L{fn.start_line}–{fn.end_line}</td>
                              <td className="py-1.5 text-center text-[10px] text-muted-foreground">{fn.end_line - fn.start_line}</td>
                              <td className="py-1.5 text-center text-[10px] text-muted-foreground">{fn.child_count}</td>
                              <td className="py-1.5 text-right">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: fc.bg, color: fc.fg }}>{fn.complexity}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-File Analysis Findings */}
                  {fileFindings.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest flex items-center gap-1.5">
                        Analysis Findings
                      </h5>
                      {/* Finding stats */}
                      <div className="flex flex-wrap gap-2 text-[9px] font-mono">
                        <span className="text-foreground font-bold">Total: {fileFindings.length}</span>
                        <span className="text-red-400">High: {findingsBySeverity.high}</span>
                        <span className="text-amber-400">Medium: {findingsBySeverity.medium}</span>
                        <span className="text-green-400">Low: {findingsBySeverity.low}</span>
                      </div>
                      {/* Category badges */}
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(findingsByCategory).map(([cat, count]) => (
                          <span key={cat} className="px-1.5 py-0.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded text-[8px] text-muted-foreground font-mono">
                            {cat}: {count}
                          </span>
                        ))}
                      </div>
                      {/* Finding cards */}
                      <div className="space-y-1.5">
                        {fileFindings.map((f, idx) => {
                          const isHigh = f.severity === "high";
                          const isMed = f.severity === "medium";
                          return (
                            <div
                              key={idx}
                              className={`p-2 border rounded text-[10px] leading-relaxed ${
                                isHigh ? "border-red-900 bg-red-950/10" : isMed ? "border-amber-900/50 bg-amber-950/10" : "border-[var(--cp-border)] bg-[var(--cp-bg-3)]"
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                <span className={`mt-0.5 shrink-0 px-1 py-0 rounded text-[8px] font-bold uppercase ${
                                  isHigh ? "bg-red-900/40 text-red-400" : isMed ? "bg-amber-900/40 text-amber-400" : "bg-green-900/40 text-green-400"
                                }`}>{f.severity}</span>
                                <div className="min-w-0">
                                  <span className="font-bold text-foreground">{f.title}</span>
                                  <span className="text-muted-foreground ml-1.5 font-mono">L{f.line}</span>
                                  <p className="text-muted-foreground mt-0.5">{f.detail}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                );
              })() : (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                  <span className="text-2xl mb-2">📊</span>
                  <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Select a file</span>
                  <p className="text-[10px] text-muted-foreground max-w-xs mt-1">Click a file from the list to view its complexity breakdown and analysis findings.</p>
                </div>
              )}
            </div>
            {isHeatmapChatOpen && analysis && selectedFile && (
              <AnalysisChatPanel 
                analysis={analysis} 
                repoName={repoName} 
                onClose={() => setIsHeatmapChatOpen(false)} 
                activeModel={activeModel}
                serverUrl={serverUrl}
                apiKey={apiKey}
                filePath={selectedFile.path}
              />
            )}
          </div>
        )}


        {activeSubTab === "tree" && (
          <TreeVisualizer nodes={nodes} repoName={repoName} showLabels={showTreeLabels} setShowLabels={setShowTreeLabels} findings={analysis?.findings} serverUrl={serverUrl} apiKey={apiKey} />
        )}

        {activeSubTab === "radial" && (
          <RadialVisualizer nodes={nodes} repoName={repoName} findings={analysis?.findings} serverUrl={serverUrl} apiKey={apiKey} />
        )}

        {activeSubTab === "cluster" && (
          <ClusterVisualizer nodes={nodes} repoName={repoName} findings={analysis?.findings} serverUrl={serverUrl} apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}

// ── Tree Visualizer Component ──
function TreeVisualizer({ nodes, repoName, showLabels, setShowLabels, findings = [], serverUrl, apiKey }: { nodes: ASTNode[]; repoName: string; showLabels: boolean; setShowLabels: any; findings?: Finding[]; serverUrl: string; apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDepth, setActiveDepth] = useState<string>("class");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  const handleToggleCollapse = (id: string, isCollapsed: boolean) => {
    if (isCollapsed) {
      setExpandedNodeIds((prev) => new Set(prev).add(id));
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setCollapsedNodeIds((prev) => new Set(prev).add(id));
      setExpandedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

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

    // Apply global collapse to depth
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

    // Apply individual node overrides
    hierRoot.descendants().forEach((d: any) => {
      if (collapsedNodeIds.has(d.data.id)) {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        }
      } else if (expandedNodeIds.has(d.data.id)) {
        if (d._children) {
          d.children = d._children;
          d._children = null;
        }
      }
    });

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
          setSelectedNodeId(d.data.id);
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

    if (selectedNodeId) {
      const found = hierRoot.descendants().find((d: any) => d.data.id === selectedNodeId);
      if (found) setSelectedNode(found);
    }
  }, [nodes, repoName, activeDepth, showLabels, collapsedNodeIds, expandedNodeIds, selectedNodeId]);

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
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={handleToggleCollapse} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} />
      </div>
    </div>
  );
}

// ── Radial Visualizer Component ──
function RadialVisualizer({ nodes, repoName, findings = [], serverUrl, apiKey }: { nodes: ASTNode[]; repoName: string; findings?: Finding[]; serverUrl: string; apiKey: string }) {
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
      id: repoName,
      name: repoName,
      type: "repo",
      children: files.slice(0, 50).map((f) => ({
        id: f.path,
        name: f.path.split("/").pop() || "",
        path: f.path,
        repo: f.repo,
        type: "file",
        node_type: "file",
        total: f.total_complexity,
        fnCount: f.functions.length,
        children: f.functions.slice(0, 8).map((fn) => ({
          id: `${f.path}#${fn.name}#${fn.node_type}#${fn.start_line}`,
          name: fn.name,
          type: fn.node_type,
          node_type: fn.node_type,
          path: f.path,
          repo: f.repo,
          value: Math.max(1, fn.complexity),
          complexity: fn.complexity,
          child_count: fn.child_count,
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
      <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={() => {}} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} />
    </div>
  );
}

// ── Cluster Visualizer Component ──
function ClusterVisualizer({ nodes, repoName, findings = [], serverUrl, apiKey }: { nodes: ASTNode[]; repoName: string; findings?: Finding[]; serverUrl: string; apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDepth, setActiveDepth] = useState<string>("class");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  const handleToggleCollapse = (id: string, isCollapsed: boolean) => {
    if (isCollapsed) {
      setExpandedNodeIds((prev) => new Set(prev).add(id));
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setCollapsedNodeIds((prev) => new Set(prev).add(id));
      setExpandedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

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

    // Apply individual node overrides
    hierRoot.descendants().forEach((d: any) => {
      if (collapsedNodeIds.has(d.data.id)) {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        }
      } else if (expandedNodeIds.has(d.data.id)) {
        if (d._children) {
          d.children = d._children;
          d._children = null;
        }
      }
    });

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
        setSelectedNodeId(d.data.id);
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

    if (selectedNodeId) {
      const found = hierRoot.descendants().find((d: any) => d.data.id === selectedNodeId);
      if (found) setSelectedNode(found);
    }
  }, [nodes, repoName, activeDepth, collapsedNodeIds, expandedNodeIds, selectedNodeId]);

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
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={handleToggleCollapse} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} />
      </div>
    </div>
  );
}

// ── Shared Node Detail Drawer Component ──
export function DetailDrawer({
  selectedNode,
  isOpen,
  onClose,
  onToggleCollapse,
  findings = [],
  repoName,
  serverUrl = "http://127.0.0.1:3100",
  apiKey = ""
}: {
  selectedNode: any;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: (id: string, isCollapsed: boolean) => void;
  findings?: Finding[];
  repoName: string;
  serverUrl?: string;
  apiKey?: string;
}) {
  if (!isOpen || !selectedNode) return null;

  const nodeData = selectedNode.data || selectedNode;
  const id = nodeData.id;
  const name = nodeData.name || "Unknown";
  const type = nodeData.type || nodeData.node_type || "node";
  const line = nodeData.line || nodeData.start_line;
  const endLine = nodeData.endLine || nodeData.end_line;
  const filePath = nodeData.path || nodeData.id; // Fallback to ID for files
  const complexity = nodeData.complexity || nodeData.total || 0;
  const childCount = nodeData.child_count || 0;
  const descCount = selectedNode.descendants ? selectedNode.descendants().length - 1 : 0;
  const nestedCount = childCount || descCount;
  const lineSpan = (line && endLine) ? (endLine - line + 1) : 0;

  const isCollapsed = !!selectedNode._children;
  const canCollapse = (selectedNode.children && selectedNode.children.length > 0) || (selectedNode._children && selectedNode._children.length > 0);

  // Filter findings for this node or its descendants
  const nodePath = nodeData.path || (type === "file" ? nodeData.id : "");
  const nodeFindings = findings.filter((f) => {
    if (type === "file") return f.path === nodePath;
    if (type === "dir" || type === "repo") return f.path.startsWith(nodePath);
    return f.path === nodePath && f.line >= line && f.line <= (endLine || line);
  });

  const handleCopyPrompt = () => {
    const prompt = `Refactor Request:
Node: ${name} (${type.toUpperCase()})
Path: ${filePath}
Complexity: ${complexity}
Issues Found: ${nodeFindings.length}
${nodeFindings.map(f => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.detail} (Line ${f.line})`).join("\n")}

Context: This ${type} is part of the knowledge graph for ${nodeData.repo || "the project"}. 
Please provide suggestions to reduce complexity and address the identified issues while maintaining the original functionality.`;

    navigator.clipboard.writeText(prompt);
  };

  // McCabe-inspired cyclomatic complexity grade
  const getGrade = (cx: number) => {
    if (cx <= 5) return { grade: "A", label: "Low", color: "#4ade80", advisory: "Clean and maintainable" };
    if (cx <= 10) return { grade: "B", label: "Moderate", color: "#a3e635", advisory: "Acceptable — monitor growth" };
    if (cx <= 20) return { grade: "C", label: "Risky", color: "#facc15", advisory: "Consider refactoring into smaller units" };
    if (cx <= 35) return { grade: "D", label: "High", color: "#fb923c", advisory: "High risk — refactor strongly advised" };
    return { grade: "F", label: "Very High", color: "#f87171", advisory: "Very high — refactor strongly advised" };
  };

  const gradeInfo = getGrade(complexity);

  const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
    repo: { icon: "📦", label: "REPOSITORY", color: "#22d3ee" },
    dir: { icon: "📁", label: "DIRECTORY", color: "#a78bfa" },
    file: { icon: "📄", label: "FILE", color: "#4ade80" },
    class: { icon: "🏛️", label: "CLASS", color: "#f43f5e" },
    function: { icon: "λ", label: "FUNCTION", color: "#fb923c" },
    method: { icon: "⚙️", label: "METHOD", color: "#fb923c" },
  };
  const tc = typeConfig[type] || { icon: "◉", label: type.toUpperCase(), color: "#94a3b8" };

  // Build hierarchy path list
  const pathParts: string[] = [];
  let curr = selectedNode;
  while (curr) {
    if (curr.data && curr.data.name && curr.data.name !== "root") {
      pathParts.unshift(curr.data.name);
    }
    curr = curr.parent;
  }

  // Ask ATHENA states
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [selectedChainItem, setSelectedChainItem] = useState<any>(null);
  const [gatewayModels, setGatewayModels] = useState<Array<{ provider: string; model: string; label: string }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Resize states
  const [width, setWidth] = useState(320); // Default width 320px
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth >= 260 && newWidth <= window.innerWidth * 0.75) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Reset active tab to details when selecting a new node
  useEffect(() => {
    setActiveTab("details");
  }, [id]);

  // Load chat history from SQLite
  const getStorageKey = () => `savant_chat_history_${repoName}_${id}`;
  useEffect(() => {
    async function load() {
      const key = getStorageKey();
      const stored = await window.system.getChatHistory(key);
      if (stored) {
        setMessages(stored);
      } else {
        setMessages([]);
      }
    }
    load();
  }, [id, repoName]);

  // Load settings once and fetch models from gateway
  useEffect(() => {
    async function loadSettings() {
      try {
        const s = await window.system.getSettings();
        setSettings(s);
        
        const chain = s["provider:chain"] || [];
        if (chain.length > 0) {
          setSelectedChainItem({
            provider: chain[0].provider,
            model: chain[0].model,
            label: `${chain[0].provider.toUpperCase()}: ${chain[0].model}`
          });
        } else {
          setSelectedChainItem({ provider: "gemini", model: "3.5", label: "GEMINI: 3.5" });
        }
      } catch (err) {
        console.error("Error loading settings in DetailDrawer:", err);
      }
    }
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  // Scroll to bottom helper
  useEffect(() => {
    if (chatEndRef.current && typeof chatEndRef.current.scrollIntoView === "function") {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, activeTab]);

  const saveMessages = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    window.system.saveChatHistory(getStorageKey(), newMessages);
  };

  const buildAthenaAugmentedPrompt = async (basePrompt: string, query: string) => {
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const [codeHits, knowledgeHits, tools] = await Promise.all([
      fetchAthenaCodeContext(baseUrl, apiKey, query, repoName),
      fetchAthenaKnowledgeContext(baseUrl, apiKey, query),
      fetchAthenaMcpTools(baseUrl, apiKey),
    ]);

    return buildAthenaPromptSections([
      ["BASE PROMPT", basePrompt],
      ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
      ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
      ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
    ]);
  };

  const handleClearHistory = () => {
    saveMessages([]);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const newUserMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, newUserMessage];
    saveMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      let provider = "gemini";
      let model = "3.5";
      if (selectedChainItem) {
        provider = selectedChainItem.provider;
        model = selectedChainItem.model;
      } else {
        const s = settings || await window.system.getSettings();
        const chain = s?.["provider:chain"] || [];
        if (chain.length > 0) {
          provider = chain[0].provider;
          model = chain[0].model;
        }
      }

      const contextPrompt = `You are ATHENA, an AI assistant integrated into the Savant Olympus app.
The user is having a conversation with you regarding code refactoring and planning.

[USER CONTEXT]
- Current View: Context > Viz > Radial (Interactive D3 Sunburst chart of the codebase)
- Selected Node: ${name}
- Node Type: ${type.toUpperCase()}
- Target File: ${filePath}
- Target Line Range: ${line ? `L${line}${endLine ? ` - L${endLine}` : ""}` : "Unknown"}
- Cyclomatic Complexity Score: ${complexity}
- McCabe Assessment Grade: ${gradeInfo.grade} (${gradeInfo.label})
- Goal: Help the user plan, refactor, and reduce complexity/address issues in this code section.

[STATIC ANALYSIS FINDINGS]
${nodeFindings.length > 0 ? 
  nodeFindings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}: ${f.detail} (Line ${f.line})`).join("\n") 
  : "No static analysis issues or warnings were found for this section."
}

[CONVERSATION HISTORY]
${messages.length > 0 ? 
  messages.map(msg => `${msg.sender === "user" ? "User" : "ATHENA"}: ${msg.text}`).join("\n")
  : "No previous messages in this conversation."
}

[NEW USER MESSAGE]
${textToSend}

Please analyze the code context and the history, then respond to the user's message. Explain why the section is red if they ask (red/orange signifies high complexity or analysis findings). Suggest refactoring strategies and code changes to help them plan and execute their refactoring goal.

[INSTRUCTIONS FOR MCP USAGE]
You have access to a variety of Savant MCP tools. Use them to investigate code, query knowledge, or perform actions as needed. 
Always prefer using a tool if it can provide more accurate or deep information.
`;

      const responseText = await window.ipcRenderer.invoke("run-agent", {
        provider,
        model,
        prompt: await buildAthenaAugmentedPrompt(contextPrompt, `${name} ${textToSend} ${filePath || ""}`),
      });

      const newAiMessage: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: responseText || "No response received from the gateway.",
        timestamp: new Date().toISOString(),
      };

      saveMessages([...updatedMessages, newAiMessage]);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Error calling ATHENA agent: ${error.message || "Unknown error"}. Make sure Savant Gateway is running.`,
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updatedMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{ width: `${width}px` }}
      className={`relative border-l border-[var(--cp-border)] bg-[var(--cp-bg-3)] p-4 overflow-hidden max-h-full shrink-0 flex flex-col space-y-4 text-xs font-mono text-foreground ${
        isResizing ? "select-none" : ""
      }`}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-50 transition-colors ${
          isResizing ? "bg-[var(--cp-cyan)]" : "bg-transparent hover:bg-[var(--cp-cyan)]/30"
        }`}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold font-mono">Node Detail</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] transition-colors font-mono">
          ‹ CLOSE
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--cp-border)] mb-2 font-mono">
        <button
          onClick={() => setActiveTab("details")}
          className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
            activeTab === "details"
              ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
            activeTab === "chat"
              ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Ask ATHENA
        </button>
      </div>

      {activeTab === "details" && (
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
          {/* Type Badge + Name + Collapse Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] uppercase border rounded font-bold tracking-wider"
                  style={{ borderColor: `${tc.color}55`, backgroundColor: `${tc.color}15`, color: tc.color }}
                >
                  <span className="text-sm">{tc.icon}</span> {tc.label}
                </span>
              </div>

              {canCollapse && (
                <button
                  onClick={() => onToggleCollapse(id, isCollapsed)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-all ${
                    isCollapsed
                      ? "bg-[rgba(34,211,238,0.15)] border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
                      : "bg-[rgba(148,163,184,0.05)] border-[var(--cp-border)] text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="text-[9px] font-bold uppercase tracking-wider">{isCollapsed ? "Expand" : "Collapse"}</span>
                </button>
              )}
            </div>
            <h3 className="text-base font-black text-foreground break-all leading-tight font-sans" style={{ color: tc.color }}>
              {name}
            </h3>
            {filePath && (
              <p className="text-[10px] text-muted-foreground break-all leading-relaxed opacity-80">
                {filePath}
              </p>
            )}
          </div>



          {/* Metrics Grid */}
          {complexity > 0 && (
            <div className="space-y-2">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">// METRICS</h5>
              <div className="grid grid-cols-2 gap-2">
                {/* Complexity */}
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Complexity</span>
                  <span className="text-xl font-black" style={{ color: gradeInfo.color }}>{complexity}</span>
                </div>
                {/* Nested */}
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Nested</span>
                  <span className="text-xl font-black text-foreground">{nestedCount}</span>
                </div>
                {/* Lines */}
                {lineSpan > 0 && (
                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                    <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Lines</span>
                    <span className="text-xl font-black text-foreground">{lineSpan}</span>
                  </div>
                )}
                {/* Grade */}
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Grade</span>
                  <span className="text-xl font-black" style={{ color: gradeInfo.color }}>{gradeInfo.label}</span>
                </div>
              </div>
            </div>
          )}

          {/* Line Range */}
          {line && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">// LINE RANGE</h5>
              <div className="flex items-center gap-2 p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded">
                <span className="text-[var(--cp-cyan)] font-bold">L{line}</span>
                {endLine && (
                  <>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-[var(--cp-cyan)] font-bold">{endLine}</span>
                    <span className="text-[9px] text-muted-foreground ml-auto">({lineSpan} lines)</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* McCabe Advisory */}
          {complexity > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">// CYCLOMATIC ASSESSMENT</h5>
              <div
                className="p-3 rounded border text-[10px] leading-relaxed"
                style={{
                  borderColor: `${gradeInfo.color}44`,
                  backgroundColor: `${gradeInfo.color}08`,
                  color: gradeInfo.color,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: gradeInfo.color }}
                  />
                  <span className="font-bold uppercase text-[9px] tracking-wider font-mono">
                    McCabe Score: {complexity}
                  </span>
                </div>
                <p className="opacity-90 font-sans">{gradeInfo.advisory}</p>
              </div>
            </div>
          )}

          {/* Hierarchy Path */}
          {pathParts.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">// HIERARCHY PATH</h5>
              <div className="p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded leading-relaxed text-[10px] opacity-85">
                {pathParts.map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground mx-1">➔</span>}
                    <span className={i === pathParts.length - 1 ? "text-[var(--cp-cyan)] font-bold" : "text-muted-foreground"}>{part}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scope Details */}
          {nestedCount > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">// SCOPE DETAILS</h5>
              <p className="text-muted-foreground text-[10px] font-sans">
                Contains <strong className="text-foreground">{nestedCount}</strong> nested typed blocks.
                {lineSpan > 200 && (
                  <span className="block mt-1 text-amber-400">⚠ Large scope — consider decomposing into smaller, focused units.</span>
                )}
                {lineSpan > 500 && (
                  <span className="block mt-1 text-red-400">🚨 Extremely large scope — this is a maintenance burden and a likely source of bugs.</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3 font-mono">
          {/* Settings / Model Info (Read-Only) */}
          <div className="flex items-center gap-2 justify-between bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] rounded shrink-0">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Gateway Model</span>
              <span className="text-[10px] font-bold text-[var(--cp-cyan)] uppercase truncate">
                {selectedChainItem ? selectedChainItem.label || `${selectedChainItem.provider}: ${selectedChainItem.model}` : "GEMINI: 3.5"}
              </span>
            </div>
            <button
              onClick={handleClearHistory}
              title="Clear Chat History"
              className="p-1 hover:bg-red-500/10 hover:text-red-400 text-muted-foreground rounded transition-colors cursor-pointer shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 space-y-3 min-h-0 flex flex-col pr-1">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
                <Sparkles className="w-8 h-8 text-[var(--cp-cyan)] animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider font-mono">ATHENA</h4>
                  <p className="text-[9px] text-muted-foreground max-w-[200px] leading-relaxed font-sans">
                    Ask ATHENA questions about this code section. ATHENA has full context of this node.
                  </p>
                </div>

                {/* Quick actions */}
                <div className="w-full flex flex-col gap-1.5 pt-2">
                  {(nodeFindings.length > 0 || complexity > 5) && (
                    <button
                      onClick={() => handleSendMessage("Why is this section red?")}
                      className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                    >
                      ❓ Why is this red/high complexity?
                    </button>
                  )}
                  <button
                    onClick={() => handleSendMessage("How can I refactor this section to reduce complexity?")}
                    className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                  >
                    🛠️ How can I refactor this?
                  </button>
                  <button
                    onClick={() => handleSendMessage("Explain what this section of code does.")}
                    className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                  >
                    🔍 Explain this code section
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col space-y-1 group relative ${
                      msg.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[8px] text-muted-foreground opacity-60">
                      <span>{msg.sender === "user" ? "USER" : "ATHENA"}</span>
                      {/* Copy & Delete action buttons */}
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigator.clipboard.writeText(msg.text)}
                          title="Copy message text"
                          className="hover:text-[var(--cp-cyan)] cursor-pointer"
                        >
                          <Copy size={9} />
                        </button>
                        <button
                          onClick={() => {
                            const newMessages = messages.filter((_, idx) => idx !== i);
                            saveMessages(newMessages);
                          }}
                          title="Delete message"
                          className="hover:text-red-400 cursor-pointer"
                        >
                          <Trash size={9} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`p-2 rounded border max-w-full overflow-hidden font-mono text-[10px] leading-relaxed break-words text-foreground ${
                        msg.sender === "user"
                          ? "bg-[rgba(0,229,255,0.06)] border-[rgba(0,229,255,0.25)] text-right"
                          : "bg-[rgba(167,139,250,0.06)] border-[rgba(167,139,250,0.2)] text-left"
                      }`}
                    >
                      {msg.sender === "user" ? (
                        <span className="whitespace-pre-wrap">{msg.text}</span>
                      ) : (
                        <div className="prose prose-invert max-w-none text-[10px] leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>pre]:bg-[var(--cp-bg-1)] [&>pre]:p-1.5 [&>pre]:rounded [&>pre]:my-1.5 [&>pre]:border [&>pre]:border-[var(--cp-border)] [&>pre>code]:text-[9px] [&>pre]:overflow-x-auto [&>pre]:max-w-full [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:mb-2 [&_code]:break-all [&_code]:whitespace-pre-wrap font-sans">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex flex-col space-y-1 items-start">
                    <span className="text-[8px] text-[var(--cp-cyan)] uppercase tracking-wider animate-pulse">ATHENA IS THINKING...</span>
                    <div className="p-2 rounded border border-[var(--cp-border)] bg-[var(--cp-bg-3)] flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-[var(--cp-cyan)]" />
                      <span className="text-muted-foreground text-[10px] font-sans">Consulting Savant Gateway...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputValue);
            }}
            className="flex gap-2 shrink-0"
          >
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (inputValue.trim() && !isLoading) {
                    handleSendMessage(inputValue);
                  }
                }
              }}
              placeholder="Ask ATHENA about this code..."
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
            >
              ASK
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="px-2 py-1.5 border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-mono"
              >
                CLEAR
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
