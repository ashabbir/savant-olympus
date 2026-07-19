import { ASTNode, CodeDoc, Finding, AnalysisResults } from "../types";

export function detectStructural(lines: string[], fileNodes: ASTNode[], path: string, pushFinding: any) {
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

export function detectSecurity(lines: string[], path: string, pushFinding: any) {
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
    if (/cors.*\*|Access-Control-Allow-Origin.*\*/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "cors_wildcard", path, line: lineNo, title: "CORS wildcard origin", detail: "Wildcard CORS allows any domain to access resources. Restrict to known origins." });
    }
    if (/\b(DEBUG|debug)\s*[:=]\s*(True|true|1)\b/.test(trimmed) && !/(test|spec|mock)/i.test(path)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "debug_enabled", path, line: lineNo, title: "Debug mode enabled", detail: "Debug mode should be disabled in production configurations." });
    }
    if (/\b(pickle\.load|yaml\.load|yaml\.unsafe_load|marshal\.loads?)\s*\(/.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "unsafe_deserialization", path, line: lineNo, title: "Unsafe deserialization", detail: "pickle/yaml.load/marshal can execute arbitrary code from untrusted data. Use safe alternatives." });
    }
    if (/\b(md5|sha1)\s*\(|hashlib\.(md5|sha1)/i.test(trimmed) && !/hmac/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "weak_hash", path, line: lineNo, title: "Weak hash algorithm", detail: "MD5/SHA1 are cryptographically broken. Use SHA-256 or stronger for security-sensitive hashing." });
    }
    if (/\.innerHTML\s*=|dangerouslySetInnerHTML/i.test(trimmed)) {
      pushFinding({ severity: "medium", category: "security", rule_id: "xss_innerHTML", path, line: lineNo, title: "Potential XSS via innerHTML", detail: "Direct innerHTML assignment can lead to cross-site scripting. Sanitize content or use safe DOM APIs." });
    }
    if (/subprocess\.(call|run|Popen)\s*\(.*shell\s*=\s*True/i.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "shell_injection", path, line: lineNo, title: "Shell injection risk", detail: "subprocess with shell=True is vulnerable to shell injection. Pass command as a list without shell=True." });
    }
    if (/verify\s*=\s*False|SSL_CERT_NONE|CERT_NONE/i.test(trimmed)) {
      pushFinding({ severity: "high", category: "security", rule_id: "ssl_disabled", path, line: lineNo, title: "SSL verification disabled", detail: "Disabling SSL verification exposes connections to man-in-the-middle attacks." });
    }
  });
}

