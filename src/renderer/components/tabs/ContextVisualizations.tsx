import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Folder, FileCode, CheckCircle, Database, AlertTriangle, Square, Trash, Zap, Clock, Info, ShieldAlert, FileText, ChevronRight, ChevronDown, Layers, HelpCircle, MessageSquare, Send, Sparkles, Trash2, Loader2, Copy } from "lucide-react";
import { AthenaMessage } from "@/components/shared/AthenaMessage";
import { AthenaConversationExport, AthenaMessageExportActions } from "@/components/shared/AthenaExportActions";
import { useAthenaThread } from "@/hooks/useAthenaThread";
import { buildAthenaConversationPrompt, ensureAthenaMcpSummary } from "@/services/athenaService";
import { ASTNode, ComplexityFunction, ComplexityFile, CodeDoc, Finding, AnalysisResults } from "./context/types";
import { computeAstComplexity, complexityColor } from "./context/utils/complexityUtils";
import { analyzeProjectSource } from "./context/utils/heuristicsEngine";
import { DetailDrawer } from "./context/components/DetailDrawer";

export type { ASTNode, ComplexityFunction, ComplexityFile, CodeDoc, Finding, AnalysisResults };
export { computeAstComplexity, complexityColor, analyzeProjectSource, DetailDrawer };


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

  const threadId = filePath
    ? `savant_analysis_chat_${repoName}_file_${filePath.replace(/\//g, '_')}`
    : `savant_analysis_chat_${repoName}`;
  const { messages, setMessages: saveMessages, clearMessages } = useAthenaThread<ChatMessage>({ threadId });

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

      const analysisSummary = `
ANALYSIS OVERVIEW for ${repoName}:
- Files Analyzed: ${analysis.summary.filesAnalyzed}
- Total Findings: ${analysis.summary.totalFindings}
- Severity Breakdown: High: ${analysis.summary.by_severity.high}, Medium: ${analysis.summary.by_severity.medium}, Low: ${analysis.summary.by_severity.low}
- Category Breakdown: ${Object.entries(analysis.summary.by_category).map(([c, count]) => `${c}: ${count}`).join(", ")}

DETAILED FINDINGS (Truncated to first 100):
${analysis.findings.slice(0, 100).map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} in ${f.path}:${f.line} - ${f.detail}`).join("\n")}
      `;

      const augmentedPrompt = await buildAthenaConversationPrompt({
        context: {
          area: filePath ? "Context > Project > Visualization and Heuristics > Complexity Heatmap" : "Context > Project > Visualization and Heuristics > Analysis",
          repository: repoName,
          selected: filePath ? { type: "file", path: filePath } : { type: "repository", name: repoName },
          screen: { analysis: analysisSummary },
        },
        history: messages,
        userMessage: textToSend,
        instructions: "Act as an expert software architect and security auditor. Use the pinned analysis data, prioritize dangerous or structural issues, and suggest concrete refactoring plans. For a selected heatmap file, keep that file as the primary target while using repository analysis only as supporting context.",
        query: `${repoName} ${filePath || ""} ${textToSend} ${analysisSummary}`,
        baseUrl: serverUrl,
        apiKey,
        repo: repoName,
      });
      const rawResponse = await window.system.runAgentViaGateway({
        provider,
        model,
        prompt: augmentedPrompt,
      });
      const response = ensureAthenaMcpSummary(rawResponse || "No response from ATHENA.", augmentedPrompt);

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
          onClick={() => { if(confirm("Clear analysis chat history?")) clearMessages(); }}
          title="Clear Chat History"
          className="p-1 hover:bg-red-500/10 hover:text-red-400 text-muted-foreground rounded transition-colors cursor-pointer shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Messages Area */}
      <AthenaConversationExport messages={messages} title="Olympus analysis" scope="analysis-athena" />
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
              <AthenaMessage
                key={`${msg.timestamp}-${i}`}
                message={msg}
                messageIndex={i}
                exportScope="analysis-athena"
                variant="compact"
                onCopy={(text) => navigator.clipboard.writeText(text)}
                onDelete={() => saveMessages(messages.filter((_, index) => index !== i))}
                actions={<AthenaMessageExportActions message={msg} index={i} title="Olympus analysis" scope="analysis-athena" />}
              />
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
            onClick={() => { if(confirm("Clear analysis chat history?")) clearMessages(); }}
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

  // Filters for Pain Points & Findings
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  // Heatmap function/finding level severity filter
  const [selectedHeatmapSeverity, setSelectedHeatmapSeverity] = useState<string | null>(null);

  const handleCategoryClick = (cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat);
      } else {
        return [...prev, cat];
      }
    });
  };

  const handleSeverityClick = (sev: string) => {
    setSelectedSeverities((prev) => {
      if (prev.includes(sev)) {
        return prev.filter((s) => s !== sev);
      } else {
        return [...prev, sev];
      }
    });
  };

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
              // Health score: 100 minus weighted penalties (capped per tier for realistic evaluation)
              const highPenalty = Math.min(50, high * 12);
              const medPenalty = Math.min(30, med * 3);
              const lowPenalty = Math.min(15, low * 0.5);
              const rawScore = Math.max(0, Math.round(100 - highPenalty - medPenalty - lowPenalty));
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
                  <div 
                    className="border border-[var(--cp-border)] bg-[var(--cp-bg-3)] rounded p-3 flex flex-col items-center justify-center min-w-[120px] relative group cursor-help"
                    title={`Base Score: 100\nPenalties: High (-15 ea, max -50), Medium (-5 ea, max -30), Low (-1 ea, max -15)\nFindings: ${total} total (${high} Critical, ${med} Warning, ${low} Info)`}
                  >
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Health Score</span>
                    <span className="text-3xl font-black font-[Orbitron,monospace]" style={{ color: gradeColor }}>{grade}</span>
                    <span className="text-[10px] font-mono font-bold mt-0.5" style={{ color: gradeColor }}>{rawScore}/100</span>
                    <span className="text-[8px] text-muted-foreground/80 mt-1 text-center font-mono leading-tight">
                      {total === 0 ? "Perfect Codebase" : `${high} Crit · ${med} Warn · ${low} Info`}
                    </span>
                  </div>

                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div 
                      onClick={() => handleSeverityClick("high")}
                      className={`border border-red-900/50 bg-red-950/10 rounded p-3 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedSeverities.includes("high") ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] bg-red-950/30" : selectedSeverities.length > 0 ? "opacity-40" : ""
                      }`}
                    >
                      <span className="text-[9px] text-red-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <span>Critical</span>
                        {selectedSeverities.includes("high") && <span className="text-[8px] text-red-400">●</span>}
                      </span>
                      <span className="text-2xl font-bold text-red-400">{high}</span>
                    </div>

                    <div 
                      onClick={() => handleSeverityClick("medium")}
                      className={`border border-amber-900/50 bg-amber-950/10 rounded p-3 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedSeverities.includes("medium") ? "ring-2 ring-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)] bg-amber-950/30" : selectedSeverities.length > 0 ? "opacity-40" : ""
                      }`}
                    >
                      <span className="text-[9px] text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <span>Warning</span>
                        {selectedSeverities.includes("medium") && <span className="text-[8px] text-amber-400">●</span>}
                      </span>
                      <span className="text-2xl font-bold text-amber-400">{med}</span>
                    </div>

                    <div 
                      onClick={() => handleSeverityClick("low")}
                      className={`border border-green-900/50 bg-green-950/10 rounded p-3 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedSeverities.includes("low") ? "ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)] bg-green-950/30" : selectedSeverities.length > 0 ? "opacity-40" : ""
                      }`}
                    >
                      <span className="text-[9px] text-green-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <span>Info</span>
                        {selectedSeverities.includes("low") && <span className="text-[8px] text-green-400">●</span>}
                      </span>
                      <span className="text-2xl font-bold text-green-400">{low}</span>
                    </div>
                  </div>

                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-3)] rounded p-4 flex flex-col items-center justify-center min-w-[100px]">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Files</span>
                    <span className="text-2xl font-bold text-[var(--section-label)]">{filesCount}</span>
                    <span className="text-[9px] text-muted-foreground">{total} findings</span>
                  </div>
                </div>

                {/* Category Breakdown Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Object.entries(analysis?.summary?.by_category || {}).map(([cat, count]) => {
                    const cc = categoryColors[cat] || { border: "border-[var(--cp-border)]", bg: "bg-[var(--cp-bg-3)]", icon: "📋" };
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <div
                        key={cat}
                        onClick={() => handleCategoryClick(cat)}
                        className={`${cc.border} ${cc.bg} border p-2.5 rounded transition-all hover:scale-[1.02] cursor-pointer ${
                          isSelected ? "ring-2 ring-[var(--cp-cyan)] shadow-[0_0_10px_rgba(0,229,255,0.3)] bg-opacity-80" : selectedCategories.length > 0 ? "opacity-40" : ""
                        }`}
                      >
                        <span className="block text-[9px] text-muted-foreground uppercase flex items-center justify-between">
                          <span>{cc.icon} {cat.replace("_", " ")}</span>
                          {isSelected && <span className="text-[8px] text-[var(--cp-cyan)] font-bold">ACTIVE</span>}
                        </span>
                        <span className="text-lg font-bold text-foreground">{count as number}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Active Filter Bar if any filters selected */}
                {(selectedCategories.length > 0 || selectedSeverities.length > 0) && (
                  <div className="flex items-center justify-between bg-[rgba(0,229,255,0.06)] border border-[var(--cp-cyan)]/40 p-2 rounded text-xs font-mono">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-[var(--cp-cyan)]">Active Filters:</span>
                      {selectedSeverities.map((sev) => (
                        <span 
                          key={sev}
                          onClick={() => handleSeverityClick(sev)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted/30 border border-[var(--cp-border)] text-foreground flex items-center gap-1 cursor-pointer hover:border-red-400"
                        >
                          SEVERITY: {sev.toUpperCase()} <span className="text-muted-foreground hover:text-red-400">✕</span>
                        </span>
                      ))}
                      {selectedCategories.map((cat) => (
                        <span 
                          key={cat}
                          onClick={() => handleCategoryClick(cat)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted/30 border border-[var(--cp-border)] text-foreground flex items-center gap-1 cursor-pointer hover:border-red-400"
                        >
                          CATEGORY: {cat.toUpperCase()} <span className="text-muted-foreground hover:text-red-400">✕</span>
                        </span>
                      ))}
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedCategories([]);
                        setSelectedSeverities([]);
                      }}
                      className="text-[10px] uppercase font-bold text-[var(--cp-cyan)] hover:underline cursor-pointer ml-2 shrink-0"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}

                {/* Findings List */}
                <div className="space-y-2">
                  {(() => {
                    const filteredFindings = (analysis.findings || []).filter((f) => {
                      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(f.category);
                      const matchesSeverity = selectedSeverities.length === 0 || selectedSeverities.includes(f.severity);
                      return matchesCategory && matchesSeverity;
                    });

                    return (
                      <>
                        <h4 className="text-xs uppercase text-[var(--section-label)] tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <ShieldAlert size={14} /> PAIN POINTS &amp; FINDINGS ({filteredFindings.length} / {total})
                          </span>
                          {(selectedCategories.length > 0 || selectedSeverities.length > 0) && (
                            <span className="text-[10px] font-normal text-muted-foreground">
                              Filtered from {total} total findings
                            </span>
                          )}
                        </h4>
                        <div className="space-y-2">
                          {filteredFindings.length === 0 ? (
                            <div className="p-6 border border-dashed border-[var(--cp-border)] rounded text-center text-muted-foreground space-y-1">
                              <p className="text-xs font-bold uppercase">No findings match the selected filters</p>
                              <button
                                onClick={() => {
                                  setSelectedCategories([]);
                                  setSelectedSeverities([]);
                                }}
                                className="text-[10px] text-[var(--cp-cyan)] underline hover:opacity-80 cursor-pointer"
                              >
                                Reset filters to show all {total} findings
                              </button>
                            </div>
                          ) : (
                            filteredFindings.map((f, idx) => {
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
                                    <span className="px-1.5 py-0.5 rounded cursor-pointer hover:opacity-100" onClick={() => handleSeverityClick(f.severity)} style={{ background: isHigh ? "rgba(239,68,68,0.15)" : isMed ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)" }}>
                                      {f.severity.toUpperCase()}
                                    </span>
                                    <span className="cursor-pointer hover:opacity-100" onClick={() => handleCategoryClick(f.category)}>
                                      CATEGORY: {f.category?.toUpperCase() || ""}
                                    </span>
                                    <span>RULE: {f.rule_id}</span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              );
            })() : (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                <Info size={32} className="text-[var(--cp-cyan)] mb-2 animate-pulse" />
                <span className="text-xs font-mono uppercase tracking-widest text-[var(--section-label)]">
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
          <div className="h-full flex flex-col gap-2 overflow-hidden">
            {/* Heatmap Top Bar & Global Filter Controls */}
            <div className="flex items-center justify-between bg-[var(--cp-bg-3)] border border-[var(--cp-border)] p-2 rounded shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[var(--cp-cyan)] uppercase tracking-wider">File Filter:</span>
                {(["all", "high", "risky", "moderate", "low"] as const).map((tier) => {
                  const isSelected = (selectedHeatmapSeverity === tier) || (tier === "all" && !selectedHeatmapSeverity);
                  return (
                    <button
                      key={tier}
                      onClick={() => {
                        if (tier === "all") setSelectedHeatmapSeverity(null);
                        else setSelectedHeatmapSeverity(prev => prev === tier ? null : tier);
                      }}
                      className={`px-2 py-0.5 text-[9px] uppercase font-mono border rounded transition-all cursor-pointer ${
                        isSelected
                          ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.15)] text-[var(--cp-cyan)] font-bold shadow-[0_0_8px_rgba(0,229,255,0.2)]"
                          : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground hover:border-[var(--cp-cyan)]/40"
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>

              {/* Heatmap Search Box */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files by path..."
                className="w-48 bg-[var(--cp-bg-0)] text-foreground border border-[var(--cp-border)] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              />
            </div>

            <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
              {/* Left explorer list */}
              {(() => {
                const filteredFiles = complexityFiles.filter((file) => {
                  const matchesSearch = !searchQuery || file.path.toLowerCase().includes(searchQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  if (!selectedHeatmapSeverity) return true;
                  const c = file.total_complexity;
                  if (selectedHeatmapSeverity === "high") return c > 20 || file.functions.some(f => f.complexity > 20);
                  if (selectedHeatmapSeverity === "risky") return (c > 10 && c <= 20) || file.functions.some(f => f.complexity > 10 && f.complexity <= 20);
                  if (selectedHeatmapSeverity === "medium" || selectedHeatmapSeverity === "moderate") return (c > 5 && c <= 10) || file.functions.some(f => f.complexity > 5 && f.complexity <= 10);
                  if (selectedHeatmapSeverity === "low") return c <= 5;
                  return true;
                });

                return (
                  <div className="w-72 border-r border-[var(--cp-border)] pr-2 overflow-y-auto space-y-1 select-none shrink-0">
                    <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider px-1 pb-1 flex justify-between">
                      <span>Files ({filteredFiles.length} / {complexityFiles.length})</span>
                      {selectedHeatmapSeverity && (
                        <span className="text-[var(--cp-cyan)]">[{selectedHeatmapSeverity.toUpperCase()}]</span>
                      )}
                    </div>
                    {filteredFiles.length === 0 ? (
                      <div className="p-4 text-center text-[10px] text-muted-foreground font-mono">
                        No files match filter criteria
                      </div>
                    ) : (
                      filteredFiles.map((file) => {
                        const c = complexityColor(file.total_complexity);
                        const isSelected = selectedFile?.path === file.path;
                        return (
                          <div
                            key={file.path}
                            onClick={() => setSelectedFile(prev => prev?.path === file.path ? null : file)}
                            className={`p-2 border transition-all cursor-pointer flex justify-between items-center rounded ${
                              isSelected
                                ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)] shadow-[0_0_8px_rgba(0,229,255,0.15)]"
                                : "border-[var(--cp-border)] bg-[var(--cp-bg-3)] hover:border-[rgba(0,229,255,0.2)]"
                            }`}
                          >
                            <div className="truncate pr-2">
                              <span className="text-[11px] font-bold text-foreground block truncate">{file.path.split("/").pop()}</span>
                              <span className="text-[9px] text-muted-foreground block truncate">{file.path}</span>
                            </div>
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded shrink-0" style={{ backgroundColor: c.bg, color: c.fg }}>
                              {file.total_complexity}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })()}

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
                      <span className="text-[var(--section-label)]">📦</span> {selectedFile.repo || repoName}
                      <span className="mx-1 text-muted-foreground">›</span>
                      <span className="text-[var(--section-label)]">📁</span> {selectedFile.path}
                    </div>
                  </div>

                  {/* Overview Metrics (Non-filterable summary row) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider font-mono">
                        {grade.toUpperCase()} FILE SCORE
                      </span>
                      <span className="text-xl font-black font-mono" style={{ color: cxColor.fg }}>{totalCx}</span>
                    </div>

                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider font-mono">TOTAL FUNCTIONS</span>
                      <span className="text-xl font-black text-foreground font-mono">{fnCount}</span>
                    </div>

                    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                      <span className="block text-[8px] text-muted-foreground uppercase tracking-wider font-mono">COMPLEXITY GRADE</span>
                      <span className="text-lg font-bold font-mono" style={{ color: cxColor.fg }}>{cxColor.label}</span>
                    </div>
                  </div>

                  {/* Filterable Severity Breakdown (Row 2) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div 
                      onClick={() => setSelectedHeatmapSeverity(prev => prev === "high" ? null : "high")}
                      className={`border border-red-900/50 bg-red-950/10 rounded p-2.5 text-center cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedHeatmapSeverity === "high" ? "ring-2 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] bg-red-950/30" : selectedHeatmapSeverity ? "opacity-40" : ""
                      }`}
                    >
                      <span className="block text-[8px] text-red-400 uppercase tracking-wider font-bold font-mono flex items-center justify-center gap-1">
                        <span>HIGH COMPLEXITY ({">"}20)</span>
                        {selectedHeatmapSeverity === "high" && <span className="text-[8px] text-red-400">●</span>}
                      </span>
                      <span className="text-xl font-black text-red-400 font-mono">{highFns}</span>
                    </div>

                    <div 
                      onClick={() => setSelectedHeatmapSeverity(prev => prev === "medium" || prev === "moderate" ? null : "medium")}
                      className={`border border-amber-900/40 bg-amber-950/10 rounded p-2.5 text-center cursor-pointer transition-all hover:scale-[1.02] ${
                        (selectedHeatmapSeverity === "medium" || selectedHeatmapSeverity === "moderate") ? "ring-2 ring-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)] bg-amber-950/30" : selectedHeatmapSeverity ? "opacity-40" : ""
                      }`}
                    >
                      <span className="block text-[8px] text-amber-400 uppercase tracking-wider font-bold font-mono flex items-center justify-center gap-1">
                        <span>MEDIUM (6-20)</span>
                        {(selectedHeatmapSeverity === "medium" || selectedHeatmapSeverity === "moderate") && <span className="text-[8px] text-amber-400">●</span>}
                      </span>
                      <span className="text-xl font-black text-amber-400 font-mono">{medFns}</span>
                    </div>

                    <div 
                      onClick={() => setSelectedHeatmapSeverity(prev => prev === "low" ? null : "low")}
                      className={`border border-green-900/40 bg-green-950/10 rounded p-2.5 text-center cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedHeatmapSeverity === "low" ? "ring-2 ring-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)] bg-green-950/30" : selectedHeatmapSeverity ? "opacity-40" : ""
                      }`}
                    >
                      <span className="block text-[8px] text-green-400 uppercase tracking-wider font-bold font-mono flex items-center justify-center gap-1">
                        <span>LOW (1-5)</span>
                        {selectedHeatmapSeverity === "low" && <span className="text-[8px] text-green-400">●</span>}
                      </span>
                      <span className="text-xl font-black text-green-400 font-mono">{lowFns}</span>
                    </div>
                  </div>

                  {/* Function Breakdown Table */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest flex items-center gap-1.5">
                        Function Breakdown
                        {selectedHeatmapSeverity && (
                          <span className="text-[9px] font-normal text-[var(--cp-cyan)] uppercase">
                            (Filtered: {selectedHeatmapSeverity.toUpperCase()})
                          </span>
                        )}
                      </h5>
                      {selectedHeatmapSeverity && (
                        <button
                          onClick={() => setSelectedHeatmapSeverity(null)}
                          className="text-[9px] text-[var(--cp-cyan)] hover:underline uppercase font-bold cursor-pointer"
                        >
                          Show All Functions
                        </button>
                      )}
                    </div>
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
                        {selectedFile.functions
                          .filter((fn) => {
                            if (!selectedHeatmapSeverity) return true;
                            if (selectedHeatmapSeverity === "high") return fn.complexity > 20;
                            if (selectedHeatmapSeverity === "medium") return fn.complexity > 5 && fn.complexity <= 20;
                            if (selectedHeatmapSeverity === "low") return fn.complexity <= 5;
                            return true;
                          })
                          .map((fn, idx) => {
                          const fc = complexityColor(fn.complexity);
                          const icon = typeIcons[fn.node_type] || "λ";
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
              })() : (() => {
                const total = analysis?.summary?.totalFindings || 0;
                const high = analysis?.summary?.by_severity?.high || 0;
                const med = analysis?.summary?.by_severity?.medium || 0;
                const low = analysis?.summary?.by_severity?.low || 0;
                const filesCount = analysis?.summary?.filesAnalyzed || 0;
                const categoryColors: Record<string, { border: string; bg: string; icon: string }> = {
                  security: { border: "border-red-800", bg: "bg-red-950/20", icon: "🔒" },
                  structural: { border: "border-orange-800", bg: "bg-orange-950/20", icon: "🏗️" },
                  performance: { border: "border-purple-800", bg: "bg-purple-950/20", icon: "⚡" },
                  modernization: { border: "border-blue-800", bg: "bg-blue-950/20", icon: "🔄" },
                  style: { border: "border-slate-700", bg: "bg-slate-950/20", icon: "🎨" },
                  dead_code: { border: "border-zinc-700", bg: "bg-zinc-950/20", icon: "💀" },
                };

                const filteredProjectFindings = (analysis?.findings || []).filter((f) => {
                  if (!selectedHeatmapSeverity) return true;
                  return f.severity === selectedHeatmapSeverity || (selectedHeatmapSeverity === "moderate" && f.severity === "medium");
                });

                return (
                  <div className="space-y-4 p-2 font-mono">
                    <div className="bg-[rgba(0,229,255,0.06)] border border-[var(--cp-cyan)]/40 p-3 rounded flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📦</span>
                          <h4 className="text-sm font-black text-foreground uppercase tracking-wider">Whole Project Analysis Overview</h4>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Viewing project-wide rules, findings, and complexity metrics for <strong className="text-[var(--cp-cyan)]">{repoName}</strong>. Select a file from the explorer on the left to inspect file-specific findings.
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] rounded text-[9px] text-[var(--cp-cyan)] font-bold shrink-0">
                        {filesCount} Files Analyzed
                      </span>
                    </div>

                    {/* Summary Row */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                        <span className="block text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Total Findings</span>
                        <span className="text-xl font-black text-foreground">{total}</span>
                      </div>
                      <div className="border border-red-900/50 bg-red-950/10 rounded p-2.5 text-center">
                        <span className="block text-[8px] text-red-400 uppercase font-bold tracking-wider">Critical High</span>
                        <span className="text-xl font-black text-red-400">{high}</span>
                      </div>
                      <div className="border border-amber-900/40 bg-amber-950/10 rounded p-2.5 text-center">
                        <span className="block text-[8px] text-amber-400 uppercase font-bold tracking-wider">Warning Medium</span>
                        <span className="text-xl font-black text-amber-400">{med}</span>
                      </div>
                      <div className="border border-green-900/40 bg-green-950/10 rounded p-2.5 text-center">
                        <span className="block text-[8px] text-green-400 uppercase font-bold tracking-wider">Info Low</span>
                        <span className="text-xl font-black text-green-400">{low}</span>
                      </div>
                    </div>

                    {/* Category Breakdown */}
                    <div className="space-y-1">
                      <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Findings by Category</h5>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                        {Object.entries(analysis?.summary?.by_category || {}).map(([cat, count]) => {
                          const cc = categoryColors[cat] || { border: "border-[var(--cp-border)]", bg: "bg-[var(--cp-bg-3)]", icon: "📋" };
                          return (
                            <div key={cat} className={`${cc.border} ${cc.bg} border p-2 rounded text-xs`}>
                              <span className="block text-[9px] text-muted-foreground uppercase">{cc.icon} {cat.replace("_", " ")}</span>
                              <span className="text-base font-bold text-foreground">{count as number}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Project Findings List */}
                    <div className="space-y-2">
                      <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest flex items-center justify-between">
                        <span>Project Pain Points &amp; Findings ({filteredProjectFindings.length} / {total})</span>
                        {selectedHeatmapSeverity && (
                          <span className="text-[var(--cp-cyan)] text-[9px] font-normal">Filtered: {selectedHeatmapSeverity.toUpperCase()}</span>
                        )}
                      </h5>
                      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                        {filteredProjectFindings.map((f, idx) => {
                          const isHigh = f.severity === "high";
                          const isMed = f.severity === "medium";
                          const cc = categoryColors[f.category] || { border: "border-[var(--cp-border)]", bg: "bg-[var(--cp-bg-3)]", icon: "📋" };
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                const targetFile = complexityFiles.find(cf => cf.path === f.path);
                                if (targetFile) setSelectedFile(targetFile);
                              }}
                              className={`p-2.5 border rounded text-[10px] leading-relaxed cursor-pointer transition-all hover:scale-[1.01] ${
                                isHigh ? "border-red-900 bg-red-950/10 hover:border-red-500" : isMed ? "border-amber-900/50 bg-amber-950/10 hover:border-amber-500" : "border-[var(--cp-border)] bg-[var(--cp-bg-3)] hover:border-[var(--cp-cyan)]"
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? "bg-red-500 animate-pulse" : isMed ? "bg-amber-500" : "bg-green-500"}`} />
                                  <span className="opacity-70 mr-0.5">{cc.icon}</span>
                                  {f.title}
                                </span>
                                <span className="text-[9px] text-[var(--cp-cyan)] font-mono hover:underline">
                                  {f.path}:{f.line} ›
                                </span>
                              </div>
                              <p className="text-muted-foreground text-[10px]">{f.detail}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
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
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={handleToggleCollapse} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} visualization="Complexity Tree" screenContext={{ repository: repoName, visibleNodeCount: nodes.length, activeDepth, labelsVisible: showLabels, totalFindingCount: findings.length }} />
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
      <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={() => {}} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} visualization="Radial Complexity" screenContext={{ repository: repoName, analyzedNodeCount: nodes.length, fileCount: computeAstComplexity(nodes).length, totalComplexity: computeAstComplexity(nodes).reduce((sum, file) => sum + file.total_complexity, 0), totalFindingCount: findings.length }} />
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
        <DetailDrawer selectedNode={selectedNode} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onToggleCollapse={handleToggleCollapse} findings={findings} repoName={repoName} serverUrl={serverUrl} apiKey={apiKey} visualization="Radial Cluster" screenContext={{ repository: repoName, visibleNodeCount: nodes.length, activeDepth, totalFindingCount: findings.length }} />
      </div>
    </div>
  );
}
