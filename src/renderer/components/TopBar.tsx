import savantIcon from "../imports/icon.png";

export function TopBar() {
  return (
    <header
      style={{
        background: "var(--cp-bg-1)",
        borderBottom: "1px solid var(--cp-border)",
        boxShadow: "0 1px 0 rgba(0,229,255,0.08)",
      }}
      className="flex items-center justify-between px-3 h-10 shrink-0"
    >
      {/* left spacer */}
      <div className="w-24" />

      {/* center: icon + name */}
      <div className="flex items-center gap-2">
        <div
          style={{
            background:
              "linear-gradient(135deg, var(--cp-cyan), var(--cp-purple))",
            boxShadow: "var(--cp-glow-cyan)",
          }}
          className="w-6 h-6 flex items-center justify-center overflow-hidden"
        >
          <img
            src={savantIcon}
            alt="Savant"
            className="w-full h-full object-contain"
          />
        </div>
        <span
          style={{
            fontFamily: "'Orbitron', monospace",
            color: "var(--cp-cyan)",
            textShadow: "var(--cp-glow-cyan)",
            letterSpacing: "0.15em",
          }}
          className="text-sm font-bold uppercase tracking-widest"
        >
          olympus
        </span>
      </div>

      {/* right spacer */}
      <div className="w-24" />
    </header>
  );
}
