import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  User,
  Bot,
  Code,
  Lightbulb,
  Upload,
  Download,
  FileBox,
  Box,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useModel } from "@/contexts/ModelContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: MessageAction[];
}

interface MessageAction {
  id: string;
  label: string;
  icon: "import" | "export" | "info" | "clear";
  action: () => void | Promise<void>;
}

const suggestions = [
  { icon: Code, text: "Subdivide the mesh" },
  { icon: Lightbulb, text: "Add emission material" },
  { icon: Box, text: "Create primitive shapes" },
  { icon: FileBox, text: "Show file info" },
];

export const CopilotChat = () => {
  const {
    loadedModel,
    isLoading,
    isExporting,
    stats,
    triggerFileDialog,
    exportScene,
    clearModel,
  } = useModel();

  const getInitialMessage = (): Message => ({
    id: "1",
    role: "assistant",
    content:
      "Hello! I'm your 3D modeling assistant. I can help you with:\n\n• **Import/Export**: Load and save Rhino .3dm files\n• Modifying geometry and materials\n• Optimizing mesh topology\n• Applying transformations\n• Generating procedural shapes\n\nDrag & drop a .3dm file onto the viewport. What would you like to work on?",
    timestamp: new Date(Date.now() - 60000),
  });

  const [messages, setMessages] = useState<Message[]>([getInitialMessage()]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        const scrollContainer =
          scrollRef.current.querySelector(
            "[data-radix-scroll-area-viewport]"
          ) || scrollRef.current;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    };

    setTimeout(scrollToBottom, 50);
  }, [messages, isTyping]);

  // Generate context-aware responses with actions
  const getResponse = (
    userInput: string
  ): { content: string; actions?: MessageAction[] } => {
    const lowerInput = userInput.toLowerCase();

    // Import-related queries
    if (/import|load|open|upload/i.test(lowerInput)) {
      if (loadedModel) {
        return {
          content: `You already have **${loadedModel.metadata.fileName}** loaded with ${loadedModel.metadata.objectCount} object(s).\n\nWould you like to clear the current model? You can then drag & drop a new file onto the viewport.`,
          actions: [
            {
              id: "clear-model",
              label: "Clear Current",
              icon: "clear",
              action: clearModel,
            },
          ],
        };
      }
      return {
        content:
          "Ready to import! Drag & drop a Rhino .3dm file directly onto the viewport.\n\n**Supported geometry:**\n• Meshes\n• NURBS surfaces (converted to mesh)\n• Curves\n• Points\n• Extrusions",
      };
    }

    // Export-related queries
    if (/export|save|download/i.test(lowerInput)) {
      if (stats.objects === 0) {
        return {
          content:
            "There's nothing to export yet! Drag & drop a .3dm file onto the viewport or create some geometry first.\n\nThe default cube in the viewport is just a placeholder.",
        };
      }
      return {
        content: `Ready to export your scene!\n\n**Current scene:**\n• ${stats.objects} object(s)\n• ${stats.vertices.toLocaleString()} vertices\n• ${stats.faces.toLocaleString()} faces\n\nThe file will be saved in Rhino's native .3dm format, compatible with Rhino 7+.`,
        actions: [
          {
            id: "export-action",
            label: "Export to 3DM",
            icon: "export",
            action: () => exportScene(),
          },
        ],
      };
    }

    // Info queries
    if (/info|file|metadata|details|stats|statistics/i.test(lowerInput)) {
      if (loadedModel) {
        const fileSizeKB = (loadedModel.metadata.fileSize / 1024).toFixed(1);
        return {
          content: `**Current File:** ${loadedModel.metadata.fileName}\n**File Size:** ${fileSizeKB} KB\n**Objects Loaded:** ${loadedModel.metadata.objectCount}\n\n**Scene Statistics:**\n• Vertices: ${stats.vertices.toLocaleString()}\n• Faces: ${stats.faces.toLocaleString()}\n• Total Objects: ${stats.objects}`,
          actions: [
            {
              id: "export-info",
              label: "Export Scene",
              icon: "export",
              action: () => exportScene(),
            },
            {
              id: "clear-info",
              label: "Clear Model",
              icon: "clear",
              action: clearModel,
            },
          ],
        };
      }
      return {
        content: `**Scene Statistics:**\n• Vertices: ${stats.vertices.toLocaleString()}\n• Faces: ${stats.faces.toLocaleString()}\n• Objects: ${stats.objects}\n\nNo file is currently loaded. Drag & drop a .3dm file onto the viewport to see file metadata.`,
      };
    }

    // Rhino-related queries
    if (/rhino|rhinoceros|3dm/i.test(lowerInput)) {
      return {
        content:
          "This viewer fully supports **Rhino 3D** files (.3dm format)!\n\n**Powered by:** Official rhino3dm library (OpenNURBS)\n\n**Import support:**\n• Meshes, BReps, Extrusions\n• Curves and Points\n• Object colors and names\n\n**Export support:**\n• Mesh geometry with colors\n• Compatible with Rhino 7+\n\nDrag & drop a .3dm file onto the viewport to get started!",
        actions:
          stats.objects > 0
            ? [
                {
                  id: "export-rhino",
                  label: "Export 3DM",
                  icon: "export" as const,
                  action: () => exportScene(),
                },
              ]
            : undefined,
      };
    }

    // Clear/remove queries
    if (/clear|remove|delete|reset/i.test(lowerInput)) {
      if (loadedModel) {
        return {
          content: `This will remove **${loadedModel.metadata.fileName}** from the viewport and restore the default cube.\n\nAre you sure?`,
          actions: [
            {
              id: "confirm-clear",
              label: "Clear Model",
              icon: "clear",
              action: clearModel,
            },
          ],
        };
      }
      return {
        content:
          "No model is currently loaded. The viewport shows the default placeholder cube.",
      };
    }

    // Subdivide/mesh operations
    if (/subdivide|smooth|refine/i.test(lowerInput)) {
      return {
        content:
          "Subdivision will smooth your mesh using the Catmull-Clark algorithm. Each face becomes 4 faces, creating a smoother surface.\n\n⚠️ This feature is coming soon! For now, you can:\n• Import pre-subdivided meshes from Rhino\n• Export and subdivide in your 3D software",
        actions: loadedModel
          ? [
              {
                id: "export-subdivide",
                label: "Export for Processing",
                icon: "export",
                action: () => exportScene(),
              },
            ]
          : undefined,
      };
    }

    // Material queries
    if (/material|emission|glow|color/i.test(lowerInput)) {
      return {
        content:
          "Material editing is coming soon! Currently, I preserve the original colors from your .3dm files.\n\n**Supported properties:**\n• Object color (imported)\n• Metalness & roughness (default values)\n\nExport your model to edit materials in Rhino or another 3D app.",
        actions: loadedModel
          ? [
              {
                id: "export-material",
                label: "Export Model",
                icon: "export",
                action: () => exportScene(),
              },
            ]
          : undefined,
      };
    }

    // Primitive shapes
    if (/primitive|shape|cube|sphere|cylinder/i.test(lowerInput)) {
      return {
        content:
          "Procedural shape generation is coming soon!\n\n**Planned primitives:**\n• Box, Sphere, Cylinder\n• Cone, Torus, Plane\n\nFor now, create shapes in Rhino and drag & drop them here.",
      };
    }

    // Default response
    const defaults = [
      {
        content:
          "I can help with Rhino .3dm file operations! Try asking about:\n\n• **Importing** - Drag & drop .3dm files onto the viewport\n• **Exporting** - Save your scene\n• **File info** - View statistics\n\nWhat would you like to do?",
        actions:
          stats.objects > 0
            ? [
                {
                  id: "export-default",
                  label: "Export Scene",
                  icon: "export" as const,
                  action: () => exportScene(),
                },
              ]
            : undefined,
      },
    ];

    return defaults[0];
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");
    setIsTyping(true);

    // Simulate AI response with context-aware replies
    setTimeout(() => {
      const response = getResponse(userInput);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
        actions: response.actions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 600 + Math.random() * 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const getActionIcon = (icon: MessageAction["icon"]) => {
    switch (icon) {
      case "import":
        return Upload;
      case "export":
        return Download;
      case "info":
        return FileBox;
      case "clear":
        return AlertCircle;
      default:
        return CheckCircle2;
    }
  };

  const handleAction = async (action: MessageAction) => {
    await action.action();
  };

  return (
    <div className="h-full flex flex-col panel-glass">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Copilot</span>
        </div>
        <div className="flex items-center gap-1">
          {isLoading || isExporting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-xs text-primary">
                {isLoading ? "Loading..." : "Exporting..."}
              </span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-foreground" />
              <span className="text-xs text-muted-foreground">Online</span>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3 animate-fade-in",
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  message.role === "user"
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {message.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className="flex flex-col gap-2 max-w-[85%]">
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {/* Action buttons */}
                {message.actions && message.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.actions.map((action) => {
                      const Icon = getActionIcon(action.icon);
                      return (
                        <Button
                          key={action.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction(action)}
                          disabled={isLoading || isExporting}
                          className="gap-2 text-xs h-8"
                        >
                          {(isLoading && action.icon === "import") ||
                          (isExporting && action.icon === "export") ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Icon className="w-3.5 h-3.5" />
                          )}
                          {action.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-secondary text-muted-foreground">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-secondary rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggestions */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestion(suggestion.text)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <suggestion.icon className="w-3.5 h-3.5" />
              {suggestion.text}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 pt-2 border-t border-panel-border">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about importing, exporting, or modifying 3D models..."
            rows={1}
            className="w-full resize-none bg-secondary rounded-lg pl-4 pr-12 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-secondary text-code">
            Enter
          </kbd>{" "}
          to send
        </p>
      </div>
    </div>
  );
};
