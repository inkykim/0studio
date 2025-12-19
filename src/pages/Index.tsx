import { TitleBar } from "@/components/TitleBar";
import { VersionControl } from "@/components/VersionControl";
import { ModelViewer } from "@/components/ModelViewer";
import { CopilotChat } from "@/components/CopilotChat";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ModelProvider } from "@/contexts/ModelContext";

const Index = () => {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* macOS Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex-1 p-2 overflow-hidden">
        <ModelProvider>
          <ResizablePanelGroup direction="horizontal" className="h-full overflow-hidden">
            {/* Version Control Panel */}
            <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
              <VersionControl />
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors" />

            {/* 3D Viewport */}
            <ResizablePanel defaultSize={56} minSize={30}>
              <ModelViewer />
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors" />

            {/* Copilot Chat */}
            <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
              <CopilotChat />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ModelProvider>
      </div>
    </div>
  );
};

export default Index;
