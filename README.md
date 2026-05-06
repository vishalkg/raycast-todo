# Todo — a Raycast extension

A local, markdown-backed todo list for [Raycast](https://raycast.com). Add, toggle, edit, and annotate tasks — all stored in a single configurable markdown file you own.

No cloud. No account. No lock-in. Your todos are plain text on disk.

## Features

- 📝 **Single markdown file** — your todos live in one `.md` file. Open it in any editor, any time.
- ⚡ **Fast capture** — `⌘N` to add a task with optional multi-line notes.
- ✅ **Keyboard-first list** — arrow-navigate, `Enter` to toggle done, `⌘E` to edit.
- 🗒 **Notes per task** — each task can carry arbitrary multi-line context, rendered as sub-bullets.
- 🔍 **Live filter** — type in the Raycast search bar to filter across all tasks and notes.
- 🔧 **Configurable file path** — point it at any location you want (Documents, iCloud, Obsidian vault, Dropbox, etc.).
- 🖥 **Works on macOS and Windows** — anywhere Raycast runs.

## File format

Tasks are plain [GitHub-flavored markdown](https://github.github.com/gfm/#task-list-items-extension-) checklist items. Notes are indented sub-bullets under a task.

```markdown
- [ ] Review PR
    - focus on the auth changes
    - check error handling path
- [x] Buy groceries
- [ ] Plain task without notes
```

Anything the extension produces is valid markdown, so the file renders correctly in Obsidian, GitHub, Typora, VS Code preview, or any other viewer.

## Configuration

On first launch, Raycast will prompt you to set **Todo File Path** — the absolute path to the markdown file where your todos will be stored.

- Supports `~` for home directory (e.g. `~/Documents/todo.md`)
- If the file doesn't exist, it will be created (along with any missing parent directories).
- Change it any time via Raycast → Preferences → Extensions → Todo. No data migration needed — just move the file.

Common choices:
- `~/Documents/todo.md`
- `~/Dropbox/todo.md` (if you want cross-Mac sync via Dropbox)
- `~/vault/todo.md` (inside an Obsidian vault — todos render as native checklist items)

## Keyboard shortcuts

Inside the **Todo** command:

| Shortcut | Action |
|----------|--------|
| `Enter` | Toggle task (done ↔ open) |
| `⌘N` | Add new task |
| `⌘E` | Edit task text and notes |
| `⌃X` | Delete task |
| `⌘C` | Copy task text |
| `⌘,` | Open extension preferences |

Inside the add/edit form:

| Shortcut | Action |
|----------|--------|
| `⌘↵` | Submit |
| `Esc` | Cancel |

## Install (development)

Until this is published to the Raycast Store, install locally:

```bash
git clone https://github.com/vishalkg/raycast-todo.git
cd raycast-todo
npm install
npm run dev
```

`npm run dev` starts Raycast's development mode and registers the extension. Once you see "built extension successfully," open Raycast and search for **Todo**.

To build a permanent version (so it survives reboots without dev mode running):

```bash
npm run build
```

## Why this instead of Todoist / Apple Reminders / Raycast built-in?

- **You want a plain markdown file** you can read, edit, grep, version-control, and back up however you like.
- **You don't want another account / cloud service** for a local todo list.
- **You want multi-line notes per task** (which Raycast's built-in Todo List doesn't offer).

If those don't describe you, Raycast's built-in Todo List or Todoist are probably better fits.

## License

MIT — see [LICENSE](./LICENSE).
