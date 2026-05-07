import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type Preferences = { todoFilePath: string };

const INDENT = "    "; // 4 spaces

function resolveTodoPath(raw: string): string {
  let p = (raw || "").trim();
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  if (!path.isAbsolute(p)) p = path.resolve(os.homedir(), p);
  return p;
}

function getTodoFile(): string {
  return resolveTodoPath(getPreferenceValues<Preferences>().todoFilePath);
}

function ensureFileExists(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "");
}

function readFile(): string[] {
  const f = getTodoFile();
  ensureFileExists(f);
  return fs.readFileSync(f, "utf-8").split("\n");
}

function writeFile(lines: string[]): void {
  const f = getTodoFile();
  ensureFileExists(f);
  fs.writeFileSync(f, lines.join("\n"));
}

// --- Data model ---

type SubTask = {
  lineIndex: number; // line in file
  text: string;
  done: boolean;
};

type Task = {
  lineIndex: number;     // main line (the "- [ ] ..." line)
  endLineIndex: number;  // last line that belongs to this task (incl. notes + subtasks)
  text: string;
  notes: string[];       // indented plain "- note" lines (no checkbox)
  subtasks: SubTask[];   // indented "- [ ] ..." or "- [x] ..." lines
  done: boolean;
};

// --- Parsing ---

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

    const notes: string[] = [];
    const subtasks: SubTask[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      // indented sub-task? (checked or unchecked)
      const subOpen = l.match(/^\s+- \[ \] (.+)$/);
      const subDone = l.match(/^\s+- \[x\] (.+)$/i);
      if (subOpen) {
        subtasks.push({ lineIndex: j, text: subOpen[1], done: false });
        j++;
        continue;
      }
      if (subDone) {
        subtasks.push({ lineIndex: j, text: subDone[1], done: true });
        j++;
        continue;
      }
      // indented plain note?
      const noteMatch = l.match(/^\s+- (.+)$/);
      if (noteMatch) {
        notes.push(noteMatch[1]);
        j++;
        continue;
      }
      // blank line or non-indented line ends this task's block
      break;
    }

    tasks.push({
      lineIndex: i,
      endLineIndex: j - 1,
      text,
      notes,
      subtasks,
      done,
    });
    i = j - 1;
  }

  return tasks;
}

// --- Rendering ---

function renderTaskBlock(
  text: string,
  notes: string[],
  subtasks: SubTask[],
  done: boolean
): string[] {
  const marker = done ? "[x]" : "[ ]";
  const out = [`- ${marker} ${text}`];
  for (const n of notes) if (n.trim()) out.push(`${INDENT}- ${n.trim()}`);
  for (const s of subtasks) {
    const m = s.done ? "[x]" : "[ ]";
    if (s.text.trim()) out.push(`${INDENT}- ${m} ${s.text.trim()}`);
  }
  return out;
}

// --- Mutations (each re-reads file, applies, writes) ---

function prependTask(text: string, notes: string[]): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const block = renderTaskBlock(trimmed, notes, [], false);
  const existing = readFile();
  writeFile([...block, ...existing]);
}

