import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus, Check, ChevronLeft, ChevronRight, CalendarDays,
  Clock, MessageSquare, X, Send, FileText, Trash2,
  Menu, Settings, User, ChevronDown, RotateCcw, List,
  Flag, Coffee,
} from "lucide-react";
import openai from "./openaiClient";
import "./App.css";

// ── Constants ──────────────────────────────────────────
const COMPLEXITY = {
  easy:   { label: "Easy",   color: "#22c55e" },
  medium: { label: "Medium", color: "#f59e0b" },
  hard:   { label: "Hard",   color: "#ef4444" },
};

const DEFAULT_GROUPS = [
  { id: "private", name: "Private", color: "#8b5cf6" },
  { id: "work",    name: "Work",    color: "#3b82f6" },
];

const WEEKDAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const HOURS  = Array.from({ length: 18 }, (_, i) => i + 6);
const HOUR_H = 56; // px per hour in Apple-calendar style grid
const LABEL_W = 60; // px for time label column

const calcTop = (hour, minute) => (hour - HOURS[0]) * HOUR_H + (minute / 60) * HOUR_H;

// ── Helpers ────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2);
const pad      = (n) => String(n).padStart(2, "0");
const fmtDate  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr = () => fmtDate(new Date());

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
};

const fmtTime = (h, m) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${pad(m)} ${suffix}`;
};

const fmtHourLabel = (h) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr} ${suffix}`;
};

const fmtDur = (min) => {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
};

const prettyDate = (dateStr) => {
  const today = todayStr();
  if (dateStr === today)                        return "Today";
  if (dateStr === fmtDate(addDays(today, -1))) return "Yesterday";
  if (dateStr === fmtDate(addDays(today,  1))) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const getMonthDays = (dateStr) => {
  const d     = new Date(dateStr + "T00:00:00");
  const y     = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const days = [];
  for (let i = startPad - 1; i >= 0; i--)
    days.push({ date: fmtDate(new Date(y, m, -i)), inMonth: false });
  for (let i = 1; i <= last.getDate(); i++)
    days.push({ date: fmtDate(new Date(y, m, i)), inMonth: true });
  const end = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
  for (let i = 1; i <= end; i++)
    days.push({ date: fmtDate(new Date(y, m + 1, i)), inMonth: false });
  return days;
};

const shiftMonth = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n, 1);
  return fmtDate(d);
};

// Returns true if task repeats on `date` (excluding the task's own origin date)
const isRepeatMatch = (task, date) => {
  if (!task.repeat || task.date === date || task.date > date) return false;
  if (task.repeatEnd && task.repeatEnd < date) return false;
  const base   = new Date(task.date + "T00:00:00");
  const target = new Date(date      + "T00:00:00");
  const days   = Math.round((target - base) / 86400000);
  if (task.repeat === "daily")   return days > 0;
  if (task.repeat === "weekly")  return days % 7 === 0;
  if (task.repeat === "monthly") return target.getDate() === base.getDate() && days > 0;
  return false;
};

