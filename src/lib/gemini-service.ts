import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

const SYSTEM_PROMPT = `You are a helpful 3D modeling assistant for a Rhino 3D (.3dm) file viewer application. You help users with:

- Understanding their 3D models and file statistics
- Importing and exporting .3dm files
- Mesh operations like subdivision and smoothing
- Materials and colors
- Geometry transformations

Keep responses concise and helpful. When users ask about features that aren't implemented yet, let them know it's coming soon and suggest alternatives.

The viewer currently supports:
- Loading .3dm files via drag & drop
- Viewing meshes, BReps, extrusions, curves, and points
- Preserving object colors from the original file
- Exporting scenes back to .3dm format

Features coming soon:
- Mesh subdivision
- Material editing
- Procedural shape generation`;

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export async function sendMessage(
  userMessage: string,
  history: ChatMessage[],
  modelContext?: {
    hasModel: boolean;
    fileName?: string;
    objectCount?: number;
    curves: number;
    surfaces: number;
    polysurfaces: number;
  }
): Promise<string> {
  if (!genAI) {
    return "Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.";
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Build context about the current scene
    let contextInfo = "";
    if (modelContext) {
      if (modelContext.hasModel && modelContext.fileName) {
        contextInfo = `\n\nCurrent scene context:
- File loaded: ${modelContext.fileName}
- Objects: ${modelContext.objectCount}
- Curves: ${modelContext.curves}
- Surfaces: ${modelContext.surfaces}
- Polysurfaces: ${modelContext.polysurfaces}`;
      } else {
        contextInfo = `\n\nCurrent scene context:
- No file loaded (showing default placeholder cube)
- Curves: ${modelContext.curves}
- Surfaces: ${modelContext.surfaces}
- Polysurfaces: ${modelContext.polysurfaces}`;
      }
    }

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: "System: " + SYSTEM_PROMPT + contextInfo }],
        },
        {
          role: "model",
          parts: [
            {
              text: "I understand. I'm ready to help with 3D modeling tasks in this Rhino file viewer.",
            },
          ],
        },
        ...history,
      ],
    });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API error:", error);
    if (error instanceof Error) {
      if (error.message.includes("API_KEY")) {
        return "Invalid API key. Please check your VITE_GEMINI_API_KEY in the .env file.";
      }
      return `Error: ${error.message}`;
    }
    return "An error occurred while communicating with Gemini.";
  }
}

export function isGeminiConfigured(): boolean {
  return !!apiKey;
}
