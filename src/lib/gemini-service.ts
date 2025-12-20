import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

const SYSTEM_PROMPT = `You are a 3D modeling assistant for a Rhino 3D (.3dm) file viewer application. You can CREATE and MODIFY 3D objects in the scene.

## Your Capabilities
- Create primitive shapes: box, sphere, cylinder, cone, torus, plane
- Transform objects: move (position), rotate, scale
- Change colors
- Delete objects
- Clear all generated objects

## How to Execute Actions
When the user asks you to create or modify objects, include a JSON command block in your response. Use this format:

\`\`\`json
{"action": "create", "type": "box", "params": {"size": 2, "color": "#ff0000", "position": [0, 1, 0], "name": "Red Box"}}
\`\`\`

### Available Commands:

1. CREATE - Make new objects:
\`\`\`json
{"action": "create", "type": "sphere", "params": {"radius": 1.5, "color": "#00ff00", "position": [2, 0, 0]}}
\`\`\`
Types: box, sphere, cylinder, cone, torus, plane
Params: size, width, height, depth, radius, color (hex), position ([x,y,z]), name

2. TRANSFORM - Move/rotate/scale objects:
\`\`\`json
{"action": "transform", "target": "last", "position": [0, 2, 0], "rotation": [0, 45, 0], "scale": 1.5}
\`\`\`
Target: "last" (most recent) or object ID
Position: [x, y, z]
Rotation: [x, y, z] in degrees
Scale: number or [x, y, z]

3. COLOR - Change object color:
\`\`\`json
{"action": "color", "target": "last", "color": "#0000ff"}
\`\`\`

4. DELETE - Remove an object:
\`\`\`json
{"action": "delete", "target": "last"}
\`\`\`

5. CLEAR - Remove all generated objects:
\`\`\`json
{"action": "clear"}
\`\`\`

## Multiple Commands
You can include multiple commands in an array:
\`\`\`json
[
  {"action": "create", "type": "box", "params": {"size": 1, "color": "#ff0000", "position": [-2, 0, 0]}},
  {"action": "create", "type": "sphere", "params": {"radius": 0.5, "color": "#00ff00", "position": [2, 0, 0]}}
]
\`\`\`

## Guidelines
- Always include a brief conversational response explaining what you're doing
- Use sensible default sizes (1-2 units) unless the user specifies
- Position objects so they don't overlap (spread them out on x/z axes)
- Use appealing colors when not specified
- Keep responses concise`;

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface GeneratedObjectInfo {
  id: string;
  type: string;
  name: string;
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
    generatedObjects?: GeneratedObjectInfo[];
  }
): Promise<string> {
  if (!genAI) {
    return "Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.";
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build context about the current scene
    let contextInfo = "\n\nCurrent scene context:";
    if (modelContext) {
      if (modelContext.hasModel && modelContext.fileName) {
        contextInfo += `
- File loaded: ${modelContext.fileName}
- Imported objects: ${modelContext.objectCount}
- Curves: ${modelContext.curves}
- Surfaces: ${modelContext.surfaces}
- Polysurfaces: ${modelContext.polysurfaces}`;
      } else {
        contextInfo += `
- No file loaded`;
      }
      
      if (modelContext.generatedObjects && modelContext.generatedObjects.length > 0) {
        contextInfo += `
- Generated objects (${modelContext.generatedObjects.length}):`;
        modelContext.generatedObjects.forEach(obj => {
          contextInfo += `
  * ${obj.name} (${obj.type}) - ID: ${obj.id}`;
        });
      } else {
        contextInfo += `
- No generated objects yet`;
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
