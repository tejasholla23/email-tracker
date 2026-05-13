import React from "react";

export default function DashboardStats({ total, newThisWeek, urgentDeadlines, unmarkedCount }) {
  return (
    <div className="stats-grid">
      <div className="stat-card total">
        <div className="stat-icon">📊</div>
        <div className="stat-content">
          <span className="stat-label">Total Applications</span>
          <div className="stat-main">
            <span className="stat-value">{total}</span>
            {newThisWeek > 0 && <span className="stat-trend">+{newThisWeek} this week</span>}
          </div>
        </div>
      </div>
      
      <div className="stat-card urgent">
        <div className="stat-icon">🔔</div>
        <div className="stat-content">
          <span className="stat-label">Deadlines Today</span>
          <div className="stat-main">
            <span className="stat-value">{urgentDeadlines}</span>
            <span className="stat-subtext">{urgentDeadlines === 0 ? "No immediate action" : "Requires attention"}</span>
          </div>
        </div>
      </div>

      <div className="stat-card unmarked">
        <div className="stat-icon">📝</div>
        <div className="stat-content">
          <span className="stat-label">Unmarked</span>
          <div className="stat-main">
            <span className="stat-value">{unmarkedCount}</span>
            <span className="stat-subtext">Needs review</span>
          </div>
        </div>
      </div>
    </div>
  );
}
