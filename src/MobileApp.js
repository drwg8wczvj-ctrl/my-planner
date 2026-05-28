import React, { useState, useRef, useEffect } from "react";
import {
  Check, ChevronLeft, ChevronRight, Clock, MessageSquare, X, Send,
  FileText, Trash2, User, RotateCcw, CalendarDays,
  Flag, Coffee, Bell, Activity, Wind, TrendingUp,
  TrendingDown, Minus, Brain, AlertTriangle,
  SkipForward, Sparkles, Plus, Settings,
  BarChart2, Zap, List, CheckSquare,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./MobileApp.css";

// ── Local helpers ────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2);
const pad  = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${pad(m)} ${suffix}`;
};
const fmtDur = (min) => {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${r}m`;
};

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
  const [mobileView, setMobileView] = useState("plan");
  const [planSubView, setPlanSubView] = useState("day");  // "day" | "month"
  const [dayMode, setDayMode] = useState("list");          // "list" | "grid"
  const { dark, chatOpen, setChatOpen, editingTask, draft, inAppAlert, setInAppAlert } = ctx;

  return (
    <div className={`app mob-app${dark ? " dark" : ""}`}>

      <MobileHeader ctx={ctx} />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} />}
        {mobileView === "tasks"    && <MobileTasks ctx={ctx} />}
        {mobileView === "notes"    && <MobileNotes ctx={ctx} />}
        {mobileView === "status"   && <MobileStatus ctx={ctx} />}
        {mobileView === "settings" && <MobileSettings ctx={ctx} />}
      </main>

      <nav className="mob-bottom-nav">
        {[
          ["plan",     "Plan",     <CalendarDays size={21} />],
          ["tasks",    "Tasks",    <CheckSquare size={21} />],
          ["notes",    "Notes",    <FileText size={21} />],
          ["status",   "Status",   <Activity size={21} />],
          ["settings", "Settings", <Settings size={21} />],
        ].map(([v, l, icon]) => (
          <button key={v}
            className={`mob-nav-btn${mobileView === v ? " mob-nav-active" : ""}`}
            onClick={() => setMobileView(v)}>
            {icon}
            <span>{l}</span>
          </button>
        ))}
      </nav>

      <button
        className={`mob-ai-fab${chatOpen ? " fab-open" : ""}`}
        onClick={() => setChatOpen((o) => !o)}>
        {chatOpen ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      <MobileChat ctx={ctx} />
      {editingTask && draft && <MobileEditModal ctx={ctx} />}
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

    </div>
  );
}

