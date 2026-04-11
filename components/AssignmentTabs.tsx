"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  icon: string;
  badge?: string | number;
}

interface AssignmentTabsProps {
  overviewContent: ReactNode;
  matrixContent: ReactNode;
  memberContent: ReactNode;
  assignedCount: number;
  unassignedCount: number;
}

export default function AssignmentTabs({
  overviewContent,
  matrixContent,
  memberContent,
  assignedCount,
  unassignedCount,
}: AssignmentTabsProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs: Tab[] = [
    { key: "overview", label: "Tổng quan", icon: "📊" },
    { key: "matrix", label: "Bảng phân công", icon: "📋" },
    {
      key: "members",
      label: "Chi tiết thành viên",
      icon: "👥",
      badge: unassignedCount > 0 ? `${assignedCount}/${assignedCount + unassignedCount}` : assignedCount,
    },
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="assignment-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`assignment-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="assignment-tab-icon">{tab.icon}</span>
            <span className="assignment-tab-label">{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`assignment-tab-badge ${
                tab.key === "members" && unassignedCount > 0 ? "has-warning" : ""
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="assignment-tab-content">
        {activeTab === "overview" && overviewContent}
        {activeTab === "matrix" && matrixContent}
        {activeTab === "members" && memberContent}
      </div>
    </div>
  );
}
