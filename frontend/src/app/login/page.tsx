"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth/session";

type Mode = "login" | "register" | "forgot";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.5 10.5a2.5 2.5 0 003 3M9.9 5.1A10 10 0 0112 5c4.8 0 8.9 3 10.5 7.2a11 11 0 01-4 4.8M6.2 6.2A11 11 0 001.5 12.2C3.1 16.4 7.2 19.5 12 19.5c1.5 0 2.9-.3 4.2-.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12.2C3.6 8 7.7 5 12 5s8.4 3 10 7.2c-1.6 4.2-5.7 7.2-10 7.2S3.6 16.4 2 12.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.2" r="2.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title =
    mode === "login" ? "Welcome back" : mode === "register" ? "Create account" : "Reset password";
  const subtitle =
    mode === "login"
      ? "Sign in to continue to your workspace."
      : mode === "register"
        ? "Ask your admin for access, or request an invite below."
        : "Enter your email and we’ll help you recover access.";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setShowPassword(false);
  }

  return (
    <div className="auth-form">
      <header className="auth-form__header">
        <h1 className="auth-form__title">{title}</h1>
        <p className="auth-form__subtitle">{subtitle}</p>
      </header>

      {mode !== "forgot" ? (
        <div className="auth-tabs" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-tabs__btn${mode === "login" ? " is-active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-tabs__btn${mode === "register" ? " is-active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>
      ) : null}

      <form
        className="auth-form__fields"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setInfo(null);
          try {
            if (mode === "login") {
              const { user } = await login(email, password);
              router.push(
                user.mustChangePassword ? "/password" : user.isPlatformAdmin ? "/platform" : "/home",
              );
              return;
            }
            if (mode === "register") {
              setInfo(
                "Self-serve signup isn’t available yet. Ask your workspace admin to invite this email.",
              );
              return;
            }
            setInfo("Password reset isn’t available yet. Contact your workspace admin.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "register" ? (
          <label className="auth-field">
            <span className="auth-field__label">Full name</span>
            <input
              className="auth-field__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
              autoComplete="name"
              required
            />
          </label>
        ) : null}

        <label className="auth-field">
          <span className="auth-field__label">Email</span>
          <input
            className="auth-field__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </label>

        {mode !== "forgot" ? (
          <div className="auth-field">
            <div className="auth-field__row">
              <label htmlFor="auth-password" className="auth-field__label">
                Password
              </label>
              {mode === "login" ? (
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <div className="auth-field__control">
              <input
                id="auth-password"
                className="auth-field__input auth-field__input--icon"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required={mode === "login"}
                minLength={mode === "register" ? 8 : undefined}
              />
              <button
                type="button"
                className="auth-field__eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="auth-msg auth-msg--error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? <p className="auth-msg">{info}</p> : null}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : mode === "register"
                ? "Request access"
                : "Continue"}
        </button>
      </form>

      <p className="auth-form__footer">
        {mode === "forgot" ? (
          <>
            Remembered it?{" "}
            <button type="button" className="auth-link" onClick={() => switchMode("login")}>
              Back to log in
            </button>
          </>
        ) : mode === "login" ? (
          <>
            No account yet?{" "}
            <button type="button" className="auth-link" onClick={() => switchMode("register")}>
              Create account
            </button>
          </>
        ) : (
          <>
            Already have access?{" "}
            <button type="button" className="auth-link" onClick={() => switchMode("login")}>
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
