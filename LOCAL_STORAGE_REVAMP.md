# Local Storage System Revamp - Documentation

## Overview

This document describes the complete revamp of the file storage system in 0studio, moving from a cloud-based (IndexedDB/AWS S3/Supabase) architecture to a simple, local file system-based approach. This change simplifies the codebase, improves reliability, and provides a more intuitive workflow for users.

## Table of Contents

1. [Architecture Changes](#architecture-changes)
2. [Technical Implementation](#technical-implementation)
3. [User Guide](#user-guide)
4. [Migration Notes](#migration-notes)
5. [Developer Notes](#developer-notes)

---

## Architecture Changes

### Previous System (Removed)

- **Storage**: IndexedDB for file buffers, localStorage for metadata, AWS S3 for cloud sync
- **Complexity**: Multiple storage layers, cloud sync logic, authentication dependencies
- **Issues**: CORS errors, complex state management, dependency on external services

### New System (Current)

- **Storage**: Local file system only - commits stored as files in `0studio_<filename>` folders
- **Simplicity**: Single storage mechanism, no external dependencies
- **Benefits**: Faster, more reliable, easier to debug, works offline

### Key Principle

When a user opens a `.3dm` file, 0studio creates a folder named `0studio_<filename>` in the same directory as the file. Every commit saves a duplicate copy of the file in this folder, named using the commit ID (e.g., `commit-1234567890-abc123.3dm`). This allows users to iterate through versions just like having multiple files, but managed through the UI.

---

## Technical Implementation

### File Structure

```
/path/to/
  ├── model.3dm                    # Working file (user's current file)
  └── 0studio_model/                # Commit storage folder
      ├── commit-1234567890-abc.3dm # Commit 1
      ├── commit-1234567891-def.3dm # Commit 2
      └── commit-1234567892-ghi.3dm # Commit 3
```

### Core Components

#### 1. File Storage Service (`electron/services/file-storage-service.ts`)

New service that manages the 0studio commit folders:

- `getStorageFolderPath(filePath)`: Returns path to `0studio_<filename>` folder
- `ensureStorageFolder(filePath)`: Creates folder if it doesn't exist
- `getCommitFilePath(filePath, commitId)`: Returns path to specific commit file
- `saveCommitFile(filePath, commitId, buffer)`: Saves commit file to folder
- `readCommitFile(filePath, commitId)`: Reads commit file from folder
- `listCommitFiles(filePath)`: Lists all commit IDs in folder
- `commitFileExists(filePath, commitId)`: Checks if commit file exists

#### 2. Electron IPC Handlers (`electron/main.ts`)

New IPC handlers for file storage operations:

- `save-commit-file`: Save a commit file to the 0studio folder
- `read-commit-file`: Read a commit file from the 0studio folder
- `list-commit-files`: List all commit files for a project
- `commit-file-exists`: Check if a commit file exists

#### 3. Desktop API (`src/lib/desktop-api.ts`)

Wrapper methods for React components:

- `saveCommitFile(filePath, commitId, buffer)`
- `readCommitFile(filePath, commitId)`
- `listCommitFiles(filePath)`
- `commitFileExists(filePath, commitId)`

#### 4. Version Control Context (`src/contexts/VersionControlContext.tsx`)

**Removed:**
- All AWS S3 integration code
- All Supabase integration code
- Cloud-related state (`currentProjectId`, `isCloudEnabled`)
- `pullFromCloud()` method
- `initializeProject()` method

**Updated:**
- `createInitialCommit()`: Now accepts `filePath` parameter, saves to 0studio folder
- `commitModelChanges()`: Saves commits to 0studio folder instead of IndexedDB/cloud
- `pullFromCommit()`: Reads from 0studio folder first (primary method)
- `restoreToCommit()`: Reads from 0studio folder first (primary method)

**Commit ID Format:**
- Changed from `Date.now().toString()` to `${Date.now()}-${random}`
- Ensures uniqueness and prevents collisions
- Format: `1234567890-abc123def`

#### 5. Model Context (`src/contexts/ModelContext.tsx`)

**Updated:**
- `importFile()`: Now passes `filePath` to `createInitialCommit()`
- Removed stats handling from restore callback (stats calculated separately)

#### 6. Model Viewer (`src/components/ModelViewer.tsx`)

**Updated:**
- Added Canvas key using `currentCommitId` to force re-render on commit changes
- Properly displays committed files when restored/pulled

### Storage Priority (Fallback Chain)

When reading a commit file, the system tries in this order:

1. **0studio folder** (file system) - PRIMARY METHOD
2. In-memory `fileBuffer` (for backwards compatibility)
3. IndexedDB (for backwards compatibility)
4. Export from `modelData` (last resort, may lose data)

This ensures backwards compatibility with old commits while prioritizing the new file system storage.

---

## User Guide

### Getting Started

1. **Open a File**: Drag & drop a `.3dm` file onto the viewport, or use the file picker
2. **Automatic Initial Commit**: When you open a file, 0studio automatically creates an initial commit and saves it to the `0studio_<filename>` folder
3. **Start Working**: Make changes to your model in Rhino or through the app

### Version Control Features

#### Creating Commits

1. **Manual Commit**:
   - Make changes to your model
   - Enter a commit message in the version control panel
   - Click "Save Version" or press `Cmd/Ctrl + Shift + S`
   - The current file is saved to the `0studio_<filename>` folder with a unique commit ID

2. **AI Commit**:
   - Enter a natural language description of changes you want
   - Click "Commit with AI"
   - The AI interprets your message and makes the changes
   - A commit is automatically created

#### Viewing Commits

- **Commit List**: All commits appear in the version control panel, sorted by most recent first
- **Commit Info**: Each commit shows:
  - Commit message
  - Timestamp (relative time like "2h ago")
  - Version number (v1, v2, v3, etc.)
  - Star status (if starred)
  - Current commit indicator

#### Restoring Commits

- **Restore (In-Memory)**: Click on any commit to restore it in the viewer (doesn't modify the file on disk)
- **Pull (To Disk)**: Hover over a commit and click the download icon to pull it to your working file (updates the actual `.3dm` file on disk)

#### Starring Commits

- **Star a Commit**: Click the star icon next to any commit to mark it as important
- **Filter Starred**: Click the "Starred" button to show only starred commits
- **Visual Indicator**: Starred commits show a filled star icon (black/white theme)

#### Gallery Mode

- **Enable Gallery**: Click the grid icon to enter gallery mode
- **Select Commits**: Check up to 4 commits to view side-by-side
- **Compare Versions**: See multiple versions of your model simultaneously
- **Exit Gallery**: Click the grid icon again to return to single view

#### Search

- **Search Commits**: Use the search box to filter commits by message
- **Combine Filters**: Search works with the starred filter

### File Management

#### Where Files Are Stored

- **Working File**: Your original `.3dm` file stays in its original location
- **Commit Files**: All commit versions are stored in `0studio_<filename>` folder next to your file
- **No Cloud**: Everything is stored locally on your computer

#### File Naming

- Commit files are named: `commit-{commitId}.3dm`
- Example: `commit-1234567890-abc123def.3dm`
- The commit ID is unique and includes timestamp + random component

#### Managing Storage

- **Automatic**: 0studio automatically manages the commit folder
- **Manual Access**: You can browse the `0studio_<filename>` folder in Finder/Explorer
- **Backup**: Simply copy the entire folder to backup all versions

### Keyboard Shortcuts

- `Cmd/Ctrl + O`: Open file dialog
- `Cmd/Ctrl + Shift + S`: Save version (commit)
- `Cmd/Ctrl + Shift + H`: Show version history

### Tips & Best Practices

1. **Meaningful Messages**: Write clear commit messages to easily find versions later
2. **Star Important Versions**: Use stars to mark milestones or important iterations
3. **Regular Commits**: Commit frequently to have more restore points
4. **Pull vs Restore**: 
   - Use **Restore** to preview a version in the viewer
   - Use **Pull** when you want to actually work with that version in Rhino
5. **Gallery Mode**: Great for comparing design iterations side-by-side

---

## Migration Notes

### For Existing Users

If you have existing commits stored in IndexedDB:

- **Old Commits**: Will still work via fallback chain (IndexedDB → modelData export)
- **New Commits**: Will be stored in the new file system
- **No Data Loss**: All existing commits remain accessible
- **Gradual Migration**: As you create new commits, they'll use the new system

### For Developers

**Breaking Changes:**
- Removed all cloud-related code (AWS S3, Supabase)
- Removed `pullFromCloud()` method
- Removed cloud-related state variables
- `createInitialCommit()` now requires `filePath` parameter

**New Dependencies:**
- None! The new system uses only Node.js `fs` module (already available in Electron)

**Testing:**
- Test file operations in Electron environment (not browser)
- Verify commit files are created in correct location
- Test pull/restore operations
- Verify backwards compatibility with old commits

---

## Developer Notes

### Key Files Modified

1. **New Files:**
   - `electron/services/file-storage-service.ts` - Core file storage logic

2. **Modified Files:**
   - `electron/main.ts` - Added IPC handlers
   - `electron/preload.ts` - Exposed new methods
   - `src/lib/desktop-api.ts` - Added wrapper methods
   - `src/contexts/VersionControlContext.tsx` - Removed cloud, added file storage
   - `src/contexts/ModelContext.tsx` - Updated to pass filePath
   - `src/components/ModelViewer.tsx` - Added key for re-rendering
   - `src/components/VersionControl.tsx` - UI improvements (stars, buttons)

3. **Removed Code:**
   - All AWS S3 API calls
   - All Supabase API calls
   - Cloud initialization logic
   - Cloud sync logic

### Commit ID Generation

```typescript
const commitId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

This ensures:
- Uniqueness (timestamp + random)
- Sortability (timestamp first)
- Readability (alphanumeric)

### Error Handling

The system gracefully handles:
- Missing commit files (falls back to IndexedDB/modelData)
- File system errors (logs errors, continues operation)
- Missing folders (creates automatically)

### Performance Considerations

- **File I/O**: All file operations are async
- **Caching**: In-memory fileBuffer used when available
- **Storage**: Each commit is a full file copy (simple but uses disk space)

### Future Improvements

Potential enhancements:
- Compression for commit files
- Deduplication (store only diffs)
- Automatic cleanup of old commits
- Export/import commit folders
- Merge functionality

---

## Troubleshooting

### Commit Files Not Appearing

1. Check that you're in Electron mode (not browser)
2. Verify the `0studio_<filename>` folder exists next to your file
3. Check console for error messages
4. Verify file permissions

### Can't Pull Commit

1. Ensure the commit file exists in the 0studio folder
2. Check that the working file path is correct
3. Verify Electron has file system access
4. Check console for specific error messages

### Old Commits Not Showing

1. Old commits may be in IndexedDB (check browser DevTools)
2. They should still be accessible via fallback chain
3. Create new commits to use the new system

---

## Summary

The local storage revamp simplifies 0studio's architecture while providing a more intuitive workflow. Users can now manage versions like multiple files, but through a clean UI. The system is more reliable, faster, and works completely offline. All changes are backwards compatible, ensuring existing users can continue working without issues.
