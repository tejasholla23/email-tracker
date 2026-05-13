import React from "react";

export default function Topbar({ 
  onMenuClick, 
  searchQuery, 
  onSearchChange, 
  isDarkMode, 
  onToggleDarkMode, 
  userEmail, 
  onLogout, 
  onAddClick,
  onSync,
  syncing,
  onClearAll,
  clearing
}) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button className="hamburger" onClick={onMenuClick}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="topbar-actions">
        <button 
          onClick={onToggleDarkMode} 
          className="outline-btn" 
          style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Toggle Dark Mode"
        >
          {isDarkMode ? "☀️" : "🌙"}
        </button>
        <div className="user-badge">
          <span className="user-email">{userEmail}</span>
        </div>
        <button className="outline-btn" onClick={onLogout} style={{ background: '#fef2f2', borderColor: '#fee2e2', color: '#991b1b' }}>
          Logout
        </button>
        <button className="btn-primary" onClick={onAddClick}>
          + Add Application
        </button>
        <button className="outline-btn" onClick={onSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync Emails"}
        </button>
        <button className="btn-danger" onClick={onClearAll} disabled={clearing}>
          {clearing ? "Clearing..." : "Clear All"}
        </button>
      </div>
    </header>
  );
}
