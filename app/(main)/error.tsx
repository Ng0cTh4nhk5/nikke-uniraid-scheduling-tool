"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 16 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Đã xảy ra lỗi</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, maxWidth: 400, textAlign: "center" }}>
        {error.message || "Có gì đó không đúng. Vui lòng thử lại."}
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
