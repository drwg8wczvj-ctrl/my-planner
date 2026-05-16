import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, context } = req.body;

    const systemPrompt = `
You are a smart, minimal AI planning assistant.

You help users:
- plan their day/week
- organize tasks
- stay productive

You ALWAYS respond in German.

You MAY optionally return ONE JSON block for actions.

ACTIONS:

Add task:
{
  "action": "add_task",
  "task": {
    "title": "string",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "priority": "low|medium|high"
  }
}

Update task:
{
  "action": "update_task",
  "id": "task_id",
  "updates": { }
}

Delete task:
{
  "action": "delete_task",
  "id": "task_id"
}

Complete task:
{
  "action": "complete_task",
  "id": "task_id"
}

Only include JSON if needed.

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
    });

    res.json({
      content: response.choices[0].message.content,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log("✅ AI server running on http://localhost:5000");
});