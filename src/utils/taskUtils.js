// Returns a cognitive load weight 1–5 for a task.
// 3 is the neutral default; breaks always return 1.
export function calculateTaskWeight(task, today) {
  if (!task || task.type === "break") return 1;

  // Duration-based baseline
  let weight = 3;
  const dur = task.duration;
  if (dur != null) {
    if (dur <= 10)      weight = 1;
    else if (dur <= 25) weight = 2;
    else if (dur <= 60) weight = 3;
    else if (dur <= 90) weight = 4;
    else                weight = 5;
  }

  // Complexity field
  if (task.complexity === "easy") weight = Math.max(1, weight - 1);
  if (task.complexity === "hard") weight = Math.min(5, weight + 1);

  // Title keywords — high cognitive/emotional demand
  const tl = (task.title ?? "").toLowerCase();
  if (/exam|interview|presentation|pitch|defend|deadline/.test(tl))
    weight = Math.min(5, weight + 1);
  else if (/study|write|code|build|implement|decide|design|analyze|plan|review/.test(tl))
    weight = Math.min(5, weight + 0.5);

  // Urgency boost
  if (today && task.date) {
    const daysUntil = Math.round(
      (new Date(task.date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000
    );
    if (daysUntil < 0)       weight = Math.min(5, weight + 1);    // overdue
    else if (daysUntil === 0) weight = Math.min(5, weight + 0.5); // due today
  }

  return Math.min(5, Math.max(1, Math.round(weight)));
}
