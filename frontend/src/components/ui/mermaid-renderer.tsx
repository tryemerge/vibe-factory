import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

let mermaidInitialized = false;

const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  code,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      mermaidInitialized = true;
    }
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current || !code) return;

      try {
        setError(null);
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to render diagram'
        );
      }
    };

    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="text-red-500 text-sm p-2 border border-red-400 rounded">
        <div className="font-semibold">Failed to render mermaid diagram:</div>
        <pre className="text-xs mt-1">{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-container ${className}`}
      style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}
    />
  );
};

export default MermaidRenderer;
