# 0studio - Product Requirements Document & System Architecture

**Last Updated:** 2026-01-22  
**Version:** 1.2.0  
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
10. [Implementation Gaps & Known Issues](#implementation-gaps--known-issues)
11. [Recent Updates & Features](#recent-updates--features)

---

## Project Overview

**0studio** is a macOS desktop application that provides Git-based version control for Rhino 3D (.3dm) files. It functions similarly to VSCode opening a folder as a project, but instead opens a single .3dm file as a project.

### Core Features

- **File-Based Projects**: Open any .3dm file as a project
- **Auto-Detection**: Automatically detects when .3dm files are saved in Rhino
- **Local Version Control**: Full version control with commit history, branching, and restore operations
- **Visual Timeline**: Browse through model history with intuitive branching tree UI
- **Gallery Mode**: Compare up to 4 model versions side-by-side in adaptive grid layouts
- **3D Model Viewer**: Interactive Three.js-based viewer for .3dm files
- **Payment Plans**: Student and Enterprise plans (Stripe integration ready)
- **macOS Native**: Built specifically for macOS with proper file associations

### Planned Features (Not Yet Implemented)

- **Cloud Storage**: Backend API ready, frontend integration pending
- **Git Integration**: Service exists but IPC handlers not implemented

### Project Structure

- **Frontend**: React + TypeScript + Vite
- **Backend**: Electron (main process) + Node.js/Express API server
- **3D Rendering**: Three.js + React Three Fiber
- **Version Control**: Git via simple-git (local) + Supabase (cloud)
- **Cloud Storage**: AWS S3 with versioning
- **Authentication**: Supabase Auth
- **Payments**: Stripe subscriptions
- **AI Integration**: Removed (infrastructure was unused and has been cleaned up)

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
│   │   ├── file-storage-service.ts  # 0studio commit storage
│   │   ├── file-watcher.ts          # File system watching
│   │   ├── git-service.ts           # Git operations (not connected to IPC)
│   │   └── project-service.ts       # Project management
│   └── tsconfig.json     # TypeScript config for Electron
│
├── src/                  # React application source
│   ├── main.tsx         # React app entry point
│   ├── App.tsx          # Root React component
│   │
│   ├── components/      # React components
│   │   ├── ModelViewer.tsx      # 3D model viewer with gallery mode
│   │   ├── VersionControl.tsx   # Version control UI with branching tree
│   │   ├── NavLink.tsx          # Navigation link component
│   │   ├── Auth.tsx             # Authentication UI (AuthDialog, UserMenu)
│   │   ├── TitleBar.tsx         # macOS title bar with user menu
│   │   └── ui/                  # Shadcn UI components
│   │
│   ├── contexts/        # React contexts (state management)
│   │   ├── ModelContext.tsx           # 3D model state
│   │   ├── VersionControlContext.tsx  # Version control state
│   │   └── AuthContext.tsx            # Authentication state
│   │
│   ├── lib/             # Core libraries and services
│   │   ├── desktop-api.ts        # Electron IPC wrapper
│   │   ├── rhino3dm-service.ts   # Rhino file loading/exporting
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

**`electron/services/file-storage-service.ts`**
- Manages local file storage for commit versions
- Creates `0studio_{filename}/` folder structure
- Stores commit files as `commit-{commitId}.3dm`
- Stores branch/commit tree in `tree.json` (same folder as commits)
- Provides: saveCommitFile, readCommitFile, listCommitFiles, saveTreeFile, loadTreeFile, validateCommitFiles
- Validates commit files exist when loading tree.json

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
- Main application layout with macOS-style title bar
- Resizable panels: VersionControl (30%) | ModelViewer (70%)
- Wraps content in VersionControlProvider → ModelProvider (order matters!)

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
- **Local Persistence**: Loads/saves `tree.json` from `0studio_{filename}/` folder
  - Loads on `setCurrentModel()` (primary source, falls back to localStorage)
  - Auto-saves on any commit/branch change via `useEffect`
  - Validates commit files exist, warns about missing files
  - Saves before project close to ensure persistence

**`src/contexts/AuthContext.tsx`**
- Authentication state management using Supabase Auth
- Provides: signUp, signIn, signOut, resetPassword, refreshPaymentStatus
- Tracks user session and loading state
- Manages payment plan state (student/enterprise/none) from backend API
- Auto-refreshes tokens and persists sessions

**`src/lib/desktop-api.ts`**
- Singleton service wrapping Electron IPC
- Provides type-safe API for:
  - Project management (openProjectDialog, getCurrentProject, closeProject)
  - File watching (startFileWatching, stopFileWatching, setCurrentFile)
  - File reading/writing (readFileBuffer, writeFileBuffer)
  - **Local commit storage**: saveCommitFile, readCommitFile, listCommitFiles, commitFileExists
  - **Tree persistence**: saveTreeFile, loadTreeFile, validateCommitFiles
  - Git operations (gitInit, gitStatus, gitCommit, gitLog, gitCheckout, gitPush, gitPull) - ⚠️ Exposed but handlers NOT implemented in main.ts
- Event listeners for IPC events (onProjectOpened, onProjectClosed, onFileChanged, onShowCommitDialog, onGitOperationComplete)
- `isDesktop` property to check if running in Electron

**`src/lib/rhino3dm-service.ts`**
- Loads .3dm files using Three.js Rhino3dmLoader
- Exports Three.js scenes to .3dm files
- Uses CDN-hosted rhino3dm library
- Converts between Three.js and Rhino mesh formats
- Provides metadata about loaded models

**`src/lib/supabase-api.ts`**
- API service for Supabase database operations
- Methods for projects, commits, and branches CRUD operations
- Handles error reporting via toast notifications
- Singleton instance exported as `supabaseAPI`
- ⚠️ **Note**: Complete and functional, but NOT currently called from VersionControlContext

**`src/lib/aws-api.ts`**
- AWS S3 API service (via backend API)
- Methods for presigned URLs (upload/download)
- File upload/download with version ID tracking
- S3 key generation helpers
- Singleton instance exported as `awsS3API`
- ⚠️ **Note**: Complete and functional, but NOT currently called from VersionControlContext

**`src/components/ModelViewer.tsx`**
- React Three Fiber canvas for 3D rendering
- Displays loaded .3dm models with automatic centering and camera fitting
- Renders generated primitives (AI-created objects)
- Provides OrbitControls for camera manipulation (rotate, zoom, pan)
- Multi-directional lighting setup (ambient, directional, hemisphere)
- Adaptive grid floor that scales based on model size
- Scene stats overlay (curves, surfaces, polysurfaces count)
- Drag-and-drop file import support
- Empty state with file picker button
- Loading and error states
- **Gallery Mode**: Adaptive grid layouts for comparing multiple commits
  - 1 model: Full view
  - 2 models: Side by side (2 columns)
  - 3 models: 2 on top, 1 full-width on bottom
  - 4 models: 2x2 grid
- Each gallery viewport has independent orbit controls
- Integrates with ModelContext and VersionControlContext

**`src/components/VersionControl.tsx`**
- UI for version control operations
- **BranchingTree**: SVG-based visual tree with colored branch lines and commit nodes
- Shows commit history with version labels, current commit, unsaved changes indicator
- Commit input with AI option (🤖 checkbox) and custom branch name support
- Pull (Download) and Restore buttons for each commit
- **Gallery Mode Toggle**: Button to enter/exit gallery mode
- **Commit Selection**: Checkboxes to select commits for gallery (max 4)
- **Branch Selector**: Dropdown to switch between branches when multiple exist
- **Keep Button**: Mark current branch as main
- Star/unstar commits
- Integrates with VersionControlContext and ModelContext

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

**`src/lib/commit-storage.ts`**
- IndexedDB storage for commit file buffers (legacy, used as fallback)
- Stores large file buffers separately from localStorage
- Provides: storeFileBuffer, getFileBuffer
- **Note**: Primary storage is now local file system (`0studio_{filename}/` folder)

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

**Purpose**: Manages version control state, branching, and operations

**Key State**:
- `currentModel`: Path to current model file
- `modelName`: Filename of current model
- `commits`: Array of ModelCommit objects
- `currentCommitId`: ID of currently active commit
- `hasUnsavedChanges`: Whether model has uncommitted changes
- `branches`: Array of Branch objects (branching feature)
- `activeBranchId`: Currently selected branch ID
- `pulledCommitId`: ID of commit that was last pulled/downloaded (for highlighting)
- `isGalleryMode`: Whether gallery mode is active
- `selectedCommitIds`: Set of commit IDs selected for gallery (max 4)
- `isLoadingTree`: Whether tree.json is currently being loaded (internal)
- `treeLoadPromise`: Promise that resolves when tree.json loading completes (internal, for race condition prevention)

**Key Methods**:
- `setCurrentModel(path)`: Set current model, loads tree.json and creates treeLoadPromise
- `commitModelChanges(message, modelData, customBranchName?)`: Create regular commit (auto-branches when committing from non-head)
- `restoreToCommit(commitId)`: Restore model to specific commit (UI only, doesn't update disk)
- `pullFromCommit(commitId)`: Pull commit to local file (updates disk, sets pulledCommitId for branch tracking)
- `createInitialCommit(modelData, fileBuffer?, filePath?)`: Create first commit and main branch (awaits treeLoadPromise first)
- `markUnsavedChanges()` / `clearUnsavedChanges()`: Track changes
- `clearCurrentModel()`: Clear model, reset gallery mode, branches, and tree loading state
- `toggleGalleryMode()`: Enter/exit gallery mode
- `toggleCommitSelection(commitId)`: Select/deselect commit for gallery (max 4)
- `clearSelectedCommits()`: Clear all selections
- `toggleStarCommit(commitId)`: Star/unstar a commit
- `getStarredCommits()`: Get all starred commits
- `switchBranch(branchId)`: Switch to a different branch
- `keepBranch(branchId)`: Mark a branch as the main branch
- `getBranchCommits(branchId)`: Get all commits for a specific branch
- `getCommitVersionLabel(commit)`: Get version label (v1, v2, v3a, v3b, etc.)
- `setModelRestoreCallback(callback)`: Set callback for restoring model from commit

**Branching Logic**:
- When `pullFromCommit` is called, `pulledCommitId` is set to track the pulled commit
- When committing with `pulledCommitId` set and it's not the branch head, a new branch is automatically created
- Branch names follow pattern: v{parentVersion}{letter} (e.g., v2a, v2b, v2c)
- Each branch has a unique color for visualization
- Users can switch between branches and mark any branch as "main"

**Integration Points**:
- Listens to file changes (via desktopAPI) to mark unsaved changes
- Listens to project-closed events to reset gallery mode and branches
- Uses callbacks to ModelContext for model restoration (`onModelRestore`)
- Uses FileStorageService (via desktopAPI) for local commit file storage
- Uses tree.json for persisting branch/commit metadata

**Note**: Cloud storage integration (Supabase + AWS S3) is NOT currently implemented in VersionControlContext. The backend API and service files exist for future integration, but the frontend context only handles local storage via the `0studio_{filename}/` folder structure.

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
- File Watching: `startFileWatching()`, `stopFileWatching()`, `setCurrentFile()`
- File Reading: `readFileBuffer(filePath)`, `writeFileBuffer(filePath, buffer)`
- Commit Storage: `saveCommitFile()`, `readCommitFile()`, `listCommitFiles()`, `commitFileExists()`
- Tree Persistence: `saveTreeFile()`, `loadTreeFile()`, `validateCommitFiles()`
- Events: `onProjectOpened()`, `onProjectClosed()`, `onFileChanged()`, `onShowCommitDialog()`, `onGitOperationComplete()`
- Git (exposed but NOT implemented): `gitInit()`, `gitStatus()`, `gitCommit()`, `gitLog()`, `gitCheckout()`, `gitPush()`, `gitPull()`

**Pattern**: All methods check `isElectron` and return early/null if not in Electron

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

### Local File Storage Architecture

**Overview**: The system stores commit files and metadata locally in a dedicated folder structure alongside the original .3dm file.

**Storage Structure**:
```
/path/to/
├── model.3dm                    # Original working file
└── 0studio_model/               # Storage folder for this file (named 0studio_{filename})
    ├── commit-{id1}.3dm         # Commit file versions
    ├── commit-{id2}.3dm
    ├── commit-{id3}.3dm
    └── tree.json                # Branch and commit tree metadata
```

**File Storage Service** (`electron/services/file-storage-service.ts`):
- Creates `0studio_{filename}/` folder in the same directory as the .3dm file
- Stores each commit as `commit-{commitId}.3dm` in the storage folder
- Stores branch and commit tree structure in `tree.json` (same folder as commits)
- Validates commit files exist when loading tree.json
- Provides methods: `saveCommitFile()`, `readCommitFile()`, `listCommitFiles()`, `saveTreeFile()`, `loadTreeFile()`, `validateCommitFiles()`

**Tree.json Structure**:
```json
{
  "version": "1.0",
  "activeBranchId": "branch-123",
  "currentCommitId": "commit-456",
  "branches": [
    {
      "id": "branch-123",
      "name": "main",
      "headCommitId": "commit-456",
      "color": "#ef4444",
      "isMain": true,
      "parentBranchId": null,
      "originCommitId": null
    }
  ],
  "commits": [
    {
      "id": "commit-456",
      "message": "Initial commit",
      "timestamp": 1234567890,
      "parentCommitId": null,
      "branchId": "branch-123",
      "starred": false
    }
  ]
}
```

**Persistence Flow**:
1. **On Project Open**: 
   - `VersionControlContext.setCurrentModel()` loads `tree.json` from `0studio_{filename}/` folder
   - Creates a `treeLoadPromise` that resolves when loading is complete
   - If `tree.json` exists and has commits, parses and loads branches, commits, activeBranchId, currentCommitId
   - Validates all commit files exist, warns about missing files
   - Falls back to localStorage if `tree.json` doesn't exist (backwards compatibility)
2. **On Initial Commit Creation**:
   - `createInitialCommit()` awaits `treeLoadPromise` before proceeding (prevents race conditions)
   - Uses Promise-based state check to get real current commits count
   - If commits already exist (loaded from tree.json), skips creating duplicate initial commit
   - Only creates new initial commit if no commits exist
3. **On Commit/Branch Change**:
   - Auto-saves `tree.json` via `useEffect` hook whenever branches, commits, activeBranchId, or currentCommitId change
   - Skips saving while `isLoadingTree` is true (prevents overwriting during load)
   - Saves full commit metadata (id, message, timestamp, parentCommitId, branchId, starred)
   - Saves full branch metadata (id, name, headCommitId, color, isMain, parentBranchId, originCommitId)
4. **On Project Close**:
   - Saves `tree.json` one final time before clearing state
   - Resets `treeLoadPromise` and `isLoadingTree` state
   - Handles errors gracefully (logs warnings, doesn't throw)

**Benefits**:
- **Efficient**: JSON format, only stores metadata (not file data)
- **Readable**: Pretty-printed with 2-space indentation for debugging
- **Persistent**: Survives app restarts, stored in local file system
- **Race-Condition Safe**: Uses Promise-based coordination to prevent duplicate commits on reload
- **Validated**: Checks for missing commit files and warns in console
- **Backwards Compatible**: Falls back to localStorage if tree.json doesn't exist

### Cloud Storage Architecture (Supabase + S3) - PLANNED

**⚠️ Implementation Status**: The backend API for cloud storage exists and is functional, but the frontend integration in VersionControlContext is NOT yet implemented. Currently, all version control is handled locally via the `0studio_{filename}/` folder structure.

**Overview**: The planned system uses a hybrid approach combining Supabase (database) and AWS S3 (file storage with versioning).

**Planned Storage Structure**:
```
S3 Bucket:
└── org-{userId}/
    └── project-{projectId}/
         ├── models/
         │     └── model.3dm  (S3 Version IDs: v1, v2, v3...)
         └── textures/
               └── texture.png
```

**Database Schema** (Supabase - `subscriptions` table IS used):
- `projects`: One row per file location - ⚠️ Table exists but not used by frontend
- `commits`: One row per file version - ⚠️ Table exists but not used by frontend
- `branches`: Pointers to specific commits - ⚠️ Table exists but not used by frontend
- `subscriptions`: User payment plan subscriptions (ACTIVE - managed by Stripe webhooks)
  - `id` (uuid, primary key), `user_id` (uuid, references auth.users), `plan` (text: 'student' | 'enterprise')
  - `status` (text: 'active' | 'canceled' | 'past_due'), `stripe_customer_id` (text), `stripe_subscription_id` (text)
  - `created_at` (timestamptz), `updated_at` (timestamptz)
  - Managed automatically by Stripe webhook handlers in backend

**Backend API Status**:
- ✅ AWS S3 presigned upload/download URLs - Implemented
- ✅ Stripe payment integration - Implemented
- ✅ Payment status API - Implemented
- ⚠️ Frontend cloud sync integration - NOT implemented

---

## API Contracts & Interfaces

### Electron IPC Channels

**Main → Renderer (Events)**:
- `project-opened`: `{ filePath, fileName }`
- `project-closed`: `{}`
- `file-changed`: `{ eventType, filename, filePath }`
- `git-operation-complete`: `{ operation }`

**Renderer → Main (Invokes)**:

*Project & File Management (Implemented):*
- `open-project-dialog`: `() => Promise<string | null>`
- `get-current-project`: `() => Promise<ProjectInfo | null>`
- `close-project`: `() => Promise<void>`
- `start-file-watching`: `() => Promise<void>`
- `stop-file-watching`: `() => Promise<void>`
- `set-current-file`: `(filePath: string) => Promise<void>`
- `read-file-buffer`: `(filePath: string) => Promise<ArrayBuffer>`
- `write-file-buffer`: `(filePath: string, buffer: ArrayBuffer) => Promise<void>`

*0studio Commit Storage (Implemented):*
- `save-commit-file`: `(filePath: string, commitId: string, buffer: ArrayBuffer) => Promise<void>`
- `read-commit-file`: `(filePath: string, commitId: string) => Promise<ArrayBuffer | null>`
- `list-commit-files`: `(filePath: string) => Promise<string[]>`
- `commit-file-exists`: `(filePath: string, commitId: string) => Promise<boolean>`
- `save-tree-file`: `(filePath: string, treeData: object) => Promise<void>`
- `load-tree-file`: `(filePath: string) => Promise<object | null>`
- `validate-commit-files`: `(filePath: string, commitIds: string[]) => Promise<string[]>`

*Git Operations (Exposed in preload but NOT implemented in main.ts):*
- `git-init`: `(projectPath: string) => Promise<void>` - ⚠️ Handler not implemented
- `git-status`: `() => Promise<GitStatus>` - ⚠️ Handler not implemented
- `git-commit`: `(message: string, files: string[]) => Promise<void>` - ⚠️ Handler not implemented
- `git-log`: `() => Promise<GitCommit[]>` - ⚠️ Handler not implemented
- `git-checkout`: `(commitHash: string) => Promise<void>` - ⚠️ Handler not implemented
- `git-push`: `() => Promise<void>` - ⚠️ Handler not implemented
- `git-pull`: `() => Promise<void>` - ⚠️ Handler not implemented

**Note**: Git IPC handlers are defined in `preload.ts` but the corresponding `ipcMain.handle()` calls are NOT implemented in `main.ts`. The `GitService` class exists but is not connected to IPC. Version control is handled locally via `tree.json` and commit files, not via Git.

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
  parentCommitId?: string | null; // Parent commit ID for branching (null for root)
  branchId: string; // Branch this commit belongs to
  starred?: boolean; // Whether this commit is starred/favorited
}
```

**Branch** (VersionControlContext):
```typescript
interface Branch {
  id: string;
  name: string;
  headCommitId: string; // Latest commit on this branch
  color: string; // Color for visualization (e.g., '#ef4444')
  parentBranchId?: string; // Parent branch for branch-off-branch scenarios
  originCommitId?: string; // Commit this branch was created from
  isMain: boolean; // Whether this is the main/master branch
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

### Local File Storage

- **Storage location**: `0studio_{filename}/` folder in same directory as .3dm file
- **Commit files**: Stored as `commit-{commitId}.3dm` in storage folder
- **Tree metadata**: Stored as `tree.json` in same folder as commit files
- **Persistence**: Auto-saves tree.json on any commit/branch change
- **Loading**: Loads tree.json on project open (primary source, falls back to localStorage)
- **Validation**: Checks for missing commit files and warns in console
- **File operations**: All via FileStorageService in Electron main process

### Git Operations (NOT IMPLEMENTED)

- **⚠️ Note**: Git IPC handlers are exposed in preload.ts but NOT implemented in main.ts
- **GitService Class**: Exists in `electron/services/git-service.ts` but not connected to IPC
- **Current Implementation**: Version control is handled via local `tree.json` and commit files, NOT Git
- **Future**: Git integration could be added by implementing IPC handlers in main.ts

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

### Cloud Storage (Supabase + AWS S3) - Backend Only

- **Database**: Supabase PostgreSQL (`subscriptions` table is active for payments; projects/commits/branches tables exist but unused)
- **File Storage**: AWS S3 with versioning enabled (backend API ready)
- **Backend API**: S3 operations implemented via Express server
- **Frontend Integration**: ⚠️ NOT yet implemented - all version control is local
- **Presigned URLs**: Used for secure upload/download without exposing AWS credentials
- **Access Control**: Payment status is fetched from backend, but cloud operations not yet available in UI

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
   - VersionControlContext loads `tree.json` from `0studio_{filename}/` folder:
     - If exists: Parses and loads branches and commits, validates commit files
     - If missing: Falls back to localStorage (backwards compatibility)
   - VersionControlContext.createInitialCommit() creates first commit (if no commits exist)
   - Tree.json is auto-saved after initial commit

### Committing Changes

**Regular Commit**:
1. User enters commit message
2. VersionControlContext.commitModelChanges()
3. Creates ModelCommit with current modelData and fileBuffer
4. Saves commit file to `0studio_{filename}/commit-{commitId}.3dm` via FileStorageService
5. If cloud enabled, uploads to S3 and creates Supabase commit
6. Adds to commits array
7. Sets as current commit
8. Clears unsaved changes flag
9. Auto-saves `tree.json` via useEffect hook (includes new commit and updated branch head)

### Restoring a Commit

1. User clicks "Restore" on commit in history
2. VersionControlContext.restoreToCommit(commitId)
3. Retrieves fileBuffer from `0studio_{filename}/commit-{commitId}.3dm` (primary source)
   - Falls back to in-memory fileBuffer if file doesn't exist
   - Falls back to IndexedDB if in-memory not available
   - Falls back to exporting from modelData if all else fails
4. Loads file via rhino3dm-service.load3dmFile()
5. Calls onModelRestore callback with modelData
6. ModelContext restores scene:
   - If modelData.objects: setLoadedModel()
   - If serialized objects: restoreScene()
7. Scene updates to show restored state
8. VersionControlContext updates currentCommitId

### Pulling from Commit (Updates File on Disk)

1. User clicks "Pull" button on commit
2. VersionControlContext.pullFromCommit(commitId)
3. Retrieves fileBuffer from `0studio_{filename}/commit-{commitId}.3dm` (primary source)
   - Falls back to in-memory fileBuffer if file doesn't exist
   - Falls back to IndexedDB if in-memory not available
   - Falls back to exporting from modelData if all else fails
4. Writes fileBuffer to disk via desktopAPI.writeFileBuffer()
5. File is updated on disk
6. Rhino detects change and auto-reloads
7. ModelContext reloads model from disk
8. Sets pulledCommitId for branch creation tracking

### Gallery Mode Workflow

1. User clicks "Gallery" button in VersionControl
2. VersionControlContext.toggleGalleryMode() sets isGalleryMode = true
3. User selects commits via checkboxes (max 4, disabled when limit reached)
4. ModelViewer detects selectedCommits and renders grid layout
5. Each selected commit renders in its own Canvas with modelData
6. User can interact with each viewport independently
7. User exits gallery mode → toggleGalleryMode() clears selections and resets state

### Branching Workflow

```
1. User has commits v1, v2, v3 on main branch
   ↓
2. User clicks Download (pull) on v2
   ↓
3. VersionControlContext.pullFromCommit(v2) called
   - Sets pulledCommitId = v2
   - v2 commit gets amber "working" highlight in UI
   - File is written to disk, Rhino reloads
   ↓
4. User makes changes in Rhino and saves
   ↓
5. hasUnsavedChanges = true, UI shows "Creating new branch from v2"
   ↓
6. User enters commit message and clicks "Create Branch & Save"
   ↓
7. commitModelChanges() detects pulledCommitId is not branch head
   - Creates new branch "v2a" with unique color
   - Creates commit on new branch with parentCommitId = v2
   - Clears pulledCommitId
   ↓
8. UI shows branching tree with main (red) and v2a (green) branches
   ↓
9. User can switch branches via dropdown
   ↓
10. User clicks "Keep" to set current branch as main
```

**Branching UI Components**:
- **BranchingTree**: SVG-based visual tree with colored branch lines
  - Dashed horizontal lines for branch points
  - Solid vertical lines for same-branch connections
  - Nodes colored by branch
- **Branch Selector**: Dropdown to switch between branches
- **Keep Button**: Sets current branch as the main branch
- **Version Labels**: Dynamic labels like v1, v2, v3a, v3b, v4a based on branch

**Version Naming Convention**:
- Main branch: v1, v2, v3, v4...
- First branch from v2: v3a (first commit), v4a (second commit)...
- Second branch from v2: v3b, v4b...
- Third branch from v2: v3c, v4c...

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

## Implementation Gaps & Known Issues

This section documents features that are partially implemented or have known gaps between the API surface and actual functionality.

### Git Integration (Not Connected)
- **Issue**: IPC handlers for Git operations are exposed in `preload.ts` but NOT implemented in `main.ts`
- **Impact**: Calling `desktopAPI.gitStatus()`, `gitCommit()`, etc. will fail silently or throw
- **Workaround**: Version control works via local `tree.json` and commit files
- **Fix Required**: Add `ipcMain.handle()` calls in main.ts that use GitService

### Cloud Sync (Backend Only)
- **Issue**: Backend API for AWS S3 and Supabase is implemented, but frontend integration is missing
- **Impact**: All version control is local only
- **Workaround**: N/A - local storage works fine
- **Fix Required**: Add cloud sync methods to VersionControlContext when cloud features are needed

### ProjectInfo Interface Inconsistency
- **Issue**: `getCurrentProject()` in main.ts returns `{filePath, fileName}` but desktop-api.ts expects `{filePath, projectDir, fileName}`
- **Impact**: `projectDir` will be undefined when accessed
- **Fix Required**: Either update main.ts to include projectDir or remove it from interface

---

## Recent Updates & Features

### Local File Storage & Tree Persistence (Latest)
- **Local Commit Storage**: Commits stored as `commit-{commitId}.3dm` files in `0studio_{filename}/` folder
- **Tree.json Persistence**: Branch and commit tree structure persisted to `tree.json` in same folder as commits
- **Dynamic File Paths**: File paths are not hardcoded - dynamically constructed from .3dm file path
- **Auto-Save**: Tree.json automatically saved on any commit/branch change (skips during loading)
- **Project Open**: Loads tree.json via `treeLoadPromise` (primary source, falls back to localStorage)
- **Race Condition Prevention**: `createInitialCommit()` awaits `treeLoadPromise` before checking for existing commits, preventing duplicate initial commits when reopening projects
- **Validation**: Validates commit files exist when loading tree.json, warns about missing files
- **Error Handling**: Graceful error handling during save/load, doesn't throw on project close

### Branching System
- **GitHub-like Branching**: Automatic branch creation when committing from a non-head commit
- **Visual Branch Tree**: SVG-based tree visualization with colored branch lines
- **Pulled Commit Highlighting**: Amber highlight and "working" badge for the active pulled commit
- **Branch Selector**: Dropdown to switch between branches when multiple exist
- **Keep Branch**: Button to mark any branch as the main/master branch
- **Dynamic Version Labels**: Automatic labeling (v1, v2, v3a, v3b, v4c, etc.)
- **Branch Colors**: Each branch gets a unique color from a predefined palette

### Gallery Mode
- **Selection Limit**: Maximum 4 commits can be selected for comparison
- **Adaptive Layouts**: 
  - 2 models: Side by side
  - 3 models: 2 on top, 1 full-width on bottom
  - 4 models: 2x2 grid
- **State Management**: Proper reset when project is closed
- **UI**: Checkboxes with disabled state when limit reached

### Cloud Storage Integration (Backend Ready, Frontend Pending)
- **Supabase**: Database tables exist for projects and commits, but NOT integrated with frontend
- **AWS S3**: Backend API for file storage with versioning is implemented
- **Payment Gating**: Payment status is checked via backend API, but cloud pull/push not yet implemented in frontend
- **Current Status**: All version control is local via `0studio_{filename}/` folder. Cloud sync is planned for future release.

### Payment System
- **Stripe Integration**: Full subscription management
- **Webhook Handling**: Automatic subscription status updates
- **Dashboard**: User-friendly plan selection interface

### Bug Fixes
- **Tree.json Persistence**: Fixed race condition where `createInitialCommit` could run before tree.json finished loading, causing duplicate commits when reopening projects
- **Gallery Mode Reset**: Fixed bug where gallery mode background persisted after closing project
- **Grid Layout**: Fixed 3 and 4 model layouts to display correctly
- **Selection Limit**: Proper enforcement of 4-commit maximum

---

## Environment Variables

### Frontend
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
3. **Scene manipulation**: Use ModelContext methods (addPrimitive, transformObject, etc.)
5. **Cloud operations**: Backend API ready (supabase-api.ts, aws-api.ts exist) but frontend integration NOT implemented
6. **Authentication**: Use AuthContext and check user state - works for payment plans
7. **Payment plans**: 
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
14. **Branching**:
    - Branches are created automatically when committing from a non-head commit (pulledCommitId set)
    - Use `getCommitVersionLabel()` to get proper version labels (v1, v2, v3a, v3b)
    - Check `pulledCommitId` to determine if user is about to create a new branch
    - `switchBranch()` changes active branch, `keepBranch()` marks a branch as main
    - Branch colors are assigned from `BRANCH_COLORS` array in order of creation
    - Reset branches when closing project via `clearCurrentModel()`
15. **Local File Storage**:
    - Commit files stored in `0studio_{filename}/` folder as `commit-{commitId}.3dm`
    - Tree.json stored in same folder, contains full branch and commit metadata
    - File paths are NOT hardcoded - dynamically constructed from .3dm file path using `dirname()` and `basename()`
    - Use `desktopAPI.saveCommitFile()`, `readCommitFile()`, `saveTreeFile()`, `loadTreeFile()`
    - Tree.json auto-saves via useEffect when branches/commits change (skips during `isLoadingTree`)
    - Load tree.json on project open via `treeLoadPromise`, validate commit files exist
    - `createInitialCommit()` awaits `treeLoadPromise` to prevent race conditions and duplicate commits
    - Save tree.json before project close to ensure persistence
    - Handle errors gracefully (log warnings, don't throw)

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

---

**End of PRD Context Document**
