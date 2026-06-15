import { describe, it, expect } from 'vitest'
import {
  analyzeProjectSource,
  complexityColor,
  computeAstComplexity,
  type ASTNode,
  type CodeDoc,
} from '../components/tabs/ContextVisualizations'

describe('ContextVisualizations analysis helpers', () => {
  it('computes per-file complexity from typed AST nodes', () => {
    const nodes: ASTNode[] = [
      { repo: 'repo-a', path: 'src/a.ts', name: 'outer', node_type: 'function', start_line: 1, end_line: 50 },
      { repo: 'repo-a', path: 'src/a.ts', name: 'inner', node_type: 'method', start_line: 10, end_line: 20 },
      { repo: 'repo-a', path: 'src/b.ts', name: 'Model', node_type: 'class', start_line: 1, end_line: 12 },
      { repo: 'repo-a', path: 'src/b.ts', name: 'ignored', node_type: 'variable', start_line: 1, end_line: 1 },
    ]

    const files = computeAstComplexity(nodes)

    expect(files).toHaveLength(2)
    expect(files[0].path).toBe('src/a.ts')
    expect(files[0].functions[0]).toMatchObject({ name: 'outer', child_count: 1, complexity: 5 })
    expect(files[0].total_complexity).toBe(6)
    expect(files[1].functions).toHaveLength(1)
  })

  it('maps complexity scores to stable severity labels and colors', () => {
    expect(complexityColor(3).label).toBe('Low')
    expect(complexityColor(8).label).toBe('Moderate')
    expect(complexityColor(15).label).toBe('Risky')
    expect(complexityColor(25).label).toBe('High')
  })

  it('detects structural, security, modernization, style, and dead-code findings', () => {
    const astNodes: ASTNode[] = [
      { repo: 'repo-a', path: 'src/example.py', name: 'big_fn', node_type: 'function', start_line: 1, end_line: 135 },
    ]
    const codeDocs: CodeDoc[] = [
      {
        path: 'src/example.py',
        language: 'python',
        content: [
          'def big_fn(a, b, c, d, e, f):',
          '    API_KEY = "abcdef-secret"',
          '    eval(user_input)',
          '    cursor.execute(f"SELECT * FROM users WHERE id={user_id}")',
          '    df.append(row)',
          '    if ready:',
          '        pass',
          '    return True',
          '    print("unreachable")',
        ].join('\n'),
      },
    ]

    const analysis = analyzeProjectSource(astNodes, codeDocs)
    const ruleIds = analysis.findings.map((finding) => finding.rule_id)

    expect(analysis.summary.filesAnalyzed).toBe(1)
    expect(ruleIds).toEqual(expect.arrayContaining([
      'large_block_bloat',
      'parameter_overload',
      'hardcoded_secret',
      'insecure_call',
      'sql_injection_pattern',
      'deprecated_append_api',
      'missing_return_type_hint',
      'empty_block',
      'unreachable_code',
    ]))
    expect(analysis.summary.by_severity.high).toBeGreaterThan(0)
    expect(analysis.summary.by_category.security).toBe(3)
  })

  it('returns empty analysis for empty inputs', () => {
    const analysis = analyzeProjectSource([], [])
    expect(analysis.summary.totalFindings).toBe(0)
    expect(analysis.findings).toEqual([])
  })
})