function updateTask(
  task: Task,
  newText: string,
  newNotes: string[],
  newSubtasks?: SubTask[]
): void {
  const lines = readFile();
  // If sub-tasks weren't passed, preserve existing ones from fresh parse.
  const current = parseTasks().find((t) => t.lineIndex === task.lineIndex);
  const subtasks = newSubtasks ?? current?.subtasks ?? task.subtasks;
  const block = renderTaskBlock(newText.trim() || task.text, newNotes, subtasks, task.done);
  const before = lines.slice(0, task.lineIndex);
  const after = lines.slice(task.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

function toggleTask(task: Task): void {
  const lines = readFile();
  const main = lines[task.lineIndex];
  if (/^- \[ \]/.test(main)) lines[task.lineIndex] = main.replace(/^- \[ \]/, "- [x]");
  else if (/^- \[x\]/i.test(main)) lines[task.lineIndex] = main.replace(/^- \[x\]/i, "- [ ]");
  writeFile(lines);
}

function deleteTask(task: Task): void {
  const lines = readFile();
  const before = lines.slice(0, task.lineIndex);
  const after = lines.slice(task.endLineIndex + 1);
  writeFile([...before, ...after]);
}

function addSubtask(parent: Task, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const fresh = parseTasks().find((t) => t.lineIndex === parent.lineIndex);
  if (!fresh) return;
  const newSubtasks: SubTask[] = [
    ...fresh.subtasks,
    { lineIndex: -1, text: trimmed, done: false }, // lineIndex will be reassigned on next parse
  ];
  const lines = readFile();
  const block = renderTaskBlock(fresh.text, fresh.notes, newSubtasks, fresh.done);
  const before = lines.slice(0, fresh.lineIndex);
  const after = lines.slice(fresh.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

function toggleSubtask(parent: Task, subtaskIndex: number): void {
  const fresh = parseTasks().find((t) => t.lineIndex === parent.lineIndex);
  if (!fresh || !fresh.subtasks[subtaskIndex]) return;
  const updated = fresh.subtasks.map((s, i) =>
    i === subtaskIndex ? { ...s, done: !s.done } : s
  );
  const lines = readFile();
  const block = renderTaskBlock(fresh.text, fresh.notes, updated, fresh.done);
  const before = lines.slice(0, fresh.lineIndex);
  const after = lines.slice(fresh.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

function updateSubtaskText(parent: Task, subtaskIndex: number, newText: string): void {
  const fresh = parseTasks().find((t) => t.lineIndex === parent.lineIndex);
  if (!fresh || !fresh.subtasks[subtaskIndex]) return;
  const trimmed = newText.trim();
  if (!trimmed) return;
  const updated = fresh.subtasks.map((s, i) =>
    i === subtaskIndex ? { ...s, text: trimmed } : s
  );
  const lines = readFile();
  const block = renderTaskBlock(fresh.text, fresh.notes, updated, fresh.done);
  const before = lines.slice(0, fresh.lineIndex);
  const after = lines.slice(fresh.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

function deleteSubtask(parent: Task, subtaskIndex: number): void {
  const fresh = parseTasks().find((t) => t.lineIndex === parent.lineIndex);
  if (!fresh) return;
  const updated = fresh.subtasks.filter((_, i) => i !== subtaskIndex);
  const lines = readFile();
  const block = renderTaskBlock(fresh.text, fresh.notes, updated, fresh.done);
  const before = lines.slice(0, fresh.lineIndex);
  const after = lines.slice(fresh.endLineIndex + 1);
  writeFile([...before, ...block, ...after]);
}

// --- Helpers ---

const notesToText = (n: string[]) => n.join("\n");
const textToNotes = (t: string) =>
  t.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

// Render sub-tasks as editable text (one per line, "[checkbox] text" format)
const subtasksToText = (subs: SubTask[]) =>
  subs.map((s) => `${s.done ? "[x]" : "[ ]"} ${s.text}`).join("\n");

// Parse sub-tasks from edit-form textarea. Accepts:
//   "[ ] text"       → open
//   "[x] text"       → done (case-insensitive)
//   "text"           → open (new sub-task convenience)
// Empty lines are skipped.
const textToSubtasks = (t: string): SubTask[] => {
  const out: SubTask[] = [];
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[([ xX])\]\s*(.*)$/);
    if (m) {
      const text = m[2].trim();
      if (!text) continue;
      out.push({ lineIndex: -1, text, done: m[1].toLowerCase() === "x" });
    } else {
      out.push({ lineIndex: -1, text: line, done: false });
    }
  }
  return out;
};

// --- Forms ---

type FormValues = { text: string; notes: string };

function AddTaskForm({ onAdded }: { onAdded: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Add Task"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Task"
            onSubmit={async (v: FormValues) => {
              const text = v.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
                return;
              }
              prependTask(text, textToNotes(v.notes ?? ""));
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
            onSubmit={async (v: { text: string; notes: string; subtasks: string }) => {
              const text = v.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
                return;
              }
              updateTask(
                task,
                text,
                textToNotes(v.notes ?? ""),
                textToSubtasks(v.subtasks ?? "")
              );
              await showToast({ style: Toast.Style.Success, title: "Saved", message: text });
              onSaved();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="text" title="Task" defaultValue={task.text} autoFocus />
      <Form.TextArea
        id="notes"
        title="Notes"
        defaultValue={notesToText(task.notes)}
        placeholder="Optional. Each line becomes a sub-bullet."
      />
      <Form.TextArea
        id="subtasks"
        title="Sub-tasks"
        defaultValue={subtasksToText(task.subtasks)}
        placeholder={`One per line. Format:\n[ ] open sub-task\n[x] completed sub-task\nplain text lines become new open sub-tasks`}
      />
    </Form>
  );
}

function EditSubtaskForm({
  parent,
  subtaskIndex,
  onSaved,
}: {
  parent: Task;
  subtaskIndex: number;
  onSaved: () => void;
}) {
  const { pop } = useNavigation();
  const existing = parent.subtasks[subtaskIndex];
  return (
    <Form
      navigationTitle="Edit Sub-task"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Sub-task"
            onSubmit={async (v: { text: string }) => {
              const text = v.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Sub-task cannot be empty" });
                return;
              }
              updateSubtaskText(parent, subtaskIndex, text);
              await showToast({ style: Toast.Style.Success, title: "Sub-task updated", message: text });
              onSaved();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Parent: ${parent.text}`} />
      <Form.TextField id="text" title="Sub-task" defaultValue={existing?.text ?? ""} autoFocus />
    </Form>
  );
}

function AddSubtaskForm({ parent, onAdded }: { parent: Task; onAdded: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Add Sub-task to "${parent.text}"`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Sub-task"
            onSubmit={async (v: { text: string }) => {
              const text = v.text?.trim();
              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Sub-task cannot be empty" });
                return;
              }
              addSubtask(parent, text);
              await showToast({ style: Toast.Style.Success, title: "Sub-task added", message: text });
              onAdded();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Parent: ${parent.text}`} />
      <Form.TextField id="text" title="Sub-task" placeholder="What needs doing?" autoFocus />
    </Form>
  );
}

// --- List UI ---

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

  // Accessory showing "n/m" sub-task progress on parent
  const subtaskProgress = (task: Task) => {
    if (task.subtasks.length === 0) return null;
    const done = task.subtasks.filter((s) => s.done).length;
    return { text: `${done}/${task.subtasks.length}`, icon: Icon.Checkmark };
  };

  const renderParent = (task: Task) => {
    const parts: string[] = [];
    if (task.notes.length > 0) parts.push(task.notes.join(" • "));
    const subtitle = parts.join("  ·  ");
    const acc = subtaskProgress(task);
    const accessories = acc ? [acc] : [];

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
              title="Add Sub-task"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
              target={<AddSubtaskForm parent={task} onAdded={refresh} />}
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

  const renderSubtask = (parent: Task, s: SubTask, idx: number) => (
    <List.Item
      key={`sub-${parent.lineIndex}-${idx}`}
      title={`    ${s.text}`} // indented title for visual hierarchy
      icon={
        s.done
          ? { source: Icon.CheckCircle, tintColor: Color.Green }
          : { source: Icon.Circle, tintColor: Color.SecondaryText }
      }
      accessories={[{ text: "sub-task", icon: Icon.ChevronRight }]}
      actions={
        <ActionPanel>
          <Action
            title={s.done ? "Reopen Sub-task" : "Mark Sub-task Done"}
            icon={s.done ? Icon.Circle : Icon.CheckCircle}
            onAction={async () => {
              toggleSubtask(parent, idx);
              await showToast({
                style: Toast.Style.Success,
                title: s.done ? "Reopened" : "Done",
                message: s.text,
              });
              refresh();
            }}
          />
          <Action.Push
            title="Edit Sub-task"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            target={<EditSubtaskForm parent={parent} subtaskIndex={idx} onSaved={refresh} />}
          />
          <Action
            title="Delete Sub-task"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={async () => {
              deleteSubtask(parent, idx);
              await showToast({ style: Toast.Style.Success, title: "Sub-task deleted", message: s.text });
              refresh();
            }}
          />
          <Action.Push
            title="Add Sub-task to Parent"
            icon={Icon.PlusCircle}
            shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
            target={<AddSubtaskForm parent={parent} onAdded={refresh} />}
          />
          <Action.CopyToClipboard
            title="Copy Sub-task"
            content={s.text}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );

  // Raycast's List.Section children type is picky across @types/react versions.
  // Flatten each parent+subtasks into a single array of elements inline.
  const renderAll = (taskList: Task[]) => {
    const out = [];
    for (const task of taskList) {
      out.push(renderParent(task));
      for (let i = 0; i < task.subtasks.length; i++) {
        out.push(renderSubtask(task, task.subtasks[i], i));
      }
    }
    return out;
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
        {renderAll(openTasks)}
      </List.Section>

      <List.Section title="Done" subtitle={`${doneTasks.length}`}>
        {renderAll(doneTasks)}
      </List.Section>

      <List.EmptyView
        title="No todos yet"
        description="Press ⌘N to add your first task"
        icon={Icon.BulletPoints}
      />
    </List>
  );
}
