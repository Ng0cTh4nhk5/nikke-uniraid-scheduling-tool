"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  onClose: () => void;
}

export default function AdminLoginModal({ onClose }: Props) {
  const { loginAdmin } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true); setError("");
    const success = await loginAdmin(password);
    setLoading(false);
    if (success) {
      onClose();
    } else {
      setError("Sai mật khẩu");
      setPassword("");
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="modal-title">🔐 Đăng nhập Admin</div>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          Nhập mật khẩu để mở khoá các tính năng quản trị.
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Mật khẩu</label>
            <input
              ref={inputRef}
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              autoFocus
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
            />
          </div>
          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</p>
          )}
          <div className="gap-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !password}>
              {loading ? "Đang kiểm tra..." : "Đăng nhập"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
