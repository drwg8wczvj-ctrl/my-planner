import { supabase } from "./supabase";

// ── Auth ─────────────────────────────────────────────────────

export const signIn  = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp  = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ── Tasks ─────────────────────────────────────────────────────

export async function createTask({ title, description, priority = "medium", scheduled_time = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, title, description, priority, scheduled_time })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rescheduleTask(id, scheduled_time) {
  return updateTask(id, { scheduled_time, status: "rescheduled" });
}

export async function markTaskCompleted(id) {
  return updateTask(id, { status: "completed" });
}

export async function getUserTasks({ status = null } = {}) {
  let query = supabase
    .from("tasks")
    .select("*")
    .order("scheduled_time", { ascending: true, nullsFirst: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── User Profile ──────────────────────────────────────────────

export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_profile")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Cross-device app data sync ────────────────────────────────

export async function loadUserData() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_app_data")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows yet
  return data ?? null;
}

export async function saveUserData({ tasks, groups, notes, preferences }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("user_app_data")
    .upsert({ user_id: user.id, tasks, groups, notes, preferences });
  if (error) throw error;
}

// ── AI context bundle ─────────────────────────────────────────
// Call before every NORA AI request to inject full user context

export async function getAIContext() {
  const [profile, tasks] = await Promise.all([
    getUserProfile(),
    getUserTasks(),
  ]);
  return {
    profile,
    active_tasks:    tasks.filter(t => t.status === "active"),
    deferred_tasks:  tasks.filter(t => t.status === "deferred" || t.status === "rescheduled"),
    completed_tasks: tasks.filter(t => t.status === "completed").slice(-20),
  };
}
