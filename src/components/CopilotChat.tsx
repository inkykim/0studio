import { useState, useRef, useEffect, useCallback } from "react";
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
import {
  sendMessage,
  isGeminiConfigured,
  type ChatMessage,
} from "@/lib/gemini-service";
import {
  parseGeminiResponse,
  executeCommands,
  type CommandExecutor,
} from "@/lib/scene-commands";

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
    generatedObjects,
    triggerFileDialog,
    exportScene,
    clearModel,
    addPrimitive,
    removeObject,
    transformObject,
    setObjectColor,
    clearGeneratedObjects,
  } = useModel();

  const getInitialMessage = (): Message => ({
    id: "1",
    role: "assistant",
    content:
      "Hello! I'm your 3D modeling assistant. I can:\n\n• Create shapes (box, sphere, cylinder, cone, torus)\n• Move, rotate, and scale objects\n• Change colors\n• Import/export .3dm files\n\nTry saying \"Create a red cube\" or \"Add 3 spheres in a row\"!",
    timestamp: new Date(Date.now() - 60000),
  });

  const [messages, setMessages] = useState<Message[]>([getInitialMessage()]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
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
          content: `You already have ${loadedModel.metadata.fileName} loaded with ${loadedModel.metadata.objectCount} object(s).\n\nWould you like to clear the current model? You can then drag & drop a new file onto the viewport.`,
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
          "Drag & drop a Rhino .3dm file directly onto the viewport to view it.",
      };
    }

    // Export-related queries
    if (/export|save|download/i.test(lowerInput)) {
      const totalObjects = stats.curves + stats.surfaces + stats.polysurfaces;
      if (totalObjects === 0) {
        return {
          content:
            "There's nothing in the scene yet. Drag & drop a .3dm file onto the viewport to get started.\n\nThe default cube in the viewport is just a placeholder.",
        };
      }
      return {
        content: `Current scene:\n${stats.curves} curve(s)\n${stats.surfaces} surface(s)\n${stats.polysurfaces} polysurface(s)`,
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
          content: `Current File: ${loadedModel.metadata.fileName}\nFile Size: ${fileSizeKB} KB\nObjects Loaded: ${loadedModel.metadata.objectCount}\n\nScene Statistics:\nCurves: ${stats.curves}\nSurfaces: ${stats.surfaces}\nPolysurfaces: ${stats.polysurfaces}`,
          actions: [
            {
              id: "export-info",
              label: "Export to 3DM",
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
        content: `Scene Statistics:\nCurves: ${stats.curves}\nSurfaces: ${stats.surfaces}\nPolysurfaces: ${stats.polysurfaces}\n\nNo file is currently loaded. Drag & drop a .3dm file onto the viewport.`,
      };
    }

    // Rhino-related queries
    if (/rhino|rhinoceros|3dm/i.test(lowerInput)) {
      const hasObjects = stats.curves + stats.surfaces + stats.polysurfaces > 0;
      return {
        content:
          "This viewer supports Rhino 3D files (.3dm format).\n\nPowered by: Official rhino3dm library (OpenNURBS)\n\nSupported:\nMeshes, BReps, Extrusions\nCurves and Points\nObject colors and names\n\nDrag & drop a .3dm file onto the viewport to get started!",
        actions: hasObjects
          ? [
              {
                id: "export-rhino",
                label: "Export to 3DM",
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
          content: `This will remove ${loadedModel.metadata.fileName} from the viewport and restore the default cube.\n\nAre you sure?`,
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
          "Subdivision will smooth your mesh using the Catmull-Clark algorithm. Each face becomes 4 faces, creating a smoother surface.\n\nThis feature is coming soon! For now, you can edit geometry in Rhino or your 3D software.",
        actions: loadedModel
          ? [
              {
                id: "export-subdivide",
                label: "Export to 3DM",
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
          "Material editing is coming soon! Currently, I preserve the original colors from your .3dm files.\n\nSupported properties:\nObject color (preserved from file)\nMetalness & roughness (default values)\n\nYou can edit materials in Rhino or another 3D app.",
        actions: loadedModel
          ? [
              {
                id: "export-material",
                label: "Export to 3DM",
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
          "Procedural shape generation is coming soon!\n\nPlanned primitives:\nBox, Sphere, Cylinder\nCone, Torus, Plane\n\nFor now, create shapes in Rhino and drag & drop them here.",
      };
    }

    // Default response
    const hasObjects = stats.curves + stats.surfaces + stats.polysurfaces > 0;
    return {
      content:
        "I can help you understand your 3D models! Try asking about:\n\nFile info - View statistics\nSubdividing meshes\nMaterials and colors\n\nWhat would you like to know?",
      actions: hasObjects
        ? [
            {
              id: "export-default",
              label: "Export to 3DM",
              icon: "export" as const,
              action: () => exportScene(),
            },
          ]
        : undefined,
    };
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

    // Check if Gemini is configured
    if (!isGeminiConfigured()) {
      // Fallback to local responses if no API key
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
      return;
    }

    // Use Gemini API
    try {
      const modelContext = {
        hasModel: !!loadedModel,
        fileName: loadedModel?.metadata.fileName,
        objectCount: loadedModel?.metadata.objectCount,
        curves: stats.curves,
        surfaces: stats.surfaces,
        polysurfaces: stats.polysurfaces,
        generatedObjects: generatedObjects.map(obj => ({
          id: obj.id,
          type: obj.type,
          name: obj.name,
        })),
      };

      const responseText = await sendMessage(userInput, chatHistory, modelContext);

      // Parse the response for commands
      const { message, commands } = parseGeminiResponse(responseText);

      // Execute any commands found
      if (commands.length > 0) {
        const executor: CommandExecutor = {
          addPrimitive,
          removeObject,
          transformObject,
          setObjectColor,
          clearGeneratedObjects,
          getLastObjectId: () => generatedObjects.length > 0 ? generatedObjects[generatedObjects.length - 1].id : null,
        };

        const result = executeCommands(commands, executor);
        
        if (result.errors.length > 0) {
          console.warn("Command execution errors:", result.errors);
        }
      }

      // Update chat history for context
      setChatHistory((prev) => [
        ...prev,
        { role: "user", parts: [{ text: userInput }] },
        { role: "model", parts: [{ text: responseText }] },
      ]);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: message || "Done!",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
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
          ) : isGeminiConfigured() ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Gemini</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-xs text-muted-foreground">Offline</span>
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