// ── Header ───────────────────────────────────────────────────
function MobileHeader({ ctx }) {
  const { today, dark } = ctx;
  const d = new Date(today + "T00:00:00");
  const dayName  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const dateText = `${dayName}, ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
  return (
    <header className="mob-header">
      <img
        src={dark ? "/logo-dark.png" : "/logo-light.png"}
        className="mob-brand-logo"
        alt="NORA" />
      <span className="mob-header-date">{dateText}</span>
    </header>
  );
}

// ── Plan view (Day / Month) ───────────────────────────────────
function MobilePlan({ ctx, subView, setSubView, dayMode, setDayMode }) {
  return (
    <div className="mob-plan">
      {/* Sub-view toggle */}
      <div className="mob-plan-segs">
        <div className={`mob-seg-pill mob-seg-pill-${subView === "day" ? 0 : 1}`} />
        <button className={`mob-seg-btn${subView === "day" ? " active" : ""}`} onClick={() => setSubView("day")}>Day</button>
        <button className={`mob-seg-btn${subView === "month" ? " active" : ""}`} onClick={() => setSubView("month")}>Month</button>
      </div>

      {subView === "day" && (
        <>
          {/* List / Grid toggle inside Day */}
          <div className="mob-day-mode-row">
            <button className={`mob-mode-btn${dayMode === "list" ? " active" : ""}`} onClick={() => setDayMode("list")}>
              <List size={14} /> List
            </button>
            <button className={`mob-mode-btn${dayMode === "grid" ? " active" : ""}`} onClick={() => setDayMode("grid")}>
              <BarChart2 size={14} /> Grid
            </button>
          </div>
          {dayMode === "list" ? <MobileHome ctx={ctx} /> : <MobileGrid ctx={ctx} />}
        </>
      )}

      {subView === "month" && <MobileMonth ctx={ctx} />}
    </div>
  );
}

// ── Home view (Day list mode) ────────────────────────────────
function MobileHome({ ctx }) {
  const {
    todayTasks, today, aiFocus, contextMode, deferredTasks,
    doneToday, totalToday, pct, toggleTask, skipTask,
    setChatInput, setChatOpen, setEditingTask,
    groups, nowObj,
  } = ctx;

  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();

  const scheduled = [...todayTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));

  const nextTask = scheduled.find(
    (t) => !t.completed && t.startHour * 60 + (t.startMinute ?? 0) >= nowMins
  );

  const getGroup = (id) => groups.find((g) => g.id === id);

  return (
    <div className="mob-home">

      {/* AI Focus Card */}
      <div className="mob-focus-card">
        <div className="mob-focus-card-top">
          <span className="mob-ctx-badge" style={{
            background: `${contextMode.color}1a`,
            color: contextMode.color,
            borderColor: `${contextMode.color}40`,
          }}>
            <Sparkles size={11} /> {contextMode.label}
          </span>
          {totalToday > 0 && (
            <span className="mob-done-pill">{doneToday}/{totalToday}</span>
          )}
        </div>

        {aiFocus.priorityTask ? (
          <>
            <p className="mob-focus-eyebrow">Focus on next</p>
            <h2 className="mob-focus-title">{aiFocus.priorityTask.title}</h2>
            {aiFocus.priorityTask.startHour != null && (
              <p className="mob-focus-time">
                {fmtTime(aiFocus.priorityTask.startHour, aiFocus.priorityTask.startMinute ?? 0)}
                {aiFocus.priorityTask.duration ? ` · ${fmtDur(aiFocus.priorityTask.duration)}` : ""}
              </p>
            )}
          </>
        ) : (
          <h2 className="mob-focus-title mob-focus-empty">You're all caught up.</h2>
        )}

        <p className="mob-focus-insight">{aiFocus.insight}</p>

        {totalToday > 0 && (
          <div className="mob-progress-track">
            <div className="mob-progress-fill" style={{ width: `${pct}%`, background: contextMode.color }} />
          </div>
        )}

        {/* Action buttons */}
        <div className="mob-focus-actions">
          {aiFocus.priorityTask && (
            <button className="mob-btn mob-btn-done" onClick={() => toggleTask(aiFocus.priorityTask.id)}>
              <Check size={17} /> Done
            </button>
          )}
          {aiFocus.priorityTask && (
            <button className="mob-btn mob-btn-skip" onClick={() => skipTask(aiFocus.priorityTask.id)}>
              <SkipForward size={17} /> Later
            </button>
          )}
          <button className="mob-btn mob-btn-ai" onClick={() => {
            setChatInput(aiFocus.priorityTask
              ? `What's the best way to tackle "${aiFocus.priorityTask.title}" right now?`
              : "What should I focus on today?");
            setChatOpen(true);
          }}>
            <MessageSquare size={17} /> Ask NORA
          </button>
        </div>
      </div>

      {/* Deferred nudge */}
      {deferredTasks.length > 0 && (
        <button className="mob-nudge-bar" onClick={() => {
          setChatInput(`I have ${deferredTasks.length} deferred task${deferredTasks.length > 1 ? "s" : ""}. Can you help me find the best time for them this week?`);
          setChatOpen(true);
        }}>
          <RotateCcw size={14} />
          <span>{deferredTasks.length} task{deferredTasks.length > 1 ? "s" : ""} still pending — tap to reschedule</span>
          <ChevronRight size={14} />
        </button>
      )}

      {/* Mini agenda */}
      {scheduled.length > 0 ? (
        <div className="mob-agenda">
          <div className="mob-section-title">
            <Clock size={14} /> Today's Schedule
          </div>
          {scheduled.map((t) => {
            const tp    = t.type ?? "task";
            const group = getGroup(t.groupId);
            const gc    = tp === "deadline" ? "#ef4444"
                        : tp === "break"    ? "#94a3b8"
                        : group?.color ?? "var(--accent)";
            const tMins = t.startHour * 60 + (t.startMinute ?? 0);
            const isPast = tMins < nowMins;
            const isNext = t === nextTask;
            return (
              <div key={t.id}
                className={`mob-agenda-item${t.completed ? " mai-done" : ""}${isPast && !t.completed ? " mai-past" : ""}${isNext ? " mai-next" : ""}${tp === "break" ? " mai-break" : ""}${tp === "deadline" ? " mai-dl" : ""}`}
                style={{ "--gc": gc }}
                onClick={() => setEditingTask(t)}>

                <div className="mai-time-col">
                  <span className="mai-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                  {t.duration && <span className="mai-dur">{fmtDur(t.duration)}</span>}
                </div>

                <div className="mai-body">
                  <span className="mai-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                  {isNext && <span className="mai-next-tag">Up next</span>}
                </div>

                {tp === "task" ? (
                  <button
                    className={`mai-check${t.completed ? " checked" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed ? <Check size={14} strokeWidth={3} /> : null}
                  </button>
                ) : (
                  <span className="mai-type-icon">
                    {tp === "break" ? <Coffee size={14} /> : <Flag size={14} />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mob-empty-state">
          <Sparkles size={36} style={{ opacity: .15 }} />
          <p>Nothing scheduled today.</p>
          <button className="mob-plan-cta" onClick={() => {
            setChatInput("Plan my day. Consider my energy level and current workload.");
            setChatOpen(true);
          }}>
            <Sparkles size={15} /> Let NORA plan my day
          </button>
        </div>
      )}

      {/* Quick add */}
      <button className="mob-quick-add" onClick={() => {
        ctx.setEditingTask({
          id: uid(), type: "task",
          title: "", date: today,
          startHour: null, startMinute: null,
          duration: null, repeat: null, repeatEnd: null,
          completed: false, notes: "", complexity: null,
          groupId: null, reminderOffset: null,
        });
      }}>
        <Plus size={18} /> Add task
      </button>

    </div>
  );
}

// ── Grid view (24h timeline) ─────────────────────────────────
function MobileGrid({ ctx }) {
  const { todayTasks, nowObj, toggleTask, setEditingTask } = ctx;
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const CELL = 64; // px per hour
  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
  const gridRef = useRef(null);

  useEffect(() => {
    if (gridRef.current) {
      const scrollTo = Math.max(0, (nowMins / 60) * CELL - 120);
      gridRef.current.scrollTop = scrollTo;
    }
  }, []); // eslint-disable-line

  const scheduled = todayTasks.filter((t) => t.startHour != null);

  const fmt = (h) => h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

  return (
    <div className="mob-grid-scroll" ref={gridRef}>
      <div className="mob-grid-inner" style={{ height: 24 * CELL + 32 }}>
        {/* Hour rows */}
        {HOURS.map((h) => (
          <div key={h} className="mob-grid-hour-row" style={{ top: h * CELL + 16, height: CELL }}>
            <span className="mob-grid-h-label">{fmt(h)}</span>
            <div className="mob-grid-h-line" />
          </div>
        ))}

        {/* Current time line */}
        <div className="mob-grid-now-wrap" style={{ top: (nowMins / 60) * CELL + 16 }}>
          <div className="mob-grid-now-dot" />
          <div className="mob-grid-now-line" />
        </div>

        {/* Task blocks */}
        <div className="mob-grid-blocks">
          {scheduled.map((t) => {
            const startMin = t.startHour * 60 + (t.startMinute ?? 0);
            const dur = t.duration ?? 30;
            const top = (startMin / 60) * CELL + 16;
            const height = Math.max(28, (dur / 60) * CELL - 3);
            const tp = t.type ?? "task";
            const color = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : "var(--accent)";
            return (
              <div key={t.id}
                className={`mob-grid-block${t.completed ? " mob-gb-done" : ""}`}
                style={{ top, height, borderLeftColor: color, background: `${color}18` }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-gb-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                {t.duration && <span className="mob-gb-dur">{fmtDur(t.duration)}</span>}
                {tp === "task" && (
                  <button
                    className={`mob-gb-check${t.completed ? " checked" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed && <Check size={10} strokeWidth={3} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month / Calendar view ────────────────────────────────────
function MobileMonth({ ctx }) {
  const { tasks, today, setEditingTask } = ctx;
  const [cur, setCur] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [sel, setSel] = useState(today);

  const { year, month } = cur;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const taskMap = {};
  tasks.forEach((t) => {
    if (!taskMap[t.date]) taskMap[t.date] = [];
    taskMap[t.date].push(t);
  });

  const shiftMonth = (d) => {
    setCur(({ year, month }) => {
      let nm = month + d, ny = year;
      if (nm < 0) { nm = 11; ny--; }
      if (nm > 11) { nm = 0; ny++; }
      return { year: ny, month: nm };
    });
  };

  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, ds, ts: taskMap[ds] || [] };
  });

  const selTasks = taskMap[sel] || [];

  return (
    <div className="mob-month-view">
      <div className="mob-month-nav">
        <button className="mob-month-nav-btn" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
        <span className="mob-month-title">{MONTHS[month]} {year}</span>
        <button className="mob-month-nav-btn" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
      </div>

      <div className="mob-cal-grid">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <div key={d} className="mob-cal-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="mob-cal-empty" />;
          const { day, ds, ts } = cell;
          const isToday = ds === today;
          const isSel = ds === sel;
          const hasDl = ts.some((t) => t.type === "deadline");
          const taskCount = ts.filter((t) => t.type !== "break").length;
          return (
            <div key={ds}
              className={`mob-cal-cell${isToday ? " mob-cal-today" : ""}${isSel ? " mob-cal-sel" : ""}`}
              onClick={() => setSel(ds)}>
              <span className="mob-cal-num">{day}</span>
              <div className="mob-cal-dots">
                {hasDl && <span className="mob-dot mob-dot-dl" />}
                {taskCount > 0 && <span className="mob-dot" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mob-cal-day-panel">
        <div className="mob-section-title">
          <CalendarDays size={13} />
          {sel === today ? "Today" : sel}
          <span className="mob-cal-task-count">{selTasks.length} item{selTasks.length !== 1 ? "s" : ""}</span>
        </div>
        {selTasks.length === 0 ? (
          <p className="mob-cal-empty-msg">Nothing planned</p>
        ) : (
          selTasks.map((t) => {
            const tp = t.type ?? "task";
            const color = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : "var(--accent)";
            return (
              <div key={t.id} className={`mob-cal-task-row${t.completed ? " done" : ""}`}
                style={{ borderLeftColor: color }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-cal-task-name">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                {t.startHour != null && <span className="mob-cal-task-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Tasks view ───────────────────────────────────────────────
function MobileTasks({ ctx }) {
  const { tasks, today, toggleTask, skipTask, askNORAtoReschedule, setEditingTask, groups } = ctx;

  const getGroup = (id) => groups.find((g) => g.id === id);

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const at = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
    const bt = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
    return at - bt;
  });

  const todayItems  = sorted.filter((t) => t.date === today && !t.completed);
  const upcoming    = sorted.filter((t) => t.date > today && !t.completed);
  const deferred    = sorted.filter((t) => t.date < today && !t.completed);
  const completed   = sorted.filter((t) => t.completed).slice(0, 10);

  const renderTask = (t, showDate = false) => {
    const tp    = t.type ?? "task";
    const group = getGroup(t.groupId);
    const gc    = tp === "deadline" ? "#ef4444"
                : tp === "break"    ? "#94a3b8"
                : group?.color ?? "var(--accent)";
    const isDeferred = tp === "task" && !t.completed && t.date < today;
    return (
      <div key={t.id}
        className={`mob-task-row${t.completed ? " mtr-done" : ""}${isDeferred ? " mtr-deferred" : ""}`}
        style={{ "--gc": gc }}
        onClick={() => setEditingTask(t)}>

        <div className="mtr-left">
          {tp === "task" ? (
            <button className={`mob-check${t.completed ? " checked" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
              {t.completed && <Check size={13} strokeWidth={3} />}
            </button>
          ) : (
            <span className="mtr-icon">
              {tp === "deadline" ? <Flag size={14} style={{ color: "#ef4444" }} />
                                 : <Coffee size={14} style={{ color: "#94a3b8" }} />}
            </span>
          )}
        </div>

        <div className="mtr-body">
          <span className="mtr-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
          <span className="mtr-meta">
            {showDate && <span>{t.date === today ? "Today" : t.date} </span>}
            {t.startHour != null && <span>{fmtTime(t.startHour, t.startMinute ?? 0)} </span>}
            {t.duration && <span>{fmtDur(t.duration)}</span>}
          </span>
        </div>

        {tp === "task" && !t.completed && (
          <div className="mtr-actions" onClick={(e) => e.stopPropagation()}>
            <button className="mtr-act" title="Skip to tomorrow" onClick={() => skipTask(t.id)}>
              <SkipForward size={15} />
            </button>
            <button className="mtr-act mtr-act-ai" title="Ask NORA to reschedule" onClick={() => askNORAtoReschedule(t)}>
              <RotateCcw size={15} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, items, showDate = false }) => {
    if (!items.length) return null;
    return (
      <div className="mob-tasks-section">
        <div className="mob-section-title">{title}</div>
        {items.map((t) => renderTask(t, showDate))}
      </div>
    );
  };

  return (
    <div className="mob-tasks">
      {tasks.length === 0 ? (
        <div className="mob-empty-state">
          <CalendarDays size={36} style={{ opacity: .15 }} />
          <p>No tasks yet.</p>
        </div>
      ) : (
        <>
          <Section title="Today"    items={todayItems} />
          <Section title="Pending"  items={deferred} showDate />
          <Section title="Upcoming" items={upcoming} showDate />
          <Section title="Done"     items={completed} showDate />
        </>
      )}

      <button className="mob-quick-add" onClick={() => {
        ctx.setEditingTask({
          id: uid(), type: "task", title: "", date: today,
          startHour: null, startMinute: null, duration: null,
          repeat: null, repeatEnd: null, completed: false,
          notes: "", complexity: null, groupId: null, reminderOffset: null,
        });
      }}>
        <Plus size={18} /> Add task
      </button>
    </div>
  );
}

// ── Notes view ───────────────────────────────────────────────
function MobileNotes({ ctx }) {
  const { notes, setNotes, toggleNote, updateNote, deleteNote } = ctx;
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const addNote = () => {
    if (!text.trim()) return;
    setNotes((p) => [...p, { id: uid(), content: text.trim(), done: false, createdAt: Date.now() }]);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="mob-notes">
      <div className="mob-notes-add-bar">
        <textarea
          ref={inputRef}
          className="mob-notes-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
          placeholder="Write a note…"
          rows={2} />
        <button className="mob-notes-add-btn" onClick={addNote} disabled={!text.trim()}>
          <Plus size={20} />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="mob-empty-state">
          <FileText size={36} style={{ opacity: .15 }} />
          <p>No notes yet.</p>
        </div>
      ) : (
        <div className="mob-notes-list">
          {[...notes].reverse().map((note) => (
            <div key={note.id} className={`mob-note-card${note.done ? " done" : ""}`}>
              <button
                className={`mob-note-check${note.done ? " checked" : ""}`}
                onClick={() => toggleNote(note.id)}>
                {note.done && <Check size={12} strokeWidth={3} />}
              </button>
              <textarea
                className="mob-note-text"
                value={note.content}
                onChange={(e) => updateNote(note.id, e.target.value)}
                rows={1}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }} />
              <button className="mob-note-del" onClick={() => deleteNote(note.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status view ──────────────────────────────────────────────
function MobileStatus({ ctx }) {
  const {
    energy, setEnergy, relaxation, setRelaxation,
    momentum, recoveryState, workloadForecast, weekData, weekTrend,
    adaptiveRecs, deferredTasks, askNORAtoReschedule,
    setChatInput, setChatOpen, doneToday, totalToday, pct,
    noraState,
  } = ctx;

  const maxWl = Math.max(...workloadForecast.map((d) => d.load), 1);

  return (
    <div className="mob-status">

      {/* NORA State */}
      <div className="mob-status-card mob-nora-card" style={{ borderTop: `3px solid ${noraState.color}` }}>
        <div className="mob-status-card-title"><Sparkles size={15} /> NORA State</div>
        <div className="mob-momentum-row">
          <span className="mob-momentum-dot" style={{ background: noraState.color }} />
          <span className="mob-momentum-label" style={{ color: noraState.color }}>{noraState.label}</span>
          <span className="mob-state-conf">{noraState.confidence}</span>
        </div>
        <p className="mob-status-desc">{({
          "peak_focus":        "You're in an ideal state for deep, high-quality work.",
          "building_momentum": "Momentum is building — keep the streak alive.",
          "steady_flow":       "Consistent and stable. Good conditions for focused progress.",
          "high_load":         "High cognitive load. Consider prioritising or delegating.",
          "recovery_day":      "Your system needs rest. Protect your energy today.",
          "focus_mode":        "Standard mode. Tackle tasks at a comfortable pace.",
        }[noraState.key] ?? "NORA is monitoring your state.")}</p>
      </div>

      {/* Wellness */}
      <div className="mob-status-card">
        <div className="mob-status-card-title"><Wind size={15} /> How are you feeling?</div>
        {[
          { label: "Relaxation", value: relaxation, set: setRelaxation, lo: "Stressed", hi: "Relaxed",
            cls: "mob-slider-relax" },
          { label: "Energy", value: energy, set: setEnergy, lo: "Exhausted", hi: "Energized",
            cls: "mob-slider-energy" },
        ].map(({ label, value, set, lo, hi, cls }) => (
          <div key={label} className="mob-wellness-row">
            <div className="mob-wellness-top">
              <span className="mob-wellness-lbl">{label}</span>
              <span className="mob-wellness-val">{value}<span className="mob-wellness-denom">/10</span></span>
            </div>
            <input type="range" className={`mob-slider ${cls}`}
              min={0} max={10} step={1} value={value}
              onChange={(e) => set(Number(e.target.value))} />
            <div className="mob-slider-ends"><span>{lo}</span><span>{hi}</span></div>
          </div>
        ))}
      </div>

      {/* Momentum */}
      <div className="mob-status-card">
        <div className="mob-status-card-title"><Brain size={15} /> Momentum</div>
        <div className="mob-momentum-row">
          <span className="mob-momentum-dot" style={{ background: momentum.color }} />
          <span className="mob-momentum-label" style={{ color: momentum.color }}>{momentum.label}</span>
        </div>
        <p className="mob-status-desc">{momentum.desc}</p>
        {momentum.score != null && (
          <div className="mob-momentum-bar-wrap">
            <div className="mob-momentum-fill" style={{ width: `${Math.round(momentum.score * 100)}%`, background: momentum.color }} />
          </div>
        )}
      </div>

      {/* Recovery signal */}
      {recoveryState.level !== "stable" && (
        <div className={`mob-status-card mob-recovery-card recovery-${recoveryState.level}`}>
          <div className="mob-status-card-title"><AlertTriangle size={15} /> Recovery Signal</div>
          <div className="mob-momentum-row">
            <span className="mob-momentum-dot" style={{ background: recoveryState.color }} />
            <span className="mob-momentum-label" style={{ color: recoveryState.color }}>{recoveryState.label}</span>
          </div>
          <p className="mob-status-desc">{recoveryState.desc}</p>
          {recoveryState.advice && (
            <p className="mob-recovery-advice">{recoveryState.advice}</p>
          )}
        </div>
      )}

      {/* Today's progress */}
      {totalToday > 0 && (
        <div className="mob-status-card">
          <div className="mob-status-card-title"><Activity size={15} /> Today's Progress</div>
          <div className="mob-progress-stats">
            <span className="mob-progress-big">{doneToday}/{totalToday}</span>
            <span className="mob-progress-pct">{pct}% done</span>
          </div>
          <div className="mob-progress-track" style={{ marginTop: 10 }}>
            <div className="mob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Week ahead */}
      <div className="mob-status-card">
        <div className="mob-status-card-title"><BarChart2 size={15} /> Week Ahead</div>
        <div className="mob-workload-row">
          {workloadForecast.map((day) => (
            <div key={day.date} className={`mob-wl-day${day.isToday ? " mob-wl-today" : ""}`}>
              <div className="mob-wl-bar-wrap">
                <div className={`mob-wl-bar mob-wl-${day.level}`}
                  style={{ height: `${Math.max(4, Math.round((day.load / maxWl) * 52))}px` }} />
              </div>
              <span className="mob-wl-label">{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* This week sparkline */}
      <div className="mob-status-card">
        <div className="mob-status-card-top">
          <div className="mob-status-card-title" style={{ marginBottom: 0 }}>
            <Activity size={15} /> This Week
          </div>
          <span className={`mob-trend-badge mob-trend-${weekTrend}`}>
            {weekTrend === "improving" ? <TrendingUp size={12} />
              : weekTrend === "declining" ? <TrendingDown size={12} />
              : <Minus size={12} />}
            {weekTrend === "new" ? "Starting" : weekTrend.charAt(0).toUpperCase() + weekTrend.slice(1)}
          </span>
        </div>
        <div className="mob-sparkline">
          {weekData.map(({ date, done, total, rate }) => {
            const d = new Date(date + "T00:00:00");
            const label = ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()];
            const isT = date === ctx.today;
            const h = rate != null ? Math.max(4, Math.round(rate * 44)) : 4;
            return (
              <div key={date} className="mob-spark-col">
                <div className="mob-spark-bar-wrap">
                  <div className={`mob-spark-bar${rate == null ? " empty" : ""}${isT ? " today" : ""}`}
                    style={{ height: h }} />
                </div>
                <span className={`mob-spark-lbl${isT ? " today" : ""}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending deferred tasks */}
      {deferredTasks.length > 0 && (
        <div className="mob-status-card mob-deferred-card">
          <div className="mob-status-card-title"><RotateCcw size={15} /> Pending Focus</div>
          <p className="mob-status-desc">
            {deferredTasks.length === 1
              ? "1 task still active — not failed, just waiting."
              : `${deferredTasks.length} tasks still active — deferred, not forgotten.`}
          </p>
          {deferredTasks.slice(0, 3).map((t) => (
            <div key={t.id} className={`mob-deferred-row mob-def-${t.urgency}`}>
              <div className="mob-def-info">
                <span className="mob-def-name">{t.title}</span>
                <span className="mob-def-age">{t.daysDeferred}d pending</span>
              </div>
              <button className="mob-def-btn" onClick={() => askNORAtoReschedule(t)}>
                <RotateCcw size={12} />
              </button>
            </div>
          ))}
          {deferredTasks.length > 1 && (
            <button className="mob-rebalance-btn" onClick={() => {
              const titles = deferredTasks.slice(0, 4).map((t) => `"${t.title}"`).join(", ");
              setChatInput(`I have ${deferredTasks.length} deferred tasks: ${titles}. Help me rebalance them across this week.`);
              setChatOpen(true);
            }}>
              Rebalance all with NORA
            </button>
          )}
        </div>
      )}

      {/* NORA recommendations */}
      {adaptiveRecs.length > 0 && (
        <div className="mob-status-card">
          <div className="mob-status-card-title"><Zap size={15} /> NORA's Read on You</div>
          <ul className="mob-reco-list">
            {adaptiveRecs.map((r, i) => <li key={i} className="mob-reco-item">{r}</li>)}
          </ul>
        </div>
      )}

    </div>
  );
}

// ── Settings view ────────────────────────────────────────────
function MobileSettings({ ctx }) {
  const {
    accountName, setAccountName,
    dark, setDark,
    theme, setTheme,
    reminderMins, setReminderMins,
    session,
  } = ctx;

  return (
    <div className="mob-settings">
      {/* Profile */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> Profile</div>
        <div className="mob-sett-avatar-row">
          <div className="mob-sett-avatar">
            {(accountName?.trim()?.[0] ?? session?.user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="mob-sett-avatar-info">
            <span className="mob-sett-display-name">{accountName || "No name set"}</span>
            <span className="mob-sett-email-sm">{session?.user?.email}</span>
          </div>
        </div>
        <label className="mob-sett-label">Display name</label>
        <input
          className="mob-sett-input"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Your name" />
      </div>

      {/* Appearance */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Activity size={15} /> Appearance</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Dark mode</span>
          <button className={`mob-toggle${dark ? " on" : ""}`} onClick={() => setDark((d) => !d)}>
            <span className="mob-toggle-knob" />
          </button>
        </div>
        <div className="mob-sett-divider" />
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Theme</span>
        </div>
        <div className="mob-theme-pills">
          <button className={`mob-theme-pill${theme === "default" ? " active" : ""}`}
            onClick={() => setTheme("default")}>Default</button>
          <button className={`mob-theme-pill${theme === "liquid_glass" ? " active" : ""}`}
            onClick={() => setTheme("liquid_glass")}>✦ Liquid Glass</button>
        </div>
      </div>

      {/* Notifications */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Bell size={15} /> Notifications</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Default reminder</span>
          <select className="mob-sett-select"
            value={reminderMins}
            onChange={(e) => setReminderMins(Number(e.target.value))}>
            <option value={0}>At start</option>
            <option value={5}>5 min before</option>
            <option value={10}>10 min before</option>
            <option value={15}>15 min before</option>
            <option value={30}>30 min before</option>
            <option value={60}>1 hour before</option>
          </select>
        </div>
      </div>

      {/* Account */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> Account</div>
        <p className="mob-sett-email-text">{session?.user?.email}</p>
        <button className="mob-signout-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Chat overlay ─────────────────────────────────────────────
function MobileChat({ ctx }) {
  const { chatOpen, setChatOpen, messages, chatInput, setChatInput, chatLoading, sendChat } = ctx;
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  return (
    <div className={`mob-chat${chatOpen ? " mob-chat-open" : ""}`}>
      <div className="mob-chat-header">
        <div className="mob-chat-brand">
          <div className="mob-chat-avatar">N</div>
          <div>
            <div className="mob-chat-title-text">NORA</div>
            <div className="mob-chat-sub">Your productivity assistant</div>
          </div>
        </div>
        <button className="mob-chat-close" onClick={() => setChatOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <div className="mob-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`mob-chat-msg mob-chat-${m.role}`}>
            <div className="mob-chat-bubble">{m.content}</div>
          </div>
        ))}
        {chatLoading && (
          <div className="mob-chat-msg mob-chat-assistant">
            <div className="mob-chat-bubble mob-chat-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mob-chat-input-bar">
        <textarea
          ref={inputRef}
          className="mob-chat-input"
          value={chatInput}
          rows={1}
          onChange={(e) => {
            setChatInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
          }}
          placeholder="Ask NORA anything…" />
        <button className="mob-chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
          {chatLoading ? <span className="dot-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

// ── Task edit modal ───────────────────────────────────────────
function MobileEditModal({ ctx }) {
  const { draft, setDraft, saveTask, deleteTask, groups } = ctx; // eslint-disable-line

  const HOURS_RANGE = Array.from({ length: 18 }, (_, i) => i + 6);

  return (
    <div className="mob-modal-overlay" onClick={() => ctx.setEditingTask(null)}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>

        <div className="mob-modal-handle" />

        <div className="mob-modal-header">
          <input
            className="mob-modal-title-input"
            value={draft.title}
            placeholder="Task title"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            autoFocus />
          <button className="mob-modal-close" onClick={() => ctx.setEditingTask(null)}>
            <X size={20} />
          </button>
        </div>

        <div className="mob-modal-body">

          {/* Type */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Type</label>
            <div className="mob-type-row">
              {[["task","Task"],["deadline","Deadline"],["break","Break"]].map(([val, lbl]) => (
                <button key={val}
                  className={`mob-type-btn mob-type-${val}${(draft.type ?? "task") === val ? " active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, type: val }))}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Date</label>
            <input type="date" className="mob-modal-select"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </div>

          {/* Time */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Time</label>
            <div className="mob-time-row">
              <select className="mob-modal-select mob-time-select"
                value={draft.startHour ?? ""}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  startHour: e.target.value === "" ? null : Number(e.target.value),
                  startMinute: e.target.value === "" ? null : (d.startMinute ?? 0),
                }))}>
                <option value="">No time</option>
                {HOURS_RANGE.map((h) => <option key={h} value={h}>{fmtTime(h, 0)}</option>)}
              </select>
              <select className="mob-modal-select mob-min-select"
                disabled={draft.startHour == null}
                value={draft.startMinute ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, startMinute: Number(e.target.value) }))}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>{`:${pad(m)}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration */}
          {(draft.type ?? "task") !== "deadline" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Duration</label>
              <select className="mob-modal-select"
                value={draft.duration ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value === "" ? null : Number(e.target.value) }))}>
                <option value="">No duration</option>
                {Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((m) => (
                  <option key={m} value={m}>{fmtDur(m)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Repeat */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Repeat</label>
            <select className="mob-modal-select"
              value={draft.repeat ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, repeat: e.target.value || null }))}>
              <option value="">No repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </div>

          {/* Group */}
          {(draft.type ?? "task") === "task" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Group</label>
              <div className="mob-pill-row">
                {groups.map((g) => (
                  <button key={g.id}
                    className={`mob-pill${draft.groupId === g.id ? " active" : ""}`}
                    style={{ "--gc": g.color }}
                    onClick={() => setDraft((d) => ({ ...d, groupId: d.groupId === g.id ? null : g.id }))}>
                    <span className="mob-gdot" />{g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Notes</label>
            <textarea className="mob-modal-notes" rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Add notes…" />
          </div>

        </div>

        <div className="mob-modal-footer">
          <button className="mob-modal-delete" onClick={() => deleteTask(draft.id)}>
            <Trash2 size={15} /> Delete
          </button>
          <button className="mob-modal-save" onClick={saveTask}>Save</button>
        </div>

      </div>
    </div>
  );
}
