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
    const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

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

const COMMIT_MESSAGE_PROMPT = `You are a 3D modeling assistant. The user has written a commit message describing changes they want to make to a 3D model. Your job is to interpret this message and generate commands to modify the scene.

## Your Capabilities
- Create primitive shapes: box, sphere, cylinder, cone, torus, plane
- Transform objects: move (position), rotate, scale
- Change colors
- Delete objects
- Clear all generated objects

## Output Format
You MUST respond with ONLY a JSON array of commands. No explanation, no markdown formatting, just pure JSON.

### Available Commands:

1. CREATE - Make new objects:
{"action": "create", "type": "sphere", "params": {"radius": 1.5, "color": "#00ff00", "position": [2, 0, 0], "name": "Green Sphere"}}
Types: box, sphere, cylinder, cone, torus, plane
Params: size, width, height, depth, radius, color (hex), position ([x,y,z]), name

2. TRANSFORM - Move/rotate/scale objects:
{"action": "transform", "target": "last", "position": [0, 2, 0], "rotation": [0, 45, 0], "scale": 1.5}
Target: "last" (most recent) or object ID

3. COLOR - Change object color:
{"action": "color", "target": "last", "color": "#0000ff"}

4. DELETE - Remove an object:
{"action": "delete", "target": "last"}

5. CLEAR - Remove all generated objects:
{"action": "clear"}

## Examples

Commit message: "Add a red cube"
Response: [{"action": "create", "type": "box", "params": {"size": 1, "color": "#ff0000", "name": "Red Cube"}}]

Commit message: "Create a blue sphere at the origin and a green cylinder next to it"
Response: [{"action": "create", "type": "sphere", "params": {"radius": 1, "color": "#0044ff", "position": [0, 0, 0], "name": "Blue Sphere"}}, {"action": "create", "type": "cylinder", "params": {"radius": 0.5, "height": 2, "color": "#00ff44", "position": [3, 0, 0], "name": "Green Cylinder"}}]

Commit message: "Scale up the last object"
Response: [{"action": "transform", "target": "last", "scale": 2}]

Commit message: "Remove all objects and start fresh with a torus"
Response: [{"action": "clear"}, {"action": "create", "type": "torus", "params": {"radius": 1.5, "color": "#ff6600", "name": "Torus"}}]

## Guidelines
- Return an empty array [] if the message doesn't seem to be about 3D modeling
- Use sensible default sizes (1-2 units) unless specified
- Position objects so they don't overlap (spread them out)
- Use appealing colors when not specified
- Be creative in interpreting natural language`;

export interface CommitInterpretationResult {
  success: boolean;
  commands: import('./scene-commands').SceneCommand[];
  error?: string;
}

/**
 * Interpret a commit message as 3D modeling instructions and return scene commands
 */
export async function interpretCommitMessage(
  commitMessage: string,
  sceneContext?: {
    generatedObjects?: GeneratedObjectInfo[];
  }
): Promise<CommitInterpretationResult> {
  if (!genAI) {
    return {
      success: false,
      commands: [],
      error: "Gemini API key not configured",
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build context about existing objects
    let contextInfo = "";
    if (sceneContext?.generatedObjects && sceneContext.generatedObjects.length > 0) {
      contextInfo = `\n\nCurrent scene has ${sceneContext.generatedObjects.length} generated objects:\n`;
      sceneContext.generatedObjects.forEach(obj => {
        contextInfo += `- ${obj.name} (${obj.type}) - ID: ${obj.id}\n`;
      });
    }

    const prompt = `${COMMIT_MESSAGE_PROMPT}${contextInfo}

Now interpret this commit message and return ONLY the JSON array of commands:

Commit message: "${commitMessage}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the JSON response
    try {
      // Remove any markdown code block formatting if present
      let jsonText = text;
      if (text.startsWith("```")) {
        jsonText = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      }
      
      const commands = JSON.parse(jsonText);
      
      if (!Array.isArray(commands)) {
        return {
          success: false,
          commands: [],
          error: "LLM did not return a valid command array",
        };
      }

      return {
        success: true,
        commands: commands,
      };
    } catch (parseError) {
      console.error("Failed to parse LLM response:", text, parseError);
      return {
        success: false,
        commands: [],
        error: `Failed to parse LLM response: ${parseError}`,
      };
    }
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      success: false,
      commands: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
