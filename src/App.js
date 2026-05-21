import React, { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./lib/supabase";
import AuthScreen from "./AuthScreen";
import {
  Plus, Check, ChevronLeft, ChevronRight, CalendarDays,
  Clock, MessageSquare, X, Send, FileText, Trash2,
  Menu, Settings, User, ChevronDown, RotateCcw, List,
  Flag, Coffee, Bell,
  Activity, Zap, Wind, TrendingUp, TrendingDown, Minus,
  ZoomIn, ZoomOut,
  Brain, Target, Lightbulb, BarChart2, AlertTriangle,
  Pencil, SkipForward,
} from "lucide-react";
import "./App.css";

// ── Constants ──────────────────────────────────────────
const COMPLEXITY = {
  easy:   { label: "Easy",   color: "#22c55e" },
  medium: { label: "Medium", color: "#f59e0b" },
  hard:   { label: "Hard",   color: "#ef4444" },
};

const REMINDER_PRESETS = [3, 5, 10, 15];

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

const calcTop = (hour, minute, hh = HOUR_H) => (hour - HOURS[0]) * hh + (minute / 60) * hh;

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
      if (input.startHour != null) {
        const now = new Date();
        const todayDate = fmtDate(now);
        if (input.date === todayDate) {
          const inputMins = input.startHour * 60 + (input.startMinute ?? 0);
          const nowMins   = now.getHours() * 60 + now.getMinutes();
          if (inputMins <= nowMins) {
            return {
              result: `Rejected: "${input.title}" at ${fmtTime(input.startHour, input.startMinute ?? 0)} is in the past (now ${pad(now.getHours())}:${pad(now.getMinutes())}). Choose a later time and try again.`,
              nextTasks: currentTasks,
            };
          }
        }
      }
      const task = {
        id: uid(), title: input.title, date: input.date,
        type: input.type ?? "task",
        startHour: input.startHour ?? null, startMinute: input.startMinute ?? null,
        duration: input.duration ?? null,
        repeat: input.repeat ?? null, repeatEnd: null,
        completed: false, notes: input.notes ?? "",
        complexity: input.complexity ?? null, groupId: input.groupId ?? null,
        reminderOffset: input.reminderOffset ?? null,
      };
      return { result: `Created ${task.type} "${task.title}" on ${task.date}`, nextTasks: [...currentTasks, task] };
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
      description: "Create one calendar item. For plans, call this once per item — tasks, breaks, AND the deadline itself. Never group everything into one call.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string" },
          date:        { type: "string",  description: "YYYY-MM-DD" },
          type:        { type: "string",  enum: ["task","deadline","break"], description: "REQUIRED: 'task' for work/study items, 'deadline' for fixed external events (exam day, submission), 'break' for rest/recovery blocks." },
          startHour:   { type: "number",  description: "6-23, omit for unscheduled" },
          startMinute: { type: "number",  description: "0-55 in 5-min steps" },
          duration:    { type: "number",  description: "Duration in minutes, e.g. 30, 60" },
          repeat:      { type: "string",  enum: ["daily","weekly","monthly"], description: "Repeat frequency" },
          complexity:  { type: "string",  enum: ["easy","medium","hard"] },
          groupId:     { type: "string",  description: "private | work | custom id" },
          notes:          { type: "string" },
          reminderOffset: { type: "number", enum: [3, 5, 10, 15], description: "Minutes before start to send reminder." },
        },
        required: ["title","date","type"],
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
  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => { setSession(session); setAuthLoading(false); })
      .catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session); setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [tasks,        setTasks]        = useLocalStorage("nora_tasks", []);
  const [groups,       setGroups]       = useLocalStorage("nora_groups", DEFAULT_GROUPS);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view,         setView]         = useState("day");
  const [dark,         setDark]         = useLocalStorage("nora_dark", false);
  const [dragOver,     setDragOver]     = useState(null);
  const [zoomLevel,    setZoomLevel]    = useState(1);
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
  const [inAppAlert,  setInAppAlert]  = useState(null);
  const [messages,    setMessages]    = useState([{
    role: "assistant",
    content: "Hi! I'm NORA, your productivity coach. I can manage your tasks, spot patterns in your schedule, and give you evidence-based advice to get more done. What are you working on today?",
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
  const [reminderMins,   setReminderMins]   = useLocalStorage("nora_reminder_mins", 5);
  const [relaxation,     setRelaxation]     = useLocalStorage("nora_relaxation", 5);
  const [energy,         setEnergy]         = useLocalStorage("nora_energy", 5);
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
  const progressTasks = todayTasks.filter((t) => (t.type ?? "task") !== "break");
  const totalToday = progressTasks.length;
  const doneToday  = progressTasks.filter((t) => t.completed).length;
  const pct        = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = fmtDate(addDays(today, i - 6));
    const dayTasks = tasks.filter((t) => t.date === d);
    const done  = dayTasks.filter((t) => t.completed).length;
    const total = dayTasks.length;
    return { date: d, done, total, rate: total > 0 ? done / total : null };
  }), [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekTrend = useMemo(() => {
    const rated = weekData.filter((d) => d.rate !== null);
    if (rated.length < 4) return "new";
    const recent = rated.slice(-3);
    const prior  = rated.slice(0, rated.length - 3);
    const avg    = (arr) => arr.reduce((s, d) => s + d.rate, 0) / arr.length;
    const diff   = avg(recent) - avg(prior);
    return diff > 0.1 ? "improving" : diff < -0.1 ? "declining" : "steady";
  }, [weekData]);

  // ── Behavioral intelligence ─────────────────────────────────────

  const momentum = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = fmtDate(addDays(today, i - 13));
      const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
      const done = dayT.filter((t) => t.completed).length;
      return { date, total: dayT.length, done, rate: dayT.length > 0 ? done / dayT.length : null };
    });
    const rated = days.filter((d) => d.rate !== null);
    if (rated.length < 2) return { state: "new", label: "Just Starting", desc: "Build a few days of history and NORA will start recognising patterns.", color: "var(--accent)", score: null };
    const recent = rated.slice(-Math.min(3, rated.length));
    const prior  = rated.slice(0, rated.length - recent.length);
    const avg    = (arr) => arr.length > 0 ? arr.reduce((s, d) => s + d.rate, 0) / arr.length : null;
    const rAvg   = avg(recent);
    const pAvg   = avg(prior) ?? rAvg;
    const trend  = rAvg - pAvg;
    const avgLoad = recent.reduce((s, d) => s + d.total, 0) / recent.length;
    if (rAvg < 0.40 && avgLoad > 4)   return { state: "overloaded", label: "Overloaded",      desc: "Schedule exceeds your current capacity. Remove or defer tasks — consistency beats volume.", color: "#ef4444", score: rAvg };
    if (rAvg >= 0.65 && trend >  0.08) return { state: "rising",    label: "Rising",           desc: "Momentum is building. Protect this energy and keep sessions predictable.",                color: "#22c55e", score: rAvg };
    if (rAvg >= 0.55 && Math.abs(trend) <= 0.12) return { state: "stable", label: "Stable",    desc: "Consistent and reliable. Steady momentum is more sustainable than burst performance.",   color: "#3b82f6", score: rAvg };
    if (trend < -0.20 && pAvg > 0.55) return { state: "recovery",   label: "Recovery Phase",   desc: "You slipped after a strong stretch — that's natural. A lighter day resets the system.",  color: "#f59e0b", score: rAvg };
    if (trend >  0.12)                 return { state: "rising",     label: "Recovering",       desc: "Turning around. Each completed task rebuilds the pattern.",                              color: "#22c55e", score: rAvg };
    return { state: "unstable", label: "Unstable", desc: "Inconsistent pattern. Fewer, smaller, well-timed tasks work better than an ambitious list.", color: "#f59e0b", score: rAvg };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const workloadForecast = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date  = fmtDate(addDays(today, i));
    const dayT  = tasks.filter((t) => t.date === date && t.type !== "break");
    const mins  = dayT.filter((t) => t.duration).reduce((s, t) => s + t.duration, 0);
    const load  = dayT.length;
    const d     = new Date(date + "T00:00:00");
    const level = load > 6 || mins > 360 ? "heavy" : load > 3 || mins > 180 ? "moderate" : load > 0 ? "light" : "free";
    return {
      date, load, mins, level,
      label:   i === 0 ? "Today" : i === 1 ? "Tmr" : ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()],
      isToday: i === 0,
    };
  }), [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusPatterns = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 4) return null;
    const bands = [
      { key: "morning",   label: "Morning",   range: "6–11 AM", hours: [6,7,8,9,10,11],       count: 0 },
      { key: "afternoon", label: "Afternoon", range: "12–5 PM", hours: [12,13,14,15,16,17],    count: 0 },
      { key: "evening",   label: "Evening",   range: "6–10 PM", hours: [18,19,20,21,22],       count: 0 },
    ];
    doneT.forEach((t) => { const b = bands.find((b) => b.hours.includes(t.startHour)); if (b) b.count++; });
    const total = bands.reduce((s, b) => s + b.count, 0);
    if (total === 0) return null;
    const peak = [...bands].sort((a, b) => b.count - a.count)[0];
    return { bands, peak, peakPct: Math.round((peak.count / total) * 100), total };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostAvoided = useMemo(() => {
    const overdue = tasks.filter((t) => !t.completed && t.date < today && t.type === "task");
    if (!overdue.length) return null;
    const task = [...overdue].sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysOverdue = Math.floor((new Date(today + "T00:00:00") - new Date(task.date + "T00:00:00")) / 86400000);
    const tl = task.title.toLowerCase();
    const microStarts =
      /read|study|learn|review/.test(tl)         ? ["Open the material and read just 1 page.", "Set a 5-min timer and start anywhere.", "Write down 3 key things you need to understand."] :
      /write|essay|report|draft/.test(tl)        ? ["Open a blank doc and type one sentence.", "Bullet your 3 main ideas — nothing else.", "Write only the title and intro paragraph."] :
      /code|build|implement|fix|debug/.test(tl)  ? ["Open the file and just read it once.", "Write a comment describing what needs to happen.", "Make one small change and run it."] :
      /email|message|call|reply/.test(tl)        ? ["Open it and read it — don't respond yet.", "Type just the first line of a reply.", "Draft a 2-sentence response and save it."] :
      [`Spend 5 minutes on "${task.title}" — that's it.`, "Set a timer and begin. Anything counts.", "Do the smallest possible piece right now."];
    return { task, daysOverdue, microStarts, count: overdue.length };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const adaptiveRecs = useMemo(() => {
    const recs = [];
    if (momentum.state === "overloaded")                         recs.push("Cut your task list by ~30% this week — volume is the problem, not effort.");
    if (focusPatterns?.peakPct >= 35)                            recs.push(`${focusPatterns.peakPct}% of completions happen in the ${focusPatterns.peak.label.toLowerCase()} (${focusPatterns.peak.range}). Guard that window.`);
    const heavyDays = workloadForecast.filter((d) => d.level === "heavy");
    if (heavyDays.length > 0)                                    recs.push(`${heavyDays.map((d) => d.label).join(", ")} ${heavyDays.length === 1 ? "looks" : "look"} overloaded — move some tasks to lighter days.`);
    if (mostAvoided?.daysOverdue >= 3)                           recs.push(`"${mostAvoided.task.title}" has been waiting ${mostAvoided.daysOverdue} days. A 5-minute start breaks the avoidance loop.`);
    if (momentum.state === "stable")                             recs.push("Consistent rhythm detected. Don't add tasks on already-full days — protect what's working.");
    if (energy <= 3)                                             recs.push("Low energy: 25-min focused blocks beat long exhausted sessions every single time.");
    if (relaxation <= 3)                                         recs.push("Stress is elevated. One completed task restores more calm than five half-started ones.");
    return recs.slice(0, 3);
  }, [momentum, focusPatterns, workloadForecast, mostAvoided, energy, relaxation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recovery intelligence ───────────────────────────────────────
  const recoveryState = useMemo(() => {
    const last7      = Array.from({ length: 7 }, (_, i) => {
      const date = fmtDate(addDays(today, i - 6));
      const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
      const done = dayT.filter((t) => t.completed).length;
      return { total: dayT.length, done, rate: dayT.length > 0 ? done / dayT.length : null };
    });
    const overdueCount = tasks.filter((t) => !t.completed && t.date < today && t.type !== "break").length;
    const recentRated  = last7.filter((d) => d.rate !== null);
    const recentAvg    = recentRated.length > 0 ? recentRated.reduce((s, d) => s + d.rate, 0) / recentRated.length : 1;
    const avgLoad      = last7.reduce((s, d) => s + d.total, 0) / 7;
    const lateNight    = tasks.filter((t) => t.completed && t.startHour != null && t.startHour >= 21).length;
    const avoidRate    = overdueCount / Math.max(tasks.length, 1);

    let score = 100;
    if (recentRated.length > 0) score -= (1 - recentAvg) * 40;
    score -= Math.min(28, overdueCount * 2.5);
    score -= Math.min(18, avoidRate * 36);
    if (lateNight >= 3) score -= 10;
    if (avgLoad > 6)    score -= 8;

    if (score >= 78) return { level: "stable",   label: "Stable",             color: "#22c55e", desc: "Output and recovery are balanced. You're in a sustainable rhythm.",                                                   advice: null };
    if (score >= 58) return { level: "mild",     label: "Mild Overload",       color: "#f59e0b", desc: "A few signals suggest the pace is slightly unsustainable.",                                                          advice: "Trim 1–2 tasks this week and protect at least one longer break." };
    if (score >= 38) return { level: "high",     label: "High Cognitive Load", color: "#f97316", desc: "Your schedule has consistently exceeded comfortable capacity.",                                                       advice: "Reduce daily task count by ~30%. Focus only on what genuinely moves things forward." };
    if (score >= 18) return { level: "recovery", label: "Recovery Needed",     color: "#ef4444", desc: "Sustained pressure is reducing effectiveness. Recovery actively improves long-term output.",                         advice: "Protect the next day as near-rest. One essential task only." };
    return              { level: "burnout",  label: "Burnout Risk",        color: "#dc2626", desc: "Patterns suggest significant cumulative exhaustion. Rest is more productive than pushing through.",                  advice: "Pause non-essential tasks entirely. Rest today. Rebuild from a lighter baseline tomorrow." };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Adaptive plan data — learns from completion history ─────────
  const adaptivePlanData = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 5) return null;

    const hourBuckets = {};
    doneT.forEach((t) => { hourBuckets[t.startHour] = (hourBuckets[t.startHour] || 0) + 1; });
    const topHours = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => parseInt(h));

    const withDur = doneT.filter((t) => t.duration);
    const avgDur  = withDur.length > 0 ? Math.round(withDur.reduce((s, t) => s + t.duration, 0) / withDur.length) : null;

    const byDay = {};
    doneT.forEach((t) => { const day = new Date(t.date + "T00:00:00").getDay(); byDay[day] = (byDay[day] || 0) + 1; });
    const bestDayEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const dayNames     = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const bestDayName  = bestDayEntry ? dayNames[parseInt(bestDayEntry[0])] : null;

    const hardTotal    = tasks.filter((t) => t.complexity === "hard" && t.type !== "break").length;
    const hardDone     = tasks.filter((t) => t.complexity === "hard" && t.completed).length;
    const hardRate     = hardTotal >= 3 ? Math.round((hardDone / hardTotal) * 100) : null;

    const longFail = tasks.filter((t) => !t.completed && t.duration && t.duration > 90 && t.type !== "break").length;
    const longAll  = tasks.filter((t) => t.duration && t.duration > 90 && t.type !== "break").length;
    const longTasksFail = longAll >= 4 && (longFail / longAll) > 0.5;

    return { topHours, avgDur, bestDayName, hardRate, longTasksFail, sampleSize: doneT.length };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weekly reflection — interprets what happened this week ──────
  const weeklyReflection = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date  = fmtDate(addDays(today, i - 6));
      const d     = new Date(date + "T00:00:00");
      const dayT  = tasks.filter((t) => t.date === date && t.type !== "break");
      const done  = dayT.filter((t) => t.completed).length;
      return { date, name: ["Sun","Mo","Tue","Wed","Thu","Fri","Sat"][d.getDay()], done, total: dayT.length, rate: dayT.length > 0 ? done / dayT.length : null };
    });
    const rated = last7.filter((d) => d.rate !== null);
    if (rated.length < 3) return null;

    const avgRate = rated.reduce((s, d) => s + d.rate, 0) / rated.length;
    const best    = [...rated].sort((a, b) => b.rate - a.rate)[0];
    const worst   = [...rated].sort((a, b) => a.rate - b.rate)[0];
    const heavy   = rated.filter((d) => d.total > 5 && d.rate < 0.5);
    const insights = [];

    if (avgRate >= 0.7)       insights.push(`Strong week — ${Math.round(avgRate * 100)}% of planned work completed.`);
    else if (avgRate >= 0.45) insights.push(`Decent week at ${Math.round(avgRate * 100)}% completion. A solid foundation to build from.`);
    else                      insights.push(`Completion was ${Math.round(avgRate * 100)}% this week — worth reflecting on what created friction.`);

    if (best && best.rate >= 0.75 && best.total > 1)
      insights.push(`${best.name} was your strongest day (${best.done}/${best.total}) — notice what conditions made it flow.`);

    if (heavy.length > 0)
      insights.push(`Heavy-schedule days (${heavy.map((d) => d.name).join(", ")}) had lower output. Dense lists reduce completion, not improve it.`);

    if (worst && worst.rate < 0.3 && worst.total > 1) {
      const recovered = rated.find((d) => d.date > worst.date && d.rate > 0.5);
      insights.push(recovered
        ? `You bounced back after ${worst.name}'s difficult session — that resilience counts.`
        : `${worst.name} was a rough day. Identifying the trigger helps design next week better.`);
    }

    return { insights: insights.slice(0, 4), avgRate };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const deferredTasks = useMemo(() => {
    const past = tasks.filter((t) => !t.completed && t.date < today && (t.type ?? "task") !== "break");
    return past
      .map((t) => {
        const daysDeferred = Math.round(
          (new Date(today + "T00:00:00") - new Date(t.date + "T00:00:00")) / 86400000
        );
        const urgency = daysDeferred >= 7 ? "high" : daysDeferred >= 3 ? "medium" : "low";
        return { ...t, daysDeferred, urgency };
      })
      .sort((a, b) => b.daysDeferred - a.daysDeferred);
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomedH = Math.round(HOUR_H * zoomLevel);
  const cTop    = (h, m) => calcTop(h, m, zoomedH);

  // Scroll to current time on day view
  useEffect(() => {
    if (view === "day" && selectedDate === today) {
      setTimeout(() => {
        const top = (currentHour - HOURS[0]) * zoomedH + (nowObj.getMinutes() / 60) * zoomedH;
        if (timelineRef.current) {
          timelineRef.current.scrollTop = Math.max(0, top - 200);
        }
      }, 120);
    }
  }, [view, selectedDate, zoomedH]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (addingAt !== null) addInputRef.current?.focus(); }, [addingAt]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);
  useEffect(() => { if (chatOpen) chatInputRef.current?.focus(); }, [chatOpen]);
  useEffect(() => { setDraft(editingTask ? { ...editingTask } : null); }, [editingTask]);

  // Notification scheduling — per-task reminderOffset overrides global reminderMins
  useEffect(() => {
    Object.values(notifTimers.current).forEach(clearTimeout);
    notifTimers.current = {};
    if (!notifEnabled) return;
    const now = Date.now();
    tasks.forEach((task) => {
      if (task.completed || task.startHour == null || task.date !== todayStr()) return;
      const offset = task.reminderOffset === "none" ? null
        : task.reminderOffset != null ? task.reminderOffset
        : reminderMins;
      if (offset == null) return;
      const start = new Date();
      start.setHours(task.startHour, task.startMinute ?? 0, 0, 0);
      const delay = start.getTime() - offset * 60000 - now;
      if (delay <= 0) return;
      notifTimers.current[task.id] = setTimeout(() => {
        const timeStr = fmtTime(task.startHour, task.startMinute ?? 0);
        setInAppAlert({ id: uid(), title: task.title, offset, timeStr });
        if (notifPermission === "granted") {
          new Notification(`Upcoming: ${task.title}`, {
            body: `Starting in ${offset} min at ${timeStr}`,
            icon: "/logo-light.png",
          });
        }
      }, delay);
    });
  }, [tasks, reminderMins, notifPermission, notifEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inAppAlert) return;
    const t = setTimeout(() => setInAppAlert(null), 8000);
    return () => clearTimeout(t);
  }, [inAppAlert]);

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
        completed: false, notes: "", complexity: null, groupId: null, reminderOffset: null,
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
  const skipTask   = (id) => {
    const tomorrow = fmtDate(addDays(today, 1));
    setTasks((p) => p.map((t) => t.id === id ? { ...t, date: tomorrow, startHour: null, startMinute: null } : t));
  };
  const moveToSlot = (id, h, m) => setTasks((p) => p.map((t) => t.id === id ? { ...t, startHour: h, startMinute: m } : t));

  const askNORAtoReschedule = (task) => {
    const daysDeferred = Math.round(
      (new Date(today + "T00:00:00") - new Date(task.date + "T00:00:00")) / 86400000
    );
    setChatInput(
      `"${task.title}" has been pending for ${daysDeferred} day${daysDeferred !== 1 ? "s" : ""}. Can you find the best spot for it this week and schedule it there? Consider my current workload and energy.`
    );
    setChatOpen(true);
  };

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
          return `• id:${t.id} [${t.completed?"done":"todo"}] [${t.type??"task"}] "${t.title}" on ${t.date}` +
            (t.startHour != null ? ` at ${fmtTime(t.startHour, t.startMinute??0)}` : " (unscheduled)") +
            (t.duration   ? ` dur:${fmtDur(t.duration)}` : "") +
            (t.repeat     ? ` repeat:${t.repeat}` : "") +
            (t.complexity ? ` [${t.complexity}]` : "") + (g ? ` [${g.name}]` : "");
        }).join("\n")
      : "(no tasks)";

    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter((t) => !t.completed && t.date < today).length;
    const todayTasks = tasks.filter((t) => t.date === today);
    const todayDone = todayTasks.filter((t) => t.completed).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Schedule intelligence — injected as context for NORA
    const todayItems = tasks.filter((t) => t.date === today && !t.completed);
    const todayHasBreak = todayItems.some((t) => t.type === "break");
    const todayScheduled = todayItems.filter((t) => t.startHour != null)
      .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));
    let maxConsecMin = 0, runMin = 0;
    todayScheduled.forEach((t) => {
      if (t.type === "break") { maxConsecMin = Math.max(maxConsecMin, runMin); runMin = 0; }
      else runMin += t.duration ?? 60;
    });
    maxConsecMin = Math.max(maxConsecMin, runMin);
    const upcomingDeadlines = tasks
      .filter((t) => t.type === "deadline" && !t.completed && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const scheduleNotes = [
      todayItems.length === 0 && "Today's schedule is empty.",
      todayItems.length > 4 && `Today is quite full (${todayItems.length} items).`,
      !todayHasBreak && todayScheduled.length >= 2 && "No breaks scheduled today.",
      maxConsecMin >= 90 && `Longest consecutive work block today: ${maxConsecMin} min — consider a break.`,
      upcomingDeadlines.length > 0 && `Upcoming deadlines: ${upcomingDeadlines.map((d) => `"${d.title}" on ${d.date}`).join(", ")}.`,
      overdue > 0 && `${overdue} deferred item(s) are still active and waiting for the right moment.`,
    ].filter(Boolean).join(" ");

    const currentTimeStr = `${pad(nowObj.getHours())}:${pad(nowObj.getMinutes())}`;
    const blockedIntervals = todayScheduled
      .filter((t) => t.type !== "break" && t.duration != null)
      .map((t) => {
        const endMins = t.startHour * 60 + (t.startMinute ?? 0) + t.duration;
        return `${fmtTime(t.startHour, t.startMinute ?? 0)}–${fmtTime(Math.floor(endMins / 60), endMins % 60)} "${t.title}"`;
      });
    const blockedStr = blockedIntervals.length > 0 ? blockedIntervals.join(" | ") : "(none)";

    const completedWithTime = tasks.filter((t) => t.completed && t.startHour != null);
    let peakHourStr = "not enough data yet";
    if (completedWithTime.length >= 3) {
      const hourCounts = {};
      completedWithTime.forEach((t) => {
        const bucket = Math.floor(t.startHour / 2) * 2;
        hourCounts[bucket] = (hourCounts[bucket] || 0) + 1;
      });
      const peak = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (peak) peakHourStr = `${peak[0]}:00–${parseInt(peak[0]) + 2}:00`;
    }

    return `You are NORA — a warm, observant personal planning butler. Today is ${today}.
You work exclusively for this person. You know their schedule inside and out, and you genuinely care about how they're doing — not just what they need to get done.

Speak like a trusted human assistant, not a productivity app:
• Natural and warm: "I've gone ahead and added that for you."
• Observant: "I noticed you have three sessions back-to-back today — want me to slip in a break?"
• Caring: "Given how you're feeling right now, maybe we keep today lighter?"
• Never robotic. Never start with "Certainly!", "Absolutely!", or "Of course!" every time.
• Refer to tasks by name. Be brief unless a plan is needed.
• Use contractions and natural phrasing. Sound human.

━━━ SCHEDULE AT A GLANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current time: ${currentTimeStr}. Do not schedule anything on ${today} at or before this time.
Today's occupied windows: ${blockedStr} — no break or new task may overlap these.

Today (${today}): ${todayItems.length} item(s), ${todayDone}/${todayTasks.length} complete. ${scheduleNotes || "Schedule looks balanced."}
Overall: ${completionRate}% completion rate across ${total} tasks. Peak productive window: ${peakHourStr}.
Groups: ${groups.map((g) => `${g.id}="${g.name}"`).join(", ") || "(none)"}.

All scheduled items:
${taskLines}

━━━ BEHAVIORAL INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━━━━━━
Momentum:       ${momentum.label}${momentum.score != null ? ` (${Math.round(momentum.score * 100)}% avg)` : ""}  — ${momentum.desc}
Recovery state: ${recoveryState.label} — ${recoveryState.desc}
Most avoided:   ${mostAvoided ? `"${mostAvoided.task.title}" (${mostAvoided.daysOverdue}d deferred — still active)` : "(none)"}
Focus peak:     ${focusPatterns ? `${focusPatterns.peak.label} (${focusPatterns.peak.range}), ${focusPatterns.peakPct}% of completions` : "not enough data"}
Heavy days:     ${workloadForecast.filter((d) => d.level === "heavy").map((d) => d.label).join(", ") || "none"}
Best hours:     ${adaptivePlanData ? adaptivePlanData.topHours.slice(0, 2).map((h) => fmtTime(h, 0)).join(", ") : "unknown"}
Avg session:    ${adaptivePlanData?.avgDur ? `~${adaptivePlanData.avgDur} min (from successful completions)` : "unknown"}
Best day:       ${adaptivePlanData?.bestDayName ?? "unknown"}
Long tasks:     ${adaptivePlanData?.longTasksFail ? "often fail — split sessions >90 min automatically" : "completing fine"}

━━━ HOW YOU ARE FEELING RIGHT NOW ━━━━━━━━━━━━━━━━━━━━

Relaxation ${relaxation}/10 · Energy ${energy}/10
→ ${
    relaxation <= 2 && energy <= 2
      ? "They are severely stressed AND exhausted. Start with genuine empathy. Do not add tasks. Offer to lighten the load and suggest a proper rest."
    : relaxation <= 3 && energy <= 3
      ? "Very low state. Acknowledge it kindly. Trim the day to one essential thing. No piling on."
    : relaxation <= 3
      ? "Stressed. Be gentle and grounding. Suggest the smallest, easiest next step. Keep it simple."
    : energy <= 3
      ? "Low energy. Suggest deferring anything non-critical. Recommend a short break before the next task."
    : relaxation >= 8 && energy >= 8
      ? "In great shape — relaxed and energized. This is the moment for the hardest, most important work."
    : relaxation >= 6 && energy >= 6
      ? "Doing well. Steady, focused blocks. Light encouragement."
    : "Moderate. One task at a time, Pomodoro-style. Don't overload."
  }

━━━ ITEM TYPES — USE CORRECTLY EVERY TIME ━━━━━━━━━━━━

type:"task"     → work or study items (reading, coding, gym session, writing, etc.)
type:"deadline" → a fixed external point in time (exam day, interview, submission). NOT the work itself. Never schedule study sessions as deadlines.
type:"break"    → intentional rest (e.g. "Short break", "Lunch", "Walk outside", "Rest"). Title it naturally.

BREAK RULES:
• After any session ≥ 90 min → automatically add a 15–20 min break task immediately after.
• If today already has 2+ sessions and no breaks → mention it and offer to add one.
• For stressed or low-energy users → suggest breaks proactively even without being asked.
• Breaks are not optional extras. They are part of a healthy schedule.

━━━ OPERATING MODES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODE 1 — TASK / CALENDAR OPS:
Execute with tools immediately. One brief, warm sentence after. Mention anything notable in the schedule if relevant ("Done — I also noticed you have nothing scheduled after 3 PM, so you're free.").

MODE 2 — PRODUCTIVITY COACHING (user asks for advice, technique, or feedback):
Call research_productivity to fetch a proven technique. Apply it directly to the user's wellness + data.
2–3 sentences max. Warm and personal, not textbook.

MODE 3 — PLANNING ENGINE ← activate whenever the user mentions:
  deadline · exam · test · project · assignment · submission · presentation ·
  interview · competition · launch · event · goal · study · prepare
This mode is NON-OPTIONAL. Every step below is required.

━━━ PLANNING ENGINE — MANDATORY STEPS ━━━━━━━━━━━━━━━━━

STEP 1 — INTERPRET THE GOAL
Identify: what is the user actually trying to achieve?
Identify: what type of preparation does it require?
  academic study | project delivery | skill practice | physical prep | creative work | professional prep

STEP 2 — COUNT AVAILABLE DAYS
Calculate days from today (${today}) to the deadline (inclusive of both ends).
Adjust plan density:
  ≤ 2 days  → intensive sprint (2–3 sessions/day)
  3–6 days  → short structured plan (1–2 sessions/day)
  7–14 days → full phased plan (1 session/day + weekends)
  15+ days  → milestone-based plan (group by week)

STEP 3 — BACKWARD PLAN (STRICTLY ENFORCED)
Work backward from the deadline. NEVER cluster tasks on or near the deadline.
Distribute according to these phase proportions:
  Phase 1 – Foundation  (~40% of days): learn, understand, gather — complexity: easy
  Phase 2 – Practice    (~30% of days): exercises, drafts, problems — complexity: medium
  Phase 3 – Consolidation (~20% of days): weak areas, mock runs, refinement — complexity: hard
  Phase 4 – Final day   (1 day):         light review only OR rest. NO heavy sessions.

STEP 4 — CREATE ALL TASKS (MANDATORY TOOL CALLS)
Rules — no exceptions:
  • Call add_task once for EVERY session. Do not list tasks without creating them.
  • Minimum: 1 session per available day. Never fewer than 3 tasks for 3+ day plans.
  • Duration: 45–90 min study blocks. Never schedule 3+ hour single sessions.
  • Times: morning session → 9:00 AM, afternoon → 14:00, evening → 19:00.
  • notes field: WHAT to focus on — e.g. "Chapter 3–4, practice integrals, focus on edge cases".
  • Set the deadline event itself as type "deadline" on the correct date.
  • WELLNESS OVERRIDE:
      Low wellness (relaxation ≤ 3 or energy ≤ 3) → reduce session count by ~30%, add break tasks.
      Peak wellness (both ≥ 7) → keep full schedule, add optional stretch sessions labeled "Optional:".

STEP 5 — REPLY WITH STRUCTURED PLAN SUMMARY
After all add_task calls are complete, respond in this exact format:

**Objective:** [the underlying goal]
**Deadline:** [date]
**Plan:**
[day-by-day or phase summary — 4–7 lines, e.g. "Mon: Chapter 1–2 (9 AM, 60 min) …"]
**Why this structure:** [1–2 sentences on the reasoning behind the distribution]
**Tip:** [1 personalized optimization tied to current wellness state]

━━━ MORNING / ROUTINE PLANNING ━━━━━━━━━━━━━━━━━━━━━━━

When asked for a "productive morning", "morning routine", or any day-start plan:
Create this sequence with add_task (every item is a real task):
  1. Movement  (20–45 min, 6–7 AM). Low energy → walk. High energy → workout.
  2. Recovery  (shower, 10–15 min).
  3. Breakfast (20–30 min). Suggest SPECIFIC food:
       Peak state    → eggs + avocado toast (sustained fuel for deep work)
       Low energy    → banana + peanut butter smoothie (quick, zero friction)
       Moderate      → oatmeal + berries (steady glucose release)
  4. Cognitive prime — the single most important task of the day, right after breakfast.
Tailor intensity and duration to current wellness state.

━━━ ANTI-PATTERNS — NEVER DO THESE ━━━━━━━━━━━━━━━━━━━

✗ Set only a deadline and create no preparation tasks
✗ Cluster all work on or near the deadline date
✗ Fewer than 3 tasks for any goal with 3+ prep days
✗ List tasks in text instead of calling add_task
✗ Call an exam or interview a "task" — it is a "deadline"
✗ Sessions longer than 90 min without a break task after them
✗ Sound like a chatbot — no "Certainly!", no mechanical lists, no robotic phrasing
✗ Ignore what's already in the schedule — always read and reference it
✗ Schedule any item at or before ${currentTimeStr} on today (${today}) — it's already in the past
✗ Place a break or task during a window already occupied by another item (check occupied windows above)

━━━ HIDDEN TASK RADAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Whenever you detect a goal, event, or challenge without adequate preparation tasks, create them immediately — even if the user didn't explicitly ask.

Triggers:
• User mentions any future goal, event, exam, project, or deadline
• Schedule has a deadline with no work sessions on the days before it
• Task implies sub-steps that don't exist yet (e.g. "submit report" with no drafting sessions)

Action: Create the hidden preparation tasks, then briefly explain what you added and why.

━━━ MICRO-START MODE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Activate when:
• User says they're stuck, overwhelmed, procrastinating, or can't begin
• A task has been avoided 3+ days (check behavioral intelligence above)
• Momentum is Unstable or Overloaded

Micro-start rules:
• Suggest 3 starting actions — each under 5–15 minutes
• Frame as tiny steps, not tasks: "Just open the file and read it." not "Complete Step 1."
• Never add guilt. Add forward motion.
• Offer to add a micro-task to the calendar if they want.

━━━ RECOVERY INTELLIGENCE — RESPONSE RULES ━━━━━━━━━━━━━━━━━━━━━

Current recovery state: ${recoveryState.label}
${recoveryState.advice ? `→ Guidance: ${recoveryState.advice}` : "→ User is stable. Standard scheduling applies."}

Adapt NORA's tone and planning density to the recovery state:
• Stable:             Full scheduling. Ambitious plans welcome.
• Mild Overload:      Reduce session count. Add more breaks. Softer tone.
• High Cognitive Load: Cut daily task count by ~30–40%. One essential task per day emphasis. Gentle framing.
• Recovery Needed:    Max 2 tasks per day. No multi-hour sessions. Protecting rest is top priority.
• Burnout Risk:       Never add tasks. Only help reorganize and remove. Compassionate, non-urgent tone only.

NORA must NEVER:
• Frame missed tasks as failures or use language like "you only completed X%"
• Push urgency when recovery state is elevated
• Shame or guilt-trip on low-output patterns

NORA SHOULD instead:
• Normalize difficulty ("That was a heavy stretch — completely understandable.")
• Focus forward, not on what was missed
• Frame recovery as a productivity strategy, not a break from productivity

━━━ ADAPTIVE SCHEDULING ENGINE ━━━━━━━━━━━━━━━━━━━━━━━
${adaptivePlanData ? `
Behavioral profile (learned from ${adaptivePlanData.sampleSize} completed tasks):
• Best completion hours: ${adaptivePlanData.topHours.slice(0, 2).map((h) => fmtTime(h, 0)).join(", ")} — schedule demanding work here
• Successful session avg: ~${adaptivePlanData.avgDur ?? 60} min — avoid exceeding without explicit request
• Most productive day: ${adaptivePlanData.bestDayName ?? "unknown"} — weight important tasks here
• Hard task completion: ${adaptivePlanData.hardRate != null ? `${adaptivePlanData.hardRate}%` : "unknown"}${adaptivePlanData.hardRate != null && adaptivePlanData.hardRate < 50 ? " — break hard tasks into easier sub-steps" : ""}
• ${adaptivePlanData.longTasksFail ? "Long sessions (>90 min) fail often — automatically cap new sessions at 60–75 min" : "Session length tolerance is healthy"}
` : "Not enough behavioral data yet — use defaults (60 min sessions, 9 AM and 2 PM start times)."}
Silent adaptation rules (apply without explaining to user):
1. Schedule new tasks at the user's best completion hours when possible
2. If long sessions fail → cap blocks at 60 min, add a break between them
3. If hard tasks have low completion → default new tasks to easy/medium complexity
4. If recovery state is elevated → automatically reduce session count in any plan

━━━ TASK PURPOSE ENGINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When creating tasks, append a 1-sentence purpose to the notes field.
Purpose should explain WHY this task matters RIGHT NOW, not just what it is.

Examples:
• "Finishing this today removes pressure from the rest of your week."
• "Early preparation improves retention significantly before the exam."
• "This session builds the foundation everything else depends on."
• "Completing this now protects your free weekend."
• "Getting this done first prevents it from compounding into a larger problem later."

Generate purpose based on:
- Position in the plan (early = foundation building, late = consolidation)
- Proximity to upcoming deadlines
- Whether it relieves future workload
- The user's current recovery state (stressed users need calming purpose framing)

━━━ WEEKLY REFLECTION MODE ━━━━━━━━━━━━━━━━━━━━━━━━━━

Activate when user says: weekly review · how did I do · weekly reflection · what worked · this week

Generate a warm, interpretive reflection (NOT a stats dump):
1. Lead with what genuinely went well — even small wins deserve recognition
2. Identify what created friction — name the pattern, not the person
3. Suggest ONE structural change for next week (specific, not vague)
4. Close with forward momentum: "Here's what I'd prioritize Monday..."

NEVER: list raw completion numbers without interpretation · focus primarily on failures · use clinical analytics language
ALWAYS: interpret patterns · sound like a thoughtful observer who cares · connect behavior to outcome

━━━ RESCHEDULING INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━━━━━

Deferred tasks (${deferredTasks.length}):${deferredTasks.length > 0
  ? "\n" + deferredTasks.slice(0, 5).map((t) => `  • "${t.title}" — deferred ${t.daysDeferred}d (${t.urgency} priority)`).join("\n")
  : " (none)"}

When the user or the Pending Focus card asks NORA to reschedule a deferred task:
1. ASSESS why it may have been skipped (overloaded day, low energy, unclear scope)
2. FIND a gap in the upcoming 7 days — prefer the user's best completion hours and low-load days
3. MOVE the task: call update_task with the new date and a suitable startHour/startMinute
4. MENTION any workload rebalancing: "I moved it to Thursday at 10 AM — you have breathing room there."
5. If the task is vague or large, offer to break it into a micro-start + follow-up session

Language rules — ALWAYS:
• "pending focus" / "still active" / "deferred" / "waiting for the right moment"
• "I've found a better home for this" / "Let's slot it in when the timing works"
• Forward-focused: "Here's when it fits best…"

Language rules — NEVER:
• "missed" / "failed" / "overdue" / "you didn't complete"
• Guilt, urgency framing, or productivity shame of any kind
• Treating a deferred task as a personal shortcoming

━━━ WORKLOAD REBALANCING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When the user asks to rebalance multiple deferred tasks:
1. List the deferred tasks with their urgency
2. Identify the lightest days in the upcoming week (from Workload Forecast)
3. Distribute tasks across those days — highest urgency first, lighter days first
4. Respect session length limits (≤ 90 min) and add a break after any block ≥ 90 min
5. Confirm what moved where: "I've spread these across Tuesday, Thursday, and Friday — here's the plan."

━━━ OUTPUT FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task ops: 1 warm sentence. Reference the schedule if something's worth noting.
Coaching advice: 2–3 conversational sentences. Sound human.
Planning: Step 5 structured format.
Recovery-state responses: compassionate, forward-focused, no guilt.
Weekly reflection: 4-part warm narrative format above.
Rescheduling: forward-focused, name where things landed, no guilt language.
Everything else: direct, brief, warm — like a trusted person, not an AI.`;
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const uiHistory = [...messages, { role: "user", content: text }];
    setMessages(uiHistory); setChatInput(""); setChatLoading(true);

    const toApiMsgs = (msgs) => {
      const flat = msgs.filter((m) => m.role === "user" || m.role === "assistant");
      const first = flat.findIndex((m) => m.role === "user");
      return first >= 0 ? flat.slice(first).slice(-20) : [];
    };

    try {
      let workingTasks = tasks;
      let apiMsgs = [{ role: "system", content: buildSystem() }, ...toApiMsgs(uiHistory)];
      let finalText = "";

      for (let iter = 0; iter < 10; iter++) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMsgs, tools: AI_TOOLS }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `API error ${res.status}`);
        }
        const data = await res.json();
        const msg = data.choices[0].message;
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
    const totalMins  = Math.round((y / zoomedH) * 60 / 5) * 5;
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

  // ── Auth guard ────────────────────────────────────────
  if (authLoading) return (
    <div className={`app${dark ? " dark" : ""} auth-loading-wrap`}>
      <div className="auth-spinner" />
    </div>
  );
  if (!session) return <AuthScreen dark={dark} />;

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
          {[["day","Day View",<CalendarDays size={16} />],["month","Month View",<CalendarDays size={16} />],["list","All Tasks",<List size={16} />],["notes","Notes",<FileText size={16} />],["status","My Status",<Activity size={16} />]].map(([v,label,icon]) => (
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
                <label className="sett-field-lbl">Signed in as</label>
                <span className="sett-email-display">{session?.user?.email}</span>
              </div>
              <button className="sett-signout-btn" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
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
          {view !== "notes" && view !== "status" && <div className="controls">
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
          {view !== "notes" && view !== "status" && <div className="filter-bar">
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
                    return <TaskChip key={t.id} task={t} group={getGroup(t.groupId)} onToggle={toggleTask} onReschedule={askNORAtoReschedule} onSkip={skipTask} onClick={setEditingTask} />;
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

              <div className="tl-zoom-bar">
                <button className="tl-zoom-btn" disabled={zoomLevel <= 0.5}
                  onClick={() => setZoomLevel((z) => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}>
                  <ZoomOut size={14} />
                </button>
                <span className="tl-zoom-label">{Math.round(zoomLevel * 100)}%</span>
                <button className="tl-zoom-btn" disabled={zoomLevel >= 2.5}
                  onClick={() => setZoomLevel((z) => Math.min(2.5, parseFloat((z + 0.25).toFixed(2))))}>
                  <ZoomIn size={14} />
                </button>
                <button className="tl-zoom-reset" onClick={() => setZoomLevel(1)}>Reset</button>
              </div>

              <div className="timeline" ref={timelineRef}>
                <div className="tl-grid"
                  style={{ height: HOURS.length * zoomedH + 1 }}
                  onClick={handleTimelineClick}
                  onDragOver={handleTimelineDragOver}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={handleTimelineDrop}>

                  {/* Hour lines and labels */}
                  {HOURS.map((hour, idx) => (
                    <React.Fragment key={hour}>
                      <div className="tl-hour-label" style={{ top: idx * zoomedH }}>{fmtHourLabel(hour)}</div>
                      <div className="tl-hour-line"  style={{ top: idx * zoomedH }} />
                      <div className="tl-half-line"  style={{ top: idx * zoomedH + zoomedH / 2 }} />
                    </React.Fragment>
                  ))}
                  <div className="tl-hour-line" style={{ top: HOURS.length * zoomedH }} />

                  {/* Deadline markers */}
                  {filteredTodayTasks
                    .filter((t) => t.type === "deadline" && t.startHour != null)
                    .map((t) => (
                      <div key={t.id} className="tl-deadline"
                        style={{ top: cTop(t.startHour, t.startMinute ?? 0) }}
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
                      const top    = cTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * zoomedH : zoomedH / 2;
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
                      const top    = cTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * zoomedH : zoomedH * 0.38;
                      const height = Math.max(durPx, 22);
                      const group  = getGroup(t.groupId);
                      const cx     = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc     = group?.color ?? cx?.color ?? "var(--accent)";
                      const isDeferred = !t.completed && t.date < today;
                      return (
                        <div key={t.id}
                          className={`tl-task-chip${t.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
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
                          <div className="tl-actions">
                            {!t.completed && (
                              <button className="tl-act" title="Reschedule with NORA"
                                onClick={(e) => { e.stopPropagation(); askNORAtoReschedule(t); }}>
                                <RotateCcw size={9} />
                              </button>
                            )}
                            {!t.completed && (
                              <button className="tl-act" title="Skip to tomorrow"
                                onClick={(e) => { e.stopPropagation(); skipTask(t.id); }}>
                                <SkipForward size={9} />
                              </button>
                            )}
                            <button className="tl-act" title="Edit"
                              onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                              <Pencil size={9} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  }

                  {/* Inline add input */}
                  {addingAt !== null && typeof addingAt === "object" && (
                    <div className="tl-add-wrap"
                      style={{ top: cTop(addingAt.hour, addingAt.minute) }}
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
                    <div className="tl-now-line" style={{ top: cTop(currentHour, nowObj.getMinutes()) }}>
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
                      const isDeferred = tp === "task" && !t.completed && t.date < today;
                      return (
                        <div key={t.id}
                          className={`list-task${t.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
                          style={{ "--gc": gc }}>
                          {/* Header row */}
                          <div className="list-task-main" onClick={() => setEditingTask(t)}>
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
                              <span className="list-task-title">
                                {t.title || (tp === "break" ? "Break" : "Deadline")}
                                {t.startHour != null && <span className="list-title-time"> — {fmtTime(t.startHour, t.startMinute ?? 0)}</span>}
                              </span>
                              <div className="list-task-meta">
                                {t.duration   && <span className="badge dbadge">{fmtDur(t.duration)}</span>}
                                {cx           && <span className="badge cbadge" style={{ "--cc": cx.color }}>{t.complexity}</span>}
                                {group        && <span className="badge gbadge" style={{ "--gc": group.color }}>{group.name}</span>}
                                {t.repeat     && <span className="badge rbadge"><RotateCcw size={9} /> {t.repeat}</span>}
                                {t.notes      && <span className="badge nbadge"><FileText size={9} /></span>}
                              </div>
                            </div>
                          </div>
                          {/* Action row — tasks only */}
                          {tp === "task" && (
                            <div className="list-task-actions">
                              <button className={`tca tca-done${t.completed ? " active" : ""}`}
                                onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                <Check size={10} strokeWidth={3} /> Done
                              </button>
                              {!t.completed && (
                                <button className="tca tca-resched"
                                  onClick={(e) => { e.stopPropagation(); askNORAtoReschedule(t); }}>
                                  <RotateCcw size={10} /> Reschedule
                                </button>
                              )}
                              {!t.completed && (
                                <button className="tca tca-skip"
                                  onClick={(e) => { e.stopPropagation(); skipTask(t.id); }}>
                                  <SkipForward size={10} /> Skip
                                </button>
                              )}
                              <button className="tca tca-edit"
                                onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                                <Pencil size={10} /> Edit
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Notes view ── */}
          {/* ── Status view ── */}
          {view === "status" && (() => {
            const relaxLabel  = relaxation <= 3 ? "Stressed" : relaxation <= 6 ? "Moderate" : relaxation <= 8 ? "Relaxed" : "Very relaxed";
            const energyLabel = energy     <= 3 ? "Exhausted" : energy <= 6 ? "Moderate" : energy <= 8 ? "Energized" : "Very energized";
            const insightText = (() => {
              if (relaxation <= 3 && energy <= 3) return "You're running on empty. Take a proper break before continuing — even 10 minutes resets focus significantly.";
              if (relaxation <= 3)  return "Stress is elevated. Try completing one small, easy task to build momentum, then step away briefly.";
              if (energy <= 3)      return `Energy is low. Focus on just your top ${Math.min(2, totalToday - doneToday)} remaining tasks today and defer the rest.`;
              if (relaxation >= 7 && energy >= 7) return `You're in peak state${pct >= 60 ? " and already making solid progress" : ""}. This is ideal for your hardest, most important tasks.`;
              if (pct >= 70)        return "Great progress today. Keep your rhythm and avoid overloading your afternoon.";
              if (totalToday - doneToday > 0) return `You have ${totalToday - doneToday} task${totalToday - doneToday > 1 ? "s" : ""} left today. Start with the most important one.`;
              return "No tasks scheduled today. Open NORA chat to plan your day.";
            })();
            const maxWlLoad = Math.max(...workloadForecast.map((d) => d.load), 1);
            return (
              <div className="status-view">

                {/* ── Momentum ── */}
                <div className="status-card momentum-card">
                  <div className="status-card-title"><Brain size={15} /> Momentum</div>
                  <div className="momentum-state-row">
                    <span className="momentum-dot" style={{ background: momentum.color }} />
                    <span className="momentum-label" style={{ color: momentum.color }}>{momentum.label}</span>
                  </div>
                  <p className="momentum-desc">{momentum.desc}</p>
                  {momentum.score != null && (
                    <div className="momentum-score-row">
                      <div className="momentum-score-bg">
                        <div className="momentum-score-fill" style={{ width: `${Math.round(momentum.score * 100)}%`, background: momentum.color }} />
                      </div>
                      <span className="momentum-score-pct">{Math.round(momentum.score * 100)}% avg</span>
                    </div>
                  )}
                </div>

                {/* ── Recovery state ── */}
                {recoveryState.level !== "stable" && (
                  <div className={`status-card recovery-card recovery-${recoveryState.level}`}>
                    <div className="status-card-title"><AlertTriangle size={15} /> Recovery Signal</div>
                    <div className="recovery-level-row">
                      <span className="recovery-dot" style={{ background: recoveryState.color }} />
                      <span className="recovery-label" style={{ color: recoveryState.color }}>{recoveryState.label}</span>
                    </div>
                    <p className="recovery-desc">{recoveryState.desc}</p>
                    {recoveryState.advice && (
                      <div className="recovery-advice">
                        <span className="recovery-advice-label">What helps:</span>
                        {recoveryState.advice}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Pending Focus (deferred tasks) ── */}
                {deferredTasks.length > 0 && (
                  <div className="status-card deferred-card">
                    <div className="status-card-title"><RotateCcw size={15} /> Pending Focus</div>
                    <p className="deferred-intro">
                      {deferredTasks.length === 1
                        ? "1 task is still active — not failed, just waiting for the right moment."
                        : `${deferredTasks.length} tasks are still active — deferred, not forgotten.`}
                    </p>
                    <div className="deferred-list">
                      {deferredTasks.slice(0, 4).map((t) => (
                        <div key={t.id} className={`deferred-task-row deferred-${t.urgency}`}>
                          <div className="deferred-task-info">
                            <span className="deferred-task-name">{t.title}</span>
                            <span className="deferred-task-age">{t.daysDeferred}d pending</span>
                          </div>
                          <button
                            className="reschedule-btn"
                            onClick={() => askNORAtoReschedule(t)}>
                            <RotateCcw size={10} /> Reschedule
                          </button>
                        </div>
                      ))}
                    </div>
                    {deferredTasks.length > 1 && (
                      <button
                        className="rebalance-all-btn"
                        onClick={() => {
                          const titles = deferredTasks.slice(0, 4).map((t) => `"${t.title}"`).join(", ");
                          setChatInput(`I have ${deferredTasks.length} deferred tasks: ${titles}. Can you help me rebalance them across this week based on my current load?`);
                          setChatOpen(true);
                        }}>
                        Rebalance all with NORA
                      </button>
                    )}
                  </div>
                )}

                {/* ── Workload forecast ── */}
                <div className="status-card">
                  <div className="status-card-title"><BarChart2 size={15} /> Week Ahead</div>
                  <div className="workload-row">
                    {workloadForecast.map((day) => (
                      <div key={day.date} className={`workload-day${day.isToday ? " wl-today" : ""}`}>
                        <div className="wl-bar-wrap">
                          <div className={`wl-bar wl-${day.level}`}
                            style={{ height: `${Math.max(4, Math.round((day.load / maxWlLoad) * 100))}%` }}
                            title={`${day.load} task${day.load !== 1 ? "s" : ""}${day.mins ? `, ${Math.round(day.mins / 60)}h` : ""}`} />
                        </div>
                        <span className="wl-label">{day.label}</span>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const heavy = workloadForecast.filter((d) => d.level === "heavy");
                    return <p className="workload-note">{heavy.length > 0 ? `${heavy.map((d) => d.label).join(", ")} ${heavy.length === 1 ? "looks" : "look"} overloaded.` : workloadForecast.some((d) => d.level !== "free") ? "This week looks manageable — good pacing." : "Light week ahead."}</p>;
                  })()}
                </div>

                {/* ── Wellness ── */}
                <div className="status-card">
                  <div className="status-card-title"><Wind size={15} /> How are you feeling?</div>
                  <div className="wellness-row">
                    <div className="wellness-label-row">
                      <span className="wellness-name">Relaxation</span>
                      <span className="wellness-value">{relaxation}<span className="wellness-denom">/10</span></span>
                    </div>
                    <span className="wellness-desc">{relaxLabel}</span>
                    <input type="range" className="wellness-slider" min={0} max={10} step={1}
                      value={relaxation} onChange={(e) => setRelaxation(Number(e.target.value))} />
                    <div className="slider-ends"><span>Stressed</span><span>Relaxed</span></div>
                  </div>
                  <div className="wellness-row">
                    <div className="wellness-label-row">
                      <span className="wellness-name">Energy</span>
                      <span className="wellness-value energy-val">{energy}<span className="wellness-denom">/10</span></span>
                    </div>
                    <span className="wellness-desc">{energyLabel}</span>
                    <input type="range" className="wellness-slider energy-slider" min={0} max={10} step={1}
                      value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
                    <div className="slider-ends"><span>Exhausted</span><span>Energized</span></div>
                  </div>
                </div>

                {/* ── Today's progress ── */}
                <div className="status-card">
                  <div className="status-card-title"><Check size={15} /> Today's Progress</div>
                  <div className="status-stats-row">
                    <div className="status-stat">
                      <span className="status-stat-value">{doneToday}</span>
                      <span className="status-stat-label">Done</span>
                    </div>
                    <div className="status-stat">
                      <span className="status-stat-value">{Math.max(0, totalToday - doneToday)}</span>
                      <span className="status-stat-label">Pending</span>
                    </div>
                    <div className="status-stat">
                      <span className="status-stat-value">{pct}%</span>
                      <span className="status-stat-label">Complete</span>
                    </div>
                  </div>
                  {totalToday > 0
                    ? <div className="status-progress-bg"><div className="status-progress-fill" style={{ width: `${pct}%` }} /></div>
                    : <p className="status-empty-note">No tasks scheduled for today.</p>
                  }
                </div>

                {/* ── Most avoided + micro-start ── */}
                {mostAvoided && (
                  <div className="status-card avoided-card">
                    <div className="status-card-title"><Target size={15} /> Most Avoided Task</div>
                    <div className="avoided-task-name">{mostAvoided.task.title}</div>
                    <div className="avoided-meta">
                      {mostAvoided.daysOverdue} day{mostAvoided.daysOverdue !== 1 ? "s" : ""} overdue
                      {mostAvoided.count > 1 ? ` · ${mostAvoided.count} tasks waiting` : ""}
                    </div>
                    <div className="micro-start-label"><Lightbulb size={12} /> Start with just one of these:</div>
                    <ul className="micro-start-list">
                      {mostAvoided.microStarts.map((s, i) => (
                        <li key={i} className="micro-start-item">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── Focus patterns ── */}
                {focusPatterns && (
                  <div className="status-card">
                    <div className="status-card-title"><Activity size={15} /> Focus Patterns</div>
                    <div className="focus-bands">
                      {focusPatterns.bands.map((b) => (
                        <div key={b.key} className={`focus-band${b.key === focusPatterns.peak.key ? " focus-peak" : ""}`}>
                          <span className="focus-band-label">{b.label}</span>
                          <div className="focus-band-bar-wrap">
                            <div className="focus-band-fill" style={{ width: `${focusPatterns.total > 0 ? Math.round((b.count / focusPatterns.total) * 100) : 0}%` }} />
                          </div>
                          <span className="focus-band-pct">{focusPatterns.total > 0 ? Math.round((b.count / focusPatterns.total) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                    <p className="focus-peak-note">Peak: {focusPatterns.peak.label} ({focusPatterns.peak.range}) — {focusPatterns.peakPct}% of your completed work</p>
                  </div>
                )}

                {/* ── This week sparkline ── */}
                <div className="status-card">
                  <div className="status-card-title-row">
                    <div className="status-card-title" style={{ marginBottom: 0 }}><Activity size={15} /> This Week</div>
                    <span className={`trend-badge trend-${weekTrend}`}>
                      {weekTrend === "improving" ? <TrendingUp size={12} />
                        : weekTrend === "declining" ? <TrendingDown size={12} />
                        : <Minus size={12} />}
                      {weekTrend === "new" ? "Getting started" : weekTrend.charAt(0).toUpperCase() + weekTrend.slice(1)}
                    </span>
                  </div>
                  <div className="sparkline">
                    {weekData.map(({ date, done, total, rate }) => {
                      const d = new Date(date + "T00:00:00");
                      const label = ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()];
                      const isToday = date === today;
                      const barH = rate !== null ? Math.max(5, Math.round(rate * 48)) : 5;
                      return (
                        <div key={date} className="spark-col">
                          <div className="spark-bar-wrap">
                            <div
                              className={`spark-bar${rate === null ? " spark-empty" : ""}${isToday ? " spark-today" : ""}`}
                              style={{ height: `${barH}px` }}
                              title={total ? `${done}/${total} done` : "No tasks"} />
                          </div>
                          <span className={`spark-label${isToday ? " today" : ""}`}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Weekly reflection ── */}
                {weeklyReflection && (
                  <div className="status-card reflection-card">
                    <div className="status-card-title"><RotateCcw size={15} /> This Week's Patterns</div>
                    <ul className="reflection-list">
                      {weeklyReflection.insights.map((ins, i) => (
                        <li key={i} className={`reflection-item${i === 0 ? " reflection-lead" : ""}`}>{ins}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── Adaptive recommendations ── */}
                {adaptiveRecs.length > 0 && (
                  <div className="status-card reco-card">
                    <div className="status-card-title"><Lightbulb size={15} /> What NORA Sees</div>
                    <ul className="reco-list">
                      {adaptiveRecs.map((r, i) => <li key={i} className="reco-item">{r}</li>)}
                    </ul>
                  </div>
                )}

                {/* ── NORA's insight ── */}
                <div className="status-card status-insight">
                  <div className="status-card-title"><Zap size={15} /> NORA's read on you</div>
                  <p className="insight-text">{insightText}</p>
                </div>

              </div>
            );
          })()}

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
            <div><div className="chat-title">NORA</div><div className="chat-subtitle">Your productivity coach</div></div>
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
            onChange={(e) => {
              setChatInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Ask for advice, add tasks, or say 'how's my week looking?'" />
          <button className="chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
            {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {inAppAlert && (
        <div className="notif-toast" role="alert">
          <Bell size={18} className="notif-toast-icon" />
          <div className="notif-toast-text">
            <div className="notif-toast-title">{inAppAlert.title}</div>
            <div className="notif-toast-body">Starting in {inAppAlert.offset} min · {inAppAlert.timeStr}</div>
          </div>
          <button className="notif-toast-close" onClick={() => setInAppAlert(null)}><X size={14} /></button>
        </div>
      )}

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
              {draft.startHour != null && (
                <div className="modal-field">
                  <label className="field-label">Reminder</label>
                  <div className="reminder-dial">
                    <button
                      className={`reminder-btn none-opt${draft.reminderOffset === "none" ? " active" : ""}`}
                      onClick={() => setDraft((d) => ({ ...d, reminderOffset: d.reminderOffset === "none" ? null : "none" }))}>
                      None
                    </button>
                    {REMINDER_PRESETS.map((m) => (
                      <button key={m}
                        className={`reminder-btn${draft.reminderOffset === m ? " active" : ""}`}
                        onClick={() => setDraft((d) => ({ ...d, reminderOffset: d.reminderOffset === m ? null : m }))}>
                        {m} min
                      </button>
                    ))}
                  </div>
                  {draft.reminderOffset == null && (
                    <span className="field-hint">Default — {reminderMins} min before (from sidebar settings)</span>
                  )}
                </div>
              )}
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

function TaskChip({ task, group, onToggle, onReschedule, onSkip, onClick }) {
  const cx = task.complexity ? COMPLEXITY[task.complexity] : null;
  const todayLocal = fmtDate(new Date());
  const isDeferred = !task.completed && task.date < todayLocal;
  const timeStr = task.startHour != null ? fmtTime(task.startHour, task.startMinute ?? 0) : null;
  return (
    <div
      className={`task-chip${task.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
      style={{ "--gc": group?.color ?? cx?.color ?? "var(--accent)" }}
      draggable onDragStart={() => (window.__dragId = task.id)}>
      <div className="chip-header">
        <span className="chip-title">
          {task.title}
          {timeStr && <span className="chip-time"> — {timeStr}</span>}
        </span>
      </div>
      <div className="chip-actions">
        <button className={`tca tca-done${task.completed ? " active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}>
          <Check size={10} strokeWidth={3} /> Done
        </button>
        {!task.completed && onReschedule && (
          <button className="tca tca-resched"
            onClick={(e) => { e.stopPropagation(); onReschedule(task); }}>
            <RotateCcw size={10} /> Reschedule
          </button>
        )}
        {!task.completed && onSkip && (
          <button className="tca tca-skip"
            onClick={(e) => { e.stopPropagation(); onSkip(task.id); }}>
            <SkipForward size={10} /> Skip
          </button>
        )}
        <button className="tca tca-edit"
          onClick={(e) => { e.stopPropagation(); onClick(task); }}>
          <Pencil size={10} /> Edit
        </button>
      </div>
    </div>
  );
}
