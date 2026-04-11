export default function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div className="loading-spinner" />
        <span className="text-muted text-sm">Đang tải...</span>
      </div>
    </div>
  );
}
