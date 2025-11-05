# AgentPalette Integration Guide

## Overview

`AgentPalette` is a self-contained component that displays a draggable list of agents. It manages its own data fetching using React Query and integrates with `@dnd-kit/core` for drag-and-drop functionality.

## Architecture Decision

This component uses a **self-contained pattern** rather than a controlled component pattern:

- ✅ **Fetches its own data** via React Query (automatic caching, refetching)
- ✅ **Provides draggable agents** via @dnd-kit/core
- ✅ **Parent handles drops** via DndContext

## Basic Usage

```tsx
import { AgentPalette } from '@/components/factory';
import { DndContext, DragEndEvent } from '@dnd-kit/core';

function FactoryFloorPage() {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta, over } = event;

    // Check if dropped item is an agent
    if (active.data.current?.type === 'agent') {
      const agent = active.data.current.agent as Agent;

      // Calculate drop position (adjust based on your canvas implementation)
      const dropPosition = {
        x: delta.x,
        y: delta.y,
      };

      // Create station with this agent at the drop position
      createStationAtPosition(agent, dropPosition);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-screen">
        {/* Agent Palette Sidebar */}
        <AgentPalette className="w-80 border-r" />

        {/* Factory Floor Canvas */}
        <FactoryCanvas />
      </div>
    </DndContext>
  );
}
```

## Drag Data Format

Each draggable agent provides the following data structure:

```typescript
{
  id: `agent-${agent.id}`,        // Unique draggable ID
  data: {
    type: 'agent',                 // Identifies this as an agent drag
    agent: Agent                   // Full agent object from API
  }
}
```

## Agent Type Definition

```typescript
type Agent = {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  capabilities: string | null;
  tools: string | null;
  description: string | null;
  context_files: string | null;
  executor: string;
  created_at: string;
  updated_at: string;
};
```

## Complete Integration Example

### With React Flow Canvas

```tsx
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { AgentPalette } from '@/components/factory';
import ReactFlow, { Node, Edge, useNodesState, useEdgesState } from 'reactflow';
import type { Agent } from 'shared/types';

function FactoryFloorWithReactFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;

    if (active.data.current?.type === 'agent') {
      const agent = active.data.current.agent as Agent;

      // Create new station node at drop position
      const newNode: Node = {
        id: `station-${Date.now()}`,
        type: 'station',
        position: { x: delta.x, y: delta.y },
        data: {
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          executor: agent.executor,
        },
      };

      setNodes((nds) => [...nds, newNode]);

      // Optionally: Save to backend
      createWorkflowStation({
        agent_id: agent.id,
        x_position: delta.x,
        y_position: delta.y,
        name: agent.name,
      });
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-screen">
        <AgentPalette className="w-80 border-r" />

        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
          />
        </div>
      </div>
    </DndContext>
  );
}
```

### With Custom Canvas

```tsx
import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { AgentPalette } from '@/components/factory';
import type { Agent } from 'shared/types';

function CustomCanvas() {
  const { setNodeRef } = useDroppable({ id: 'factory-canvas' });
  const [stations, setStations] = useState<Array<StationWithAgent>>([]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Only handle drops on the canvas
    if (over?.id === 'factory-canvas' && active.data.current?.type === 'agent') {
      const agent = active.data.current.agent as Agent;

      // Get cursor position relative to canvas
      const canvasRect = over.rect;
      const dropX = event.activatorEvent.clientX - canvasRect.left;
      const dropY = event.activatorEvent.clientY - canvasRect.top;

      // Create station
      const newStation = {
        id: `station-${Date.now()}`,
        agent,
        position: { x: dropX, y: dropY },
      };

      setStations((prev) => [...prev, newStation]);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-screen">
        <AgentPalette className="w-80 border-r" />

        <div ref={setNodeRef} className="flex-1 relative bg-muted/20">
          {stations.map((station) => (
            <StationNode
              key={station.id}
              station={station}
              position={station.position}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}
```

## Advanced: Filtering Agents

If you need to filter which agents are shown in the palette, you can wrap it with your own data provider:

```tsx
// Option 1: Fetch and filter in parent (alternative architecture)
const { data: allAgents } = useQuery({
  queryKey: ['agents'],
  queryFn: () => agentsApi.list(),
});

const filteredAgents = allAgents?.filter(agent =>
  agent.executor === 'CLAUDE_CODE'
);

// Note: Current AgentPalette doesn't accept agents prop
// You would need to modify the component to support this
```

## Data Fetching Behavior

The component uses React Query with the following configuration:

```typescript
useQuery({
  queryKey: ['agents'],
  queryFn: () => agentsApi.list(),
});
```

**Benefits:**
- Automatic caching (no redundant API calls)
- Automatic background refetching
- Loading and error states handled
- Shared cache across components using same query key

**Refetching:**
- When component mounts
- When window regains focus
- When network reconnects
- Can be manually triggered: `queryClient.invalidateQueries(['agents'])`

## Props API

```typescript
interface AgentPaletteProps {
  className?: string;  // Optional Tailwind classes for container styling
}
```

**Minimal props by design:**
- Component is self-contained
- Parent doesn't need to manage agent data
- Drop handling is parent's responsibility (via DndContext)

## Styling Customization

```tsx
// Custom width and positioning
<AgentPalette className="w-96 border-r-2 shadow-lg" />

// Full height sidebar
<AgentPalette className="h-screen w-80 fixed left-0 top-0" />

// Floating panel
<AgentPalette className="absolute top-4 left-4 w-72 shadow-2xl rounded-lg" />
```

## Error Handling

The component handles the following states:

1. **Loading State**: Shows "Loading agents..." message
2. **Empty State**: Shows "No agents yet" with create button when no agents exist
3. **Search Empty State**: Shows "No agents match {query}" when search returns no results
4. **API Errors**: Handled by React Query (component will retry automatically)

## Integration Checklist

- [ ] Wrap parent component with `<DndContext>`
- [ ] Implement `onDragEnd` handler
- [ ] Check for `active.data.current.type === 'agent'`
- [ ] Extract `agent` from `active.data.current.agent`
- [ ] Calculate drop position (from `delta` or `over.rect`)
- [ ] Create station at calculated position
- [ ] Optionally: Save to backend via API

## Performance Considerations

1. **React Query Caching**: Agents list is cached, so multiple instances won't cause multiple API calls
2. **Memoized Filtering**: Search filtering is memoized with `useMemo`
3. **Drag Performance**: Each agent card is a separate draggable, optimized by @dnd-kit

## Troubleshooting

### "Agents not dragging"
- Ensure parent is wrapped in `<DndContext>`
- Check browser console for @dnd-kit errors

### "Drop not working"
- Verify `onDragEnd` handler is implemented
- Check that `active.data.current?.type === 'agent'`
- Use `console.log(event)` to inspect drop event structure

### "Agents not loading"
- Check network tab for `/api/agents` request
- Verify backend is running
- Check React Query devtools for query state

### "Search not working"
- Search is case-insensitive and searches across: name, role, executor, description
- Try clearing search with the X button
- Check that agents have the fields you're searching for

## Related Components

- `TaskTrayCard`: Similar draggable pattern for tasks
- `AgentsPage`: Full agent management page (linked from palette)
- `AgentFormDialog`: Create/edit agent modal

## API Endpoint

The component fetches data from:

```
GET /api/agents
Response: Agent[]
```

See `frontend/src/lib/api.ts` for the `agentsApi.list()` implementation.
