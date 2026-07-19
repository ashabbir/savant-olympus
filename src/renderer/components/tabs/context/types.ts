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
