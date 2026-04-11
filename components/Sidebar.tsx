"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const ALL_NAV = [
  { label: "Mùa Raid",   href: "/raids",      adminOnly: false },
  { label: "Thành viên", href: "/members",    adminOnly: true  },
  { label: "Nhân vật",   href: "/characters", adminOnly: true  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const navItems = ALL_NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="app-sidebar">
      <div className="sidebar-section">Điều hướng</div>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href}>
            <div className={`sidebar-item${active ? " active" : ""}`}>
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
