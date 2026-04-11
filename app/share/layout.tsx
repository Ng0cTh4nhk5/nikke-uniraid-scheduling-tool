import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kết quả phân công — NIKKE UniRaid",
  description: "Xem kết quả phân công Union Raid",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Minimal header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "#0B0E14",
      }}>
        <span style={{
          fontFamily: "var(--font-outfit), sans-serif",
          fontWeight: 700,
          fontSize: 15,
          color: "#fff",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          opacity: 0.8,
        }}>
          [KIBOU] NIKKE UniRaid
        </span>
      </header>

      {/* Content */}
      <main style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: "center",
        padding: "24px 16px",
        fontSize: 12,
        color: "var(--text-muted)",
        borderTop: "1px solid var(--border)",
        marginTop: 40,
      }}>
        NIKKE UniRaid Calculator · Powered by KIBOU Union
      </footer>
    </div>
  );
}