// ── AI tool executor ───────────────────────────────────
const executeAiTool = (name, input, currentTasks) => {
  switch (name) {
    case "add_task": {
      const task = {
        id: uid(), title: input.title, date: input.date,
        startHour: input.startHour ?? null, startMinute: input.startMinute ?? null,
        duration: input.duration ?? null,
        repeat: input.repeat ?? null, repeatEnd: null,
        completed: false, notes: input.notes ?? "",
        complexity: input.complexity ?? null, groupId: input.groupId ?? null,
      };
      return { result: `Created "${task.title}" on ${task.date}`, nextTasks: [...currentTasks, task] };
    }
    case "move_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      return {
        result: `Moved "${task.title}" to ${input.date ?? task.date}`,
        nextTasks: currentTasks.map((t) => t.id !== input.taskId ? t : {
          ...t,
          date:        input.date        ?? t.date,
          startHour:   "startHour"   in input ? input.startHour   : t.startHour,
          startMinute: "startMinute" in input ? input.startMinute : t.startMinute,
        }),
      };
    }
    case "complete_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      const done = input.completed !== false;
      return {
        result: `Marked "${task.title}" ${done ? "complete" : "incomplete"}`,
        nextTasks: currentTasks.map((t) => t.id === input.taskId ? { ...t, completed: done } : t),
      };
    }
    case "delete_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      return {
        result: `Deleted "${task.title}"`,
        nextTasks: currentTasks.filter((t) => t.id !== input.taskId),
      };
    }
    default:
      return { result: `Unknown tool: ${name}`, nextTasks: currentTasks };
  }
};

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Create a new task in the planner.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string" },
          date:        { type: "string",  description: "YYYY-MM-DD" },
          startHour:   { type: "number",  description: "6-23, omit for unscheduled" },
          startMinute: { type: "number",  description: "0-55 in 5-min steps" },
          duration:    { type: "number",  description: "Duration in minutes, e.g. 30, 60" },
          repeat:      { type: "string",  enum: ["daily","weekly","monthly"], description: "Repeat frequency" },
          complexity:  { type: "string",  enum: ["easy","medium","hard"] },
          groupId:     { type: "string",  description: "private | work | custom id" },
          notes:       { type: "string" },
        },
        required: ["title","date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_task",
      description: "Move a task to a different date/time.",
      parameters: {
        type: "object",
        properties: {
          taskId:      { type: "string" },
          date:        { type: "string", description: "YYYY-MM-DD" },
          startHour:   { type: "number" },
          startMinute: { type: "number" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task complete or incomplete.",
      parameters: {
        type: "object",
        properties: {
          taskId:    { type: "string" },
          completed: { type: "boolean", description: "Default true" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Permanently delete a task.",
      parameters: {
        type: "object",
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
  },
];

// ── localStorage hook ──────────────────────────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

// ── App ────────────────────────────────────────────────
export default function App() {
  const [tasks,        setTasks]        = useLocalStorage("nora_tasks", []);
  const [groups,       setGroups]       = useLocalStorage("nora_groups", DEFAULT_GROUPS);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view,         setView]         = useState("day");
  const [dark,         setDark]         = useLocalStorage("nora_dark", false);
  const [dragOver,     setDragOver]     = useState(null);
  const [filterGroup,      setFilterGroup]      = useState(null);
  const [filterComplexity, setFilterComplexity] = useState(null);
  const [filterType,       setFilterType]       = useState(null); // null | "task" | "deadline" | "break"
  const [addingAt,    setAddingAt]    = useState(null);
  const [addingTitle, setAddingTitle] = useState("");
  const addInputRef  = useRef(null);
  const timelineRef  = useRef(null);
  const [editingTask, setEditingTask] = useState(null);
  const [draft,       setDraft]       = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName,   setNewGroupName]   = useState("");
  const [newGroupColor,  setNewGroupColor]  = useState("#10b981");
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatInput,   setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages,    setMessages]    = useState([{
    role: "assistant",
    content: "Hi! I can create tasks, move them, mark them done, or help plan your day. Just ask!",
  }]);
  const chatEndRef   = useRef(null);
  const chatInputRef = useRef(null);

  const [showLanding,    setShowLanding]    = useState(true);
  const [notes,          setNotes]          = useLocalStorage("nora_notes", []);
  const [newNote,        setNewNote]        = useState("");
  const newNoteRef = useRef(null);

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeSettings, setActiveSettings] = useState(null);
  const [notifEnabled,   setNotifEnabled]   = useLocalStorage("nora_notif_enabled", false);
  const [accountName,    setAccountName]    = useLocalStorage("nora_account_name", "");
  const [accountEmail,   setAccountEmail]   = useLocalStorage("nora_account_email", "");
  const [reminderMins,   setReminderMins]   = useLocalStorage("nora_reminder_mins", 5);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const notifTimers = useRef({});

  // Live clock — re-renders every 30 s so the now-line and "Today" label stay current
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowObj      = tick;
  const today       = fmtDate(tick);
  const currentHour = tick.getHours();

  // ── Repeat-aware task lookup ─────────────────────────
  const getTasksForDate = (date) => {
    const direct   = tasks.filter((t) => t.date === date);
    const directIds = new Set(direct.map((t) => t.id));
    const repeated = tasks.filter((t) => !directIds.has(t.id) && isRepeatMatch(t, date));
    return [...direct, ...repeated];
  };

  const todayTasks = useMemo(() => getTasksForDate(selectedDate), [tasks, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTodayTasks = todayTasks.filter((t) => {
    const itemType = t.type ?? "task";
    if (filterType       && itemType        !== filterType)       return false;
    if (filterGroup      && t.groupId       !== filterGroup)      return false;
    if (filterComplexity && t.complexity    !== filterComplexity) return false;
    return true;
  });
  const totalToday = todayTasks.length;
  const doneToday  = todayTasks.filter((t) => t.completed).length;
  const pct        = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  // Scroll to current time on day view
  useEffect(() => {
    if (view === "day" && selectedDate === today) {
      setTimeout(() => {
        const top = calcTop(currentHour, nowObj.getMinutes());
        if (timelineRef.current) {
          timelineRef.current.scrollTop = Math.max(0, top - 200);
        }
      }, 120);
    }
  }, [view, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (addingAt !== null) addInputRef.current?.focus(); }, [addingAt]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);
  useEffect(() => { if (chatOpen) chatInputRef.current?.focus(); }, [chatOpen]);
  useEffect(() => { setDraft(editingTask ? { ...editingTask } : null); }, [editingTask]);

  // Notification scheduling
  useEffect(() => {
    Object.values(notifTimers.current).forEach(clearTimeout);
    notifTimers.current = {};
    if (notifPermission !== "granted" || !notifEnabled) return;
    const now = Date.now();
    tasks.forEach((task) => {
      if (task.completed || task.startHour == null || task.date !== todayStr()) return;
      const start = new Date();
      start.setHours(task.startHour, task.startMinute ?? 0, 0, 0);
      const delay = start.getTime() - reminderMins * 60000 - now;
      if (delay <= 0) return;
      notifTimers.current[task.id] = setTimeout(() => {
        new Notification(`Upcoming: ${task.title}`, {
          body: `Starting in ${reminderMins} min at ${fmtTime(task.startHour, task.startMinute ?? 0)}`,
          icon: "/logo-light.png",
        });
      }, delay);
    });
  }, [tasks, reminderMins, notifPermission, notifEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthDays  = useMemo(() => getMonthDays(selectedDate), [selectedDate]);
  const dateObj    = new Date(selectedDate + "T00:00:00");
  const monthLabel = `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const getGroup   = (id) => groups.find((g) => g.id === id);

  const commitAdd = (slot) => {
    if (addingTitle.trim()) {
      const isObj = slot !== null && slot !== undefined && typeof slot === "object";
      setTasks((p) => [...p, {
        id: uid(), title: addingTitle.trim(), date: selectedDate,
        startHour:   isObj ? slot.hour   : null,
        startMinute: isObj ? slot.minute : null,
        duration: null, repeat: null, repeatEnd: null,
        completed: false, notes: "", complexity: null, groupId: null,
      }]);
    }
    setAddingTitle(""); setAddingAt(null);
  };

  const handleSlotKey = (e, slot) => {
    if (e.key === "Enter")  { e.preventDefault(); commitAdd(slot); }
    if (e.key === "Escape") { setAddingTitle(""); setAddingAt(null); }
  };

  const saveTask = () => {
    if (!draft) return;
    setTasks((p) => {
      const exists = p.some((t) => t.id === draft.id);
      return exists ? p.map((t) => t.id === draft.id ? { ...draft } : t) : [...p, draft];
    });
    setEditingTask(null);
  };
  const deleteTask = (id) => { setTasks((p) => p.filter((t) => t.id !== id)); setEditingTask(null); };
  const toggleTask = (id) => setTasks((p) => p.map((t) => t.id === id ? { ...t, completed: !t.completed } : t));
  const moveToSlot = (id, h, m) => setTasks((p) => p.map((t) => t.id === id ? { ...t, startHour: h, startMinute: m } : t));
  const shiftDate  = (n) => setSelectedDate(fmtDate(addDays(selectedDate, n)));
  const shiftMo    = (n) => setSelectedDate(shiftMonth(selectedDate, n));

  const addNote    = () => {
    if (!newNote.trim()) return;
    setNotes((p) => [...p, { id: uid(), content: newNote.trim(), done: false, createdAt: Date.now() }]);
    setNewNote("");
    newNoteRef.current?.focus();
  };
  const toggleNote = (id) => setNotes((p) => p.map((n) => n.id === id ? { ...n, done: !n.done } : n));
  const updateNote = (id, content) => setNotes((p) => p.map((n) => n.id === id ? { ...n, content } : n));
  const deleteNote = (id) => setNotes((p) => p.filter((n) => n.id !== id));

  const createGroup = () => {
    if (!newGroupName.trim()) return;
    setGroups((g) => [...g, { id: uid(), name: newGroupName.trim(), color: newGroupColor }]);
    setNewGroupName(""); setShowGroupModal(false);
  };
  const deleteGroup = (id) => {
    setGroups((g) => g.filter((x) => x.id !== id));
    setTasks((p)  => p.map((t) => t.groupId === id ? { ...t, groupId: null } : t));
    if (filterGroup === id) setFilterGroup(null);
  };

  const buildSystem = () => {
    const taskLines = tasks.length
      ? tasks.map((t) => {
          const g = getGroup(t.groupId);
          return `• id:${t.id} [${t.completed?"done":"todo"}] "${t.title}" on ${t.date}` +
            (t.startHour != null ? ` at ${fmtTime(t.startHour, t.startMinute??0)}` : " (unscheduled)") +
            (t.duration   ? ` dur:${fmtDur(t.duration)}` : "") +
            (t.repeat     ? ` repeat:${t.repeat}` : "") +
            (t.complexity ? ` [${t.complexity}]` : "") + (g ? ` [${g.name}]` : "");
        }).join("\n")
      : "(no tasks)";
    return `You are a planning assistant in the user's planner. Today: ${today}.
Groups: ${groups.map(g=>`${g.id}="${g.name}"`).join(", ")}.
Tasks (use exact IDs with tools):
${taskLines}
Use tools to create/move/complete/delete tasks when the user asks. Confirm briefly after tool calls.`;
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const uiHistory = [...messages, { role: "user", content: text }];
    setMessages(uiHistory); setChatInput(""); setChatLoading(true);

    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      setMessages((m) => [...m, { role: "assistant", content: "No API key found.\n\nCreate .env.local:\nREACT_APP_OPENAI_API_KEY=sk-...\n\nRestart the server." }]);
      setChatLoading(false); return;
    }

    const toApiMsgs = (msgs) => {
      const flat = msgs.filter((m) => m.role === "user" || m.role === "assistant");
      const first = flat.findIndex((m) => m.role === "user");
      return first >= 0 ? flat.slice(first).slice(-20) : [];
    };

    try {
      let workingTasks = tasks;
      let apiMsgs = [{ role: "system", content: buildSystem() }, ...toApiMsgs(uiHistory)];
      let finalText = "";

      for (let iter = 0; iter < 5; iter++) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini", messages: apiMsgs, tools: AI_TOOLS,
        });
        const msg = response.choices[0].message;
        apiMsgs = [...apiMsgs, msg];
        if (!msg.tool_calls || msg.tool_calls.length === 0) { finalText = msg.content ?? ""; break; }
        const toolResults = [];
        for (const tc of msg.tool_calls) {
          const input = JSON.parse(tc.function.arguments);
          const { result, nextTasks } = executeAiTool(tc.function.name, input, workingTasks);
          workingTasks = nextTasks;
          toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        setTasks(workingTasks);
        apiMsgs = [...apiMsgs, ...toolResults];
      }
      setMessages((m) => [...m, { role: "assistant", content: finalText || "Done!" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
  };

  // ── New item helper ────────────────────────────────────
  const startNewItem = (type, slot = null) => {
    const isSlot = slot && typeof slot === "object";
    setEditingTask({
      id: uid(), type,
      title: "",
      date: selectedDate,
      startHour:   isSlot ? slot.hour   : null,
      startMinute: isSlot ? slot.minute : null,
      duration:    type === "break" ? 30 : null,
      repeat: null, repeatEnd: null,
      completed: false, notes: "",
      complexity: null, groupId: null,
    });
  };

  // ── Timeline click / drag handlers ────────────────────
  const snapToGrid = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    const x    = e.clientX - rect.left;
    if (x < LABEL_W) return null;
    const totalMins  = Math.round((y / HOUR_H) * 60 / 5) * 5;
    const clamped    = Math.max(0, Math.min(totalMins, HOURS.length * 60 - 5));
    return { hour: HOURS[0] + Math.floor(clamped / 60), minute: clamped % 60 };
  };

  const handleTimelineClick = (e) => {
    const snap = snapToGrid(e);
    if (!snap) return;
    setAddingAt(snap);
    setAddingTitle("");
  };

  const handleTimelineDragOver = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOver({ y: e.clientY - rect.top });
  };

  const handleTimelineDrop = (e) => {
    if (!window.__dragId) return;
    const snap = snapToGrid(e);
    if (snap) moveToSlot(window.__dragId, snap.hour, snap.minute);
    window.__dragId = null;
    setDragOver(null);
  };

  // ── Landing page ──────────────────────────────────────
  if (showLanding) return (
    <div className={`app landing-page${dark ? " dark" : ""}`}>
      <div className="landing-content">
        <div className="landing-logo-mark">
          <CalendarDays size={36} />
        </div>
        <h1 className="landing-hero-name">NORA</h1>
        <p className="landing-tagline">Your intelligent personal planner</p>
        <ul className="landing-features">
          <li><Check size={14} /> Timeline planner with drag &amp; drop</li>
          <li><Check size={14} /> Deadlines, breaks &amp; recurring tasks</li>
          <li><Check size={14} /> Private notes scratchpad</li>
          <li><Check size={14} /> AI assistant to manage your day</li>
        </ul>
        <button className="landing-cta" onClick={() => setShowLanding(false)}>
          Start Planning
        </button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────
  return (
    <div className={`app${dark ? " dark" : ""}`}>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo"><CalendarDays size={18} /></div>
            <span className="sidebar-app-name">NORA</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="sidebar-nav">
          {[["day","Day View",<CalendarDays size={16} />],["month","Month View",<CalendarDays size={16} />],["list","All Tasks",<List size={16} />],["notes","Notes",<FileText size={16} />]].map(([v,label,icon]) => (
            <button key={v} className={`snav-btn${view === v ? " active" : ""}`}
              onClick={() => { setView(v); setSidebarOpen(false); }}>
              {icon} {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-sep" />

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "program" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "program" ? null : "program")}>
            <Settings size={15} />
            <span>Program Settings</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "program" ? " open" : ""}`} />
          </button>
          {activeSettings === "program" && (
            <div className="sacc-body">
              <div className="sett-row">
                <span className="sett-label">Dark Mode</span>
                <button className={`theme-toggle${dark ? " on" : ""}`} onClick={() => setDark((d) => !d)} />
              </div>
              <div className="sett-row">
                <span className="sett-label">Notifications</span>
                {notifPermission === "denied"
                  ? <span className="sett-badge sett-badge-blocked">Blocked</span>
                  : notifPermission === "granted"
                  ? <button
                      className={`theme-toggle${notifEnabled ? " on" : ""}`}
                      onClick={() => setNotifEnabled((v) => !v)}
                      title={notifEnabled ? "Turn off notifications" : "Turn on notifications"}
                    />
                  : <button className="sett-btn" onClick={async () => {
                      const p = await Notification.requestPermission();
                      setNotifPermission(p);
                      if (p === "granted") setNotifEnabled(true);
                    }}>Enable</button>
                }
              </div>
              {notifPermission === "granted" && notifEnabled && (
                <div className="sett-row">
                  <span className="sett-label">Remind me</span>
                  <select className="sett-select" value={reminderMins}
                    onChange={(e) => setReminderMins(Number(e.target.value))}>
                    {[1,2,5,10,15,30].map((m) => (
                      <option key={m} value={m}>{m} min before</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "account" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "account" ? null : "account")}>
            <User size={15} />
            <span>Account</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "account" ? " open" : ""}`} />
          </button>
          {activeSettings === "account" && (
            <div className="sacc-body">
              <div className="sett-field">
                <label className="sett-field-lbl">Display Name</label>
                <input className="sett-input" value={accountName} placeholder="Your name"
                  onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div className="sett-field">
                <label className="sett-field-lbl">Email</label>
                <input className="sett-input" type="email" value={accountEmail} placeholder="email@example.com"
                  onChange={(e) => setAccountEmail(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="main-wrap">
        <header className="header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="header-center">
            <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="brand-logo" alt="NORA" />
          </div>
          <div className="header-right">
            <span className="header-date">{view === "day" ? prettyDate(selectedDate) : view === "month" ? monthLabel : view === "notes" ? "Notes" : "All Tasks"}</span>
          </div>
        </header>

        <div className="container">
          {view === "day" && (
            <>
              <div className="stats-bar">
                {[
                  { v: totalToday, l: "Today" }, { v: doneToday, l: "Done" },
                  { v: tasks.filter((t) => !t.completed && t.date >= today).length, l: "Upcoming" },
                  { v: tasks.filter((t) => t.completed).length, l: "All done" },
                ].map(({ v, l }) => (
                  <div key={l} className="stat-card">
                    <div className="stat-value">{v}</div><div className="stat-label">{l}</div>
                  </div>
                ))}
              </div>
              {totalToday > 0 && (
                <div className="progress-wrap">
                  <span className="progress-label">Progress</span>
                  <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
                  <span className="progress-pct">{pct}%</span>
                </div>
              )}
            </>
          )}

          {/* Date nav & view tabs — hidden in notes view */}
          {view !== "notes" && <div className="controls">
            <div className="date-nav">
              <button className="nav-btn" onClick={() => view === "month" ? shiftMo(-1) : shiftDate(-1)}><ChevronLeft size={16} /></button>
              {view === "day"
                ? <input type="date" className="date-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                : view === "month"
                ? <span className="month-label-nav">{monthLabel}</span>
                : <span className="month-label-nav">All Tasks</span>}
              <button className="nav-btn" onClick={() => view === "month" ? shiftMo(1) : shiftDate(1)}><ChevronRight size={16} /></button>
            </div>
            <div className="view-tabs">
              <button className={`tab-btn${view === "day"   ? " active" : ""}`} onClick={() => setView("day")}>Day</button>
              <button className={`tab-btn${view === "month" ? " active" : ""}`} onClick={() => setView("month")}>Month</button>
              <button className={`tab-btn${view === "list"  ? " active" : ""}`} onClick={() => setView("list")}>All</button>
            </div>
          </div>}

          {/* Filters — hidden in notes view */}
          {view !== "notes" && <div className="filter-bar">
            <div className="filter-section">
              <span className="filter-label">Type</span>
              <button className={`filter-pill${filterType === null ? " active" : ""}`} onClick={() => setFilterType(null)}>All</button>
              <button className={`filter-pill${filterType === "task" ? " active" : ""}`} onClick={() => setFilterType(filterType === "task" ? null : "task")}><Check size={11} /> Tasks</button>
              <button className={`filter-pill type-pill-dl${filterType === "deadline" ? " active" : ""}`} onClick={() => setFilterType(filterType === "deadline" ? null : "deadline")}><Flag size={11} /> Deadlines</button>
              <button className={`filter-pill type-pill-brk${filterType === "break" ? " active" : ""}`} onClick={() => setFilterType(filterType === "break" ? null : "break")}><Coffee size={11} /> Breaks</button>
            </div>
            <div className="filter-section">
              <span className="filter-label">Group</span>
              <button className={`filter-pill${filterGroup === null ? " active" : ""}`} onClick={() => setFilterGroup(null)}>All</button>
              {groups.map((g) => (
                <button key={g.id} className={`filter-pill gpill${filterGroup === g.id ? " active" : ""}`}
                  style={{ "--gc": g.color }} onClick={() => setFilterGroup(filterGroup === g.id ? null : g.id)}>
                  <span className="gdot" />{g.name}
                </button>
              ))}
              <button className="filter-pill add-gpill" onClick={() => setShowGroupModal(true)}><Plus size={11} /> New</button>
            </div>
            <div className="filter-section">
              <span className="filter-label">Complexity</span>
              <button className={`filter-pill${filterComplexity === null ? " active" : ""}`} onClick={() => setFilterComplexity(null)}>All</button>
              {Object.entries(COMPLEXITY).map(([key]) => (
                <button key={key} className={`filter-pill cpill ${key}${filterComplexity === key ? " active" : ""}`}
                  onClick={() => setFilterComplexity(filterComplexity === key ? null : key)}>{COMPLEXITY[key].label}</button>
              ))}
            </div>
          </div>}

          {/* ── Day view ── */}
          {view === "day" && (
            <div className="timeline-wrap">
              <div className="unscheduled-section">
                <div className="section-label"><Clock size={13} /> Unscheduled</div>
                <div className="unscheduled-tasks">
                  {filteredTodayTasks.filter((t) => t.startHour == null).map((t) => {
                    const type = t.type ?? "task";
                    if (type === "deadline") return (
                      <div key={t.id} className="unsched-deadline" onClick={() => setEditingTask(t)}>
                        <Flag size={11} /><span>{t.title || "Untitled deadline"}</span>
                      </div>
                    );
                    if (type === "break") return (
                      <div key={t.id} className="unsched-break" onClick={() => setEditingTask(t)}>
                        <Coffee size={11} /><span>{t.title || "Break"}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}</span>
                      </div>
                    );
                    return <TaskChip key={t.id} task={t} group={getGroup(t.groupId)} onToggle={toggleTask} onClick={setEditingTask} />;
                  })}
                  {addingAt === "unscheduled"
                    ? <input ref={addInputRef} className="slot-input" value={addingTitle}
                        onChange={(e) => setAddingTitle(e.target.value)} onKeyDown={(e) => handleSlotKey(e, null)}
                        onBlur={() => commitAdd(null)} placeholder="Task name..." />
                    : <div className="unsched-actions">
                        <button className="slot-add-btn" onClick={() => { setAddingAt("unscheduled"); setAddingTitle(""); }}><Plus size={13} /> Task</button>
                        <button className="slot-add-btn slot-add-dl" onClick={() => startNewItem("deadline")}><Flag size={13} /> Deadline</button>
                        <button className="slot-add-btn slot-add-brk" onClick={() => startNewItem("break")}><Coffee size={13} /> Break</button>
                      </div>
                  }
                </div>
              </div>

              <div className="timeline" ref={timelineRef}>
                <div className="tl-grid"
                  style={{ height: HOURS.length * HOUR_H + 1 }}
                  onClick={handleTimelineClick}
                  onDragOver={handleTimelineDragOver}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={handleTimelineDrop}>

                  {/* Hour lines and labels */}
                  {HOURS.map((hour, idx) => (
                    <React.Fragment key={hour}>
                      <div className="tl-hour-label" style={{ top: idx * HOUR_H }}>{fmtHourLabel(hour)}</div>
                      <div className="tl-hour-line"  style={{ top: idx * HOUR_H }} />
                      <div className="tl-half-line"  style={{ top: idx * HOUR_H + HOUR_H / 2 }} />
                    </React.Fragment>
                  ))}
                  <div className="tl-hour-line" style={{ top: HOURS.length * HOUR_H }} />

                  {/* Deadline markers */}
                  {filteredTodayTasks
                    .filter((t) => t.type === "deadline" && t.startHour != null)
                    .map((t) => (
                      <div key={t.id} className="tl-deadline"
                        style={{ top: calcTop(t.startHour, t.startMinute ?? 0) }}
                        onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                        <div className="tl-deadline-flag"><Flag size={12} /></div>
                        <div className="tl-deadline-body">
                          <span>{t.title || "Deadline"}</span>
                          <span className="tl-deadline-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                        </div>
                      </div>
                    ))
                  }

                  {/* Break blocks */}
                  {filteredTodayTasks
                    .filter((t) => t.type === "break" && t.startHour != null)
                    .map((t) => {
                      const top    = calcTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * HOUR_H : HOUR_H / 2;
                      const height = Math.max(durPx, 22);
                      return (
                        <div key={t.id} className="tl-break-block"
                          style={{ top, height }}
                          onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                          <Coffee size={11} />
                          <span className="tl-break-title">{t.title || "Break"}</span>
                          {t.duration && <span className="tl-break-dur">{fmtDur(t.duration)}</span>}
                        </div>
                      );
                    })
                  }

                  {/* Task chips */}
                  {filteredTodayTasks
                    .filter((t) => (t.type ?? "task") === "task" && t.startHour != null)
                    .map((t) => {
                      const top    = calcTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * HOUR_H : HOUR_H * 0.38;
                      const height = Math.max(durPx, 22);
                      const group  = getGroup(t.groupId);
                      const cx     = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc     = group?.color ?? cx?.color ?? "var(--accent)";
                      return (
                        <div key={t.id}
                          className={`tl-task-chip${t.completed ? " done" : ""}`}
                          style={{ "--gc": gc, top, height }}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); window.__dragId = t.id; }}
                          onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                          <button className={`chip-check${t.completed ? " checked" : ""}`}
                            onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                            {t.completed && <Check size={9} strokeWidth={3} />}
                          </button>
                          <div className="tl-task-content">
                            <span className="tl-task-title">{t.title}</span>
                            {height > 36 && (
                              <span className="tl-task-time">
                                {fmtTime(t.startHour, t.startMinute ?? 0)}
                                {t.duration ? ` · ${fmtDur(t.duration)}` : ""}
                              </span>
                            )}
                          </div>
                          {t.repeat && <RotateCcw size={9} style={{ color: "currentColor", opacity: .65, flexShrink: 0, marginTop: 2 }} />}
                        </div>
                      );
                    })
                  }

                  {/* Inline add input */}
                  {addingAt !== null && typeof addingAt === "object" && (
                    <div className="tl-add-wrap"
                      style={{ top: calcTop(addingAt.hour, addingAt.minute) }}
                      onClick={(e) => e.stopPropagation()}>
                      <input ref={addInputRef} className="slot-input" value={addingTitle}
                        onChange={(e) => setAddingTitle(e.target.value)}
                        onKeyDown={(e) => handleSlotKey(e, addingAt)}
                        onBlur={() => commitAdd(addingAt)}
                        placeholder={`Task at ${fmtTime(addingAt.hour, addingAt.minute)}…`} />
                    </div>
                  )}

                  {/* Current time indicator — green line */}
                  {selectedDate === today && currentHour >= HOURS[0] && (
                    <div className="tl-now-line" style={{ top: calcTop(currentHour, nowObj.getMinutes()) }}>
                      <div className="tl-now-dot" />
                      <div className="tl-now-rule" />
                    </div>
                  )}

                  {/* Drag position indicator */}
                  {dragOver?.y != null && (
                    <div className="tl-drag-line" style={{ top: dragOver.y }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Month view ── */}
          {view === "month" && (
            <div className="month-wrap">
              <div className="month-weekday-row">
                {WEEKDAY_SHORT.map((d) => <div key={d} className="month-weekday">{d}</div>)}
              </div>
              <div className="month-grid">
                {monthDays.map(({ date, inMonth }) => {
                  const dayTasks = getTasksForDate(date).filter((t) => {
                    if (filterGroup      && t.groupId    !== filterGroup)      return false;
                    if (filterComplexity && t.complexity !== filterComplexity) return false;
                    return true;
                  });
                  const isToday  = date === today;
                  const isPast   = date < today && inMonth;
                  const visible  = dayTasks.slice(0, 3);
                  const overflow = dayTasks.length - visible.length;
                  const dayNum   = new Date(date + "T00:00:00").getDate();
                  return (
                    <div key={date}
                      className={["month-day", !inMonth?"out-month":"", isToday?"is-today":"", isPast?"is-past":""].filter(Boolean).join(" ")}
                      onClick={() => { setSelectedDate(date); setView("day"); }}>
                      <div className={`month-day-num${isToday ? " today-badge" : ""}`}>{dayNum}</div>
                      <div className="month-task-list">
                        {visible.map((t) => {
                          const g  = getGroup(t.groupId);
                          const c  = t.complexity ? COMPLEXITY[t.complexity].color : null;
                          const tp = t.type ?? "task";
                          const gc = tp === "deadline" ? "#ef4444"
                                   : tp === "break"    ? "#94a3b8"
                                   : g?.color ?? c ?? "var(--accent)";
                          return (
                            <div key={t.id}
                              className={`month-task-pill${t.completed?" done":""}${tp !== "task" ? ` mtp-${tp}` : ""}`}
                              style={{ "--gc": gc }}>
                              {tp === "deadline" && <Flag size={8} style={{ flexShrink: 0 }} />}
                              {tp === "break"    && <Coffee size={8} style={{ flexShrink: 0 }} />}
                              {tp === "task" && t.repeat && <RotateCcw size={8} style={{ flexShrink: 0 }} />}
                              {t.startHour != null && <span className="mtp-time">{fmtTime(t.startHour, t.startMinute??0)} </span>}
                              {t.title || (tp === "break" ? "Break" : tp === "deadline" ? "Deadline" : "")}
                            </div>
                          );
                        })}
                        {overflow > 0 && <div className="month-overflow">+{overflow} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── All Tasks list view ── */}
          {view === "list" && (() => {
            const allFiltered = tasks.filter((t) => {
              if (filterGroup      && t.groupId    !== filterGroup)      return false;
              if (filterComplexity && t.complexity !== filterComplexity) return false;
              return true;
            }).sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              const aTime = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
              const bTime = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
              return aTime - bTime;
            });

            if (allFiltered.length === 0) {
              return (
                <div className="list-empty">
                  <CalendarDays size={40} style={{ opacity: .25 }} />
                  <p>No tasks yet. Add one from the Day view!</p>
                </div>
              );
            }

            // Group by date
            const byDate = [];
            let lastDate = null;
            allFiltered.forEach((t) => {
              if (t.date !== lastDate) { byDate.push({ date: t.date, tasks: [] }); lastDate = t.date; }
              byDate[byDate.length - 1].tasks.push(t);
            });

            return (
              <div className="list-view">
                {byDate.map(({ date, tasks: dateTasks }) => (
                  <div key={date} className="list-group">
                    <div className="list-date-header">
                      <span className="list-date-label">{prettyDate(date)}</span>
                      <span className="list-date-sub">{new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                    </div>
                    {dateTasks.map((t) => {
                      const tp    = t.type ?? "task";
                      const group = getGroup(t.groupId);
                      const cx    = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc    = tp === "deadline" ? "#ef4444"
                                  : tp === "break"    ? "#94a3b8"
                                  : group?.color ?? cx?.color ?? "var(--accent)";
                      return (
                        <div key={t.id} className={`list-task${t.completed ? " done" : ""}`}
                          style={{ "--gc": gc }}
                          onClick={() => setEditingTask(t)}>
                          {tp === "task"
                            ? <button className={`chip-check${t.completed ? " checked" : ""}`}
                                onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                {t.completed && <Check size={10} strokeWidth={3} />}
                              </button>
                            : <span className="list-type-icon">
                                {tp === "deadline" ? <Flag size={13} style={{ color: "#ef4444" }} /> : <Coffee size={13} style={{ color: "#94a3b8" }} />}
                              </span>
                          }
                          <div className="list-task-body">
                            <span className="list-task-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                            <div className="list-task-meta">
                              {t.startHour != null && (
                                <span className="list-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                              )}
                              {t.duration   && <span className="badge dbadge">{fmtDur(t.duration)}</span>}
                              {cx           && <span className="badge cbadge" style={{ "--cc": cx.color }}>{t.complexity}</span>}
                              {group        && <span className="badge gbadge" style={{ "--gc": group.color }}>{group.name}</span>}
                              {t.repeat     && <span className="badge rbadge"><RotateCcw size={9} /> {t.repeat}</span>}
                              {t.notes      && <span className="badge nbadge"><FileText size={9} /></span>}
                            </div>
                          </div>
                          <button className="list-task-edit" onClick={(e) => { e.stopPropagation(); setSelectedDate(t.date); setView("day"); }}>
                            <CalendarDays size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Notes view ── */}
          {view === "notes" && (
            <div className="notes-view">
              <div className="notes-add-bar">
                <input
                  ref={newNoteRef}
                  className="notes-add-input"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                  placeholder="Write a new note…" />
                <button className="notes-add-btn" onClick={addNote} disabled={!newNote.trim()}>
                  <Plus size={16} />
                </button>
              </div>
              {notes.length === 0 ? (
                <div className="notes-empty">
                  <FileText size={40} style={{ opacity: .2 }} />
                  <p>No notes yet. Type above and press Enter.</p>
                </div>
              ) : (
                <div className="notes-list">
                  {[...notes].reverse().map((note) => (
                    <div key={note.id} className={`note-card${note.done ? " done" : ""}`}>
                      <button
                        className={`chip-check note-check${note.done ? " checked" : ""}`}
                        onClick={() => toggleNote(note.id)}>
                        {note.done && <Check size={10} strokeWidth={3} />}
                      </button>
                      <textarea
                        className="note-text"
                        value={note.content}
                        onChange={(e) => updateNote(note.id, e.target.value)}
                        rows={1}
                        onInput={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }} />
                      <button className="note-delete" onClick={() => deleteNote(note.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="app-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="footer-logo" alt="NORA" />
              <span className="footer-tagline">More than just a planner</span>
            </div>
            {/* ── Social / info links — add links here later ── */}
            <div className="footer-links" />
            <span className="footer-copy">© {tick.getFullYear()} NORA</span>
          </div>
        </footer>
      </div>{/* /main-wrap */}

      {/* Chat FAB */}
      <button className={`chat-fab${chatOpen ? " active" : ""}`} onClick={() => setChatOpen((o) => !o)}>
        {chatOpen ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      <div className={`chat-panel${chatOpen ? " open" : ""}`}>
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="chat-avatar">AI</div>
            <div><div className="chat-title">Planning Assistant</div><div className="chat-subtitle">Creates & moves tasks</div></div>
          </div>
          <button className="chat-close" onClick={() => setChatOpen(false)}><X size={16} /></button>
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}><div className="chat-bubble">{m.content}</div></div>
          ))}
          {chatLoading && <div className="chat-msg assistant"><div className="chat-bubble typing"><span /><span /><span /></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-row">
          <textarea ref={chatInputRef} className="chat-input" value={chatInput} rows={1}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="e.g. Add weekly training every Monday at 7 AM" />
          <button className="chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
            {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Task edit modal */}
      {editingTask && draft && (
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <input className="modal-title-input" value={draft.title} placeholder="Task title"
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <button className="modal-close" onClick={() => setEditingTask(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Type selector */}
              <div className="type-tabs">
                {[["task","Task",<Check size={12}/>],["deadline","Deadline",<Flag size={12}/>],["break","Break",<Coffee size={12}/>]].map(([val,label,icon]) => (
                  <button key={val}
                    className={`type-tab type-tab-${val}${(draft.type ?? "task") === val ? " active" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, type: val }))}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              <div className="modal-field">
                <label className="field-label">Time</label>
                <div className="time-row">
                  <select className="field-select" value={draft.startHour ?? ""}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      startHour:   e.target.value === "" ? null : Number(e.target.value),
                      startMinute: e.target.value === "" ? null : (d.startMinute ?? 0),
                    }))}>
                    <option value="">No time</option>
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                      <option key={h} value={h}>{fmtTime(h, 0)}</option>
                    ))}
                  </select>
                  <select className="field-select" disabled={draft.startHour == null}
                    value={draft.startMinute ?? 0}
                    onChange={(e) => setDraft((d) => ({ ...d, startMinute: Number(e.target.value) }))}>
                    {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                      <option key={m} value={m}>{`:${pad(m)}`}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(draft.type ?? "task") !== "deadline" && (
                <div className="modal-field">
                  <label className="field-label">Duration</label>
                  <select className="field-select" value={draft.duration ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value === "" ? null : Number(e.target.value) }))}>
                    <option value="">No duration</option>
                    {Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((m) => (
                      <option key={m} value={m}>{fmtDur(m)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-field">
                <label className="field-label">Repeat</label>
                <select className="field-select" value={draft.repeat ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, repeat: e.target.value || null }))}>
                  <option value="">No repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>
              {(draft.type ?? "task") === "task" && (
                <div className="modal-field">
                  <label className="field-label">Complexity</label>
                  <div className="pill-row">
                    {Object.entries(COMPLEXITY).map(([key]) => (
                      <button key={key} className={`complexity-btn ${key}${draft.complexity === key ? " active" : ""}`}
                        onClick={() => setDraft((d) => ({ ...d, complexity: d.complexity === key ? null : key }))}>
                        {COMPLEXITY[key].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(draft.type ?? "task") === "task" && (
                <div className="modal-field">
                  <label className="field-label">Group</label>
                  <div className="pill-row">
                    {groups.map((g) => (
                      <button key={g.id} className={`group-btn${draft.groupId === g.id ? " active" : ""}`}
                        style={{ "--gc": g.color }}
                        onClick={() => setDraft((d) => ({ ...d, groupId: d.groupId === g.id ? null : g.id }))}>
                        <span className="gdot-sm" />{g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="modal-field">
                <label className="field-label">Notes</label>
                <textarea className="modal-notes" rows={4} value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Add notes, links, context..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-danger" onClick={() => deleteTask(draft.id)}><Trash2 size={14} /> Delete</button>
              <button className="btn-primary" onClick={saveTask}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Group modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-heading">Manage Groups</span>
              <button className="modal-close" onClick={() => setShowGroupModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label className="field-label">New Group Name</label>
                <input className="field-input" value={newGroupName} autoFocus
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createGroup()}
                  placeholder="e.g. Health, Learning..." />
              </div>
              <div className="modal-field">
                <label className="field-label">Colour</label>
                <div className="color-row">
                  {["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#10b981"].map((c) => (
                    <button key={c} className={`color-swatch${newGroupColor === c ? " sel" : ""}`}
                      style={{ background: c }} onClick={() => setNewGroupColor(c)} />
                  ))}
                  <input type="color" className="color-custom" value={newGroupColor}
                    onChange={(e) => setNewGroupColor(e.target.value)} />
                </div>
              </div>
              {groups.filter((g) => g.id !== "private" && g.id !== "work").length > 0 && (
                <div className="modal-field">
                  <label className="field-label">Custom Groups</label>
                  <div className="existing-groups">
                    {groups.filter((g) => g.id !== "private" && g.id !== "work").map((g) => (
                      <div key={g.id} className="existing-group-row">
                        <span className="gdot-sm" style={{ "--gc": g.color }} />
                        <span>{g.name}</span>
                        <button className="del-group-btn" onClick={() => deleteGroup(g.id)}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowGroupModal(false)}>Close</button>
              <button className="btn-primary" onClick={createGroup} disabled={!newGroupName.trim()}><Plus size={14} /> Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskChip({ task, group, onToggle, onClick, compact }) {
  const cx = task.complexity ? COMPLEXITY[task.complexity] : null;
  return (
    <div className={`task-chip${task.completed ? " done" : ""}${compact ? " compact" : ""}`}
      style={{ "--gc": group?.color ?? (cx?.color ?? "var(--accent)") }}
      draggable onDragStart={() => (window.__dragId = task.id)}
      onClick={(e) => { e.stopPropagation(); onClick(task); }}>
      <button className={`chip-check${task.completed ? " checked" : ""}`}
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}>
        {task.completed && <Check size={10} strokeWidth={3} />}
      </button>
      <span className="chip-title">{task.title}</span>
      {!compact && (
        <div className="chip-meta">
          {task.duration && <span className="badge dbadge">{fmtDur(task.duration)}</span>}
          {cx    && <span className="badge cbadge" style={{ "--cc": cx.color }}>{task.complexity}</span>}
          {group && <span className="badge gbadge" style={{ "--gc": group.color }}>{group.name}</span>}
          {task.repeat && <RotateCcw size={9} style={{ color: "var(--accent)", flexShrink: 0 }} />}
          {task.notes && <span className="badge nbadge"><FileText size={10} /></span>}
        </div>
      )}
    </div>
  );
}
