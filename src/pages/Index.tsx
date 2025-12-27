import { TitleBar } from "@/components/TitleBar";
import { VersionControl } from "@/components/VersionControl";
import { ModelViewer } from "@/components/ModelViewer";
// import { CopilotChat } from "@/components/CopilotChat"; // Commented out for later use
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";

const Index = () => {
  return (
    <VersionControlProvider>
      <ModelProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          {/* macOS Title Bar */}
          <TitleBar />

          {/* Main Content */}
          <div className="flex-1 p-2 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full overflow-hidden">
              {/* Version Control Panel */}
              <ResizablePanel defaultSize={30} minSize={25} maxSize={45}>
                <VersionControl />
              </ResizablePanel>

              <ResizableHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors" />

              {/* 3D Viewport */}
              <ResizablePanel defaultSize={70} minSize={55}>
                <ModelViewer />
              </ResizablePanel>

              {/* Copilot Chat Panel - Commented out for later use */}
              {/* <ResizableHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors" />
              <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
                <CopilotChat />
              </ResizablePanel> */}
            </ResizablePanelGroup>
          </div>
        </div>
      </ModelProvider>
    </VersionControlProvider>
  );
};

export default Index;
