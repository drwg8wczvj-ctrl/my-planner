import React, { useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

export default function AuthScreen({ dark }) {
  const [mode,     setMode]     = useState("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  const switchMode = (m) => { setMode(m); setError(""); setSuccess(""); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Account created — check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in App.js handles the rest
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app${dark ? " dark" : ""} auth-wrap`}>
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-logo">N</div>
          <span className="auth-app-name">NORA</span>
        </div>
        <p className="auth-tagline">Your personal productivity assistant</p>

        <div className="auth-tabs">
          <button className={`auth-tab${mode === "signin" ? " active" : ""}`} onClick={() => switchMode("signin")}>
            Sign in
          </button>
          <button className={`auth-tab${mode === "signup" ? " active" : ""}`} onClick={() => switchMode("signup")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="auth-input"
            type="password"
            placeholder={mode === "signup" ? "Password (min 6 chars)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error   && <p className="auth-msg auth-error">{error}</p>}
          {success && <p className="auth-msg auth-success">{success}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

      </div>
    </div>
  );
}
