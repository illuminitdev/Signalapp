/** Centered auth shell — login only. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-shell__form">
        <div className="auth-shell__brand">
          <span className="auth-shell__mark" aria-hidden>
            S
          </span>
          <span className="auth-shell__name">SignalApp</span>
        </div>
        {children}
      </section>
    </div>
  );
}
