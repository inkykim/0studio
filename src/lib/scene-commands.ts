// Scene command types that Gemini can output

export interface CreateCommand {
  action: 'create';
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  params?: {
    size?: number;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    color?: string;
    position?: [number, number, number];
    name?: string;
  };
}

export interface TransformCommand {
  action: 'transform';
  target: string; // object id or 'last' for most recent
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

export interface ColorCommand {
  action: 'color';
  target: string;
  color: string;
}

export interface DeleteCommand {
  action: 'delete';
  target: string;
}

export interface ClearCommand {
  action: 'clear';
}

export type SceneCommand = CreateCommand | TransformCommand | ColorCommand | DeleteCommand | ClearCommand;

export interface ParsedResponse {
  message: string;
  commands: SceneCommand[];
}

/**
 * Parse a Gemini response that may contain commands in JSON format.
 * Commands should be wrapped in ```json code blocks.
 */
export function parseGeminiResponse(response: string): ParsedResponse {
  const commands: SceneCommand[] = [];
  let message = response;

  // Look for JSON code blocks containing commands
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match;

  while ((match = jsonBlockRegex.exec(response)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);

      // Handle array of commands or single command
      if (Array.isArray(parsed)) {
        commands.push(...parsed.filter(isValidCommand));
      } else if (isValidCommand(parsed)) {
        commands.push(parsed);
      }

      // Remove the JSON block from the message
      message = message.replace(match[0], '').trim();
    } catch (e) {
      console.warn('Failed to parse JSON block:', e);
    }
  }

  // Also try to find inline JSON commands (for simpler responses)
  const inlineCommandRegex = /\[COMMAND:\s*(\{[\s\S]*?\})\s*\]/g;
  while ((match = inlineCommandRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (isValidCommand(parsed)) {
        commands.push(parsed);
        message = message.replace(match[0], '').trim();
      }
    } catch (e) {
      console.warn('Failed to parse inline command:', e);
    }
  }

  return { message, commands };
}

function isValidCommand(obj: unknown): obj is SceneCommand {
  if (!obj || typeof obj !== 'object') return false;
  const cmd = obj as Record<string, unknown>;
  
  if (!('action' in cmd)) return false;
  
  switch (cmd.action) {
    case 'create':
      return 'type' in cmd && ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'].includes(cmd.type as string);
    case 'transform':
      return 'target' in cmd;
    case 'color':
      return 'target' in cmd && 'color' in cmd;
    case 'delete':
      return 'target' in cmd;
    case 'clear':
      return true;
    default:
      return false;
  }
}

export interface CommandExecutor {
  addPrimitive: (type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane', params?: CreateCommand['params']) => string;
  removeObject: (id: string) => boolean;
  transformObject: (id: string, transform: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: number | [number, number, number] }) => boolean;
  setObjectColor: (id: string, color: string) => boolean;
  clearGeneratedObjects: () => void;
  getLastObjectId: () => string | null;
}

export interface ExecutionResult {
  success: boolean;
  createdIds: string[];
  errors: string[];
}

/**
 * Execute a list of scene commands
 */
export function executeCommands(
  commands: SceneCommand[],
  executor: CommandExecutor
): ExecutionResult {
  const createdIds: string[] = [];
  const errors: string[] = [];
  let lastCreatedId: string | null = executor.getLastObjectId();

  for (const command of commands) {
    try {
      switch (command.action) {
        case 'create': {
          const id = executor.addPrimitive(command.type, command.params);
          createdIds.push(id);
          lastCreatedId = id;
          break;
        }
        case 'transform': {
          const targetId = command.target === 'last' ? lastCreatedId : command.target;
          if (!targetId) {
            errors.push('No object to transform');
            break;
          }
          const success = executor.transformObject(targetId, {
            position: command.position,
            rotation: command.rotation,
            scale: command.scale,
          });
          if (!success) {
            errors.push(`Failed to transform object: ${targetId}`);
          }
          break;
        }
        case 'color': {
          const targetId = command.target === 'last' ? lastCreatedId : command.target;
          if (!targetId) {
            errors.push('No object to color');
            break;
          }
          const success = executor.setObjectColor(targetId, command.color);
          if (!success) {
            errors.push(`Failed to set color on object: ${targetId}`);
          }
          break;
        }
        case 'delete': {
          const targetId = command.target === 'last' ? lastCreatedId : command.target;
          if (!targetId) {
            errors.push('No object to delete');
            break;
          }
          const success = executor.removeObject(targetId);
          if (!success) {
            errors.push(`Failed to delete object: ${targetId}`);
          }
          break;
        }
        case 'clear': {
          executor.clearGeneratedObjects();
          lastCreatedId = null;
          break;
        }
      }
    } catch (e) {
      errors.push(`Command execution error: ${e}`);
    }
  }

  return {
    success: errors.length === 0,
    createdIds,
    errors,
  };
}
