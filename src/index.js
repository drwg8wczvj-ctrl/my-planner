import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import openai from "./openaiClient";

// Quick smoke-test: log a haiku to the console on startup
openai.responses
  .create({
    model: "gpt-4o-mini",
    input: "write a haiku about ai",
    store: false,
  })
  .then((result) => console.log("[OpenAI test]", result.output_text))
  .catch((err) => console.warn("[OpenAI test] skipped —", err.message));

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
