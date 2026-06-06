"use client";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

import React, { useEffect, useState } from "react";

export default function JobTrackerDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("success");
  const [syncError, setSyncError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

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
  
  // Company Info Modal State
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    // Check URL for auth params
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
      if (savedEmail) {
        setUserEmail(savedEmail);
      }
    }

    // Check local storage for dark mode preference
    const savedMode = localStorage.getItem("darkMode");
    if (savedMode === "true") {
      setIsDarkMode(true);
    }
  }, []);

  const fetchSyncStatus = async () => {
    if (!userEmail) return;
    try {
      const response = await fetch(`${BASE_URL}/applications/sync-status`, {
        headers: { "x-user-email": userEmail }
      });
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data.syncStatus);
        setSyncError(data.syncError);
        setLastSyncTime(data.lastSyncTime);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    }
  };

  useEffect(() => {
    if (userEmail) {
      fetchApplications();
      fetchSyncStatus();
    }
  }, [userEmail]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    localStorage.setItem("darkMode", !isDarkMode);
  };

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
      console.debug("[FETCH_APPLICATIONS] count=", data.length, "companyInfoCount=", data.filter((a) => !!a.companyInfo).length);
      if (data.length > 0) {
        console.debug("[FETCH_APPLICATIONS_SAMPLE]", {
          company: data[0].company,
          hasCompanyInfo: !!data[0].companyInfo,
          shortDescription: data[0].companyInfo?.shortDescription,
        });
      }
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
      await fetch(`${BASE_URL}/sync`, {
        headers: { "x-user-email": userEmail }
      });
      await fetchSyncStatus();
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
        headers: { "x-user-email": userEmail }
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
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
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

  const handleApply = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
        body: JSON.stringify({ status: "applied" }),
      });
      if (!response.ok) throw new Error("Failed to mark as applied");
      setApplications((prev) =>
        prev.map((app) => app._id === id ? { ...app, status: "applied" } : app)
      );
    } catch (error) {
      console.error("Apply action failed:", error);
    }
  };

  const handleDeleteOne = async (id) => {
    const previousApps = [...applications];
    setApplications((prev) => prev.filter((app) => app._id !== id));

    try {
      const response = await fetch(`${BASE_URL}/applications/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail }
      });
      if (!response.ok) throw new Error("Failed to delete");
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Could not remove application. Please try again.");
      setApplications(previousApps);
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
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error("Failed to save note");
    } catch (error) {
      console.error("Save note failed:", error);
      alert("Could not save note. Please try again.");
    }
  };
  const handleLogout = async () => {
    localStorage.removeItem("userEmail");
    setUserEmail(null);
    try {
      await fetch(`${BASE_URL}/logout`);
      setApplications([]);
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
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
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

  // Stats calculation
  const total = applications.length;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const newThisWeek = applications.filter(a => {
    const d = new Date(a.date || a.createdAt);
    return d >= weekAgo;
  }).length;

  const urgentDeadlines = applications.filter(a => {
    if (!a.deadlineISO) return false;
    const d = new Date(a.deadlineISO);
    return d.toDateString() === now.toDateString() && (a.status || "").toLowerCase() !== "done";
  }).length;

  const unmarkedCount = applications.filter(
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

  if (!userEmail) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Email Job Tracker</h1>
        <p style={{ marginBottom: '32px', color: '#6b7280' }}>Sign in to track your job applications via Gmail.</p>
        <a href={`${BASE_URL}/auth/google`} style={{ padding: '12px 24px', backgroundColor: '#0d9488', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background-color: #f5faf8; color: #171d1c; }
        
        .layout { display: flex; min-height: 100vh; }
        
        /* Sidebar */
        .sidebar { width: 280px; background-color: #f9fafb; border-right: 1px solid #e5e7eb; padding: 24px 16px; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 50; }
        .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding: 0 8px; }
        .logo-box { width: 40px; height: 40px; background: #ccfbf1; color: #0d9488; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 700; font-size: 16px; }
        .logo-text { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; color: #0d9488; line-height: 1.2; }
        .logo-sub { font-size: 12px; color: #6b7280; }
        
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: #6b7280; text-decoration: none; font-weight: 500; margin-bottom: 8px; cursor: pointer; transition: background 0.2s; font-size: 15px; }
        .nav-item:hover { background: #f3f4f6; color: #0d9488; }
        .nav-item.active { background: #fff; border-left: 4px solid #0d9488; color: #0d9488; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        
        .sidebar-bottom { margin-top: auto; border-top: 1px solid #e5e7eb; padding-top: 24px; }
        .sync-btn { width: 100%; padding: 12px; background: #0d9488; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; margin-bottom: 16px; transition: background 0.2s; font-size: 14px; }
        .sync-btn:hover { background: #0f766e; }
        
        /* Main Area */
        .main-wrapper { margin-left: 280px; flex: 1; display: flex; flex-direction: column; min-width: 0; }
        
        .topbar { height: 64px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(8px); border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; position: sticky; top: 0; z-index: 40; }
        .search-container input { padding: 10px 16px 10px 40px; border-radius: 999px; border: 1px solid #e5e7eb; background: #f9fafb url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 14px center; width: 320px; outline: none; font-size: 14px; transition: all 0.2s; }
        .search-container input:focus { border-color: #0d9488; box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.1); background-color: #fff; }
        .topbar-actions { display: flex; align-items: center; gap: 16px; }
        .user-badge { padding: 8px 16px; border-radius: 999px; background: #f0fdfa; border: 1px solid #ccfbf1; font-size: 13px; color: #0f766e; font-weight: 500; }
        .outline-btn { padding: 8px 16px; border: 1px solid #ccfbf1; background: #f0fdfa; color: #0f766e; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .outline-btn:hover { background: #ccfbf1; }
        
        /* Content */
        .content { padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
        .page-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: #171d1c; margin-bottom: 4px; }
        .page-subtitle { color: #3d4947; font-size: 15px; }
        
        /* Stats Section */
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
          gap: 20px; 
          margin-bottom: 32px; 
        }
        .stat-card { 
          background: #fff; 
          border: 1px solid #e2e8f0; 
          border-radius: 14px; 
          padding: 20px; 
          display: flex; 
          align-items: center; 
          gap: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        .stat-card:hover {
          transform: translateY(-4px);
          border-color: #cbd5e1;
          box-shadow: 0 12px 20px -5px rgba(0, 0, 0, 0.05);
        }
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .stat-card.total .stat-icon { 
          background: #f0fdfa; 
          color: #0d9488; 
          box-shadow: 0 0 15px rgba(13, 148, 136, 0.1);
        }
        .stat-card.urgent .stat-icon { 
          background: #fef2f2; 
          color: #dc2626; 
          box-shadow: 0 0 15px rgba(220, 38, 38, 0.1);
        }
        .stat-card.unmarked .stat-icon { 
          background: #fffbeb; 
          color: #d97706; 
          box-shadow: 0 0 15px rgba(217, 119, 6, 0.1);
        }
        .stat-content {
          display: flex;
          flex-direction: column;
        }
        .stat-label { 
          font-size: 12px; 
          font-weight: 600; 
          color: #64748b; 
          text-transform: uppercase;
          letter-spacing: 0.025em;
          margin-bottom: 2px;
        }
        .stat-main {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .stat-value { 
          font-size: 28px; 
          font-weight: 700; 
          color: #1e293b; 
          line-height: 1;
        }
        .stat-subtext {
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
        }
        .stat-trend {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
          background: #f0fdf4;
          color: #16a34a;
        }
        
        /* Filters */
        .filters { display: flex; gap: 8px; background: #f0f5f2; padding: 8px; border-radius: 12px; border: 1px solid #dee4e1; margin-bottom: 24px; overflow-x: auto; align-items: center; }
        .filter-btn { padding: 8px 16px; border-radius: 999px; border: none; background: transparent; color: #3d4947; font-weight: 500; font-size: 14px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
        .filter-btn.active { background: #00685f; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .filter-btn:hover:not(.active) { background: #e4e9e7; }
        
        /* App Grid */
        .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        .app-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .app-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          border-color: #cbd5e1;
        }
        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .app-info {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
        }
        .company-logo-container {
          width: 44px;
          height: 44px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }
        .app-card:hover .company-logo-container {
          transform: scale(1.05);
        }
        .company-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 4px;
        }
        .company-logo-fallback {
          font-weight: 700;
          font-size: 18px;
          color: #64748b;
        }
        .role-company {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .role-title {
          font-weight: 600;
          font-size: 15px;
          color: #1e293b;
          line-height: 1.2;
        }
        .company-name {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }
        .status-badge {
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        .status-new { background: #f5f3ff; color: #5b21b6; }
        .status-applied { background: #f1f5f9; color: #475569; }
        .status-interview { background: #f0fdfa; color: #0d9488; }
        .status-offer { background: #f0fdf4; color: #16a34a; }
        .status-rejected { background: #fef2f2; color: #dc2626; }
        .status-done { background: #f0fdfa; color: #0d9488; }
        .app-card.status-outline-new { border-color: #8b5cf6; }
        .app-card.status-outline-applied { border-color: #2563eb; }
        .app-card.status-outline-interview { border-color: #0d9488; }
        .app-card.status-outline-offer { border-color: #16a34a; }
        .app-card.status-outline-rejected { border-color: #dc2626; }
        .app-card.status-outline-done { border-color: #64748b; }
        .app-card.is-urgent { border-color: #dc2626; box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.18); }
        
        .app-footer { border-top: 1px solid #eaefed; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #6d7a77; }
        .email-info { display: flex; align-items: center; gap: 6px; }
        
        /* Modal Styles */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
        .modal-content { background: #fff; width: 100%; max-width: 480px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); padding: 32px; position: relative; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .modal-title { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 700; color: #171d1c; }
        .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #6d7a77; padding: 4px; line-height: 1; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
        .modal-close:hover { background: #f0f5f2; color: #171d1c; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 14px; font-weight: 600; color: #3d4947; margin-bottom: 6px; }
        .form-input, .form-select { width: 100%; padding: 10px 12px; border: 1px solid #dee4e1; border-radius: 8px; font-family: inherit; font-size: 15px; color: #171d1c; outline: none; transition: border-color 0.2s; background: #fff; }
        .form-input:focus, .form-select:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1); }
        .form-error { color: #ba1a1a; font-size: 14px; margin-bottom: 16px; background: #ffdad6; padding: 8px 12px; border-radius: 8px; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
        .btn-cancel { padding: 10px 20px; background: #f0f5f2; color: #3d4947; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-size: 14px; }
        .btn-cancel:hover { background: #dee4e1; }
        .btn-submit { padding: 10px 20px; background: #00685f; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-size: 14px; }
        .btn-submit:hover { background: #005049; }
        .btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }
        
        .btn-primary { padding: 8px 16px; background: #00685f; color: #fff; border: none; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { background: #005049; }
        .btn-danger { padding: 8px 16px; background: transparent; color: #ba1a1a; border: 1px solid #f5c2c7; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .btn-danger:hover:not(:disabled) { background: #ffdad6; border-color: #ba1a1a; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .new-tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; background: #d1fae5; color: #065f46; margin-left: 6px; vertical-align: middle; }
        
        .note-container { margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
        .note-input { width: 100%; padding: 10px; border: 1px solid #dee4e1; border-radius: 8px; font-family: inherit; font-size: 13px; color: #3d4947; outline: none; transition: border-color 0.2s; background: #f9fafb; resize: none; min-height: 60px; }
        .note-input:focus { border-color: #0d9488; background: #fff; }
        .note-save-hint { font-size: 11px; color: #9ca3af; text-align: right; margin-top: -4px; }
        
        .deadline-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 4px 10px;
          border-radius: 6px;
          width: fit-content;
          margin-top: -8px;
          font-weight: 500;
        }
        .deadline-badge.urgent {
          background: #fef2f2;
          color: #991b1b;
          font-weight: 600;
          border: 1px solid #fee2e2;
        }
        
        /* Card action buttons */
        .card-actions { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid #eaefed; }
        .card-btn { flex: 1; padding: 7px 0; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.18s; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
        .card-btn-apply { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .card-btn-apply:hover { background: #dbeafe; border-color: #93c5fd; }
        .card-btn-done { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .card-btn-done:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; }
        .card-btn-done:disabled { opacity: 0.55; cursor: default; }
        .card-btn-remove { background: #fff5f5; color: #b91c1c; border: 1px solid #fecaca; }
        .card-btn-remove:hover { background: #fee2e2; border-color: #fca5a5; }
        /* Done card blurring and dimming */
        .app-card.is-done { 
          opacity: 0.45; 
          filter: blur(1.2px) grayscale(0.2);
          transition: all 0.3s ease;
        }
        .app-card.is-done:hover {
          opacity: 0.7;
          filter: blur(0.4px);
        }
        .app-card.is-done .role-title { text-decoration: none; }
        
        /* Responsive Styles */
        .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; color: #0d9488; }
        .sidebar-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 45; backdrop-filter: blur(2px); }

        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%); transition: transform 0.3s ease; }
          .sidebar.open { transform: translateX(0); }
          .sidebar-overlay.show { display: block; }
          .main-wrapper { margin-left: 0; }
          .hamburger { display: block; }
          .topbar { padding: 0 16px; }
          .search-container input { width: 180px; }
          .topbar-actions { gap: 8px; }
          .content { padding: 20px 16px; }
          .page-title { font-size: 24px; }
          .stats-grid { grid-template-columns: 1fr; }
          .app-grid { grid-template-columns: 1fr; }
          .modal-content { padding: 20px; width: 95%; margin: 0 10px; }
        }

        @media (max-width: 480px) {
          .topbar { height: auto; padding: 12px 16px; flex-direction: column; gap: 12px; align-items: stretch; }
          .search-container { width: 100%; }
          .search-container input { width: 100%; }
          .topbar-actions { width: 100%; justify-content: center; flex-wrap: wrap; gap: 8px; }
          .topbar-actions > button { flex: 1; min-width: 100px; text-align: center; justify-content: center; display: flex; align-items: center; }
        }

        /* Dark Mode */
        .dark { background-color: #0f172a; color: #f1f5f9; min-height: 100vh; }
        .dark .sidebar { background-color: #1e293b; border-color: #334155; }
        .dark .logo-box { background: #0f766e; color: #ccfbf1; }
        .dark .logo-text { color: #2dd4bf; }
        .dark .nav-item { color: #94a3b8; }
        .dark .nav-item:hover { background: #334155; color: #2dd4bf; }
        .dark .nav-item.active { background: #0f172a; border-color: #2dd4bf; color: #2dd4bf; }
        .dark .sidebar-bottom { border-color: #334155; }
        
        .dark .topbar { background: rgba(30, 41, 59, 0.8); border-color: #334155; }
        .dark .search-container input { background-color: #1e293b; border-color: #334155; color: #f1f5f9; }
        .dark .search-container input:focus { border-color: #2dd4bf; background-color: #0f172a; }
        .dark .outline-btn { background: #1e293b; border-color: #0d9488; color: #2dd4bf; }
        .dark .outline-btn:hover { background: #0f766e; color: white; }
        
        .dark .page-title { color: #f8fafc; }
        .dark .page-subtitle { color: #cbd5e1; }
        
        .dark .stat-card { 
          background: #1e293b; 
          border-color: #334155; 
        }
        .dark .stat-card:hover {
          border-color: #475569;
        }
        .dark .stat-label { color: #94a3b8; }
        .dark .stat-value { color: #f8fafc; }
        .dark .stat-card.total .stat-icon { background: #064e3b; color: #2dd4bf; }
        .dark .stat-card.urgent .stat-icon { background: #450a0a; color: #fca5a5; }
        .dark .stat-card.unmarked .stat-icon { background: #451a03; color: #fbbf24; }
        .dark .stat-trend { background: #064e3b; color: #4ade80; }
        .dark .stat-subtext { color: #64748b; }
        
        .dark .filters { background: #1e293b; border-color: #334155; }
        .dark .filter-btn { color: #cbd5e1; }
        .dark .filter-btn.active { background: #0d9488; }
        .dark .filter-btn:hover:not(.active) { background: #334155; }
        
        /* Dark Mode Extensions */
        .dark .app-card {
          background: #1e293b;
          border-color: #334155;
        }
        .dark .app-card:hover {
          border-color: #475569;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
        }
        .dark .company-logo-container {
          background: #0f172a;
          border-color: #334155;
        }
        .dark .company-logo-fallback {
          color: #94a3b8;
        }
        .dark .role-title {
          color: #f1f5f9;
        }
        .dark .company-name {
          color: #94a3b8;
        }
        .dark .status-applied { background: #334155; color: #cbd5e1; }
        .dark .status-interview { background: #064e3b; color: #5eead4; }
        .dark .status-offer { background: #064e3b; color: #86efac; }
        .dark .status-rejected { background: #450a0a; color: #fca5a5; }
        .dark .status-done { background: #064e3b; color: #5eead4; }
        .dark .app-footer { border-color: #334155; color: #94a3b8; }
        
        .dark .modal-content { background: #1e293b; color: #f8fafc; }
        .dark .modal-title { color: #f8fafc; }
        .dark .form-label { color: #cbd5e1; }
        .dark .form-input, .dark .form-select { background: #0f172a; border-color: #334155; color: #f8fafc; }
        .dark .form-input:focus { border-color: #2dd4bf; }
        .dark .btn-cancel { background: #334155; color: #cbd5e1; }
        .dark .btn-cancel:hover { background: #475569; }
        .dark .note-input { background: #0f172a; border-color: #334155; color: #f1f5f9; }
        .dark .note-input:focus { background: #1e293b; border-color: #2dd4bf; }
        
        .dark .card-actions { border-color: #334155; }
        .dark .card-btn-done { background: #064e3b; border-color: #065f46; color: #34d399; }
        .dark .card-btn-done:hover:not(:disabled) { background: #065f46; border-color: #10b981; }
        .dark .card-btn-remove { background: #7f1d1d; border-color: #991b1b; color: #fca5a5; }
        .dark .card-btn-remove:hover { background: #991b1b; border-color: #b91c1c; }
        .dark .card-btn-apply { background: #1e3a5f; border-color: #1d4ed8; color: #93c5fd; }
        .dark .card-btn-apply:hover { background: #1d4ed8; color: #fff; }
        .dark .app-card.is-done .role-title { color: #94a3b8; }
        .dark .app-card.is-done { opacity: 0.35; filter: blur(1.5px) grayscale(0.4); }
        .dark .app-card.is-done:hover { opacity: 0.6; filter: blur(0.5px); }
        
        .dark .deadline-badge {
          background: #1e293b;
          color: #94a3b8;
        }
        .dark .deadline-badge.urgent {
          background: #450a0a;
          color: #fca5a5;
          border-color: #7f1d1d;
        }

        /* Company Info Styles */
        .company-short-desc {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          margin-top: -8px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          cursor: pointer;
          transition: color 0.2s;
        }
        .company-short-desc:hover {
          color: #0d9488;
        }
        .program-details {
          margin-top: 14px;
          border-left: 2px solid #0d9488;
          padding-left: 14px;
          color: #475569;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .program-detail {
          margin-bottom: 6px;
          display: flex;
          align-items: baseline;
        }
        .program-detail-label {
          font-weight: 600;
          color: #64748b;
          width: 70px;
          flex-shrink: 0;
        }
        .program-detail-value {
          color: #1e293b;
          font-weight: 500;
        }
        .dark .company-short-desc {
          color: #94a3b8;
        }
        .dark .company-short-desc:hover {
          color: #2dd4bf;
        }
        .dark .program-details {
          border-left-color: #0d9488;
          color: #94a3b8;
        }
        .dark .program-detail-label {
          color: #94a3b8;
        }
        .dark .program-detail-value {
          color: #f1f5f9;
        }

        .info-modal-content {
          max-width: 550px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eaefed;
        }
        .dark .info-grid {
          border-color: #334155;
        }
        .info-item-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .info-item-value {
          font-size: 14px;
          font-weight: 500;
          color: #1e293b;
        }
        .dark .info-item-value {
          color: #f1f5f9;
        }
        .info-description {
          font-size: 15px;
          line-height: 1.6;
          color: #475569;
          margin-bottom: 20px;
        }
        .dark .info-description {
          color: #cbd5e1;
        }
        
        /* Sync Warning Banner */
        .sync-warning-banner {
          background-color: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .sync-warning-content {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #991b1b;
          font-size: 14.5px;
          font-weight: 500;
        }
        .sync-warning-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .sync-reauth-btn {
          padding: 8px 16px;
          background-color: #dc2626;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13.5px;
          cursor: pointer;
          transition: background-color 0.2s;
          white-space: nowrap;
          text-decoration: none;
          display: inline-block;
        }
        .sync-reauth-btn:hover {
          background-color: #b91c1c;
        }
        .dark .sync-warning-banner {
          background-color: #450a0a;
          border-color: #7f1d1d;
        }
        .dark .sync-warning-content {
          color: #fca5a5;
        }
        .dark .sync-reauth-btn {
          background-color: #ef4444;
        }
        .dark .sync-reauth-btn:hover {
          background-color: #dc2626;
        }
      `}} />

      <div className={`layout ${isDarkMode ? 'dark' : ''}`}>
        <div className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

        <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="logo-box">ET</div>
            <div>
              <div className="logo-text">Email Tracker</div>
              <div className="logo-sub">Dashboard</div>
            </div>
          </div>

          <nav>
            <div className={`nav-item active`} onClick={() => setActiveFilter("all")}>
              Dashboard
            </div>
          </nav>

          <div className="sidebar-bottom">
            <button className="sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Emails"}
            </button>
            {lastSyncTime && (
              <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '-12px', marginBottom: '16px' }}>
                Last synced: {new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            <div className="nav-item" onClick={handleLogout} style={{ marginTop: 0, color: '#ba1a1a' }}>
              <span>Sign Out</span>
            </div>
          </div>
        </aside>

        <div className="main-wrapper">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="hamburger" onClick={() => setIsSidebarOpen(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="topbar-actions">
              <button 
                onClick={toggleDarkMode} 
                className="outline-btn" 
                style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Toggle Dark Mode"
              >
                {isDarkMode ? "☀️" : "🌙"}
              </button>
              <div className="user-badge">
                <span className="user-email">{userEmail}</span>
              </div>
              <button className="outline-btn" onClick={handleLogout} style={{ background: '#fef2f2', borderColor: '#fee2e2', color: '#991b1b' }}>
                Logout
              </button>
              <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                + Add Application
              </button>
              <button className="outline-btn" onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Emails"}
              </button>
              <button className="btn-danger" onClick={handleClearAll} disabled={clearing}>
                {clearing ? "Clearing..." : "Clear All"}
              </button>
            </div>
          </header>

          <main className="content">
            {syncStatus === "failed" && (
              <div className="sync-warning-banner">
                <div className="sync-warning-content">
                  <span className="sync-warning-icon">⚠️</span>
                  <span>
                    <strong>Gmail Connection Expired:</strong> {syncError || "The dashboard has stopped updating. Please re-authenticate."}
                  </span>
                </div>
                <a href={`${BASE_URL}/auth/google`} className="sync-reauth-btn">
                  Re-authenticate
                </a>
              </div>
            )}

            <div className="page-header">
              <div>
                <h2 className="page-title">Applications Overview</h2>
                <p className="page-subtitle">Track and manage your active job pursuits.</p>
              </div>
            </div>

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

            <div className="filters">
              {[
                { label: "All", value: "all" },
                { label: "Deadlines Today", value: "deadlines" },
                { label: "New", value: "new" },
                { label: "Interview", value: "interview" },
                { label: "Applied", value: "applied" },
                { label: "Done", value: "done" },
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
              <p style={{ color: '#6d7a77', marginTop: 24 }}>Loading applications...</p>
            ) : (
              <div className="app-grid">
                {applications
                  .filter((app) => {
                    const query = searchQuery.toLowerCase();
                    const matchesSearch =
                      (app.company || "").toLowerCase().includes(query) ||
                      (app.role || "").toLowerCase().includes(query);

                    const s = (app.status || "").toLowerCase();
                    const isDeadlineToday = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString();
                    const matchesFilter =
                      activeFilter === "all" ||
                      (activeFilter === "deadlines" && isDeadlineToday) ||
                      (activeFilter === "unmarked" && s !== "done") ||
                      activeFilter === s;

                    return matchesSearch && matchesFilter;
                  })
                  .sort((a, b) => {
                    const dateA = new Date(a.deadlineISO || a.date || a.createdAt || 0);
                    const dateB = new Date(b.deadlineISO || b.date || b.createdAt || 0);
                    return dateB - dateA;
                  })
                  .map((app) => {
                    const dateToShow = app.deadlineISO || app.date || app.testDate || app.createdAt;
                    const formattedDate = dateToShow
                      ? new Date(dateToShow).toLocaleString(undefined, app.deadlineISO ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' })
                      : "N/A";
                    const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();
                    const statusKey = (app.status || "new").toLowerCase();
                    const isUrgent = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString() && statusKey !== "done";
                    const isDone = statusKey === "done";

                    return (
                      <div key={app._id} className={`app-card status-outline-${statusKey}${isUrgent ? " is-urgent" : ""}${isDone ? " is-done" : ""}`}>
                        <div className="app-header">
                          <div className="app-info">
                            <div className="company-logo-container">
                              {app.companyInfo?.logo || app.companyInfo?.domain ? (
                                <img 
                                  src={app.companyInfo?.logo || `https://www.google.com/s2/favicons?domain=${app.companyInfo?.domain}&sz=128`} 
                                  alt={app.company}
                                  className="company-logo-img"
                                  onError={(e) => {
                                    const domain = app.companyInfo?.domain || `${app.company.toLowerCase().replace(/\s+/g, '')}.com`;
                                    if (!e.target.src.includes('google.com')) {
                                      e.target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                                    } else {
                                      e.target.onerror = null;
                                      e.target.style.display = 'none';
                                      if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className="company-logo-fallback" style={{ display: (app.companyInfo?.logo || app.companyInfo?.domain) ? 'none' : 'flex' }}>
                                {companyInitials}
                              </div>
                            </div>
                            <div className="role-company">
                              <div className="role-title">{app.company || "Unknown Company"}</div>
                              {app.role && app.role.toLowerCase() !== "unknown role" && (
                                <div className="company-name">{app.role}</div>
                              )}
                            </div>
                          </div>
                          <div className="status-badge-container">
                            <span className={`status-badge status-${(app.status || "applied").toLowerCase()}`}>
                              {app.status || "applied"}
                            </span>
                          </div>
                        </div>

                        {app.companyInfo?.shortDescription && (
                          <p 
                            className="company-short-desc"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApp(app);
                              setShowInfoModal(true);
                            }}
                          >
                            {app.companyInfo.shortDescription}
                          </p>
                        )}

                        {(() => {
                          const hasDetails = [app.programRoles, app.programDuration, app.programStipend, app.deadlineText].some(v => v && v.trim().length > 0);
                          if (!hasDetails) return null;
                          
                          return (
                            <div className="program-details">
                              {app.programRoles && (
                                <div className="program-detail">
                                  <span className="program-detail-label">Roles</span>
                                  <span className="program-detail-value">{app.programRoles}</span>
                                </div>
                              )}
                              {app.programDuration && (
                                <div className="program-detail">
                                  <span className="program-detail-label">Duration</span>
                                  <span className="program-detail-value">{app.programDuration}</span>
                                </div>
                              )}
                              {app.programStipend && (
                                <div className="program-detail">
                                  <span className="program-detail-label">Stipend</span>
                                  <span className="program-detail-value">{app.programStipend}</span>
                                </div>
                              )}
                              {app.deadlineText && (
                                <div className="program-detail">
                                  <span className="program-detail-label">Deadline</span>
                                  <span className="program-detail-value">{app.deadlineText}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {app.deadline && !app.deadlineText && (
                          <div className={`deadline-badge ${
                            app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString() 
                            ? 'urgent' : ''
                          }`}>
                            Deadline: {app.deadline}
                          </div>
                        )}

                        <div className="app-footer">
                          <div className="email-info">
                            <span style={{ fontSize: 16 }}>✉️</span>
                            <span>{app.email || "user@gmail.com"}</span>
                          </div>
                          <span>{formattedDate}</span>
                        </div>

                        <div className="note-container">
                          <textarea
                            className="note-input"
                            placeholder="Add a personal note..."
                            value={app.note || ""}
                            onChange={(e) => handleUpdateNote(app._id, e.target.value)}
                            onBlur={(e) => handleSaveNote(app._id, e.target.value)}
                          />
                          <div className="note-save-hint">Auto-saves on blur</div>
                        </div>

                        <div className="card-actions">
                          {app.link && (
                            <a
                              className="card-btn card-btn-apply"
                              href={app.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleApply(app._id)}
                            >
                              {app.isFormLink ? "📋 Apply (Form)" : "🔗 Open Link"}
                            </a>
                          )}
                          <button
                            className="card-btn card-btn-done"
                            onClick={() => handleMarkDone(app._id)}
                            disabled={isDone}
                          >
                            {isDone ? "✓ Done" : "✓ Mark Done"}
                          </button>
                          <button
                            className="card-btn card-btn-remove"
                            onClick={() => handleDeleteOne(app._id)}
                          >
                            🗑 Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!loading && applications.length === 0 && (
              <p style={{ textAlign: 'center', marginTop: 60, color: '#6d7a77' }}>No applications found. Try syncing emails.</p>
            )}
          </main>
        </div>
      </div>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Add Application</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleAddSubmit}>
              {formError && <div className="form-error">{formError}</div>}

              <div className="form-group">
                <label className="form-label">Company *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Google"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Software Engineer"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. user@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInfoModal && selectedApp && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div className="modal-content info-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{selectedApp.company}</h3>
                <p style={{ fontSize: '14px', color: '#64748b' }}>Company Details</p>
              </div>
              <button className="modal-close" onClick={() => setShowInfoModal(false)}>&times;</button>
            </div>

            <div className="info-description">
              {selectedApp.companyInfo?.fullDescription || "No detailed description available."}
            </div>

            {(selectedApp.programRoles || selectedApp.programDuration || selectedApp.programStipend || selectedApp.deadlineText) && (
              <div className="program-details" style={{ marginBottom: '20px' }}>
                {selectedApp.programRoles && (
                  <div className="program-detail">
                    <span className="program-detail-label">Roles:</span>
                    <span>{selectedApp.programRoles}</span>
                  </div>
                )}
                {selectedApp.programDuration && (
                  <div className="program-detail">
                    <span className="program-detail-label">Duration:</span>
                    <span>{selectedApp.programDuration}</span>
                  </div>
                )}
                {selectedApp.programStipend && (
                  <div className="program-detail">
                    <span className="program-detail-label">Stipend:</span>
                    <span>{selectedApp.programStipend}</span>
                  </div>
                )}
                {selectedApp.deadlineText && (
                  <div className="program-detail">
                    <span className="program-detail-label">Deadline:</span>
                    <span>{selectedApp.deadlineText}</span>
                  </div>
                )}
              </div>
            )}

            <div className="info-grid">
              <div>
                <div className="info-item-label">Industry</div>
                <div className="info-item-value">{selectedApp.companyInfo?.industry || "N/A"}</div>
              </div>
              <div>
                <div className="info-item-label">Type</div>
                <div className="info-item-value">{selectedApp.companyInfo?.companyType || "N/A"}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div className="info-item-label">Headquarters</div>
                <div className="info-item-value">{selectedApp.companyInfo?.headquarters || "N/A"}</div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setShowInfoModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

