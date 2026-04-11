import { AuthProvider } from "@/contexts/AuthContext";
import IdentityGate from "@/components/IdentityGate";
import Sidebar from "@/components/Sidebar";
import UserMenu from "@/components/UserMenu";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <IdentityGate>
        <div className="app-shell">
          {/* Header */}
          <header className="app-header">
            <span className="logo">[KIBOU] NIKKE UniRaid</span>
            <UserMenu />
          </header>

          {/* Sidebar */}
          <Sidebar />

          {/* Main */}
          <main className="app-main">{children}</main>
        </div>
      </IdentityGate>
    </AuthProvider>
  );
}
