import { TitleBar } from "@/components/TitleBar";
import { VersionControl } from "@/components/VersionControl";
import { ModelViewer } from "@/components/ModelViewer";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ModelProvider, useModel } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";

const MainContent = () => {
  const { currentFile } = useModel();
  const hasModel = !!currentFile;

  return (
    <div className="flex-1 p-2 overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full overflow-hidden">
        {/* Projects / Version Control panel - always visible */}
        <ResizablePanel defaultSize={30} minSize={25} maxSize={45}>
          {hasModel ? <VersionControl /> : <ProjectsPanel />}
        </ResizablePanel>

        <ResizableHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors" />

        {/* 3D Viewport */}
        <ResizablePanel defaultSize={70} minSize={55}>
          <ModelViewer />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

const Index = () => {
  return (
    <VersionControlProvider>
      <ModelProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <TitleBar />
          <MainContent />
        </div>
      </ModelProvider>
    </VersionControlProvider>
  );
};

export default Index;
