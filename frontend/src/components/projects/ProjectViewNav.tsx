import { useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutList, Factory } from 'lucide-react';

interface ProjectViewNavProps {
  currentView: 'tasks' | 'factory';
}

export function ProjectViewNav({ currentView }: ProjectViewNavProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const handleViewChange = (value: string) => {
    if (!projectId) return;

    if (value === 'tasks') {
      navigate(`/projects/${projectId}/tasks`);
    } else if (value === 'factory') {
      navigate(`/projects/${projectId}/factory`);
    }
  };

  return (
    <div className="border-b bg-background px-4 py-3">
      <Tabs value={currentView} onValueChange={handleViewChange}>
        <TabsList>
          <TabsTrigger value="tasks" className="gap-2">
            <LayoutList className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="factory" className="gap-2">
            <Factory className="h-4 w-4" />
            Factory Floor
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
