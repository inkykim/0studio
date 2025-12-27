# 0studio - Desktop 3D Model Version Control

0studio is a macOS desktop application that transforms how you manage versions of your 3D models. Just like VSCode opens a folder as a "project", 0studio opens a .3dm file as a project and provides Git-based version control for your Rhino 3D models.

## 🎯 Key Features

- **File-Based Projects**: Open any .3dm file as a project
- **Auto-Detection**: Detects when your .3dm file is saved in Rhino
- **Git Integration**: Full version control with commit, push, pull operations
- **Visual Timeline**: Browse through your model's history
- **One File Workflow**: No need to save multiple versions manually
- **macOS Native**: Built specifically for macOS with proper file associations

## 🚀 Getting Started

### Prerequisites

- macOS 10.14 or later
- Rhino 3D (for creating/editing .3dm files)
- Git (for version control)

### Development Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd rhino-studio
```

2. Install dependencies:
```bash
npm install
```

3. Build the Electron components:
```bash
npm run build:electron
```

4. Run in development mode:
```bash
npm run electron:dev
```

### Building for Distribution

1. Build the React app:
```bash
npm run build
```

2. Build the Electron app:
```bash
npm run build:electron
```

3. Package for macOS:
```bash
npm run electron:dist
```

This creates a `.dmg` installer in the `dist-electron` folder.

## 📖 How to Use

### Opening a Project

1. **Launch 0studio**
2. **Click "Open .3dm Project"** or use `Cmd+O`
3. **Select your .3dm file** - this becomes your project

### Version Control Workflow

1. **Initialize Git Repository** (first time only):
   - Click "Initialize Git Repository" when prompted
   - This creates a Git repo in the same folder as your .3dm file

2. **Work on Your Model**:
   - Open your .3dm file in Rhino
   - Make changes to your model
   - Save in Rhino (0studio will detect the changes)

3. **Commit Changes**:
   - Return to 0studio
   - You'll see your changes in the "Changes" section
   - Enter a commit message
   - Click "Commit Changes"

4. **Browse History**:
   - View all commits in the "Commit History" section
   - Click any commit to restore that version
   - Use push/pull buttons to sync with remote repositories

### File Watching

0studio automatically watches your .3dm file for changes:
- When you save in Rhino, changes appear immediately in 0studio
- No need to manually refresh or reload
- Supports background file monitoring

### Remote Repositories

To sync your model versions across devices:

1. **Create a remote repository** (GitHub, GitLab, etc.)
2. **Add the remote** using Git commands in terminal:
```bash
cd /path/to/your/project
git remote add origin <your-repo-url>
```
3. **Push/Pull** using the buttons in 0studio
