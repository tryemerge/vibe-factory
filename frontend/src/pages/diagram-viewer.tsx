import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { makeRequest } from '@/lib/api';
import mermaid from 'mermaid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { validateMermaidCode, preprocessMermaidCode } from '@/utils/mermaidValidation';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

interface MermaidDiagram {
  id: string;
  title: string;
  content: string;
  lineNumber: number;
}


export function DiagramViewer() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<MermaidDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<{ name: string; git_repo_path: string } | null>(null);
  const [zoomLevels, setZoomLevels] = useState<{ [key: string]: number }>({});
  const [markdownContent, setMarkdownContent] = useState<string>('');

  useEffect(() => {
    // Initialize Mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    if (projectId) {
      fetchProjectAndDiagrams();
    }
  }, [projectId]);


  const fetchProjectAndDiagrams = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch project details
      const projectResponse = await makeRequest(
        `/api/projects/${projectId}/with-branch`
      );

      if (projectResponse.ok) {
        const projectResult: ApiResponse<any> = await projectResponse.json();
        if (projectResult.success && projectResult.data) {
          setProject(projectResult.data);

          // Try to read UML.md file
          const fileResponse = await makeRequest(
            `/api/filesystem/read-file?project_path=${encodeURIComponent(projectResult.data.git_repo_path)}&file_name=UML.md`
          );

          if (fileResponse.ok) {
            const fileResult: ApiResponse<string> = await fileResponse.json();
            if (fileResult.success && fileResult.data) {
              setMarkdownContent(fileResult.data);
              const parsedDiagrams = parseMermaidFromMarkdown(fileResult.data);
              setDiagrams(parsedDiagrams);
            } else {
              setError(
                'UML.md file not found. Please generate diagrams first.'
              );
            }
          } else {
            setError(
              'Failed to read UML.md file. Please generate diagrams first.'
            );
          }
        }
      }
    } catch (err) {
      console.error('Error fetching diagrams:', err);
      setError('Failed to load diagrams');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const parseMermaidFromMarkdown = (markdown: string): MermaidDiagram[] => {
    const diagrams: MermaidDiagram[] = [];
    const lines = markdown.split('\n');
    let currentDiagram: { title: string; content: string[]; lineNumber: number } | null = null;
    let inCodeBlock = false;
    let blockType = '';
    let codeBlockStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for code block start
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // End of code block
          if (currentDiagram && blockType === 'mermaid') {
            diagrams.push({
              id: `diagram-${diagrams.length + 1}`,
              title: currentDiagram.title,
              content: currentDiagram.content.join('\n'),
              lineNumber: currentDiagram.lineNumber,
            });
          }
          currentDiagram = null;
          inCodeBlock = false;
          blockType = '';
        } else {
          // Start of code block
          blockType = line.substring(3).trim();
          codeBlockStartLine = i;
          if (blockType === 'mermaid') {
            inCodeBlock = true;
            // Look for title in previous lines (search more broadly)
            let title = `Diagram ${diagrams.length + 1}`;
            for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
              const prevLine = lines[j].trim();
              if (prevLine.startsWith('#')) {
                title = prevLine.replace(/^#+\s*/, '');
                break;
              }
            }
            currentDiagram = {
              title,
              content: [],
              lineNumber: codeBlockStartLine,
            };
          }
        }
      } else if (inCodeBlock && currentDiagram && blockType === 'mermaid') {
        // Add line to current diagram
        currentDiagram.content.push(line);
      }
    }

    return diagrams;
  };



  const handleGoBack = () => {
    navigate(`/projects/${projectId}/tasks`);
  };

  const handleZoomIn = (diagramId: string) => {
    setZoomLevels((prev) => ({
      ...prev,
      [diagramId]: Math.min((prev[diagramId] || 1) + 0.25, 3),
    }));
  };

  const handleZoomOut = (diagramId: string) => {
    setZoomLevels((prev) => ({
      ...prev,
      [diagramId]: Math.max((prev[diagramId] || 1) - 0.25, 0.25),
    }));
  };

  const handleZoomReset = (diagramId: string) => {
    setZoomLevels((prev) => ({
      ...prev,
      [diagramId]: 1,
    }));
  };

  const getZoomLevel = (diagramId: string) => {
    return zoomLevels[diagramId] || 1;
  };


  const MermaidDiagram = ({ 
    content, 
    diagramId, 
    onZoomIn, 
    onZoomOut, 
    onZoomReset, 
    getZoomLevel 
  }: { 
    content: string; 
    diagramId: string;
    onZoomIn: (id: string) => void;
    onZoomOut: (id: string) => void;
    onZoomReset: (id: string) => void;
    getZoomLevel: (id: string) => number;
  }) => {
    const diagramRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<Error | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    
    useEffect(() => {
      const renderDiagram = async () => {
        if (!diagramRef.current || !content.trim()) return;

        setError(null);
        setWarnings([]);

        try {
          // Clear previous content
          diagramRef.current.innerHTML = '';
          
          // Step 1: Preprocess the code to fix common issues
          const preprocessedContent = preprocessMermaidCode(content);
          
          // Step 2: Validate the code
          const validation = validateMermaidCode(preprocessedContent);
          
          if (!validation.isValid) {
            setError(validation.error || new Error('Unknown validation error'));
            return;
          }

          // Set warnings if any
          if (validation.warnings) {
            setWarnings(validation.warnings);
          }
          
          // Step 3: Render the diagram using normalized code
          const codeToRender = validation.normalizedCode || preprocessedContent;
          const uniqueId = `mermaid-inline-${diagramId}-${Date.now()}`;
          
          const { svg } = await mermaid.render(uniqueId, codeToRender);
          diagramRef.current.innerHTML = svg;
          
        } catch (err) {
          console.error(`Error rendering mermaid diagram ${diagramId}:`, err);
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(new Error(`Rendering failed: ${errorMessage}`));
        }
      };
      
      renderDiagram();
    }, [content, diagramId]);

    // Render error state
    if (error) {
      return (
        <div className="my-6">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-destructive mb-3">
                <AlertCircle className="h-5 w-5" />
                <h4 className="font-semibold">Diagram Error</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {error.message}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium mb-2">Show Raw Mermaid Code</summary>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                  {content}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    return (
      <div className="my-6">
        {/* Show warnings if any */}
        {warnings.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 mb-4">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">Diagram Warnings</span>
              </div>
              <ul className="text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="list-disc list-inside">
                    {warning}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        
        <div className="border rounded-md bg-white dark:bg-gray-50 p-4 relative group overflow-hidden">
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-md shadow-md border p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              className="w-6 h-6 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded flex items-center justify-center"
              onClick={() => onZoomOut(diagramId)}
              disabled={getZoomLevel(diagramId) <= 0.25}
            >
              −
            </button>
            <span className="text-xs px-1 min-w-[2rem] text-center">
              {Math.round(getZoomLevel(diagramId) * 100)}%
            </span>
            <button
              className="w-6 h-6 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded flex items-center justify-center"
              onClick={() => onZoomIn(diagramId)}
              disabled={getZoomLevel(diagramId) >= 3}
            >
              +
            </button>
            <button
              className="w-6 h-6 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded flex items-center justify-center"
              onClick={() => onZoomReset(diagramId)}
              disabled={getZoomLevel(diagramId) === 1}
            >
              ⟲
            </button>
          </div>
          <div className="w-full overflow-auto">
            <div
              ref={diagramRef}
              className="transition-transform duration-200 min-w-fit min-h-fit"
              style={{
                transform: `scale(${getZoomLevel(diagramId)})`,
                transformOrigin: 'center',
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  const CustomCodeComponent = ({ inline, className, children, ...props }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    if (!inline && language === 'mermaid') {
      const diagramContent = String(children).replace(/\n$/, '');
      // Generate a stable ID based on content hash
      const diagramId = `inline-${diagramContent.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0).toString(36)}`;
      
      return (
        <ErrorBoundary>
          <MermaidDiagram 
            content={diagramContent} 
            diagramId={diagramId}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            getZoomLevel={getZoomLevel}
          />
        </ErrorBoundary>
      );
    }

    if (!inline && language === 'text') {
      return (
        <div className="my-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-md border">
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {children}
          </pre>
        </div>
      );
    }

    if (!inline) {
      return (
        <div className="my-4">
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md border overflow-x-auto">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    }

    return (
      <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
        {children}
      </code>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading diagrams...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tasks
          </Button>
          <h1 className="text-2xl font-bold">UML Diagrams</h1>
        </div>

        <Card>
          <CardContent className="text-center py-8">
            <div className="flex items-center justify-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
            <p className="text-muted-foreground mb-4">
              Generate UML diagrams by clicking the Visualise button on the
              tasks page.
            </p>
            <Button onClick={handleGoBack}>Go Back to Tasks</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" onClick={handleGoBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tasks
        </Button>
        <div>
          <h1 className="text-2xl font-bold">UML Diagrams</h1>
          {project && <p className="text-muted-foreground">{project.name}</p>}
        </div>
      </div>

      {/* Content */}
      {diagrams.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              No diagrams found in UML.md file.
            </p>
            <Button onClick={handleGoBack}>Go Back to Tasks</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-none">
          <Card>
            <CardContent className="p-8">
              <ErrorBoundary>
                <div className="prose prose-gray dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      code: CustomCodeComponent,
                      h1: ({ children, ...props }) => (
                        <h1 className="text-3xl font-bold tracking-tight mb-6 text-gray-900 dark:text-gray-100" {...props}>
                          {children}
                        </h1>
                      ),
                      h2: ({ children, ...props }) => (
                        <h2 className="text-2xl font-semibold tracking-tight mb-4 mt-8 text-gray-900 dark:text-gray-100" {...props}>
                          {children}
                        </h2>
                      ),
                      h3: ({ children, ...props }) => (
                        <h3 className="text-xl font-semibold mb-3 mt-6 text-gray-900 dark:text-gray-100" {...props}>
                          {children}
                        </h3>
                      ),
                      p: ({ children, ...props }) => (
                        <p className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed" {...props}>
                          {children}
                        </p>
                      ),
                      ul: ({ children, ...props }) => (
                        <ul className="mb-4 pl-6 space-y-2 text-gray-700 dark:text-gray-300" {...props}>
                          {children}
                        </ul>
                      ),
                      ol: ({ children, ...props }) => (
                        <ol className="mb-4 pl-6 space-y-2 text-gray-700 dark:text-gray-300" {...props}>
                          {children}
                        </ol>
                      ),
                      li: ({ children, ...props }) => (
                        <li className="leading-relaxed" {...props}>
                          {children}
                        </li>
                      ),
                    }}
                  >
                    {markdownContent}
                  </ReactMarkdown>
                </div>
              </ErrorBoundary>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
