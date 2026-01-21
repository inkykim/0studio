import { useState, useEffect, useMemo } from "react";
import { useModel } from "@/contexts/ModelContext";
import { useVersionControl, ModelCommit, Branch } from "@/contexts/VersionControlContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, Save, Star, Download, Search, FolderOpen, X, Grid3x3, GitBranch, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
};

// Helper to build tree structure for visualization
interface CommitNode {
  commit: ModelCommit;
  branch: Branch | undefined;
  children: CommitNode[];
  x: number; // Column position (0 = main, 1 = first branch, etc.)
  y: number; // Row position (timeline order)
}

interface BranchingTreeProps {
  commits: ModelCommit[];
  branches: Branch[];
  currentCommitId: string | null;
  pulledCommitId: string | null;
  onRestoreCommit: (commitId: string) => void;
  onPullCommit: (commitId: string, e: React.MouseEvent) => void;
  onToggleStar: (commitId: string) => void;
  getVersionLabel: (commit: ModelCommit) => string;
  isGalleryMode: boolean;
  selectedCommitIds: Set<string>;
  onToggleSelection: (commitId: string) => void;
}

const BranchingTree = ({
  commits,
  branches,
  currentCommitId,
  pulledCommitId,
  onRestoreCommit,
  onPullCommit,
  onToggleStar,
  getVersionLabel,
  isGalleryMode,
  selectedCommitIds,
  onToggleSelection,
}: BranchingTreeProps) => {
  // Build tree layout
  const { nodes, connections, maxX } = useMemo(() => {
    if (commits.length === 0) return { nodes: [], connections: [], maxX: 0 };

    // Sort commits by timestamp (oldest first for building tree)
    const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);
    
    // Group commits by branch
    const branchCommits = new Map<string, ModelCommit[]>();
    sortedCommits.forEach(commit => {
      const branchId = commit.branchId || 'main';
      if (!branchCommits.has(branchId)) {
        branchCommits.set(branchId, []);
      }
      branchCommits.get(branchId)!.push(commit);
    });
    
    // Assign x positions to branches
    const branchXPositions = new Map<string, number>();
    const mainBranch = branches.find(b => b.isMain);
    let currentX = 0;
    
    if (mainBranch) {
      branchXPositions.set(mainBranch.id, currentX);
      currentX++;
    }
    
    // Sort non-main branches by their origin commit timestamp
    const nonMainBranches = branches
      .filter(b => !b.isMain)
      .sort((a, b) => {
        const aOrigin = commits.find(c => c.id === a.originCommitId);
        const bOrigin = commits.find(c => c.id === b.originCommitId);
        return (aOrigin?.timestamp || 0) - (bOrigin?.timestamp || 0);
      });
    
    nonMainBranches.forEach(branch => {
      branchXPositions.set(branch.id, currentX);
      currentX++;
    });
    
    // Build nodes with positions
    const nodes: CommitNode[] = [];
    const commitToNode = new Map<string, CommitNode>();
    
    // Sort commits by timestamp (newest first for display)
    const displayOrder = [...commits].sort((a, b) => b.timestamp - a.timestamp);
    
    displayOrder.forEach((commit, idx) => {
      const branch = branches.find(b => b.id === commit.branchId);
      const x = branchXPositions.get(commit.branchId) || 0;
      
      const node: CommitNode = {
        commit,
        branch,
        children: [],
        x,
        y: idx,
      };
      
      nodes.push(node);
      commitToNode.set(commit.id, node);
    });
    
    // Build connections (from child to parent)
    const connections: { from: CommitNode; to: CommitNode; isBranchPoint: boolean }[] = [];
    
    nodes.forEach(node => {
      if (node.commit.parentCommitId) {
        const parentNode = commitToNode.get(node.commit.parentCommitId);
        if (parentNode) {
          const isBranchPoint = node.x !== parentNode.x;
          connections.push({ from: node, to: parentNode, isBranchPoint });
        }
      }
    });
    
    return { nodes, connections, maxX: currentX - 1 };
  }, [commits, branches]);

  if (nodes.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No versions saved yet</p>
        <p className="text-xs text-muted-foreground mt-1">Save your first version to start tracking changes</p>
      </div>
    );
  }

  const nodeHeight = 56; // Height of each commit row
  const columnWidth = 24; // Width between branch columns
  const nodeRadius = 5;
  const svgWidth = (maxX + 1) * columnWidth + 20;

  return (
    <div className="relative">
      {/* SVG for branch lines */}
      <svg 
        className="absolute left-0 top-0 pointer-events-none"
        width={svgWidth}
        height={nodes.length * nodeHeight}
        style={{ overflow: 'visible' }}
      >
        {/* Draw connections */}
        {connections.map((conn, idx) => {
          const fromX = conn.from.x * columnWidth + 10 + nodeRadius;
          const fromY = conn.from.y * nodeHeight + nodeRadius + 6;
          const toX = conn.to.x * columnWidth + 10 + nodeRadius;
          const toY = conn.to.y * nodeHeight + nodeRadius + 6;
          
          const branchColor = conn.from.branch?.color || '#888';
          
          if (conn.isBranchPoint) {
            // Curved connection for branch point
            const midY = (fromY + toY) / 2;
            return (
              <g key={idx}>
                {/* Horizontal line from branch point */}
                <line
                  x1={toX}
                  y1={toY}
                  x2={fromX}
                  y2={toY}
                  stroke={branchColor}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
                {/* Vertical line on the branch */}
                <line
                  x1={fromX}
                  y1={toY}
                  x2={fromX}
                  y2={fromY}
                  stroke={branchColor}
                  strokeWidth={2}
                />
              </g>
            );
          } else {
            // Straight vertical line
            return (
              <line
                key={idx}
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke={branchColor}
                strokeWidth={2}
              />
            );
          }
        })}
        
        {/* Draw nodes */}
        {nodes.map((node, idx) => {
          const x = node.x * columnWidth + 10 + nodeRadius;
          const y = node.y * nodeHeight + nodeRadius + 6;
          const isCurrentCommit = node.commit.id === currentCommitId;
          const isPulledCommit = node.commit.id === pulledCommitId;
          const branchColor = node.branch?.color || '#888';
          
          return (
            <g key={idx}>
              {/* Outer ring for pulled commit highlight */}
              {isPulledCommit && (
                <circle
                  cx={x}
                  cy={y}
                  r={nodeRadius + 4}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}
              {/* Node circle */}
              <circle
                cx={x}
                cy={y}
                r={nodeRadius}
                fill={isCurrentCommit ? branchColor : 'transparent'}
                stroke={branchColor}
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
      
      {/* Commit items */}
      <div style={{ marginLeft: svgWidth }}>
        {nodes.map((node) => {
          const isCurrentCommit = node.commit.id === currentCommitId;
          const isPulledCommit = node.commit.id === pulledCommitId;
          const versionLabel = getVersionLabel(node.commit);
          
          return (
            <div
              key={node.commit.id}
              className={`flex gap-3 group cursor-pointer rounded-md p-2 transition-colors ${
                isPulledCommit 
                  ? 'bg-amber-500/20 ring-2 ring-amber-500/50' 
                  : isCurrentCommit 
                  ? 'bg-primary/10' 
                  : 'hover:bg-secondary/50'
              }`}
              style={{ height: nodeHeight }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.star-button')) return;
                if ((e.target as HTMLElement).closest('.pull-button')) return;
                if (!isCurrentCommit) onRestoreCommit(node.commit.id);
              }}
              title={
                isPulledCommit 
                  ? 'Active working version (pulled)' 
                  : isCurrentCommit 
                  ? 'Current version' 
                  : 'Click to restore to this version'
              }
            >
              {/* Checkbox for gallery mode */}
              {isGalleryMode && (
                <div className="flex items-center">
                  <Checkbox
                    checked={selectedCommitIds.has(node.commit.id)}
                    onCheckedChange={() => onToggleSelection(node.commit.id)}
                    disabled={!selectedCommitIds.has(node.commit.id) && selectedCommitIds.size >= 4}
                    title={
                      !selectedCommitIds.has(node.commit.id) && selectedCommitIds.size >= 4
                        ? 'Maximum of 4 models can be selected for gallery view'
                        : selectedCommitIds.has(node.commit.id)
                        ? 'Click to deselect'
                        : 'Click to select for gallery view'
                    }
                  />
                </div>
              )}
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      className="star-button p-0.5 hover:bg-secondary rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(node.commit.id);
                      }}
                      title={node.commit.starred ? 'Unstar this commit' : 'Star this commit'}
                    >
                      <Star 
                        className={`w-3.5 h-3.5 ${
                          node.commit.starred 
                            ? 'fill-foreground text-foreground' 
                            : 'text-muted-foreground hover:text-foreground'
                        } transition-colors`} 
                      />
                    </button>
                    <p className="text-sm font-medium truncate">{node.commit.message}</p>
                    {isPulledCommit && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/20 text-amber-600 border-amber-500/50">
                        working
                      </Badge>
                    )}
                    {isCurrentCommit && !isPulledCommit && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        current
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {node.branch && !node.branch.isMain && (
                      <Badge 
                        variant="outline" 
                        className="text-[10px] px-1.5 py-0 h-4"
                        style={{ borderColor: node.branch.color, color: node.branch.color }}
                      >
                        {node.branch.name}
                      </Badge>
                    )}
                    <span className="text-code text-xs text-muted-foreground shrink-0">
                      {versionLabel}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTimeAgo(node.commit.timestamp)}
                </p>
              </div>
              
              {/* Action buttons on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  className="pull-button p-1 hover:bg-secondary rounded transition-colors"
                  onClick={(e) => onPullCommit(node.commit.id, e)}
                  title="Pull this version to local file (updates file on disk)"
                >
                  <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const VersionControl = () => {
  const { 
    currentFile, 
    fileName, 
    clearModel, 
    triggerFileDialog, 
    loadedModel,
  } = useModel();
  const { 
    currentModel, 
    modelName, 
    commits, 
    currentCommitId, 
    hasUnsavedChanges,
    branches,
    activeBranchId,
    pulledCommitId,
    setCurrentModel,
    commitModelChanges,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearCurrentModel,
    toggleStarCommit,
    switchBranch,
    keepBranch,
    getCommitVersionLabel,
    isGalleryMode,
    selectedCommitIds,
    toggleGalleryMode,
    toggleCommitSelection,
    clearSelectedCommits,
  } = useVersionControl();
  
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  // When a model file is loaded, update the version control
  useEffect(() => {
    if (currentFile && currentFile !== currentModel) {
      setCurrentModel(currentFile);
    }
  }, [currentFile, currentModel, setCurrentModel]);

  const handleRestoreCommit = async (commitId: string) => {
    try {
      const success = await restoreToCommit(commitId);
      if (success) {
        console.log(`Model restored to commit: ${commitId}`);
      }
    } catch (error) {
      console.error("Failed to restore commit:", error);
    }
  };

  const handlePullCommit = async (commitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const success = await pullFromCommit(commitId);
      if (success) {
        console.log(`File pulled to commit: ${commitId}`);
      }
    } catch (error) {
      console.error("Failed to pull commit:", error);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting) return;
    
    if (!hasUnsavedChanges || !loadedModel) {
      return;
    }
    
    setIsCommitting(true);
    
    try {
      await commitModelChanges(commitMessage.trim(), loadedModel);
      setCommitMessage("");
    } catch (error) {
      console.error("Failed to commit:", error);
      toast.error("Failed to save version");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleOpenNewModel = () => {
    triggerFileDialog();
  };

  const handleCloseModel = () => {
    clearModel();
    clearCurrentModel();
  };

  const handleKeepBranch = () => {
    if (activeBranchId) {
      keepBranch(activeBranchId);
    }
  };

  // Filter commits based on search and starred filter
  const filteredCommits = useMemo(() => {
    let filtered = commits;
    
    if (showStarredOnly) {
      filtered = filtered.filter(commit => commit.starred);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(commit =>
        commit.message.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [commits, showStarredOnly, searchQuery]);

  // Get active branch info
  const activeBranch = branches.find(b => b.id === activeBranchId);
  const nonMainBranches = branches.filter(b => !b.isMain);

  if (!currentFile) {
    return (
      <div className="h-full flex flex-col panel-glass">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Version Control</span>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Archive className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Model Open</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Open a .3dm file to start tracking versions of your 3D model.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the Model Viewer tab to import a .3dm file
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col panel-glass">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Version Control</span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleOpenNewModel}
            className="h-6 px-2"
            title="Open new model"
          >
            <FolderOpen className="w-3 h-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCloseModel}
            className="h-6 px-2"
            title="Close model"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Branch Selector */}
          {branches.length > 1 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Current Branch
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Select value={activeBranchId || ''} onValueChange={switchBranch}>
                  <SelectTrigger className="flex-1 h-8">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-3.5 h-3.5" />
                      <SelectValue placeholder="Select branch" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: branch.color }}
                          />
                          <span>{branch.name}</span>
                          {branch.isMain && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 ml-1">
                              main
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeBranch && !activeBranch.isMain && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleKeepBranch}
                    className="h-8 px-3 gap-1"
                    title="Set this branch as the main branch"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Keep
                  </Button>
                )}
              </div>
            </section>
          )}

          {/* Commit Input */}
          {hasUnsavedChanges && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Save New Version
              </h3>
              <div className="space-y-2">
                <Input
                  placeholder="Describe these changes..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commitMessage.trim()) {
                      handleCommit();
                    }
                  }}
                />
                {pulledCommitId && (
                  <p className="text-xs text-amber-600">
                    Creating new branch from {getCommitVersionLabel(commits.find(c => c.id === pulledCommitId)!)}
                  </p>
                )}
                <Button 
                  onClick={handleCommit} 
                  disabled={!commitMessage.trim() || isCommitting}
                  className="w-full gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isCommitting ? "Saving Version..." : pulledCommitId ? "Create Branch & Save" : "Save Version"}
                </Button>
              </div>
            </section>
          )}

          {/* Version History */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Version History ({commits.length})
              </h3>
              <div className="flex items-center gap-1">
                {commits.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleGalleryMode}
                      className={`h-6 px-2 text-xs ${isGalleryMode ? 'bg-primary/10' : ''}`}
                      title={isGalleryMode ? 'Exit gallery mode' : 'Enter gallery mode to compare versions'}
                    >
                      <Grid3x3 className={`w-3 h-3 mr-1 ${isGalleryMode ? 'text-primary' : ''}`} />
                      Gallery
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowStarredOnly(!showStarredOnly)}
                      className="h-6 px-2 text-xs"
                    >
                      <Star className={`w-3 h-3 mr-1 ${showStarredOnly ? 'fill-foreground text-foreground' : 'text-muted-foreground'}`} />
                      {showStarredOnly ? 'Show All' : 'Starred'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* Search Input */}
            {commits.length > 0 && (
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by commit message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
            
            {/* Branching Tree */}
            {filteredCommits.length === 0 && commits.length > 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  {showStarredOnly && searchQuery
                    ? 'No starred commits match your search'
                    : showStarredOnly
                    ? 'No starred commits yet'
                    : 'No commits match your search'}
                </p>
              </div>
            ) : (
              <BranchingTree
                commits={filteredCommits}
                branches={branches}
                currentCommitId={currentCommitId}
                pulledCommitId={pulledCommitId}
                onRestoreCommit={handleRestoreCommit}
                onPullCommit={handlePullCommit}
                onToggleStar={toggleStarCommit}
                getVersionLabel={getCommitVersionLabel}
                isGalleryMode={isGalleryMode}
                selectedCommitIds={selectedCommitIds}
                onToggleSelection={toggleCommitSelection}
              />
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
};
