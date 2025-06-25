import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { makeRequest } from '@/lib/api';
import mermaid from 'mermaid';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

interface MermaidDiagram {
  id: string;
  title: string;
  content: string;
}

export function DiagramViewer() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [diagrams, setDiagrams] = useState<MermaidDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [zoomLevels, setZoomLevels] = useState<{ [key: string]: number }>({});
  const diagramRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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

  useEffect(() => {
    // Render diagrams after they're loaded
    if (diagrams.length > 0) {
      renderDiagrams();
    }
  }, [diagrams]);

  const fetchProjectAndDiagrams = async () => {
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
  };

  const parseMermaidFromMarkdown = (markdown: string): MermaidDiagram[] => {
    const diagrams: MermaidDiagram[] = [];
    const lines = markdown.split('\n');
    let currentDiagram: { title: string; content: string[] } | null = null;
    let inCodeBlock = false;
    let blockType = '';

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
            });
          }
          currentDiagram = null;
          inCodeBlock = false;
          blockType = '';
        } else {
          // Start of code block
          blockType = line.substring(3).trim();
          if (blockType === 'mermaid') {
            inCodeBlock = true;
            // Look for title in previous lines
            let title = `Diagram ${diagrams.length + 1}`;
            for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
              const prevLine = lines[j].trim();
              if (prevLine.startsWith('#')) {
                title = prevLine.replace(/^#+\s*/, '');
                break;
              }
            }
            currentDiagram = {
              title,
              content: [],
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

  const renderDiagrams = async () => {
    for (const diagram of diagrams) {
      const element = diagramRefs.current[diagram.id];
      if (element && diagram.content.trim()) {
        try {
          // Clear previous content
          element.innerHTML = '';

          // Generate unique ID for this diagram
          const diagramId = `mermaid-${diagram.id}-${Date.now()}`;

          // Render the diagram
          const { svg } = await mermaid.render(diagramId, diagram.content);
          element.innerHTML = svg;
        } catch (err) {
          console.error(`Error rendering diagram ${diagram.id}:`, err);
          element.innerHTML = `
            <div class="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded">
              <span class="text-red-500">⚠</span>
              <span>Error rendering diagram: ${err instanceof Error ? err.message : 'Unknown error'}</span>
            </div>
          `;
        }
      }
    }
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

      {/* Diagrams */}
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
        <div className="space-y-8">
          {diagrams.map((diagram) => (
            <Card key={diagram.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{diagram.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleZoomOut(diagram.id)}
                      disabled={getZoomLevel(diagram.id) <= 0.25}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
                      {Math.round(getZoomLevel(diagram.id) * 100)}%
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleZoomIn(diagram.id)}
                      disabled={getZoomLevel(diagram.id) >= 3}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleZoomReset(diagram.id)}
                      disabled={getZoomLevel(diagram.id) === 1}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-auto border rounded-md bg-white dark:bg-gray-50">
                  <div
                    ref={(el) => (diagramRefs.current[diagram.id] = el)}
                    className="w-full transition-transform duration-200 origin-top-left"
                    style={{
                      minHeight: '200px',
                      transform: `scale(${getZoomLevel(diagram.id)})`,
                      transformOrigin: 'top left',
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
