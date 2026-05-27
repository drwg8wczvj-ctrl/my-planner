import React, { useState } from "react";
import { supabase } from "./lib/supabase";
import { Eye, EyeOff } from "lucide-react";
import "./App.css";

function pwStrength(pw) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 6)  s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Weak",        color: "#ef4444" };
  if (s === 2) return { score: 2, label: "Fair",        color: "#f97316" };
  if (s === 3) return { score: 3, label: "Good",        color: "#eab308" };
  if (s === 4) return { score: 4, label: "Strong",      color: "#22c55e" };
  return             { score: 5, label: "Very strong",  color: "#16a34a" };
}

// Earliest plausible birthday that won't break age display
const MIN_BIRTHDAY = "1920-01-01";
// Must be at least 10 years old
const maxBirthday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
};

export default function AuthScreen({ dark, glass }) {
  const [mode,     setMode]     = useState("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSuccess("Reset link sent — check your inbox.");
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
    <div className={`app${dark ? " dark" : ""}${glass ? " glass" : ""} auth-wrap`}>
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-logo">N</div>
          <span className="auth-app-name">NORA</span>
        </div>
        <p className="auth-tagline">Your personal productivity assistant</p>

        {mode !== "forgot" && (
          <div className="auth-tabs">
            <button className={`auth-tab${mode === "signin" ? " active" : ""}`} onClick={() => switchMode("signin")}>
              Sign in
            </button>
            <button className={`auth-tab${mode === "signup" ? " active" : ""}`} onClick={() => switchMode("signup")}>
              Create account
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="auth-forgot-header">
            <p className="auth-forgot-title">Reset your password</p>
            <p className="auth-forgot-sub">Enter your email and we'll send you a reset link.</p>
          </div>
        )}

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

          {mode !== "forgot" && (() => {
            const strength = mode === "signup" ? pwStrength(password) : null;
            return (
              <>
                <div className="auth-pw-wrap">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "signup" ? "Password (min 6 chars)" : "Password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="auth-pw-eye"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {strength && (
                  <div className="auth-strength">
                    <div className="auth-strength-bar">
                      {[1,2,3,4,5].map((n) => (
                        <div
                          key={n}
                          className="auth-strength-seg"
                          style={{ background: n <= strength.score ? strength.color : undefined }}
                        />
                      ))}
                    </div>
                    <span className="auth-strength-label" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </>
            );
          })()}

          {mode === "signin" && (
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => switchMode("forgot")}
            >
              Forgot password?
            </button>
          )}

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
            {loading ? "…" : mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Create account"}
          </button>

          {mode === "forgot" && (
            <button
              type="button"
              className="auth-back-link"
              onClick={() => switchMode("signin")}
            >
              ← Back to sign in
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
