import React, { useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

// Earliest plausible birthday that won't break age display
const MIN_BIRTHDAY = "1920-01-01";
// Must be at least 10 years old
const maxBirthday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
};

export default function AuthScreen({ dark }) {
  const [mode,     setMode]     = useState("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  const switchMode = (m) => {
    setMode(m); setError(""); setSuccess("");
    setName(""); setBirthday("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name:     name.trim() || null,
              birthday: birthday    || null,
            },
          },
        });
        if (error) throw error;
        setSuccess("Account created — check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in App.js handles the rest
      }
    } catch (err) {
      if (err.message === "Load failed" || err.message === "Failed to fetch") {
        setError("Cannot reach Supabase — check that your project is active and the environment variables are set in Vercel.");
      } else {
        setError(err.message);
      }
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

          {mode === "signup" && (
            <>
              <input
                className="auth-input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="auth-field">
                <label className="auth-field-label">Birthday</label>
                <input
                  className="auth-input"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  min={MIN_BIRTHDAY}
                  max={maxBirthday()}
                  required
                />
              </div>
            </>
          )}

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
