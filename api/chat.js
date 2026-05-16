const PRODUCTIVITY_KB = {
  pomodoro: {
    name: "Pomodoro Technique",
    description: "Work in 25-minute focused intervals separated by 5-minute breaks. After 4 pomodoros, take a 15-30 minute break.",
    best_for: "Tasks requiring sustained concentration, reducing mental fatigue",
    tips: ["Set a timer for 25 minutes and eliminate all distractions", "Take a real break — no screens during 5-minute pauses", "After 4 pomodoros, reward yourself with a 20-minute break"],
  },
  deep_work: {
    name: "Deep Work",
    description: "Schedule 2-4 hour blocks for cognitively demanding work that requires full concentration. Protect these blocks ruthlessly.",
    best_for: "Creative work, complex problem-solving, learning new skills",
    tips: ["Work during your peak energy hours", "Use a shutdown ritual to signal the end of work sessions", "Avoid shallow work (email, Slack) during deep work blocks"],
  },
  time_blocking: {
    name: "Time Blocking",
    description: "Assign every hour of your day to a specific task or category. Treat these blocks like meetings you cannot cancel.",
    best_for: "Preventing context-switching, ensuring important work gets done",
    tips: ["Block time for email at set hours — not on-demand", "Add 15-min buffer blocks between tasks", "Do a 5-minute morning review to adjust your blocks"],
  },
  gtd: {
    name: "Getting Things Done (GTD)",
    description: "Capture everything in a trusted system, clarify what action is needed, organize by context, review weekly, engage with confidence.",
    best_for: "Managing large numbers of tasks, reducing mental overhead",
    tips: ["Do a weekly review every Friday to close open loops", "Keep your inbox empty by processing it once daily", "Use contexts (@computer, @phone) to batch similar tasks"],
  },
  eat_the_frog: {
    name: "Eat the Frog",
    description: "Tackle your most important or most dreaded task first thing in the morning before anything else.",
    best_for: "Procrastination, building momentum, high-priority deliverables",
    tips: ["Identify your frog the night before", "Do not check email or messages before completing your frog", "One frog per day — do not eat the whole pond"],
  },
  energy_management: {
    name: "Energy Management",
    description: "Match task complexity to your energy levels. Do cognitively demanding work at peak energy, admin tasks at low energy.",
    best_for: "Sustained performance, avoiding burnout, working with your chronotype",
    tips: ["Track when you feel most alert for 1 week to find your peak", "Schedule creative work at peak, email at trough", "Protect sleep — it determines tomorrow's peak energy"],
  },
  task_batching: {
    name: "Task Batching",
    description: "Group similar tasks together and do them in one session to reduce context-switching overhead.",
    best_for: "Email, calls, admin work, coding similar features",
    tips: ["Process email in 2-3 batches per day, not continuously", "Batch all meetings to one or two days per week", "Create a dedicated 'shallow work' block for quick tasks"],
  },
  weekly_review: {
    name: "Weekly Review",
    description: "A recurring ritual to capture loose ends, review commitments, update your task list, and intentionally plan the coming week.",
    best_for: "Staying on top of long-term goals, preventing tasks from slipping through cracks",
    tips: ["Block 30-60 min every Friday afternoon for this", "Review your calendar for the coming week and pre-decide priorities", "Ask yourself: What went well? What needs attention next week?"],
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set in environment variables" });
  }

  const { messages, tools } = req.body;

  const researchTool = {
    type: "function",
    function: {
      name: "research_productivity",
      description: "Look up a productivity technique from the knowledge base to give the user evidence-based, specific advice.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: ["pomodoro", "deep_work", "time_blocking", "gtd", "eat_the_frog", "energy_management", "task_batching", "weekly_review"],
            description: "The productivity technique to look up.",
          },
        },
        required: ["topic"],
      },
    },
  };

  const allTools = [...(tools || []), researchTool];
  let apiMsgs = [...messages];

  try {
    for (let iter = 0; iter < 6; iter++) {
      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-4.1-mini", messages: apiMsgs, tools: allTools }),
      });

      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status).json(data);

      const msg = data.choices[0].message;
      apiMsgs = [...apiMsgs, msg];

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return res.status(200).json(data);
      }

      const researchCalls = msg.tool_calls.filter((tc) => tc.function.name === "research_productivity");
      const taskCalls = msg.tool_calls.filter((tc) => tc.function.name !== "research_productivity");

      // Task tool calls go back to the frontend to execute
      if (taskCalls.length > 0) {
        return res.status(200).json(data);
      }

      // Handle research tool calls server-side in the loop
      for (const tc of researchCalls) {
        let result;
        try {
          const { topic } = JSON.parse(tc.function.arguments);
          const entry = PRODUCTIVITY_KB[topic];
          result = entry
            ? JSON.stringify({ found: true, ...entry })
            : JSON.stringify({
                found: false,
                available_topics: Object.keys(PRODUCTIVITY_KB),
                message: `Topic '${topic}' not found in knowledge base.`,
              });
        } catch {
          result = JSON.stringify({ error: "Could not parse topic argument" });
        }
        apiMsgs = [
          ...apiMsgs,
          { role: "tool", tool_call_id: tc.id, content: result },
        ];
      }
    }

    return res.status(500).json({ error: "Max iterations reached without a final response" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