export function detectModernization(lines: string[], path: string, pushFinding: any) {
  let callbackDepth = 0;
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const lineNo = idx + 1;
    if (/\b\w+\.append\(/.test(trimmed) && /\bpd\b|\bpandas\b|dataframe|df\./i.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "deprecated_append_api", path, line: lineNo, title: "Deprecated append-style API usage", detail: "Consider replacing append-style flows with concat-style batching." });
    }
    if (/^\s*var\s+/.test(line) && /\.(js|ts|jsx|tsx)$/.test(path)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "var_usage", path, line: lineNo, title: "Legacy var declaration", detail: "Use const/let instead of var. var has function-scoping that causes subtle bugs." });
    }
    if (/\brequire\s*\(\s*['"]/.test(trimmed) && /\.(ts|tsx|mjs)$/.test(path)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "commonjs_require", path, line: lineNo, title: "CommonJS require in ESM file", detail: "Use ES module import syntax instead of require() for better tree-shaking and type safety." });
    }
    if (/\bcallback\b|function\s*\(err/.test(trimmed) || /\.then\s*\(.*\.then\s*\(/.test(trimmed)) {
      callbackDepth++;
      if (callbackDepth >= 3) {
        pushFinding({ severity: "medium", category: "modernization", rule_id: "callback_hell", path, line: lineNo, title: "Callback nesting / promise chain", detail: "Deep callback nesting or chained .then() calls. Refactor to async/await for readability." });
        callbackDepth = 0;
      }
    }
    if (/\.(js|ts|jsx|tsx)$/.test(path) && /["']\s*\+\s*\w+\s*\+\s*["']/.test(trimmed) && !/require|import/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "string_concat", path, line: lineNo, title: "String concatenation", detail: "Use template literals (`${var}`) instead of string concatenation for cleaner code." });
    }
    if (/\.(py)$/.test(path) && /%\s*\(/.test(trimmed) && !/^\s*#/.test(line)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "old_string_format", path, line: lineNo, title: "Legacy % string formatting", detail: "Use f-strings or .format() instead of %-style string formatting." });
    }
    if (/class\s+\w+\s+extends\s+(React\.Component|Component|PureComponent)/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "class_component", path, line: lineNo, title: "Class-based React component", detail: "Consider migrating to functional components with hooks for simpler state management and better performance." });
    }
    if (/\.(ts|tsx)$/.test(path) && /:\s*any\b/.test(trimmed) && !/eslint-disable|@ts-ignore/.test(trimmed)) {
      pushFinding({ severity: "low", category: "modernization", rule_id: "typescript_any", path, line: lineNo, title: "TypeScript 'any' type", detail: "Explicit 'any' defeats type safety. Use a specific type, unknown, or a generic instead." });
    }
  });
}

export function detectStyle(lines: string[], fileNodes: ASTNode[], path: string, pushFinding: any) {
  let consecutiveBlankLines = 0;
  let consoleLogCount = 0;
  const importLines: string[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNo = idx + 1;

    const m = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/);
    if (m && !/->\s*[^:]+:/.test(line)) {
      pushFinding({ severity: "low", category: "style", rule_id: "missing_return_type_hint", path, line: lineNo, title: "Missing return type hint", detail: `${m[1]} has no return type annotation.` });
    }

    if (/\.(js|ts|jsx|tsx|py)$/.test(path)) {
      const magicMatch = trimmed.match(/(?:^|[^\w.])(\d{2,})(?:[^\w.]|$)/);
      if (magicMatch && !/^\s*(const|let|var|#define|import|from|export)\b/.test(line)
          && !/\b(port|timeout|status|code|version|0x|0b|0o)\b/i.test(trimmed)
          && parseInt(magicMatch[1]) > 1 && !/^\s*[#\/]/.test(line)) {
        const num = magicMatch[1];
        if (num !== "100" && num !== "1000" && !/^\d{4}$/.test(num)) {
          pushFinding({ severity: "low", category: "style", rule_id: "magic_number", path, line: lineNo, title: "Magic number", detail: `Numeric literal ${num} should be extracted to a named constant for clarity.` });
        }
      }
    }

    if (line.length > 150 && !/^\s*(import|from|require|\*|url|href|src)/.test(line)) {
      pushFinding({ severity: "low", category: "style", rule_id: "long_line", path, line: lineNo, title: "Long line", detail: `Line is ${line.length} characters. Consider breaking it up for readability (threshold: 150).` });
    }

    if (!trimmed) {
      consecutiveBlankLines++;
      if (consecutiveBlankLines >= 4) {
        pushFinding({ severity: "low", category: "style", rule_id: "excessive_blank_lines", path, line: lineNo, title: "Excessive blank lines", detail: "4+ consecutive blank lines reduce readability. Use 1-2 blank lines to separate sections." });
        consecutiveBlankLines = 0;
      }
    } else {
      consecutiveBlankLines = 0;
    }

    if (/\b(console\.log|console\.debug|print)\s*\(/.test(trimmed) && !/(test|spec|debug|log)/i.test(path)) {
      consoleLogCount++;
    }

    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed) || /except\s*:?\s*$/.test(trimmed)) {
      pushFinding({ severity: "medium", category: "style", rule_id: "empty_catch", path, line: lineNo, title: "Swallowed exception", detail: "Empty catch/except block silently swallows errors. At minimum, log the error." });
    }

    if (/\.(py)$/.test(path)) {
      const pyFn = trimmed.match(/^def\s+([a-z][a-zA-Z0-9]*)\s*\(/);
      if (pyFn && /[a-z][A-Z]/.test(pyFn[1])) {
        pushFinding({ severity: "low", category: "style", rule_id: "naming_convention", path, line: lineNo, title: "Non-PEP8 function name", detail: `${pyFn[1]} uses camelCase. Python convention is snake_case.` });
      }
    }

    if (/^\s*(import|from)\s+/.test(line)) {
      importLines.push(trimmed);
    }
  });

  if (consoleLogCount >= 5) {
    pushFinding({ severity: "medium", category: "style", rule_id: "console_log_spam", path, line: 1, title: "Excessive logging statements", detail: `${consoleLogCount} console.log/print statements found. Use a proper logger or clean up debug output.` });
  }

  const importSet = new Set<string>();
  importLines.forEach((imp) => {
    if (importSet.has(imp)) {
      pushFinding({ severity: "low", category: "style", rule_id: "duplicate_import", path, line: 1, title: "Duplicate import", detail: `"${imp.slice(0, 60)}" is imported more than once.` });
    }
    importSet.add(imp);
  });

  if (lines.length > 500) {
    pushFinding({ severity: lines.length > 1000 ? "high" : "medium", category: "style", rule_id: "god_file", path, line: 1, title: "God file", detail: `File has ${lines.length} lines. Consider breaking it into smaller, focused modules.` });
  }
}

export function detectDeadCode(lines: string[], path: string, pushFinding: any) {
  let commentedCodeBlock = 0;
  let commentedCodeStart = 0;
  let todoCount = 0;
  let fixmeCount = 0;
  let hackCount = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const curr = lines[i].trim();
    if (/^(return|break|raise|throw)\b/.test(curr)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith("#") || next.startsWith("//") || next === "}") continue;
        pushFinding({ severity: "medium", category: "dead_code", rule_id: "unreachable_code", path, line: j + 1, title: "Potential unreachable code", detail: "Code appears after an early exit statement in the same block." });
        break;
      }
    }

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

    if (/\bTODO\b/i.test(curr) && (curr.startsWith("#") || curr.startsWith("//"))) todoCount++;
    if (/\bFIXME\b/i.test(curr)) fixmeCount++;
    if (/\bHACK\b/i.test(curr)) hackCount++;
  }

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

export function detectPerformance(lines: string[], path: string, pushFinding: any) {
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    const lineNo = idx + 1;

    if (/\b(for|while|forEach|map)\b/.test(trimmed)) {
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

    if (/new RegExp\(|re\.compile\(/.test(trimmed)) {
      for (let k = idx - 1; k >= Math.max(0, idx - 10); k--) {
        if (/\b(for|while|forEach|map)\b/.test(lines[k].trim())) {
          pushFinding({ severity: "low", category: "performance", rule_id: "regex_in_loop", path, line: lineNo, title: "Regex compilation in loop", detail: "Compiling regex inside a loop is wasteful. Compile once outside the loop and reuse." });
          break;
        }
      }
    }
  });
}

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
