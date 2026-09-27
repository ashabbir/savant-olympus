import { useState, useEffect, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      suppressError: true,
      themeVariables: {
        primaryColor: '#00f2ff',
        primaryTextColor: '#fff',
        primaryBorderColor: '#00f2ff',
        lineColor: '#ff00ff',
        secondaryColor: '#f4ea00',
        tertiaryColor: '#0a0a0a'
      }
    } as any);
    mermaidInitialized = true;
  }
}

const Mermaid = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<boolean>(false)
  const id = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`)

  useEffect(() => {
    ensureMermaidInitialized();
    let isCancelled = false;

    const renderDiagram = async () => {
      try {
        setError(false)
        const { svg: renderedSvg } = await mermaid.render(id.current, chart)
        if (!isCancelled) setSvg(renderedSvg)
      } catch (err: any) {
        if (!isCancelled) setError(true)
      }
    }

    renderDiagram()
    return () => { isCancelled = true; }
  }, [chart])

  if (error) {
    return (
      <SyntaxHighlighter
        style={vscDarkPlus as any}
        language="mermaid"
        PreTag="div"
      >
        {chart}
      </SyntaxHighlighter>
    )
  }

  return (
    <div 
      className="mermaid" 
      data-testid="mermaid-svg"
      dangerouslySetInnerHTML={{ __html: svg }} 
      style={{ width: '100%', overflow: 'auto', marginBottom: '1rem' }}
    />
  )
}

export default Mermaid
