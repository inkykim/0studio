# 0studio - Product Requirements Document & System Architecture

**Last Updated:** 2024-1-11
**Purpose:** Comprehensive context document for Cursor AI agent to reference during development

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [File Structure & Purpose](#file-structure--purpose)
5. [Core Components](#core-components)
6. [Data Flow & State Management](#data-flow--state-management)
7. [API Contracts & Interfaces](#api-contracts--interfaces)
8. [Development Guidelines](#development-guidelines)
9. [Key Workflows](#key-workflows)

---

## Project Overview

**0studio** is a macOS desktop application that provides Git-based version control for Rhino 3D (.3dm) files. It functions similarly to VSCode opening a folder as a project, but instead opens a single .3dm file as a project.

### Core Features

- **File-Based Projects**: Open any .3dm file as a project
- **Auto-Detection**: Automatically detects when .3dm files are saved in Rhino
- **Git Integration**: Full version control with commit, push, pull operations
- **Visual Timeline**: Browse through model history
- **AI-Powered Commits**: Use natural language to describe changes, AI interprets and applies them
- **3D Model Viewer**: Interactive Three.js-based viewer for .3dm files
- **Scene Manipulation**: Create, transform, and modify 3D primitives programmatically
- **macOS Native**: Built specifically for macOS with proper file associations
- **Payment Plans**: Student and Enterprise plans that unlock cloud storage features

### Project Structure

- **Frontend**: React + TypeScript + Vite
- **Backend**: Electron (main process)
- **3D Rendering**: Three.js + React Three Fiber
- **Version Control**: Git via simple-git (local) + Supabase (cloud)
- **Cloud Storage**: AWS S3 with versioning
- **Authentication**: Supabase Auth
- **AI Integration**: Google Gemini API

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ FileWatcher  │  │  GitService  │  │ ProjectService│      │
│  │   Service    │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘             │
│                            │                                 │
│                    IPC (ipcMain)                             │
└────────────────────────────┼─────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Preload Script │
                    │  (contextBridge) │
                    └────────┬─────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│              Electron Renderer Process (React)                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    React App                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │ ModelContext │  │VersionControl│  │  Components │ │  │
│  │  │              │  │   Context    │  │             │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │  │
│  │         │                 │                 │         │  │
│  │  ┌──────▼─────────────────▼─────────────────▼───────┐ │  │
│  │  │         Desktop API Service (desktop-api.ts)      │ │  │
│  │  └───────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │             3D Rendering Layer                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │ ModelViewer  │  │ Rhino3dm     │  │  Scene      │ │  │
│  │  │  Component   │  │  Service     │  │  Commands   │ │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              AI Integration Layer                        │  │
│  │  ┌──────────────┐                                       │  │
│  │  │  Gemini      │                                       │  │
│  │  │  Service     │                                       │  │
│  │  └──────────────┘                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         Authentication & Cloud Storage Layer             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │ AuthContext  │  │  Supabase    │  │  AWS S3     │ │  │
│  │  │              │  │  API Service │  │  API Service│ │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Supabase      │
                    │   (Database +   │
                    │    Auth)        │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   AWS S3        │
                    │   (File Storage │
                    │    + Versioning)│
                    └─────────────────┘
```

### Process Communication

1. **Main Process → Renderer**: IPC events (`ipcMain.send`)
2. **Renderer → Main Process**: IPC invokes (`ipcRenderer.invoke`)
3. **Preload Bridge**: Exposes safe API via `contextBridge.exposeInMainWorld`

---

## Technology Stack

### Frontend
- **React 18.3.1**: UI framework
- **TypeScript 5.8.3**: Type safety
- **Vite 5.4.19**: Build tool and dev server
- **React Router 6.30.1**: Routing
- **TanStack Query 5.83.0**: Server state management
- **Tailwind CSS 3.4.17**: Styling
- **Shadcn UI**: Component library (Radix UI primitives)

### 3D Rendering
- **Three.js 0.160.1**: 3D graphics library
- **React Three Fiber 8.18.0**: React renderer for Three.js
- **React Three Drei 9.122.0**: Useful helpers for R3F
- **rhino3dm 8.17.0**: Rhino 3D file format support

### Desktop
- **Electron 32.2.7**: Desktop app framework
- **chokidar 4.0.0**: File system watching
- **simple-git 3.27.0**: Git operations

### Cloud & Authentication
- **@supabase/supabase-js**: Supabase client for auth and database
- **AWS S3**: File storage with versioning (via backend API)

### AI & Utilities
- **@google/generative-ai 0.21.0**: Google Gemini API
- **zod 3.25.76**: Schema validation
- **react-hook-form 7.61.1**: Form handling
- **date-fns 3.6.0**: Date utilities

---

## File Structure & Purpose

### Root Directory

```
0studio/
├── electron/              # Electron main process code
│   ├── main.ts           # Main Electron process entry point
│   ├── preload.ts        # Preload script (context bridge)
│   ├── services/         # Electron services
│   │   ├── file-watcher.ts    # File system watching
│   │   ├── git-service.ts     # Git operations
│   │   └── project-service.ts # Project management
│   └── tsconfig.json     # TypeScript config for Electron
│
├── src/                  # React application source
│   ├── main.tsx         # React app entry point
│   ├── App.tsx          # Root React component
│   │
│   ├── components/      # React components
│   │   ├── ModelViewer.tsx      # 3D model viewer component
│   │   ├── VersionControl.tsx   # Version control UI
│   │   ├── CopilotChat.tsx     # AI chat interface (commented out)
│   │   ├── TitleBar.tsx        # macOS title bar
│   │   └── ui/                 # Shadcn UI components
│   │
│   ├── contexts/        # React contexts (state management)
│   │   ├── ModelContext.tsx           # 3D model state
│   │   └── VersionControlContext.tsx  # Version control state
│   │
│   ├── lib/             # Core libraries and services
│   │   ├── desktop-api.ts        # Electron IPC wrapper
│   │   ├── gemini-service.ts     # Google Gemini AI integration
│   │   ├── rhino3dm-service.ts   # Rhino file loading/exporting
│   │   ├── scene-commands.ts     # Scene manipulation commands
│   │   └── utils.ts              # Utility functions
│   │
│   ├── pages/           # Page components
│   │   ├── Index.tsx    # Main application page
│   │   └── NotFound.tsx # 404 page
│   │
│   └── hooks/           # Custom React hooks
│
├── dist/                # Built React app (production)
├── dist-electron/       # Built Electron app
├── public/              # Static assets
└── package.json         # Dependencies and scripts
```

### Key Files Reference

#### Electron Main Process

**`electron/main.ts`**
- Entry point for Electron main process
- Manages BrowserWindow lifecycle
- Sets up IPC handlers
- Handles file associations and menu
- Coordinates FileWatcher and GitService

**`electron/preload.ts`**
- Exposes safe API to renderer via `contextBridge`
- Defines TypeScript interfaces for `window.electronAPI`
- Bridges IPC calls between renderer and main process

**`electron/services/file-watcher.ts`**
- Uses `chokidar` to watch .3dm files for changes
- Emits events when files are modified, deleted, or added
- Handles file stability (waits for write completion)

**`electron/services/git-service.ts`**
- Wraps `simple-git` for Git operations
- Provides: init, status, commit, log, checkout, push, pull
- Manages Git repository in project directory

#### React Application

**`src/App.tsx`**
- Root component
- Sets up QueryClient, TooltipProvider, Toasters
- Renders Index page

**`src/pages/Index.tsx`**
- Main application layout
- Resizable panels: VersionControl | ModelViewer
- Wraps app in ModelProvider and VersionControlProvider

**`src/contexts/ModelContext.tsx`**
- Manages 3D model state and operations
- Handles file loading, scene manipulation, export
- Tracks generated objects (primitives)
- Provides serialization for version control
- Integrates with file watching for auto-reload

**`src/contexts/VersionControlContext.tsx`**
- Manages version control state
- Tracks commits, current commit, unsaved changes
- Handles commit creation (regular and AI-powered)
- Provides model restoration from commits
- Coordinates with ModelContext via callbacks

**`src/lib/desktop-api.ts`**
- Singleton service wrapping Electron IPC
- Provides type-safe API for:
  - Project management (open, close, get current)
  - Git operations (init, status, commit, log, checkout, push, pull)
  - File watching (start, stop, set current file)
  - File reading (readFileBuffer)
- Event listeners for IPC events

**`src/lib/rhino3dm-service.ts`**
- Loads .3dm files using Three.js Rhino3dmLoader
- Exports Three.js scenes to .3dm files
- Uses CDN-hosted rhino3dm library
- Converts between Three.js and Rhino mesh formats
- Provides metadata about loaded models

**`src/lib/gemini-service.ts`**
- Integrates with Google Gemini API
- Two main functions:
  - `sendMessage()`: Chat interface for 3D modeling assistance
  - `interpretCommitMessage()`: Converts commit messages to scene commands
- System prompts define AI capabilities and command format
- Returns JSON commands that can be executed

**`src/lib/supabase.ts`**
- Supabase client configuration
- TypeScript types for database schema (projects, commits, branches)
- Exports singleton `supabase` client instance

**`src/lib/supabase-api.ts`**
- API service for Supabase database operations
- Methods for projects, commits, and branches CRUD operations
- Handles error reporting via toast notifications
- Singleton instance exported as `supabaseAPI`

**`src/lib/aws-api.ts`**
- AWS S3 API service (currently dummy implementation)
- Methods for presigned URLs (upload/download)
- File upload/download with version ID tracking
- Will be replaced with actual AWS SDK integration
- Singleton instance exported as `awsS3API`

**`src/contexts/AuthContext.tsx`**
- Authentication state management using Supabase Auth
- Provides: signUp, signIn, signOut, resetPassword, setPaymentPlan
- Tracks user session and loading state
- Manages payment plan state (student/enterprise/none)
- Auto-refreshes tokens and persists sessions
- Payment plan stored in localStorage per user

**`src/pages/Dashboard.tsx`**
- Dashboard UI for selecting payment plans
- Displays Student and Enterprise plan options
- Shows current plan status and feature limitations
- Accessible via dashboard route and TitleBar link

**`src/hooks/use-cloud-pull.ts`**
- Hook for cloud pull operations with payment plan validation
- Checks if user has verified payment plan before allowing pulls
- Shows error toast with dashboard link if plan is missing
- Wraps desktopAPI.gitPull() with permission checks

**`src/lib/scene-commands.ts`**
- Defines command types: create, transform, color, delete, clear
- Parses Gemini responses for JSON commands
- Executes commands via CommandExecutor interface
- Validates command structure

**`src/components/ModelViewer.tsx`**
- React Three Fiber canvas for 3D rendering
- Displays loaded .3dm models
- Renders generated primitives
- Provides camera controls and lighting
- Integrates with ModelContext

**`src/components/VersionControl.tsx`**
- UI for version control operations
- Shows commit history, current commit, unsaved changes
- Commit dialog with AI option
- Restore to commit functionality
- Integrates with VersionControlContext

**`src/components/Auth.tsx`**
- Authentication UI components
- `AuthDialog`: Login/Signup dialog with tabs
- `ResetPasswordDialog`: Password reset flow
- `UserMenu`: User info and sign out button
- Uses Shadcn Forms for validation
- Integrates with AuthContext

---

## Core Components

### ModelContext

**Purpose**: Manages 3D model state, file operations, and scene manipulation

**Key State**:
- `loadedModel`: Loaded .3dm file data (THREE.Object3D[] + metadata)
- `currentFile`: Path to current .3dm file
- `generatedObjects`: Array of programmatically created primitives
- `stats`: Scene statistics (curves, surfaces, polysurfaces)
- `isLoading`, `isExporting`, `error`: UI state

**Key Methods**:
- `importFile(file)`: Load .3dm file
- `exportScene(filename?)`: Export scene to .3dm
- `addPrimitive(type, params)`: Create primitive (box, sphere, etc.)
- `removeObject(id)`: Delete object
- `transformObject(id, transform)`: Move/rotate/scale
- `setObjectColor(id, color)`: Change color
- `serializeScene()`: Serialize for version control
- `restoreScene(objects)`: Restore from serialized state

**Integration Points**:
- Listens to file changes via `desktopAPI.onFileChanged()`
- Auto-reloads model when file changes on disk
- Creates initial commit when model is loaded
- Provides restore callback to VersionControlContext

### VersionControlContext

**Purpose**: Manages version control state and operations

**Key State**:
- `currentModel`: Path to current model file
- `commits`: Array of ModelCommit objects
- `currentCommitId`: ID of currently active commit
- `hasUnsavedChanges`: Whether model has uncommitted changes
- `isProcessingAICommit`: Whether AI commit is in progress

**Key Methods**:
- `setCurrentModel(path)`: Set current model
- `commitModelChanges(message, modelData)`: Create regular commit
- `commitWithAI(message)`: Create AI-powered commit
- `restoreToCommit(commitId)`: Restore model to specific commit
- `createInitialCommit(modelData)`: Create first commit
- `markUnsavedChanges()` / `clearUnsavedChanges()`: Track changes

**Integration Points**:
- Listens to file changes to mark unsaved changes
- Uses callbacks to ModelContext for restoration
- Uses callback to execute AI commands (set by component)

### DesktopAPI Service

**Purpose**: Type-safe wrapper for Electron IPC

**Key Methods**:
- Project: `openProjectDialog()`, `getCurrentProject()`, `closeProject()`
- Git: `gitInit()`, `gitStatus()`, `gitCommit()`, `gitLog()`, `gitCheckout()`, `gitPush()`, `gitPull()`
- File Watching: `startFileWatching()`, `stopFileWatching()`, `setCurrentFile()`
- File Reading: `readFileBuffer(filePath)`
- Events: `onProjectOpened()`, `onProjectClosed()`, `onFileChanged()`

**Pattern**: All methods check `isElectron` and return early if not in Electron

### Gemini Service

**Purpose**: AI integration for 3D modeling assistance

**Key Functions**:
- `sendMessage(userMessage, history, modelContext)`: Chat interface
- `interpretCommitMessage(message, sceneContext)`: Convert commit message to commands

**Command Format**: JSON objects with `action` field:
- `create`: Create primitive
- `transform`: Move/rotate/scale
- `color`: Change color
- `delete`: Remove object
- `clear`: Clear all generated objects

**System Prompts**: Define AI capabilities and expected output format

### Scene Commands

**Purpose**: Execute AI-generated commands on 3D scene

**Key Types**:
- `CreateCommand`, `TransformCommand`, `ColorCommand`, `DeleteCommand`, `ClearCommand`
- `SceneCommand`: Union of all command types

**Key Functions**:
- `parseGeminiResponse(response)`: Extract JSON commands from text
- `executeCommands(commands, executor)`: Execute commands via executor interface

**Executor Interface**: Provides methods matching ModelContext scene manipulation

---

## Data Flow & State Management

### File Loading Flow

```
1. User opens .3dm file
   ↓
2. Electron main process: openProjectDialog()
   ↓
3. IPC: project-opened event → Renderer
   ↓
4. ModelContext.importFile() called
   ↓
5. rhino3dm-service.load3dmFile() parses file
   ↓
6. ModelContext.setLoadedModel() updates state
   ↓
7. ModelViewer renders Three.js scene
   ↓
8. VersionControlContext.createInitialCommit() stores initial state
```

### File Change Detection Flow

```
1. User saves .3dm file in Rhino
   ↓
2. FileWatcherService detects change
   ↓
3. Electron main: sends 'file-changed' IPC event
   ↓
4. ModelContext: onFileChanged handler
   ↓
5. ModelContext.reloadModelFromDisk()
   ↓
6. Reads file via desktopAPI.readFileBuffer()
   ↓
7. Reloads model and updates scene
   ↓
8. VersionControlContext.markUnsavedChanges()
```

### AI Commit Flow

```
1. User enters commit message in VersionControl UI
   ↓
2. VersionControlContext.commitWithAI(message)
   ↓
3. Calls onAICommit callback (set by component)
   ↓
4. Component calls gemini-service.interpretCommitMessage()
   ↓
5. Gemini returns JSON commands array
   ↓
6. Component executes commands via ModelContext methods
   ↓
7. ModelContext updates scene (adds/modifies objects)
   ↓
8. Component returns updated modelData
   ↓
9. VersionControlContext creates commit with modelData
```

### Commit Restoration Flow

```
1. User clicks "Restore" on a commit
   ↓
2. VersionControlContext.restoreToCommit(commitId)
   ↓
3. Retrieves ModelCommit with modelData
   ↓
4. Calls onModelRestore callback (set by ModelContext)
   ↓
5. ModelContext.restoreScene() or setLoadedModel()
   ↓
6. Scene updates to show restored state
   ↓
7. VersionControlContext.setCurrentCommitId()
```

### Cloud Storage Architecture (Supabase + S3)

**Overview**: The system uses a hybrid approach combining Supabase (database) and AWS S3 (file storage with versioning).

**Storage Structure**:
```
S3 Bucket:
└── org-{userId}/
    └── project-{projectId}/
         ├── models/
         │     └── model.3dm  (S3 Version IDs: v1, v2, v3...)
         └── textures/
               └── texture.png
```

**Database Schema** (Supabase):
- `projects`: One row per file location
  - `id`, `name`, `s3_key`, `owner_id`, `created_at`
- `commits`: One row per file version
  - `id`, `project_id`, `parent_commit_id`, `message`, `author_id`, `s3_version_id`, `created_at`
- `branches`: Pointers to specific commits
  - `id`, `project_id`, `name`, `head_commit_id`

**Cloud Commit Flow**:
```
1. User creates a commit with changes
   ↓
2. Frontend uploads file to S3 via presigned URL
   ↓
3. S3 returns x-amz-version-id header
   ↓
4. Frontend calls Supabase API: createCommit()
   ↓
5. Supabase stores commit with s3_version_id
   ↓
6. Commit linked to parent_commit_id (delta commits)
```

**Cloud Restore Flow**:
```
1. User selects a commit to restore
   ↓
2. Frontend fetches commit from Supabase (includes s3_version_id)
   ↓
3. Frontend requests presigned download URL for specific version
   ↓
4. Backend generates presigned URL with VersionId parameter
   ↓
5. Frontend downloads file from S3
   ↓
6. ModelContext loads and displays restored model
```

---

## API Contracts & Interfaces

### Electron IPC Channels

**Main → Renderer (Events)**:
- `project-opened`: `{ filePath, fileName }`
- `project-closed`: `{}`
- `file-changed`: `{ eventType, filename, filePath }`
- `show-save-version-dialog`: `{}`
- `show-version-history`: `{}`
- `simulate-model-changes`: `{}`
- `export-model`: `{}`
- `git-operation-complete`: `{ operation }`

**Renderer → Main (Invokes)**:
- `open-project-dialog`: `() => Promise<string | null>`
- `get-current-project`: `() => Promise<ProjectInfo | null>`
- `close-project`: `() => Promise<void>`
- `git-init`: `(projectPath: string) => Promise<void>`
- `git-status`: `() => Promise<GitStatus>`
- `git-commit`: `(message: string, files: string[]) => Promise<void>`
- `git-log`: `() => Promise<GitCommit[]>`
- `git-checkout`: `(commitHash: string) => Promise<void>`
- `git-push`: `() => Promise<void>`
- `git-pull`: `() => Promise<void>`
- `start-file-watching`: `() => Promise<void>`
- `stop-file-watching`: `() => Promise<void>`
- `set-current-file`: `(filePath: string) => Promise<void>`
- `read-file-buffer`: `(filePath: string) => Promise<ArrayBuffer>`

### Type Definitions

**ProjectInfo**:
```typescript
interface ProjectInfo {
  filePath: string;
  projectDir: string;
  fileName: string;
}
```

**GitStatus**:
```typescript
interface GitStatus {
  files: Array<{
    path: string;
    status: string;
    staged: boolean;
  }>;
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}
```

**GitCommit**:
```typescript
interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
}
```

**ModelCommit** (VersionControlContext):
```typescript
interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Stores full model state
}
```

**LoadedModel**:
```typescript
interface LoadedModel {
  objects: THREE.Object3D[];
  metadata: Rhino3dmMetadata;
  stats?: SceneStats; // Added for version control
}
```

**SceneCommand**:
```typescript
type SceneCommand = 
  | { action: 'create', type: PrimitiveType, params?: CreateParams }
  | { action: 'transform', target: string, position?: [number, number, number], rotation?: [number, number, number], scale?: number | [number, number, number] }
  | { action: 'color', target: string, color: string }
  | { action: 'delete', target: string }
  | { action: 'clear' };
```

**Supabase Types**:
```typescript
interface Project {
  id: string;
  name: string;
  s3_key: string;
  owner_id: string;
  created_at: string;
}

interface Commit {
  id: string;
  project_id: string;
  parent_commit_id: string | null;
  message: string | null;
  author_id: string;
  s3_version_id: string;
  created_at: string;
}

interface Branch {
  id: string;
  project_id: string;
  name: string;
  head_commit_id: string | null;
}
```

---

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled, prefer explicit types
- **React**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **File Organization**: Group by feature, not by type

### Component Guidelines

1. **Use Shadcn UI components** when available (check `src/components/ui/`)
2. **Use Shadcn Forms** for user input (https://ui.shadcn.com/docs/components/form)
3. **Context for global state**: ModelContext, VersionControlContext
4. **Local state for UI**: useState for component-specific state
5. **Custom hooks**: Extract reusable logic

### State Management Patterns

1. **Model State**: Managed in ModelContext
2. **Version Control State**: Managed in VersionControlContext
3. **Server State**: Use TanStack Query (currently minimal usage)
4. **UI State**: Local useState in components

### Error Handling

- **Try-catch blocks**: Wrap async operations
- **User feedback**: Use toast notifications (Sonner)
- **Console logging**: Use for debugging, remove in production
- **Error boundaries**: Consider adding for React errors

### File Watching

- **Stability threshold**: 1 second after last change
- **Poll interval**: 100ms during stability check
- **Auto-reload**: ModelContext automatically reloads on file change
- **Unsaved changes**: VersionControlContext tracks when file changes

### Git Operations

- **Repository location**: Same directory as .3dm file
- **Initialization**: Creates .gitignore automatically
- **Commits**: Store full model state in ModelCommit.modelData
- **Restoration**: Restores model state from commit data

### Authentication (Supabase)

- **Provider**: Supabase Auth
- **Context**: AuthContext manages user session state
- **Components**: AuthDialog, UserMenu in TitleBar
- **Session**: Auto-refreshes tokens, persists across app restarts
- **Password Reset**: Email-based reset flow

### Payment Plans

- **Plans**: Student and Enterprise plans available
- **Storage**: Payment plan stored in localStorage per user ID
- **Access Control**: Without a verified payment plan, users can make commits but cannot pull from cloud storage
- **Dashboard**: Users can select their plan via the Dashboard page (`/dashboard`)
- **Verification**: `hasVerifiedPlan` property in AuthContext indicates if user has an active plan
- **Restrictions**: 
  - Commits: Always allowed (local operations)
  - Pull from cloud storage: Requires verified payment plan
  - Other features: All unlocked with verified plan
- **Hook**: `useCloudPull()` hook provides validated pull operations with error handling

### Cloud Storage (Supabase + AWS S3)

- **Database**: Supabase PostgreSQL (projects, commits, branches tables)
- **File Storage**: AWS S3 with versioning enabled
- **S3 Structure**: `org-{userId}/project-{projectId}/models/{filename}`
- **Version Tracking**: Each commit stores `s3_version_id` pointing to S3 version
- **Delta Commits**: Only changed files get new S3 versions
- **Presigned URLs**: Used for secure upload/download without exposing AWS credentials
- **Current Status**: AWS API is dummy implementation, needs backend integration

### AI Integration

- **API Key**: `VITE_GEMINI_API_KEY` environment variable
- **Model**: `gemini-3.0-flash` for chat, `gemini-2.5-flash` for commit interpretation
- **Command parsing**: Extracts JSON from markdown code blocks
- **Error handling**: Returns user-friendly error messages

### 3D Scene Management

- **Generated objects**: Stored in ModelContext.generatedObjects
- **Object IDs**: Format: `gen_{timestamp}_{random}`
- **Serialization**: Full state saved in commits
- **Restoration**: Recreates objects from serialized data

---

## Key Workflows

### Opening a Project

1. User clicks "Open .3dm Project" or uses Cmd+O
2. Electron shows file dialog
3. User selects .3dm file
4. Electron main process:
   - Sets currentProjectFile
   - Starts file watching
   - Sends 'project-opened' event
5. Renderer receives event:
   - ModelContext.importFile() loads file
   - VersionControlContext.setCurrentModel() sets path
   - VersionControlContext.createInitialCommit() creates first commit

### Committing Changes

**Regular Commit**:
1. User enters commit message
2. VersionControlContext.commitModelChanges()
3. Creates ModelCommit with current modelData
4. Adds to commits array
5. Sets as current commit
6. Clears unsaved changes flag

**AI Commit**:
1. User enters commit message
2. VersionControlContext.commitWithAI()
3. Calls onAICommit callback
4. Component calls gemini-service.interpretCommitMessage()
5. Gemini returns commands
6. Component executes commands via ModelContext
7. ModelContext updates scene
8. Component returns updated modelData
9. VersionControlContext creates commit with updated data

### Restoring a Commit

1. User clicks "Restore" on commit in history
2. VersionControlContext.restoreToCommit(commitId)
3. Retrieves ModelCommit from array
4. Calls onModelRestore callback with modelData
5. ModelContext restores scene:
   - If modelData.objects: setLoadedModel()
   - If serialized objects: restoreScene()
6. Scene updates to show restored state
7. VersionControlContext updates currentCommitId

### File Change Detection

1. User saves .3dm file in Rhino
2. FileWatcherService detects change (after 1s stability)
3. Electron main sends 'file-changed' IPC event
4. ModelContext.onFileChanged handler:
   - Calls reloadModelFromDisk()
   - Reads file via desktopAPI.readFileBuffer()
   - Parses with rhino3dm-service
   - Updates loadedModel state
5. VersionControlContext.onFileChanged handler:
   - Marks hasUnsavedChanges = true

### Exporting Model

1. User triggers export (menu or button)
2. ModelContext.exportScene(filename)
3. Traverses Three.js scene
4. Converts meshes to Rhino format
5. Creates .3dm file
6. Triggers browser download

---

## Environment Variables

- `VITE_GEMINI_API_KEY`: Google Gemini API key (required for AI features)
- `VITE_SUPABASE_URL`: Supabase project URL (required for auth and database)
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key (required for auth and database)
- `VITE_AWS_API_URL`: Backend API URL for AWS S3 operations (optional, defaults to localhost:3000)

---

## Build & Development

### Development

```bash
# Start Vite dev server
npm run dev

# Build Electron TypeScript
npm run build:electron

# Watch Electron changes
npm run watch:electron

# Run Electron app (dev mode)
npm run electron:dev
```

### Production Build

```bash
# Build React app
npm run build

# Build Electron
npm run build:electron

# Package for distribution
npm run electron:dist
```

---

## Notes for AI Agent

### When Adding Features

1. **Check existing contexts**: ModelContext, VersionControlContext, AuthContext
2. **Use desktop-api.ts**: For Electron IPC, don't call window.electronAPI directly
3. **Follow command pattern**: For scene manipulation, use scene-commands.ts types
4. **AI integration**: Use gemini-service.ts, follow command format
5. **Cloud operations**: Use supabase-api.ts for database, aws-api.ts for file storage
6. **Authentication**: Use AuthContext and check user state before cloud operations
7. **Payment plans**: Check `hasVerifiedPlan` before allowing pull operations, use `useCloudPull()` hook
8. **UI components**: Prefer Shadcn UI from `src/components/ui/`
9. **Forms**: Use Shadcn Forms pattern
10. **State management**: Use contexts for global state, useState for local

### Common Patterns

- **File operations**: Always check `desktopAPI.isDesktop` before calling
- **Error handling**: Wrap async operations, show toast on error
- **Type safety**: Use TypeScript interfaces, avoid `any`
- **Serialization**: ModelContext provides serializeScene/restoreScene
- **Event cleanup**: Remove IPC listeners in useEffect cleanup

### Testing File Watching

1. Open a .3dm file in 0studio
2. Note the file path in console
3. Save a .3dm file to that path (or modify existing)
4. App should auto-reload and show unsaved changes

### AI Command Execution

1. Commands come from Gemini as JSON
2. Parsed by scene-commands.parseGeminiResponse()
3. Executed via CommandExecutor interface
4. ModelContext implements executor methods
5. Commands update generatedObjects array
6. Scene re-renders automatically

---

**End of PRD Context Document**

