"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AdminLoginModal from "./AdminLoginModal";

export default function UserMenu() {
  const { currentMember, isAdmin, setMember, logoutAdmin } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // M-7 fix: close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  if (!currentMember) return null;

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        className="btn btn-ghost"
        onClick={() => setShowMenu((v) => !v)}
        style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        <span>{currentMember.name}</span>
        {isAdmin && <span className="badge badge-purple" style={{ fontSize: 10 }}>Admin</span>}
      </button>

      {showMenu && (
        <div className="card" style={{
          position: "absolute", top: "100%", right: 0, minWidth: 180,
          zIndex: 100, padding: 8, marginTop: 4
        }}>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }}
            onClick={async () => { await setMember(null); setShowMenu(false); }}
          >
            🔄 Đổi danh tính
          </button>
          {isAdmin ? (
            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }}
              onClick={async () => { await logoutAdmin(); setShowMenu(false); }}
            >
              🔓 Đăng xuất Admin
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }}
              onClick={() => { setShowAdminModal(true); setShowMenu(false); }}
            >
              🔐 Đăng nhập Admin
            </button>
          )}
        </div>
      )}

      {showAdminModal && (
        <AdminLoginModal onClose={() => setShowAdminModal(false)} />
      )}
    </div>
  );
}
