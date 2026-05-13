"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import DashboardStats from "./components/DashboardStats";
import ApplicationCard from "./components/ApplicationCard";
import AddApplicationModal from "./components/AddApplicationModal";
import CompanyInfoModal from "./components/CompanyInfoModal";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function JobTrackerDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({ company: "", role: "", email: "", date: "" });
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromUrl = params.get("email");
    const authSuccess = params.get("auth_success");
    const error = params.get("error");

    if (error === "unauthorized") {
      alert("Access Denied: Your account is not authorized to view this dashboard.");
      window.history.replaceState({}, document.title, "/");
    } else if (authSuccess && emailFromUrl) {
      localStorage.setItem("userEmail", emailFromUrl);
      setUserEmail(emailFromUrl);
      window.history.replaceState({}, document.title, "/");
    } else {
      const savedEmail = localStorage.getItem("userEmail");
      if (savedEmail) setUserEmail(savedEmail);
    }

    const savedMode = localStorage.getItem("darkMode");
    if (savedMode === "true") setIsDarkMode(true);
  }, []);

  useEffect(() => {
    if (userEmail) fetchApplications();
  }, [userEmail]);

  const fetchApplications = async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/applications`, {
        headers: { "x-user-email": userEmail }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      const data = await response.json();
      setApplications(data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("userEmail");
    setUserEmail(null);
    try {
      await fetch(`${BASE_URL}/auth/logout`);
      setApplications([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${BASE_URL}/sync`, { headers: { "x-user-email": userEmail } });
      await fetchApplications();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete all applications?")) return;
    setClearing(true);
    try {
      const response = await fetch(`${BASE_URL}/applications/clear`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail }
      });
      if (response.ok) await fetchApplications();
    } catch (error) {
      console.error("Clear failed:", error);
    } finally {
      setClearing(false);
    }
  };

  const handleMarkDone = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ status: "done" }),
      });
      if (response.ok) {
        setApplications(prev => prev.map(app => app._id === id ? { ...app, status: "done" } : app));
      }
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm("Remove this application?")) return;
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail }
      });
      if (response.ok) {
        setApplications(prev => prev.filter(app => app._id !== id));
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.company || !formData.role) return setFormError("Required fields missing");
    setSubmitting(true);
    try {
      const response = await fetch(`${BASE_URL}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setShowAddModal(false);
        setFormData({ company: "", role: "", email: "", date: "" });
        await fetchApplications();
      }
    } catch (error) {
      setFormError("Failed to add");
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const total = applications.length;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = applications.filter(a => new Date(a.date || a.createdAt) >= weekAgo).length;
    const urgentDeadlines = applications.filter(a => {
      if (!a.deadlineISO) return false;
      return new Date(a.deadlineISO).toDateString() === now.toDateString() && a.status !== "done";
    }).length;
    const unmarkedCount = applications.filter(a => (a.status || "").toLowerCase() !== "done").length;
    return { total, newThisWeek, urgentDeadlines, unmarkedCount };
  }, [applications]);

  const filteredApps = useMemo(() => {
    return applications
      .filter(app => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = (app.company || "").toLowerCase().includes(query) || (app.role || "").toLowerCase().includes(query);
        const matchesFilter = activeFilter === "all" || (activeFilter === "unmarked" && app.status !== "done");
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }, [applications, searchQuery, activeFilter]);

  if (!userEmail) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Email Job Tracker</h1>
        <a href={`${BASE_URL}/auth/google`} style={{ padding: '12px 24px', backgroundColor: '#0d9488', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />
      <div className={`layout ${isDarkMode ? 'dark' : ''}`}>
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onSync={handleSync}
          syncing={syncing}
          onLogout={handleLogout}
        />

        <div className="main-wrapper">
          <Topbar 
            onMenuClick={() => setIsSidebarOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => { setIsDarkMode(!isDarkMode); localStorage.setItem("darkMode", !isDarkMode); }}
            userEmail={userEmail}
            onLogout={handleLogout}
            onAddClick={() => setShowAddModal(true)}
            onSync={handleSync}
            syncing={syncing}
            onClearAll={handleClearAll}
            clearing={clearing}
          />

          <main className="content">
            <div className="page-header">
              <h2 className="page-title">Applications Overview</h2>
              <p className="page-subtitle">Track and manage your active job pursuits.</p>
            </div>

            <DashboardStats {...stats} />

            {loading && applications.length === 0 ? (
              <p style={{ color: '#6d7a77', marginTop: 24 }}>Loading applications...</p>
            ) : (
              <div className="app-grid">
                {filteredApps.map(app => (
                  <ApplicationCard 
                    key={app._id} 
                    app={app} 
                    onMarkDone={handleMarkDone}
                    onRemove={handleRemove}
                    onOpenInfo={(a) => { setSelectedApp(a); setShowInfoModal(true); }}
                  />
                ))}
              </div>
            )}
          </main>
        </div>

        <AddApplicationModal 
          isOpen={showAddModal} 
          onClose={() => setShowAddModal(false)}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleAddSubmit}
          submitting={submitting}
          error={formError}
        />

        <CompanyInfoModal 
          isOpen={showInfoModal} 
          onClose={() => setShowInfoModal(false)}
          app={selectedApp}
        />
      </div>
    </>
  );
}

const DASHBOARD_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background-color: #f5faf8; color: #171d1c; }
  .layout { display: flex; min-height: 100vh; }
  .sidebar { width: 280px; background-color: #f9fafb; border-right: 1px solid #e5e7eb; padding: 24px 16px; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 50; transition: transform 0.3s ease; }
  .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
  .logo-box { width: 40px; height: 40px; background: #ccfbf1; color: #0d9488; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 700; }
  .logo-text { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; color: #0d9488; }
  .logo-sub { font-size: 12px; color: #6b7280; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: #6b7280; font-weight: 500; cursor: pointer; transition: 0.2s; }
  .nav-item:hover { background: #f3f4f6; color: #0d9488; }
  .nav-item.active { background: #fff; border-left: 4px solid #0d9488; color: #0d9488; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .sidebar-bottom { margin-top: auto; border-top: 1px solid #e5e7eb; padding-top: 24px; }
  .sync-btn { width: 100%; padding: 12px; background: #0d9488; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; margin-bottom: 16px; }
  .main-wrapper { margin-left: 280px; flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { height: 64px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(8px); border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; position: sticky; top: 0; z-index: 40; }
  .search-container input { padding: 10px 16px 10px 40px; border-radius: 999px; border: 1px solid #e5e7eb; background: #f9fafb url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 14px center; width: 320px; outline: none; font-size: 14px; }
  .topbar-actions { display: flex; align-items: center; gap: 12px; }
  .outline-btn { padding: 8px 16px; border: 1px solid #dee4e1; border-radius: 999px; background: #fff; color: #3d4947; font-weight: 600; font-size: 13px; cursor: pointer; }
  .user-badge { background: #f0fdfa; border: 1px solid #ccfbf1; color: #0d9488; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .content { padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
  .page-header { margin-bottom: 32px; }
  .page-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: #171d1c; margin-bottom: 4px; }
  .page-subtitle { color: #3d4947; font-size: 15px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .stat-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s; }
  .stat-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -5px rgba(0, 0, 0, 0.05); }
  .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .stat-card.total .stat-icon { background: #f0fdfa; color: #0d9488; }
  .stat-card.urgent .stat-icon { background: #fef2f2; color: #dc2626; }
  .stat-card.unmarked .stat-icon { background: #fffbeb; color: #d97706; }
  .stat-value { font-size: 28px; font-weight: 700; color: #1e293b; }
  .stat-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
  .stat-trend { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: #f0fdf4; color: #16a34a; }
  .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
  .app-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; transition: all 0.2s; display: flex; flex-direction: column; gap: 16px; }
  .app-card:hover { border-color: #0d9488; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
  .app-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .app-info { display: flex; align-items: center; gap: 14px; }
  .company-logo-container { width: 44px; height: 44px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .company-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
  .role-title { font-weight: 600; font-size: 15px; color: #1e293b; }
  .company-name { font-size: 13px; color: #64748b; }
  .status-badge { padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .status-applied { background: #f1f5f9; color: #475569; }
  .status-interview { background: #f0fdfa; color: #0d9488; }
  .status-rejected { background: #fef2f2; color: #dc2626; }
  .status-done { background: #f0fdfa; color: #0d9488; }
  .card-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: auto; padding-top: 16px; border-top: 1px solid #f1f5f9; }
  .card-btn { padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 4px; }
  .card-btn-done { background: #f0fdf4; color: #16a34a; }
  .card-btn-remove { background: #fff1f2; color: #e11d48; }
  .card-btn-apply { background: #f0fdfa; color: #0d9488; border-color: #0d9488; }
  .dark { background-color: #0f172a; color: #f1f5f9; }
  .dark .sidebar { background-color: #1e293b; border-color: #334155; }
  .dark .stat-card { background: #1e293b; border-color: #334155; }
  .dark .stat-value { color: #f8fafc; }
  .dark .app-card { background: #1e293b; border-color: #334155; }
  .dark .role-title { color: #f1f5f9; }
  .dark .topbar { background: rgba(30, 41, 59, 0.8); border-color: #334155; }
  .dark .outline-btn { background: #1e293b; border-color: #0d9488; color: #2dd4bf; }
  .dark .company-logo-container { background: #0f172a; border-color: #334155; }
  .dark .app-card.is-done { opacity: 0.35; filter: grayscale(0.6); }

  /* Modal Styles */
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal-content { background: #fff; width: 100%; max-width: 480px; border-radius: 16px; padding: 32px; position: relative; }
  .dark .modal-content { background: #1e293b; color: #f8fafc; }
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 14px; font-weight: 600; color: #3d4947; margin-bottom: 6px; }
  .form-input { width: 100%; padding: 10px 12px; border: 1px solid #dee4e1; border-radius: 8px; background: #fff; outline: none; }
  .dark .form-input { background: #0f172a; border-color: #334155; color: #f8fafc; }
  .btn-submit { padding: 10px 20px; background: #00685f; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .info-description { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
  .dark .info-description { color: #cbd5e1; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaefed; }
  .info-item-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; }
  .info-item-value { font-size: 14px; font-weight: 500; color: #1e293b; }
  .dark .info-item-value { color: #f1f5f9; }
  .program-details { margin-top: 14px; border-left: 2px solid #0d9488; padding-left: 14px; }
  .program-detail { margin-bottom: 6px; display: flex; gap: 12px; font-size: 13px; }
  .program-detail-label { font-weight: 600; color: #64748b; width: 70px; flex-shrink: 0; }
  .deadline-badge { display: flex; align-items: center; padding: 4px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; color: #64748b; }
  .deadline-badge.urgent { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
  .dark .deadline-badge { background: #0f172a; border-color: #334155; color: #94a3b8; }
`;
