import { Action, ActionPanel, Form, Icon, List, showToast, Toast, useNavigation, Color, getPreferenceValues, openExtensionPreferences } from "@raycast/api";
import { useEffect, useState } from "react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type Preferences = {
  todoFilePath: string;
};

const NOTE_INDENT = "    "; // 4 spaces

// Expand a user-entered path: handle ~, relative paths.
function resolveTodoPath(raw: string): string {
  let p = (raw || "").trim();
  if (p.startsWith("~")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  if (!path.isAbsolute(p)) {
    p = path.resolve(os.homedir(), p);
  }
  return p;
}

function getTodoFile(): string {
  const prefs = getPreferenceValues<Preferences>();
  return resolveTodoPath(prefs.todoFilePath);
}

function ensureFileExists(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "");
  }
}

type Task = {
  lineIndex: number;       // position of the task's main line in the file
  endLineIndex: number;    // position of the last notes line (inclusive). Equals lineIndex if no notes.
  text: string;
  notes: string[];         // array of note strings (without the "- " or indent)
  done: boolean;
};

function readFile(): string[] {
  const TODO_FILE = getTodoFile();
  ensureFileExists(TODO_FILE);
  return fs.readFileSync(TODO_FILE, "utf-8").split("\n");
}

function writeFile(lines: string[]): void {
  const TODO_FILE = getTodoFile();
  ensureFileExists(TODO_FILE);
  fs.writeFileSync(TODO_FILE, lines.join("\n"));
}

// Parse the file into tasks. Notes are any lines starting with whitespace + "- " that
// follow a task, until we hit a non-indented line.
function parseTasks(): Task[] {
  const lines = readFile();
  const tasks: Task[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openMatch = line.match(/^- \[ \] (.*)$/);
    const doneMatch = line.match(/^- \[x\] (.*)$/i);

    if (!openMatch && !doneMatch) continue;

    const text = (openMatch ?? doneMatch)![1];
    const done = !!doneMatch;

    // Look ahead for indented note lines
    const notes: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const noteMatch = lines[j].match(/^\s+- (.+)$/);
      if (noteMatch) {
        notes.push(noteMatch[1]);
        j++;
      } else if (lines[j].trim() === "") {
        // blank line ends the notes block (conservative)
        break;
      } else {
        break;
      }
    }

    tasks.push({
      lineIndex: i,
      endLineIndex: j - 1,
      text,
      notes,
      done,
    });

    i = j - 1; // skip past notes we consumed
  }

  return tasks;
}

function renderTaskBlock(text: string, notes: string[], done: boolean): string[] {
  const marker = done ? "[x]" : "[ ]";
  const out = [`- ${marker} ${text}`];
  for (const note of notes) {
    if (note.trim()) out.push(`${NOTE_INDENT}- ${note.trim()}`);
  }
  return out;
}

function prependTask(text: string, notes: string[]): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const block = renderTaskBlock(trimmed, notes, false);
  const existing = readFile();
  writeFile([...block, ...existing]);
}

