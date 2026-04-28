"use client";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

import React, { useEffect, useState } from "react";

export default function JobTrackerDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Add Application Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({
    company: "",
    role: "",
    email: "",
    date: ""
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/applications`);
      const data = await response.json();
      setApplications(data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${BASE_URL}/sync`);
      await fetchApplications();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all applications? This cannot be undone."
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      const response = await fetch(`${BASE_URL}/applications/clear`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Clear failed");
      alert("All applications cleared.");
      await fetchApplications();
    } catch (error) {
      console.error("Clear all failed:", error);
      alert("Failed to clear applications. Please try again.");
    } finally {
      setClearing(false);
    }
  };

  const handleMarkDone = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!response.ok) throw new Error("Failed to mark as done");
      setApplications((prev) =>
        prev.map((app) => app._id === id ? { ...app, status: "done" } : app)
      );
    } catch (error) {
      console.error("Mark done failed:", error);
      alert("Could not mark as done. Please try again.");
    }
  };

  const handleDeleteOne = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      setApplications((prev) => prev.filter((app) => app._id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Could not delete application. Please try again.");
    }
  };

  const handleUpdateNote = (id, newNote) => {
    setApplications((prev) =>
      prev.map((app) => app._id === id ? { ...app, note: newNote } : app)
    );
  };

  const handleSaveNote = async (id, note) => {
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error("Failed to save note");
    } catch (error) {
      console.error("Save note failed:", error);
      alert("Could not save note. Please try again.");
    }
  };


  const handleLogout = async () => {
    try {
      await fetch(`${BASE_URL}/logout`);
      setApplications([]);
      alert("Successfully logged out and disconnected Gmail accounts.");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!formData.company || !formData.role) {
      setFormError("Company and Role are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BASE_URL}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error("Failed to add application");
      }

      setShowAddModal(false);
      setFormData({ company: "", role: "", email: "", date: "" });
      await fetchApplications();
    } catch (error) {
      console.error(error);
      setFormError("Failed to add application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  // Stats calculation
  const total = applications.length;
  const pending = applications.filter(
    (a) => (a.status || "").toLowerCase() !== "done"
  ).length;

  const isAddedToday = (app) => {
    const raw = app.date || app.createdAt;
    if (!raw) return false;
    const appDate = new Date(raw);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return appDate >= todayStart;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');
        
        :root {
          --primary: #0d9488;
          --primary-dark: #0f766e;
          --primary-light: #ccfbf1;
          --bg: #f8fafc;
          --sidebar-bg: #ffffff;
          --text-main: #1e293b;
          --text-muted: #64748b;
          --border: #e2e8f0;
          --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          --card-shadow-hover: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); line-height: 1.5; }
        
        .layout { display: flex; min-height: 100vh; }
        
        /* Sidebar */
        .sidebar { width: 260px; background-color: var(--sidebar-bg); border-right: 1px solid var(--border); padding: 32px 20px; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 50; }
        .sidebar-header { display: flex; align-items: center; gap: 14px; margin-bottom: 40px; }
        .logo-box { width: 42px; height: 42px; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; border-radius: 12px; font-weight: 800; font-size: 18px; box-shadow: 0 2px 4px rgba(13, 148, 136, 0.1); }
        .logo-text { font-family: 'Manrope', sans-serif; font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1; letter-spacing: -0.02em; }
        .logo-sub { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
        
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; color: var(--text-muted); text-decoration: none; font-weight: 600; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; font-size: 14px; }
        .nav-item:hover { background: #f1f5f9; color: var(--primary); }
        .nav-item.active { background: #f0fdfa; color: var(--primary); }
        
        .sidebar-bottom { margin-top: auto; padding-top: 24px; border-top: 1px solid var(--border); }
        .sync-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; margin-bottom: 16px; transition: all 0.2s; font-size: 14px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2); }
        .sync-btn:hover { background: var(--primary-dark); transform: translateY(-1px); box-shadow: 0 6px 12px rgba(13, 148, 136, 0.25); }
        
        /* Main Area */
        .main-wrapper { margin-left: 260px; flex: 1; display: flex; flex-direction: column; min-width: 0; }
        
        .topbar { height: 72px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 40px; position: sticky; top: 0; z-index: 40; }
        .search-container { position: relative; }
        .search-container input { padding: 10px 16px 10px 44px; border-radius: 12px; border: 1px solid var(--border); background: #f1f5f9; width: 340px; outline: none; font-size: 14px; transition: all 0.2s; font-weight: 500; }
        .search-container::before { content: ''; position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat center; opacity: 0.7; }
        .search-container input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.1); background-color: #fff; width: 400px; }
        
        .topbar-actions { display: flex; align-items: center; gap: 12px; }
        .btn-circle { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--border); background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: var(--text-muted); }
        .btn-circle:hover { border-color: var(--primary); color: var(--primary); background: #f0fdfa; }
        
        /* Content */
        .content { padding: 40px; max-width: 1200px; margin: 0 auto; width: 100%; }
        .page-header { margin-bottom: 32px; }
        .page-title { font-family: 'Manrope', sans-serif; font-size: 32px; font-weight: 800; color: var(--text-main); letter-spacing: -0.03em; }
        .page-subtitle { color: var(--text-muted); font-size: 16px; font-weight: 500; }
        
        /* Stats */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 40px; }
        .stat-card { background: #fff; border: 1px solid var(--border); border-radius: 20px; padding: 24px; box-shadow: var(--card-shadow); display: flex; flex-direction: column; gap: 4px; transition: transform 0.2s; }
        .stat-card:hover { transform: translateY(-2px); }
        .stat-title { font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .stat-value { font-size: 36px; font-family: 'Manrope', sans-serif; font-weight: 800; color: var(--text-main); line-height: 1.2; }
        .stat-card.total .stat-value { color: var(--primary); }
        
        /* Filters */
        .filters { display: flex; gap: 8px; margin-bottom: 32px; border-bottom: 2px solid var(--border); padding-bottom: 12px; }
        .filter-btn { padding: 8px 20px; border-radius: 10px; border: none; background: transparent; color: var(--text-muted); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; position: relative; }
        .filter-btn.active { color: var(--primary); background: #f0fdfa; }
        .filter-btn.active::after { content: ''; position: absolute; bottom: -14px; left: 0; right: 0; height: 2px; background: var(--primary); border-radius: 2px; }
        .filter-btn:hover:not(.active) { color: var(--text-main); background: #f1f5f9; }
        
        /* App Grid */
        .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        .app-card { background: #fff; border: 1px solid var(--border); border-radius: 24px; padding: 28px; display: flex; flex-direction: column; gap: 24px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: var(--card-shadow); border-top: 4px solid var(--primary-light); }
        .app-card:hover { transform: translateY(-6px); box-shadow: var(--card-shadow-hover); border-top-color: var(--primary); }
        
        .app-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .app-info { display: flex; gap: 16px; }
        .company-logo { width: 52px; height: 52px; border-radius: 16px; background: #f8fafc; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--primary); font-size: 22px; flex-shrink: 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }
        .role-title { font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; color: var(--text-main); margin-bottom: 2px; line-height: 1.2; }
        .company-name { font-size: 14px; color: var(--text-muted); font-weight: 600; }
        
        .app-footer { border-top: 1px solid var(--border); padding-top: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--text-muted); font-weight: 500; }
        .email-info { display: flex; align-items: center; gap: 8px; }
        .email-dot { width: 8px; height: 8px; background: #cbd5e1; border-radius: 50%; }
        
        /* Modal Styles */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-content { background: #fff; width: 100%; max-width: 460px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); padding: 32px; position: relative; animation: modalIn 0.3s ease-out; }
        @keyframes modalIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .modal-title { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em; }
        .modal-close { background: #f1f5f9; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 12px; transition: all 0.2s; }
        .modal-close:hover { background: #e2e8f0; color: var(--text-main); }
        
        .form-group { margin-bottom: 20px; }
        .form-label { display: block; font-size: 13px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        .form-input { width: 100%; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: 12px; font-family: inherit; font-size: 15px; color: var(--text-main); outline: none; transition: all 0.2s; background: #f8fafc; }
        .form-input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.1); background-color: #fff; }
        
        .modal-actions { display: flex; gap: 12px; margin-top: 32px; }
        .btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary { background: var(--primary); color: #fff; border: none; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2); }
        .btn-primary:hover:not(:disabled) { background: var(--primary-dark); transform: translateY(-1px); box-shadow: 0 6px 12px rgba(13, 148, 136, 0.25); }
        .btn-secondary { background: #f1f5f9; color: var(--text-main); border: 1px solid var(--border); }
        .btn-secondary:hover { background: #e2e8f0; }
        .btn-danger { background: #fff; color: #ef4444; border: 1.5px solid #fee2e2; }
        .btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #ef4444; }
        
        .new-tag { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; background: #d1fae5; color: #065f46; text-transform: uppercase; }
        
        .note-container { margin-top: 4px; }
        .note-input { width: 100%; padding: 14px; border: 1.5px solid var(--border); border-radius: 16px; font-family: inherit; font-size: 13px; color: var(--text-main); outline: none; transition: all 0.2s; background: #f8fafc; resize: none; min-height: 80px; font-weight: 500; }
        .note-input:focus { border-color: var(--primary); background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .note-save-hint { font-size: 11px; color: var(--text-muted); text-align: right; margin-top: 6px; font-weight: 600; }
        
        .card-actions { display: flex; gap: 10px; padding-top: 12px; }
        .card-btn { flex: 1; padding: 9px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1.5px solid transparent; }
        .card-btn-done { background: #f0fdf4; color: #15803d; border-color: #dcfce7; }
        .card-btn-done:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; }
        .card-btn-remove { background: #fff; color: var(--text-muted); border-color: var(--border); }
        .card-btn-remove:hover { background: #fef2f2; color: #ef4444; border-color: #fecaca; }
        
        .app-card.is-done { border-top-color: #cbd5e1; opacity: 0.7; }
        .app-card.is-done .role-title { text-decoration: line-through; color: var(--text-muted); }
        .app-card.is-done .company-logo { grayscale: 1; opacity: 0.5; }

        /* Empty State */
        .empty-state { text-align: center; padding: 80px 20px; background: #fff; border-radius: 24px; border: 2px dashed var(--border); }
        .empty-icon { font-size: 48px; margin-bottom: 16px; display: block; }
        .empty-title { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; }
        .empty-desc { color: var(--text-muted); font-size: 15px; max-width: 320px; margin: 0 auto 24px; }

        /* Responsive */
        .hamburger { display: none; background: #fff; border: 1px solid var(--border); cursor: pointer; padding: 10px; border-radius: 12px; color: var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .sidebar-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.4); z-index: 45; backdrop-filter: blur(4px); }

        @media (max-width: 1024px) {
          .sidebar { width: 80px; padding: 32px 14px; align-items: center; }
          .logo-text, .logo-sub, .nav-item span { display: none; }
          .main-wrapper { margin-left: 80px; }
          .content { padding: 32px; }
        }

        @media (max-width: 768px) {
          .sidebar { width: 260px; transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); align-items: flex-start; }
          .sidebar.open { transform: translateX(0); }
          .logo-text, .logo-sub, .nav-item span { display: block; }
          .sidebar-overlay.show { display: block; }
          .main-wrapper { margin-left: 0; }
          .hamburger { display: block; }
          .topbar { padding: 0 20px; }
          .search-container input { width: 200px; }
          .content { padding: 24px 20px; }
          .page-title { font-size: 28px; }
        }

        @media (max-width: 480px) {
          .topbar { height: auto; padding: 16px 20px; flex-direction: column; gap: 16px; align-items: stretch; }
          .search-container { width: 100%; }
          .search-container input { width: 100% !important; }
          .topbar-actions { width: 100%; justify-content: space-between; }
        }
      `}} />


      <div className="layout">
        <div className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

        <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="logo-box">ET</div>
            <div>
              <div className="logo-text">EmailTracker</div>
              <div className="logo-sub">Pro Dashboard</div>
            </div>
          </div>

          <nav style={{ flex: 1 }}>
            <div className="nav-item active">
              <span>🏠</span>
              <span>Dashboard</span>
            </div>
            <div className="nav-item" onClick={() => setShowAddModal(true)}>
              <span>➕</span>
              <span>Add Entry</span>
            </div>
          </nav>

          <div className="sidebar-bottom">
            <button className="sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Gmail"}
            </button>
            <div className="nav-item" onClick={handleLogout} style={{ marginTop: 0 }}>
              <span>🚪</span>
              <span>Sign Out</span>
            </div>
          </div>
        </aside>

        <div className="main-wrapper">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="hamburger" onClick={() => setIsSidebarOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Search your applications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn-circle" title="Clear All" onClick={handleClearAll} disabled={clearing}>
                🗑️
              </button>
              <div style={{ width: 38, height: 38, background: '#f1f5f9', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: 15 }}>
                U
              </div>
            </div>
          </header>

          <main className="content">
            <div className="page-header">
              <h2 className="page-title">Applications</h2>
              <p className="page-subtitle">Manage and track your active job hunt journey.</p>
            </div>

            <div className="stats-grid">
              <div className="stat-card total">
                <span className="stat-title">Total tracked</span>
                <span className="stat-value">{total}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">Pending action</span>
                <span className="stat-value">{pending}</span>
              </div>
            </div>

            <div className="filters">
              {[
                { label: "All Items",      value: "all"      },
                { label: "Unmarked", value: "unmarked" },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  className={`filter-btn${activeFilter === value ? " active" : ""}`}
                  onClick={() => setActiveFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading && applications.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 16 }}>🌀</div>
                <p>Loading your applications...</p>
              </div>
            ) : (
              <>
                {applications.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📂</span>
                    <h3 className="empty-title">No applications yet</h3>
                    <p className="empty-desc">Your synchronized job applications will appear here once you sync with Gmail.</p>
                    <button className="btn btn-primary" onClick={handleSync} style={{ width: 'auto', padding: '12px 24px', margin: '0 auto' }}>
                      Sync Gmail Now
                    </button>
                  </div>
                ) : (
                  <div className="app-grid">
                    {applications
                      .filter((app) => {
                        const query = searchQuery.toLowerCase();
                        const matchesSearch =
                          (app.company || "").toLowerCase().includes(query) ||
                          (app.role || "").toLowerCase().includes(query);

                        const s = (app.status || "").toLowerCase();
                        const matchesFilter =
                          activeFilter === "all" ||
                          (activeFilter === "unmarked" && s !== "done");

                        return matchesSearch && matchesFilter;
                      })
                      .sort((a, b) => {
                        const dateA = new Date(a.date || a.createdAt || 0);
                        const dateB = new Date(b.date || b.createdAt || 0);
                        return dateB - dateA;
                      })
                      .map((app) => {
                        const dateToShow = app.date || app.testDate || app.deadline || app.createdAt;
                        const formattedDate = dateToShow ? new Date(dateToShow).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A";
                        const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();
                        const isNew = isAddedToday(app);
                        const isDone = (app.status || "").toLowerCase() === "done";

                        return (
                          <div key={app._id} className={`app-card${isDone ? " is-done" : ""}`}>
                            <div className="app-header">
                              <div className="app-info">
                                <div className="company-logo">{companyInitials}</div>
                                <div>
                                  <div className="role-title">{app.role || "Job Opportunity"}</div>
                                  <div className="company-name">{app.company || "Unknown Company"}</div>
                                </div>
                              </div>
                              {isNew && <span className="new-tag">New</span>}
                            </div>
                            
                            <div className="note-container">
                              <textarea
                                className="note-input"
                                placeholder="Add a personal note about this role..."
                                value={app.note || ""}
                                onChange={(e) => handleUpdateNote(app._id, e.target.value)}
                                onBlur={(e) => handleSaveNote(app._id, e.target.value)}
                              />
                              <div className="note-save-hint">Auto-saves on blur</div>
                            </div>

                            <div className="app-footer">
                              <div className="email-info">
                                <div className="email-dot"></div>
                                <span>{formattedDate}</span>
                              </div>
                              <div className="card-actions">
                                <button
                                  className="card-btn card-btn-done"
                                  onClick={() => handleMarkDone(app._id)}
                                  disabled={isDone}
                                  title="Mark as Done"
                                >
                                  {isDone ? "✓" : "Done"}
                                </button>
                                <button
                                  className="card-btn card-btn-remove"
                                  onClick={() => handleDeleteOne(app._id)}
                                  title="Remove"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Add Application Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Manual Entry</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleAddSubmit}>
              {formError && <div className="form-error">{formError}</div>}

              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Google"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Job Role</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Software Engineer"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. recruiter@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Application Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Opportunity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
