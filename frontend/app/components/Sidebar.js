import React from "react";

export default function Sidebar({ isOpen, onClose, activeFilter, onFilterChange, onSync, syncing, onLogout }) {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'show' : ''}`} onClick={onClose}></div>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-box">ET</div>
          <div>
            <div className="logo-text">Email Tracker</div>
            <div className="logo-sub">Dashboard</div>
          </div>
        </div>

        <nav>
          <div 
            className={`nav-item ${activeFilter === "all" ? "active" : ""}`} 
            onClick={() => { onFilterChange("all"); onClose(); }}
          >
            Dashboard
          </div>
          <div 
            className={`nav-item ${activeFilter === "unmarked" ? "active" : ""}`} 
            onClick={() => { onFilterChange("unmarked"); onClose(); }}
          >
            Unmarked
          </div>
        </nav>

        <div className="sidebar-bottom">
          <button className="sync-btn" onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Emails"}
          </button>
          <div className="nav-item" onClick={onLogout} style={{ marginTop: 0, color: '#ba1a1a' }}>
            <span>Sign Out</span>
          </div>
        </div>
      </aside>
    </>
  );
}
