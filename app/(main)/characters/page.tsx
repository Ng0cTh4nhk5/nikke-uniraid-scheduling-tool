"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { ELEMENT_BADGE, BURST_LABEL, ALL_ELEMENTS, ALL_CLASSES, ALL_BURSTS, ALL_WEAPONS, ALL_MANUFACTURERS } from "@/lib/constants";
import type { ApiCharacter } from "@/lib/types";

export default function CharactersPage() {
  const [chars, setChars] = useState<ApiCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    element: "", class: "", burst: "", weapon: "", manufacturer: "",
  });

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải dữ liệu");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setChars(data);
        else throw new Error("Dữ liệu không hợp lệ");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return chars.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.element && c.element !== filters.element) return false;
      if (filters.class && c.class !== filters.class) return false;
      if (filters.burst && c.burst !== filters.burst) return false;
      if (filters.weapon && c.weapon !== filters.weapon) return false;
      if (filters.manufacturer && c.manufacturer !== filters.manufacturer) return false;
      return true;
    });
  }, [chars, search, filters]);

  const setF = (key: string, val: string) =>
    setFilters((f) => ({ ...f, [key]: val }));

  const resetFilters = () => {
    setSearch("");
    setFilters({ element: "", class: "", burst: "", weapon: "", manufacturer: "" });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Nhân vật</div>
          <div className="page-subtitle">{filtered.length}/{chars.length} nhân vật</div>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(5, auto)", gap: 8, alignItems: "end" }}>
          <input
            className="form-input"
            placeholder="Tìm tên nhân vật..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {[
            { key: "element", opts: ALL_ELEMENTS, label: "Hệ" },
            { key: "class", opts: ALL_CLASSES, label: "Class" },
            { key: "burst", opts: ALL_BURSTS, label: "Burst" },
            { key: "weapon", opts: ALL_WEAPONS, label: "Vũ khí" },
            { key: "manufacturer", opts: ALL_MANUFACTURERS as readonly string[], label: "Hãng" },
          ].map(({ key, opts, label }) => (
            <select
              key={key}
              className="form-select"
              value={filters[key as keyof typeof filters]}
              onChange={(e) => setF(key, e.target.value)}
              style={{ minWidth: 90 }}
            >
              <option value="">— {label} —</option>
              {opts.map((o) => (
                <option key={o} value={o}>{key === "burst" ? BURST_LABEL[o] : o}</option>
              ))}
            </select>
          ))}
        </div>
        {(search || Object.values(filters).some(Boolean)) && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={resetFilters}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><div className="loading-spinner" /></div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Thử lại</button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((c) => (
            <div
              key={c.id}
              title={`${c.name}\n${c.class} · Burst ${BURST_LABEL[c.burst]} · ${c.element} · ${c.weapon} · ${c.manufacturer}`}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
                cursor: "default",
              }}
            >
              {c.image ? (
                <Image
                  src={c.image}
                  alt={c.name}
                  width={128}
                  height={128}
                  style={{ width: "100%", height: 128, objectFit: "cover", display: "block" }}
                  unoptimized
                />
              ) : (
                <div style={{ width: "100%", height: 128, background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 32 }}>?</span>
                </div>
              )}
              <div style={{ padding: "6px 6px 8px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}
                </div>
                <div style={{ marginTop: 3, display: "flex", gap: 3, flexWrap: "wrap" }}>
                  <span className={`badge ${ELEMENT_BADGE[c.element]}`} style={{ fontSize: 10, padding: "1px 4px" }}>{c.element}</span>
                  <span className="badge badge-gray" style={{ fontSize: 10, padding: "1px 4px" }}>B{BURST_LABEL[c.burst]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
