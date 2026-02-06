import { useRef, useEffect, useCallback } from "react";
import * as d3Force from "d3-force";
import { ModelCommit, Branch } from "@/contexts/VersionControlContext";

interface GraphNode extends d3Force.SimulationNodeDatum {
  id: string;
  commit: ModelCommit;
  branch: Branch | undefined;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink extends d3Force.SimulationLinkDatum<GraphNode> {
  source: GraphNode | string;
  target: GraphNode | string;
}

interface GraphViewProps {
  commits: ModelCommit[];
  branches: Branch[];
  currentCommitId: string | null;
  pulledCommitId: string | null;
  onSelectCommit: (commitId: string) => void;
  getVersionLabel: (commit: ModelCommit) => string;
}

export const GraphView = ({
  commits,
  branches,
  currentCommitId,
  pulledCommitId,
  onSelectCommit,
  getVersionLabel,
}: GraphViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensionsRef = useRef({ width: 400, height: 300 });
  
  // All mutable state in refs - no React state to avoid re-renders
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const simulationRef = useRef<d3Force.Simulation<GraphNode, GraphLink> | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const propsRef = useRef({ currentCommitId, pulledCommitId, getVersionLabel });
  
  // Keep props ref updated
  propsRef.current = { currentCommitId, pulledCommitId, getVersionLabel };

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const { width, height } = dimensionsRef.current;
    const { currentCommitId, pulledCommitId, getVersionLabel } = propsRef.current;
    const hoveredNodeId = hoveredNodeIdRef.current;

    ctx.clearRect(0, 0, width, height);

    // Draw links
    ctx.strokeStyle = "rgba(100, 100, 100, 0.5)";
    ctx.lineWidth = 2;
    for (const link of links) {
      const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target : nodes.find(n => n.id === link.target);
      
      if (source?.x != null && source?.y != null && target?.x != null && target?.y != null) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;

      const isCurrentCommit = node.commit.id === currentCommitId;
      const isPulledCommit = node.commit.id === pulledCommitId;
      const isHovered = node.id === hoveredNodeId;
      const branchColor = node.branch?.color || "#888888";

      let radius = isHovered ? 14 : 10;
      if (isCurrentCommit || isPulledCommit) radius += 2;

      // Outer glow
      if (isPulledCommit) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(163, 163, 163, 0.3)";
        ctx.fill();
      } else if (isCurrentCommit) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = (isCurrentCommit || isHovered) ? branchColor : "rgba(30, 30, 30, 0.9)";
      ctx.fill();
      ctx.strokeStyle = branchColor;
      ctx.lineWidth = (isHovered || isCurrentCommit) ? 3 : 2;
      ctx.stroke();

      // Hover label
      if (isHovered) {
        const label = getVersionLabel(node.commit);
        ctx.font = "11px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        const metrics = ctx.measureText(label);
        const labelX = node.x;
        const labelY = node.y - radius - 16;
        const padding = 6;
        
        ctx.fillStyle = "rgba(30, 30, 30, 0.95)";
        ctx.beginPath();
        ctx.roundRect(labelX - metrics.width / 2 - padding, labelY - 8, metrics.width + padding * 2, 16, 4);
        ctx.fill();
        
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, labelX, labelY);
        
        const message = node.commit.message.length > 25 
          ? node.commit.message.slice(0, 25) + "..." 
          : node.commit.message;
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillText(message, labelX, node.y + radius + 16);
      }
    }
  }, []);

  // Setup canvas and handle resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(rect.width, 200);
      const height = Math.max(rect.height, 200);
      
      dimensionsRef.current = { width, height };
      
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      
      // Recenter simulation if it exists
      if (simulationRef.current) {
        simulationRef.current
          .force("center", d3Force.forceCenter(width / 2, height / 2))
          .alpha(0.3)
          .restart();
      }
      
      draw();
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, [draw]);

  // Initialize simulation when commits change
  useEffect(() => {
    if (commits.length === 0) {
      nodesRef.current = [];
      linksRef.current = [];
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      draw();
      return;
    }

    // Stop existing simulation
    simulationRef.current?.stop();

    const { width, height } = dimensionsRef.current;

    // Create nodes
    const newNodes: GraphNode[] = commits.map((commit, i) => ({
      id: commit.id,
      commit,
      branch: branches.find((b) => b.id === commit.branchId),
      x: width / 2 + (Math.random() - 0.5) * 50,
      y: height / 2 + (Math.random() - 0.5) * 50,
    }));

    // Create links
    const newLinks: GraphLink[] = [];
    for (const commit of commits) {
      if (commit.parentCommitId && newNodes.some(n => n.id === commit.parentCommitId)) {
        newLinks.push({
          source: commit.id,
          target: commit.parentCommitId,
        });
      }
    }

    nodesRef.current = newNodes;
    linksRef.current = newLinks;

    // Create simulation
    const simulation = d3Force
      .forceSimulation<GraphNode, GraphLink>(newNodes)
      .force("link", d3Force.forceLink<GraphNode, GraphLink>(newLinks).id(d => d.id).distance(80).strength(0.5))
      .force("charge", d3Force.forceManyBody().strength(-300))
      .force("center", d3Force.forceCenter(width / 2, height / 2))
      .force("collision", d3Force.forceCollide().radius(30))
      .alphaDecay(0.05)
      .velocityDecay(0.4)
      .on("tick", () => {
        // Clamp positions
        for (const node of newNodes) {
          if (node.x != null) node.x = Math.max(30, Math.min(width - 30, node.x));
          if (node.y != null) node.y = Math.max(30, Math.min(height - 30, node.y));
        }
        draw();
      });

    simulationRef.current = simulation;

    return () => simulation.stop();
  }, [commits, branches, draw]);

  // Redraw when currentCommitId or pulledCommitId changes
  useEffect(() => {
    draw();
  }, [currentCommitId, pulledCommitId, draw]);

  // Get node at position
  const getNodeAt = (x: number, y: number): GraphNode | null => {
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy < 225) return node; // 15^2 = 225
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle dragging
    const draggedNode = draggedNodeRef.current;
    if (draggedNode) {
      draggedNode.fx = x;
      draggedNode.fy = y;
      simulationRef.current?.alpha(0.3).restart();
      return;
    }

    // Handle hover
    const node = getNodeAt(x, y);
    const newHoveredId = node?.id ?? null;
    
    if (newHoveredId !== hoveredNodeIdRef.current) {
      hoveredNodeIdRef.current = newHoveredId;
      canvas.style.cursor = node ? "pointer" : "default";
      draw();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    
    if (node) {
      draggedNodeRef.current = node;
      node.fx = node.x;
      node.fy = node.y;
      simulationRef.current?.alphaTarget(0.3).restart();
    }
  };

  const handleMouseUp = () => {
    const node = draggedNodeRef.current;
    if (node) {
      node.fx = null;
      node.fy = null;
      simulationRef.current?.alphaTarget(0);
      draggedNodeRef.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    
    if (node) {
      onSelectCommit(node.commit.id);
    }
  };

  if (commits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm min-h-[300px]">
        No commits to display
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-background/50 rounded-lg min-h-[300px]">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
      
      <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-muted-foreground pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-primary border-2 border-primary" />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-muted-foreground bg-background" />
            <span>Commit</span>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-3 right-3 text-xs text-muted-foreground/60 pointer-events-none">
        Drag nodes / Click to restore
      </div>
    </div>
  );
};