function updateTask(task: Task, newText: string, newNotes: string[]): void {
  const lines = readFile();
  const block = renderTaskBlock(newText.trim() || task.text, newNotes, task.done);
  const before = lines.slice(0, task.lineIndex);
  const after = lines.slice(task.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

function toggleTask(task: Task): void {
  const lines = readFile();
  const main = lines[task.lineIndex];
  if (/^- \[ \]/.test(main)) {
    lines[task.lineIndex] = main.replace(/^- \[ \]/, "- [x]");
  } else if (/^- \[x\]/i.test(main)) {
    lines[task.lineIndex] = main.replace(/^- \[x\]/i, "- [ ]");
  }
  writeFile(lines);
}

function deleteTask(task: Task): void {
  const lines = readFile();
  const before = lines.slice(0, task.lineIndex);
  const after = lines.slice(task.endLineIndex + 1);
  writeFile([...before, ...after]);
}

function notesToText(notes: string[]): string {
  return notes.join("\n");
}

function textToNotes(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

type FormValues = { text: string; notes: string };

// Wrapper forms that actually perform the write. AddTaskForm creates a new task,
function AddTaskForm({ onAdded }: { onAdded: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Add Task"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Task"
            onSubmit={async (values: FormValues) => {
              const text = values.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
                return;
              }
              prependTask(text, textToNotes(values.notes ?? ""));
              await showToast({ style: Toast.Style.Success, title: "Added", message: text });
              onAdded();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="text" title="Task" placeholder="What needs doing?" autoFocus />
      <Form.TextArea id="notes" title="Notes" placeholder="Optional. Each line becomes a sub-bullet." />
    </Form>
  );
}

function EditTaskForm({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Edit Task"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            onSubmit={async (values: FormValues) => {
              const text = values.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
                return;
              }
              // Re-read current task by index before writing in case file changed
              const current = parseTasks().find(
                (t) => t.lineIndex === task.lineIndex && t.text === task.text
              );
              const target = current ?? task;
              updateTask(target, text, textToNotes(values.notes ?? ""));
              await showToast({ style: Toast.Style.Success, title: "Saved", message: text });
              onSaved();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="text"
        title="Task"
        defaultValue={task.text}
        placeholder="What needs doing?"
        autoFocus
      />
      <Form.TextArea
        id="notes"
        title="Notes"
        defaultValue={notesToText(task.notes)}
        placeholder="Optional. Each line becomes a sub-bullet."
      />
    </Form>
  );
}

export default function Command() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setTasks(parseTasks());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const openTasks = tasks.filter((t: Task) => !t.done);
  const doneTasks = tasks.filter((t: Task) => t.done);

  const renderItem = (task: Task) => {
    const subtitle = task.notes.length > 0 ? task.notes.join(" • ") : "";
    const accessories =
      task.notes.length > 1 ? [{ text: `${task.notes.length} notes`, icon: Icon.Document }] : [];

    return (
      <List.Item
        key={`${task.done ? "done" : "open"}-${task.lineIndex}`}
        title={task.text}
        subtitle={subtitle}
        accessories={accessories}
        icon={
          task.done
            ? { source: Icon.CheckCircle, tintColor: Color.Green }
            : { source: Icon.Circle, tintColor: Color.Blue }
        }
        actions={
          <ActionPanel>
            <Action
              title={task.done ? "Reopen" : "Mark Done"}
              icon={task.done ? Icon.Circle : Icon.CheckCircle}
              onAction={async () => {
                toggleTask(task);
                await showToast({
                  style: Toast.Style.Success,
                  title: task.done ? "Reopened" : "Done",
                  message: task.text,
                });
                refresh();
              }}
            />
            <Action.Push
              title="Edit Task"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              target={<EditTaskForm task={task} onSaved={refresh} />}
            />
            <Action.Push
              title="Add New Task"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              target={<AddTaskForm onAdded={refresh} />}
            />
            <Action
              title="Delete Task"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={async () => {
                deleteTask(task);
                await showToast({ style: Toast.Style.Success, title: "Deleted", message: task.text });
                refresh();
              }}
            />
            <Action.CopyToClipboard
              title="Copy Task"
              content={task.text}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder={`Search ${tasks.length} tasks…`}
      actions={
        <ActionPanel>
          <Action.Push
            title="Add New Task"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={<AddTaskForm onAdded={refresh} />}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            shortcut={{ modifiers: ["cmd"], key: "," }}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <List.Section title="Open" subtitle={`${openTasks.length}`}>
        {openTasks.map(renderItem)}
      </List.Section>

      <List.Section title="Done" subtitle={`${doneTasks.length}`}>
        {doneTasks.map(renderItem)}
      </List.Section>

      <List.EmptyView
        title="No todos yet"
        description="Press ⌘N to add your first task"
        icon={Icon.BulletPoints}
      />
    </List>
  );
}
