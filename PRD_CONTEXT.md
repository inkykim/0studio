# 0studio - Product Requirements Document & System Architecture

**Last Updated:** 2024-12-20  
**Version:** 1.0.0  
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
10. [Recent Updates & Features](#recent-updates--features)

---

## Project Overview

**0studio** is a macOS desktop application that provides Git-based version control for Rhino 3D (.3dm) files. It functions similarly to VSCode opening a folder as a project, but instead opens a single .3dm file as a project.

### Core Features

- **File-Based Projects**: Open any .3dm file as a project
- **Auto-Detection**: Automatically detects when .3dm files are saved in Rhino
- **Git Integration**: Full version control with commit, push, pull operations
- **Visual Timeline**: Browse through model history with intuitive timeline UI
- **Gallery Mode**: Compare up to 4 model versions side-by-side in adaptive grid layouts
- **AI-Powered Commits**: Use natural language to describe changes, AI interprets and applies them
- **3D Model Viewer**: Interactive Three.js-based viewer for .3dm files
- **Scene Manipulation**: Create, transform, and modify 3D primitives programmatically
- **Cloud Storage**: Sync models to AWS S3 with versioning and Supabase database
- **Payment Plans**: Student and Enterprise plans that unlock cloud storage features
- **macOS Native**: Built specifically for macOS with proper file associations

### Project Structure

- **Frontend**: React + TypeScript + Vite
- **Backend**: Electron (main process) + Node.js/Express API server
- **3D Rendering**: Three.js + React Three Fiber
- **Version Control**: Git via simple-git (local) + Supabase (cloud)
- **Cloud Storage**: AWS S3 with versioning
- **Authentication**: Supabase Auth
- **Payments**: Stripe subscriptions
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
                    │   Backend API   │
                    │  (Node/Express) │
                    │  ┌──────────┐  │
                    │  │  Stripe  │  │
                    │  │  Webhook │  │
                    │  └──────────┘  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌─────────▼─────────┐  ┌────▼──────┐
│   Supabase    │  │      AWS S3        │  │  Stripe   │
│   (Database + │  │   (File Storage +  │  │ (Payments)│
│    Auth)      │  │    Versioning)     │  │           │
└───────────────┘  └────────────────────┘  └───────────┘
```

### Process Communication

1. **Main Process → Renderer**: IPC events (`ipcMain.send`)
2. **Renderer → Main Process**: IPC invokes (`ipcRenderer.invoke`)
3. **Preload Bridge**: Exposes safe API via `contextBridge.exposeInMainWorld`
4. **Backend API**: RESTful API for cloud operations and payments

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
- **Sonner**: Toast notifications

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
- **@supabase/supabase-js 2.90.0**: Supabase client for auth and database
- **AWS S3**: File storage with versioning (via backend API)

### Payments
- **@stripe/stripe-js 4.10.0**: Stripe client SDK
- **Stripe Subscriptions**: Recurring payment plans

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
│   │   ├── ModelViewer.tsx      # 3D model viewer with gallery mode
│   │   ├── VersionControl.tsx   # Version control UI
│   │   ├── Auth.tsx            # Authentication UI
│   │   ├── TitleBar.tsx        # macOS title bar with user menu
│   │   └── ui/                 # Shadcn UI components
│   │
│   ├── contexts/        # React contexts (state management)
│   │   ├── ModelContext.tsx           # 3D model state
│   │   ├── VersionControlContext.tsx  # Version control state
│   │   └── AuthContext.tsx            # Authentication state
│   │
│   ├── lib/             # Core libraries and services
│   │   ├── desktop-api.ts        # Electron IPC wrapper
│   │   ├── gemini-service.ts     # Google Gemini AI integration
│   │   ├── rhino3dm-service.ts   # Rhino file loading/exporting
│   │   ├── scene-commands.ts    # Scene manipulation commands
│   │   ├── supabase-api.ts      # Supabase database operations
│   │   ├── aws-api.ts           # AWS S3 operations
│   │   ├── commit-storage.ts    # IndexedDB storage for commits
│   │   └── utils.ts             # Utility functions
│   │
│   ├── pages/           # Page components
│   │   ├── Index.tsx    # Main application page
│   │   ├── Dashboard.tsx # Payment plan selection
│   │   └── NotFound.tsx # 404 page
│   │
│   └── hooks/           # Custom React hooks
│       ├── use-cloud-pull.ts    # Cloud pull with payment validation
│       └── use-mobile.tsx       # Mobile detection
│
├── backend/             # Backend API server
│   ├── server.js       # Express server
│   ├── test-setup.js   # Setup verification
│   └── package.json    # Backend dependencies
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
- Renders routing with React Router

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
- Manages gallery mode state (selection, toggle)
- Coordinates with ModelContext via callbacks
- Handles cloud sync with Supabase and S3

**`src/contexts/AuthContext.tsx`**
- Authentication state management using Supabase Auth
- Provides: signUp, signIn, signOut, resetPassword, refreshPaymentStatus
- Tracks user session and loading state
- Manages payment plan state (student/enterprise/none) from backend API
- Auto-refreshes tokens and persists sessions

**`src/lib/desktop-api.ts`**
- Singleton service wrapping Electron IPC
- Provides type-safe API for:
  - Project management (open, close, get current)
  - Git operations (init, status, commit, log, checkout, push, pull)
  - File watching (start, stop, set current file)
  - File reading/writing (readFileBuffer, writeFileBuffer)
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

**`src/lib/supabase-api.ts`**
- API service for Supabase database operations
- Methods for projects, commits, and branches CRUD operations
- Handles error reporting via toast notifications
- Singleton instance exported as `supabaseAPI`

**`src/lib/aws-api.ts`**
- AWS S3 API service (via backend API)
- Methods for presigned URLs (upload/download)
- File upload/download with version ID tracking
- S3 key generation helpers
- Singleton instance exported as `awsS3API`

**`src/components/ModelViewer.tsx`**
- React Three Fiber canvas for 3D rendering
- Displays loaded .3dm models
- Renders generated primitives
- Provides camera controls and lighting
- **Gallery Mode**: Adaptive grid layouts for comparing multiple versions
  - 2 models: Side by side
  - 3 models: 2 on top, 1 full-width on bottom
  - 4 models: 2x2 grid
- Integrates with ModelContext

**`src/components/VersionControl.tsx`**
- UI for version control operations
- Shows commit history, current commit, unsaved changes
- Commit dialog with AI option
- Restore to commit functionality
- **Gallery Mode Toggle**: Button to enter/exit gallery mode
- **Commit Selection**: Checkboxes to select commits for gallery (max 4)
- Search and filter commits
- Star/unstar commits
- Integrates with VersionControlContext

**`src/components/Auth.tsx`**
- Authentication UI components
- `AuthDialog`: Login/Signup dialog with tabs
- `ResetPasswordDialog`: Password reset flow
- `UserMenu`: Dropdown menu triggered by clicking user email
  - Shows user email as clickable trigger button
  - Dropdown contains: Dashboard option (with icon) and Sign Out option (with icon)
  - Uses Shadcn DropdownMenu component
  - If user not logged in, shows AuthDialog instead

**`src/pages/Dashboard.tsx`**
- Dashboard UI for selecting payment plans via Stripe Checkout
- Displays Student and Enterprise plan options with pricing
- Shows current plan status and feature limitations
- Integrates with Stripe Checkout for subscription creation
- Handles Stripe redirect callbacks (success/cancel)
- Accessible via `/dashboard` route
- Requires both `VersionControlProvider` and `ModelProvider`

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

**`src/lib/commit-storage.ts`**
- IndexedDB storage for commit file buffers
- Stores large file buffers separately from localStorage
- Provides: storeFileBuffer, getFileBuffer

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
- `isGalleryMode`: Whether gallery mode is active
- `selectedCommitIds`: Set of commit IDs selected for gallery (max 4)
- `isCloudEnabled`: Whether cloud sync is enabled
- `currentProjectId`: Supabase project ID

**Key Methods**:
- `setCurrentModel(path)`: Set current model
- `commitModelChanges(message, modelData)`: Create regular commit
- `commitWithAI(message)`: Create AI-powered commit
- `restoreToCommit(commitId)`: Restore model to specific commit
- `pullFromCommit(commitId)`: Pull commit to local file (updates disk)
- `createInitialCommit(modelData)`: Create first commit
- `markUnsavedChanges()` / `clearUnsavedChanges()`: Track changes
- `clearCurrentModel()`: Clear model and reset gallery mode
- `toggleGalleryMode()`: Enter/exit gallery mode
- `toggleCommitSelection(commitId)`: Select/deselect commit for gallery (max 4)
- `clearSelectedCommits()`: Clear all selections
- `pullFromCloud()`: Pull commits from cloud storage
- `toggleStarCommit(commitId)`: Star/unstar a commit

**Integration Points**:
- Listens to file changes to mark unsaved changes
- Listens to project-closed events to reset gallery mode
- Uses callbacks to ModelContext for restoration
- Uses callback to execute AI commands (set by component)
- Integrates with Supabase for cloud commits
- Integrates with AWS S3 for file storage

### AuthContext

**Purpose**: Manages authentication and payment plan state

**Key State**:
- `user`: Supabase user object
- `session`: Supabase session
- `isLoading`: Loading state
- `paymentPlan`: Current payment plan ('student' | 'enterprise' | null)
- `hasVerifiedPlan`: Whether user has active subscription

**Key Methods**:
- `signUp(email, password)`: Create new account
- `signIn(email, password)`: Sign in
- `signOut()`: Sign out
- `resetPassword(email)`: Send password reset email
- `refreshPaymentStatus()`: Reload payment plan from backend API

**Integration Points**:
- Loads payment status from backend API on login
- Payment status checked before cloud pull operations
- Dashboard uses AuthContext to check current plan

### DesktopAPI Service

**Purpose**: Type-safe wrapper for Electron IPC

**Key Methods**:
- Project: `openProjectDialog()`, `getCurrentProject()`, `closeProject()`
- Git: `gitInit()`, `gitStatus()`, `gitCommit()`, `gitLog()`, `gitCheckout()`, `gitPush()`, `gitPull()`
- File Watching: `startFileWatching()`, `stopFileWatching()`, `setCurrentFile()`
- File Reading: `readFileBuffer(filePath)`, `writeFileBuffer(filePath, buffer)`
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

### Gallery Mode Flow

```
1. User clicks "Gallery" button in VersionControl
   ↓
2. VersionControlContext.toggleGalleryMode() sets isGalleryMode = true
   ↓
3. User selects commits via checkboxes (max 4)
   ↓
4. VersionControlContext.toggleCommitSelection(commitId) updates selectedCommitIds
   ↓
5. ModelViewer receives selectedCommits from VersionControlContext
   ↓
6. ModelViewer renders grid layout based on count:
   - 2 commits: 2 columns, 1 row
   - 3 commits: 2 columns, 2 rows (2 on top, 1 full-width on bottom)
   - 4 commits: 2 columns, 2 rows (2x2 grid)
   ↓
7. Each selected commit renders in its own Canvas with modelData
   ↓
8. User exits gallery mode → toggleGalleryMode() clears selections
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
  - `id` (uuid), `name` (text), `s3_key` (text), `owner_id` (uuid, references auth.users), `created_at` (timestamptz)
- `commits`: One row per file version
  - `id` (uuid), `project_id` (uuid, references projects), `parent_commit_id` (uuid, references commits), `message` (text), `author_id` (uuid, references auth.users), `s3_version_id` (text), `created_at` (timestamptz)
- `branches`: Pointers to specific commits
  - `id` (uuid), `project_id` (uuid, references projects), `name` (text), `head_commit_id` (uuid, references commits)
- `subscriptions`: User payment plan subscriptions (managed by Stripe webhooks)
  - `id` (uuid, primary key), `user_id` (uuid, references auth.users), `plan` (text: 'student' | 'enterprise')
  - `status` (text: 'active' | 'canceled' | 'past_due'), `stripe_customer_id` (text), `stripe_subscription_id` (text)
  - `created_at` (timestamptz), `updated_at` (timestamptz)
  - Managed automatically by Stripe webhook handlers in backend

**Cloud Commit Flow**:
```
1. User creates a commit with changes
   ↓
2. Frontend uploads file to S3 via presigned URL (backend API)
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
3. Frontend requests presigned download URL for specific version (backend API)
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
- `write-file-buffer`: `(filePath: string, buffer: ArrayBuffer) => Promise<void>`

### Backend API Endpoints

**AWS S3 Operations** (all require auth):
- `GET /api/aws/presigned-upload?key=...` - Get presigned URL for S3 upload
- `GET /api/aws/presigned-download?key=...&versionId=...` - Get presigned URL for S3 download with version
- `GET /api/aws/list-versions?key=...` - List S3 file versions
- `DELETE /api/aws/delete-version?key=...&versionId=...` - Delete S3 file version

**Stripe Payment Operations**:
- `POST /api/stripe/create-checkout-session` - Create Stripe Checkout Session (requires auth)
  - Body: `{ lookup_key?: string, price_id?: string }`
  - Returns: `{ sessionId: string, url: string }`
- `POST /api/stripe/webhook` - Stripe webhook handler (NO auth, uses signature verification)
  - Handles: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `GET /api/stripe/payment-status` - Get user's payment/subscription status (requires auth)
  - Returns: `{ hasActivePlan: boolean, plan: 'student' | 'enterprise' | null, status: string }`

**Health Check**:
- `GET /health` - Health check (no auth required)

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

**ModelCommit** (VersionControlContext):
```typescript
interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Stores full model state for UI
  fileBuffer?: ArrayBuffer; // Stores exact .3dm file for restoration
  s3VersionId?: string; // S3 version ID for cloud commits
  supabaseCommitId?: string; // Supabase commit ID
  parentCommitId?: string; // Parent commit ID for cloud commits
  starred?: boolean; // Whether this commit is starred/favorited
}
```

**LoadedModel**:
```typescript
interface LoadedModel {
  objects: THREE.Object3D[];
  metadata: Rhino3dmMetadata;
  stats?: SceneStats; // curves, surfaces, polysurfaces
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

---

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled, prefer explicit types
- **React**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **File Organization**: Group by feature, not by type

### Component Guidelines

1. **Use Shadcn UI components** when available (check `src/components/ui/`)
2. **Use Shadcn Forms** for user input
3. **Context for global state**: ModelContext, VersionControlContext, AuthContext
4. **Local state for UI**: useState for component-specific state
5. **Custom hooks**: Extract reusable logic

### State Management Patterns

1. **Model State**: Managed in ModelContext
2. **Version Control State**: Managed in VersionControlContext
3. **Auth State**: Managed in AuthContext
4. **Server State**: Use TanStack Query (currently minimal usage)
5. **UI State**: Local useState in components

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
- **Commits**: Store full model state in ModelCommit.modelData and fileBuffer
- **Restoration**: Restores model state from commit data

### Authentication (Supabase)

- **Provider**: Supabase Auth
- **Context**: AuthContext manages user session state
- **Components**: 
  - `AuthDialog`: Login/Signup dialog with tabs
  - `UserMenu`: Dropdown menu accessible by clicking user email in TitleBar
- **Session**: Auto-refreshes tokens, persists across app restarts
- **Password Reset**: Email-based reset flow

### Payment Plans (Stripe Integration)

- **Plans**: Student and Enterprise subscription plans via Stripe
- **Payment Provider**: Stripe subscriptions (recurring billing)
- **Storage**: Payment plan stored in Supabase `subscriptions` table
  - Managed via Stripe webhooks (not manual updates)
- **Backend API**: Node.js/Express server handles Stripe integration
  - **Local Development**: `http://localhost:3000`
  - **Stripe Webhook Endpoint**: `POST /api/stripe/webhook`
    - Local: Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- **Stripe Checkout Flow**:
  1. User clicks plan in Dashboard
  2. Frontend calls `POST /api/stripe/create-checkout-session`
  3. Backend creates Stripe Checkout Session
  4. User redirected to Stripe Checkout page
  5. After payment, redirected back to Dashboard with `success=true`
  6. Frontend calls `refreshPaymentStatus()` to update plan status
- **Payment Status API**: `GET /api/stripe/payment-status`
  - Returns: `{ hasActivePlan: boolean, plan: 'student' | 'enterprise' | null, status: string }`
  - Called by AuthContext on login and when `refreshPaymentStatus()` is invoked
- **Access Control**: Without an active subscription, users can make commits but cannot pull from cloud storage
- **Dashboard**: Users can select their plan via the Dashboard page (`/dashboard`)
- **Verification**: `hasVerifiedPlan` property in AuthContext indicates if user has an active subscription
- **Restrictions**: 
  - Commits: Always allowed (local operations)
  - Pull from cloud storage: Requires active subscription (`status: 'active'`)
- **Hook**: `useCloudPull()` hook provides validated pull operations with error handling

### Backend API Server

- **Technology**: Node.js/Express server (`backend/server.js`)
- **Port**: 3000 (configurable via `PORT` env variable)
- **Authentication**: All endpoints (except `/health` and `/api/stripe/webhook`) require Supabase JWT token in `Authorization: Bearer <token>` header
- **Security**: 
  - JWT token verification via Supabase
  - User isolation (users can only access their own resources)
  - Rate limiting (100 requests per 15 minutes per IP)
  - CORS protection
  - Stripe webhook signature verification
- **Environment Variables**: 
  - AWS: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`
  - Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Server: `PORT`, `FRONTEND_URL`

### Cloud Storage (Supabase + AWS S3)

- **Database**: Supabase PostgreSQL (projects, commits, branches, subscriptions tables)
- **File Storage**: AWS S3 with versioning enabled
- **Backend API**: All S3 operations go through backend API server (not direct from frontend)
- **S3 Structure**: `org-{userId}/project-{projectId}/models/{filename}`
- **Version Tracking**: Each commit stores `s3_version_id` pointing to S3 version
- **Delta Commits**: Only changed files get new S3 versions
- **Presigned URLs**: Used for secure upload/download without exposing AWS credentials
- **Access Control**: Pull operations require active Stripe subscription

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

### Gallery Mode

- **Selection Limit**: Maximum of 4 commits can be selected
- **Layouts**:
  - 2 commits: Side by side (2 columns, 1 row)
  - 3 commits: 2 on top, 1 full-width on bottom (2 columns, 2 rows)
  - 4 commits: 2x2 grid (2 columns, 2 rows)
- **State Management**: 
  - `isGalleryMode`: Boolean flag in VersionControlContext
  - `selectedCommitIds`: Set of selected commit IDs (max 4)
- **Reset Behavior**: Gallery mode resets when project is closed
- **UI**: Checkboxes in VersionControl component for selection, disabled when limit reached

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
3. Creates ModelCommit with current modelData and fileBuffer
4. If cloud enabled, uploads to S3 and creates Supabase commit
5. Adds to commits array
6. Sets as current commit
7. Clears unsaved changes flag

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
3. Retrieves ModelCommit from array (or downloads from S3 if cloud)
4. Calls onModelRestore callback with modelData
5. ModelContext restores scene:
   - If modelData.objects: setLoadedModel()
   - If serialized objects: restoreScene()
6. Scene updates to show restored state
7. VersionControlContext updates currentCommitId

### Pulling from Commit (Updates File on Disk)

1. User clicks "Pull" button on commit
2. VersionControlContext.pullFromCommit(commitId)
3. Retrieves fileBuffer from commit (or downloads from S3)
4. Writes fileBuffer to disk via desktopAPI.writeFileBuffer()
5. File is updated on disk
6. Rhino detects change and auto-reloads
7. ModelContext reloads model from disk

### Gallery Mode Workflow

1. User clicks "Gallery" button in VersionControl
2. VersionControlContext.toggleGalleryMode() sets isGalleryMode = true
3. User selects commits via checkboxes (max 4, disabled when limit reached)
4. ModelViewer detects selectedCommits and renders grid layout
5. Each selected commit renders in its own Canvas with modelData
6. User can interact with each viewport independently
7. User exits gallery mode → toggleGalleryMode() clears selections and resets state

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

### Stripe Payment Flow

```
1. User clicks plan in Dashboard
   ↓
2. Dashboard calls POST /api/stripe/create-checkout-session
   ↓
3. Backend creates Stripe Checkout Session with user metadata
   ↓
4. User redirected to Stripe Checkout page
   ↓
5. User completes payment
   ↓
6. Stripe sends webhook event: customer.subscription.created
   ↓
7. Backend webhook handler creates/updates subscription in Supabase
   ↓
8. User redirected back to Dashboard with success=true
   ↓
9. Dashboard calls refreshPaymentStatus() in AuthContext
   ↓
10. AuthContext calls GET /api/stripe/payment-status
   ↓
11. Backend queries Supabase subscriptions table
   ↓
12. AuthContext updates paymentPlan state
   ↓
13. User now has access to all features
```

---

## Recent Updates & Features

### Gallery Mode (Latest)
- **Selection Limit**: Maximum 4 commits can be selected for comparison
- **Adaptive Layouts**: 
  - 2 models: Side by side
  - 3 models: 2 on top, 1 full-width on bottom
  - 4 models: 2x2 grid
- **State Management**: Proper reset when project is closed
- **UI**: Checkboxes with disabled state when limit reached

### Cloud Storage Integration
- **Supabase**: Full database integration for projects and commits
- **AWS S3**: File storage with versioning via backend API
- **Payment Gating**: Cloud pull requires active subscription

### Payment System
- **Stripe Integration**: Full subscription management
- **Webhook Handling**: Automatic subscription status updates
- **Dashboard**: User-friendly plan selection interface

### Bug Fixes
- **Gallery Mode Reset**: Fixed bug where gallery mode background persisted after closing project
- **Grid Layout**: Fixed 3 and 4 model layouts to display correctly
- **Selection Limit**: Proper enforcement of 4-commit maximum

---

## Environment Variables

### Frontend
- `VITE_GEMINI_API_KEY`: Google Gemini API key (required for AI features)
- `VITE_SUPABASE_URL`: Supabase project URL (required for auth and database)
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key (required for auth and database)
- `VITE_BACKEND_URL`: Backend API URL (defaults to `http://localhost:3000`)
  - Used for both AWS S3 operations and Stripe payment operations
  - Can also use `VITE_AWS_API_URL` for backward compatibility

### Backend
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region (e.g., us-east-1)
- `S3_BUCKET_NAME`: S3 bucket name
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret
- `PORT`: Server port (default: 3000)
- `FRONTEND_URL`: Frontend URL for CORS

---

## Notes for AI Agent

### When Adding Features

1. **Check existing contexts**: ModelContext, VersionControlContext, AuthContext
2. **Use desktop-api.ts**: For Electron IPC, don't call window.electronAPI directly
3. **Follow command pattern**: For scene manipulation, use scene-commands.ts types
4. **AI integration**: Use gemini-service.ts, follow command format
5. **Cloud operations**: Use supabase-api.ts for database, aws-api.ts for file storage
6. **Authentication**: Use AuthContext and check user state before cloud operations
7. **Payment plans**: 
   - Check `hasVerifiedPlan` before allowing pull operations, use `useCloudPull()` hook
   - Payment plans managed via Stripe subscriptions stored in Supabase `subscriptions` table
   - Use `refreshPaymentStatus()` in AuthContext to reload payment status from backend
8. **UI components**: Prefer Shadcn UI from `src/components/ui/`
9. **Forms**: Use Shadcn Forms pattern
10. **State management**: Use contexts for global state, useState for local
11. **Provider dependencies**: 
    - `ModelProvider` requires `VersionControlProvider` (ModelProvider uses useVersionControl internally)
    - Always wrap pages with both providers if using ModelProvider
    - Dashboard page requires both providers for TitleBar to work correctly
12. **UserMenu**: Clicking user email in TitleBar opens dropdown menu with Dashboard and Sign Out options
13. **Gallery Mode**: 
    - Maximum 4 commits can be selected
    - Reset gallery mode state when closing project
    - Use explicit grid positioning for 4-commit layout

### Common Patterns

- **File operations**: Always check `desktopAPI.isDesktop` before calling
- **Error handling**: Wrap async operations, show toast on error
- **Type safety**: Use TypeScript interfaces, avoid `any`
- **Serialization**: ModelContext provides serializeScene/restoreScene
- **Event cleanup**: Remove IPC listeners in useEffect cleanup
- **Gallery mode**: Check `isGalleryMode` and `selectedCommitIds.size` before rendering gallery

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
