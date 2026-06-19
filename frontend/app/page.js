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
    stipend: "",
    ctc: "",
    duration: "",
    location: "",
    joining: "",
    deadline: "",
    date: "",
    link: ""
  });

  // Edit Application Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState("");
  const [editFormData, setEditFormData] = useState({});

  // Company Info Modal State
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);

  const [userEmail, setUserEmail] = useState(null);
  //test comment
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

  // Auto-refresh when syncing in background
  useEffect(() => {
    let intervalId;
    if (syncStatus === "pending") {
      intervalId = setInterval(() => {
        fetchSyncStatus();
        fetchApplicationsSilent();
      }, 5000);
    }
    return () => clearInterval(intervalId);
  }, [syncStatus, userEmail]);

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
      console.debug("[FETCH_APPLICATIONS] count=", data.length);
      if (data.length > 0) {
        console.debug("[FETCH_APPLICATIONS_SAMPLE]", {
          company: data[0].company,
        });
      }
      setApplications(data);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApplicationsSilent = async () => {
    if (!userEmail) return;
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
      console.error("Failed to fetch applications silently:", error);
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
      const response = await fetch(`${BASE_URL}/clear-all-applications`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail }
      });
      if (!response.ok) throw new Error("Clear failed");
      const data = await response.json();
      alert(`All applications cleared. (${data.deletedCount ?? "?"} records removed)`);
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

    if (!formData.company) {
      setFormError("Company is required.");
      return;
    }

    setSubmitting(true);
    try {
      const displayFields = [];
      if (formData.ctc) displayFields.push({ label: "CTC", value: formData.ctc });
      if (formData.joining) displayFields.push({ label: "Joining", value: formData.joining });
      if (formData.stipend) displayFields.push({ label: "Stipend", value: formData.stipend });
      if (formData.duration) displayFields.push({ label: "Duration", value: formData.duration });
      if (formData.deadline) displayFields.push({ label: "Deadline", value: formData.deadline });
      if (formData.location) displayFields.push({ label: "Location", value: formData.location });

      const payload = {
        company: formData.company,
        role: formData.role || "Not Specified",
        programStipend: formData.stipend,
        salaryText: formData.ctc,
        programDuration: formData.duration,
        venue: formData.location,
        deadlineText: formData.deadline,
        date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
        link: formData.link,
        displayFields: displayFields,
        source: "Manual Addition",
        status: "new"
      };

      const response = await fetch(`${BASE_URL}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to add application");
      }

      setShowAddModal(false);
      setFormData({ company: "", role: "", stipend: "", ctc: "", duration: "", location: "", joining: "", deadline: "", date: "", link: "" });
      await fetchApplications();
    } catch (error) {
      console.error(error);
      setFormError("Failed to add application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditFormError("");
    setEditSubmitting(true);

    const manualEdits = {};
    const original = editingApp;

    if (editFormData.company !== (original.company || "")) manualEdits.company = editFormData.company;
    if (editFormData.role !== (original.subtitle || original.role || "")) {
      manualEdits.role = editFormData.role;
      manualEdits.subtitle = editFormData.role;
    }
    if (editFormData.stipend !== (original.programStipend || "")) manualEdits.programStipend = editFormData.stipend;
    if (editFormData.ctc !== (original.salaryText || "")) manualEdits.salaryText = editFormData.ctc;
    if (editFormData.duration !== (original.programDuration || "")) manualEdits.programDuration = editFormData.duration;
    if (editFormData.location !== (original.venue || "")) manualEdits.venue = editFormData.location;
    if (editFormData.deadline !== (original.deadlineText || "")) manualEdits.deadlineText = editFormData.deadline;
    if (editFormData.link !== (original.link || "")) manualEdits.link = editFormData.link;

    if (editFormData.date) {
      const fd = new Date(editFormData.date).toISOString();
      const od = original.date ? new Date(original.date).toISOString() : null;
      if (fd !== od) manualEdits.date = fd;
    }

    const displayFields = [];
    if (editFormData.role) displayFields.push({ label: "Role", value: editFormData.role });
    if (editFormData.ctc) displayFields.push({ label: "CTC", value: editFormData.ctc });
    if (editFormData.joining) displayFields.push({ label: "Joining", value: editFormData.joining });
    if (editFormData.stipend) displayFields.push({ label: "Stipend", value: editFormData.stipend });
    if (editFormData.duration) displayFields.push({ label: "Duration", value: editFormData.duration });
    if (editFormData.deadline) displayFields.push({ label: "Deadline", value: editFormData.deadline });
    if (editFormData.location) displayFields.push({ label: "Location", value: editFormData.location });

    if (editFormData.dynamicFields && editFormData.dynamicFields.length > 0) {
      editFormData.dynamicFields.forEach(df => {
        if (df.value) displayFields.push({ label: df.label, value: df.value });
      });
    }

    if (displayFields.length > 0) {
      manualEdits.displayFields = displayFields;
    } else {
      manualEdits.displayFields = [];
    }

    if (Object.keys(manualEdits).length === 0) {
      setShowEditModal(false);
      setEditSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/applications/${editingApp._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
        body: JSON.stringify({ manualEdits })
      });

      if (!response.ok) throw new Error("Failed to update application");

      setApplications(prev => prev.map(app => {
        if (app._id === editingApp._id) {
          return { ...app, ...manualEdits };
        }
        return app;
      }));

      setShowEditModal(false);
    } catch (error) {
      console.error(error);
      setEditFormError("Failed to update application. Please try again.");
    } finally {
      setEditSubmitting(false);
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
    (a) => (a.status || "").toLowerCase() === "new"
  ).length;



  const isAddedToday = (app) => {
    const raw = app.date || app.createdAt;
    if (!raw) return false;
    const appDate = new Date(raw);
    const now = new Date();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    return (now - appDate) <= oneDayInMs && (now - appDate) >= 0;
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
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap');
        
        :root {
          /* Light Mode Tokens */
          --bg-color: #f5f7fa;
          --surface-color: #ffffff;
          --text-primary: #475569;
          --text-heading: #0f172a;
          --text-secondary: #64748b;
          --border-color: #e2e8f0;
          --brand-primary: #2563eb;
          --brand-primary-hover: #1d4ed8;
          --sidebar-bg: #f9fafb;
          --font-geist: 'Geist', 'Inter', sans-serif;
          --radius-card: 16px;
          --radius-btn: 8px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--font-geist); background-color: var(--bg-color); color: var(--text-primary); transition: background-color 0.25s ease-out, color 0.25s ease-out; }
        
        .layout { display: flex; min-height: 100vh; }
        
        /* Sidebar */
        .sidebar { width: 280px; background-color: #f3f4f6a6; border-right: 1px solid #e5e7eb; padding: 24px 16px; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 50; }
        .sidebar-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding: 0 8px; }
        .logo-box { width: 40px; height: 40px; background: #ccfbf1; color: #0d9488; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 700; font-size: 16px; }
        .logo-text { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; color: #0d9488; line-height: 1.2; }
        .logo-sub { font-size: 12px; color: #6b7280; }
        
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: #475569; text-decoration: none; font-weight: 500; margin-bottom: 8px; cursor: pointer; transition: background-color 0.15s ease-out, color 0.15s ease-out; font-size: 15px; }
        .nav-item:hover { background: #e5e7eb; color: #0f172a; }
        .nav-item.active { background: #ecfdf5; border-left: 4px solid #14b8a6; color: #0f766e; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        
        .sidebar-bottom { margin-top: auto; border-top: 1px solid #e5e7eb; padding-top: 24px; }
        .sync-btn { width: 100%; padding: 12px; background: var(--brand-primary); color: white; border: none; border-radius: var(--radius-btn); font-weight: 600; cursor: pointer; margin-bottom: 16px; transition: background-color 0.2s ease-out, transform 0.15s ease-out, filter 0.2s ease-out; font-size: 14px; }
        .sync-btn:hover:not(:disabled) { filter: brightness(1.05); }
        .sync-btn:active:not(:disabled) { transform: scale(0.98); }
        .sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        
        /* Main Area */
        .main-wrapper { margin-left: 280px; flex: 1; display: flex; flex-direction: column; min-width: 0; }
        
        .topbar { height: 64px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(8px); border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; position: sticky; top: 0; z-index: 40; }
        .search-container input { padding: 9px 16px 9px 40px; border-radius: 999px; border: 1px solid var(--border-color); background: var(--surface-color) url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 14px center; width: 320px; outline: none; font-size: 14px; color: var(--text-primary); transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out; }
        .search-container input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); background-color: var(--surface-color); }
        .search-container input::placeholder { color: var(--text-secondary); }
        .topbar-actions { display: flex; align-items: center; gap: 16px; }
        .user-dropdown-container { position: relative; }
        .user-avatar-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--brand-primary); color: white; border: none; font-weight: 600; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-out; }
        .user-avatar-btn:hover { filter: brightness(1.1); transform: scale(1.05); }
        .user-dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); width: 200px; overflow: hidden; z-index: 100; animation: scaleUp 0.15s ease-out; }
        .user-dropdown-header { padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-size: 13px; color: var(--text-secondary); word-break: break-all; }
        .user-dropdown-item { width: 100%; text-align: left; padding: 10px 16px; background: transparent; border: none; font-size: 13px; color: var(--text-primary); cursor: pointer; transition: background-color 0.15s ease-out; }
        .user-dropdown-item:hover { background: var(--bg-color); }
        .user-dropdown-item.text-danger { color: #dc2626; }
        .dark .user-dropdown-item.text-danger { color: #ef4444; }
        .floating-add-btn { position: fixed; bottom: 32px; right: 32px; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(37,99,235,0.5), 0 0 40px rgba(37,99,235,0.25); z-index: 50; padding: 0; background: #2563eb; color: white; border: none; cursor: pointer; transition: all 0.2s ease-out; }
        .floating-add-btn:hover { background: #1d4ed8; transform: scale(1.05); box-shadow: 0 0 25px rgba(37,99,235,0.6), 0 0 50px rgba(37,99,235,0.3); filter: none; }
        .dark .floating-add-btn { box-shadow: 0 0 20px rgba(255, 255, 255, 0.25), 0 0 40px rgba(255, 255, 255, 0.1); }
        .dark .floating-add-btn:hover { box-shadow: 0 0 25px rgba(255, 255, 255, 0.35), 0 0 50px rgba(255, 255, 255, 0.15); }
        .outline-btn { padding: 8px 16px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-primary); border-radius: var(--radius-btn); font-weight: 500; font-size: 13px; cursor: pointer; transition: all 0.2s ease; }
        .outline-btn:hover { background: var(--bg-color); border-color: #cbd5e1; }
        .btn-outline-primary { padding: 8px 16px; border: 1px solid #cbd5e1; background: #ffffff; color: var(--brand-primary); border-radius: var(--radius-btn); font-weight: 500; font-size: 13px; cursor: pointer; transition: all 0.2s ease-out; }
        .btn-outline-primary:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; filter: none; }
        .btn-outline-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-outline-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .dark .btn-outline-primary { background: transparent; border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }
        .dark .btn-outline-primary:hover:not(:disabled) { background: rgba(59, 130, 246, 0.1); border-color: #60a5fa; filter: none; }
        
        /* Content */
        .content { padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
        .page-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: var(--text-heading); margin-bottom: 4px; }
        .page-subtitle { color: #64748b; font-size: 15px; }
        
        /* Stats Section */
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
          gap: 20px; 
          margin-bottom: 32px; 
        }
        .stat-card { 
          background: var(--surface-color); 
          border: 1px solid var(--border-color); 
          border-radius: var(--radius-card); 
          padding: 20px; 
          display: flex; 
          align-items: center; 
          gap: 16px;
          transition: all 0.2s ease-out;
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }
        .stat-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
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
          background: rgba(16,185,129,0.10); 
          color: #10B981; 
        }
        .stat-card.urgent .stat-icon { 
          background: rgba(245,158,11,0.10); 
          color: #F59E0B; 
        }
        .stat-card.unmarked .stat-icon { 
          background: rgba(99,102,241,0.10); 
          color: #6366F1; 
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
        .filters { display: flex; gap: 8px; background: var(--surface-color); padding: 8px; border-radius: var(--radius-card); border: 1px solid var(--border-color); margin-bottom: 24px; overflow-x: auto; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.01); }
        .filter-btn { padding: 8px 16px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--text-secondary); font-weight: 500; font-size: 13.5px; cursor: pointer; white-space: nowrap; transition: all 0.15s ease-out; }
        .filter-btn.active { background: var(--text-primary); color: var(--surface-color); box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-weight: 600; }
        .filter-btn:hover:not(.active) { background: var(--bg-color); color: var(--text-primary); border-color: var(--border-color); }
        
        /* App Grid */
        .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        .app-card {
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 18px;
          transition: all 0.2s ease-out;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }
        .app-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
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
          transition: transform 0.2s ease-out;
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
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border: 1px solid transparent;
        }
        .status-new { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
        .status-unmarked { background: #fef3c7; color: #92400e; border-color: #fde68a; }
        .status-applied { background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }
        .status-done { background: #f3f4f6; color: #6b7280; border-color: #e5e7eb; }
        .app-card.status-outline-new { border-color: #a7f3d0; }
        .app-card.status-outline-unmarked { border-color: #fde68a; }
        .app-card.status-outline-applied { border-color: #c7d2fe; }
        .app-card.status-outline-done { border-color: #e5e7eb; }
        .app-card.is-urgent { border-color: #dc2626; box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.18); }
        
        .app-footer { border-top: 1px solid #eaefed; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #6d7a77; }
        .email-info { display: flex; align-items: center; gap: 6px; }
        
        /* Modal Styles */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease-out; }
        .modal-content { background: #fff; width: 100%; max-width: 480px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); padding: 32px; position: relative; animation: scaleUp 0.25s ease-out; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .modal-title { font-family: 'Manrope', sans-serif; font-size: 24px; font-weight: 700; color: #171d1c; }
        .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #6d7a77; padding: 4px; line-height: 1; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: background-color 0.15s ease-out, color 0.15s ease-out; }
        .modal-close:hover { background: var(--bg-color); color: var(--text-primary); }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .form-input, .form-select { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-btn); font-family: inherit; font-size: 14px; color: var(--text-primary); outline: none; transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out; background: var(--surface-color); }
        .form-input:focus, .form-select:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
        .form-error { color: #b91c1c; font-size: 13px; margin-bottom: 16px; background: #fef2f2; padding: 10px 12px; border-radius: 8px; border: 1px solid #fecaca; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
        .btn-cancel { padding: 9px 18px; background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; border-radius: var(--radius-btn); font-weight: 500; cursor: pointer; transition: background 0.2s; font-size: 13.5px; }
        .btn-cancel:hover { background: #e5e7eb; color: #111827; }
        .btn-submit { padding: 9px 18px; background: var(--brand-primary); color: #fff; border: none; border-radius: var(--radius-btn); font-weight: 500; cursor: pointer; transition: background-color 0.2s ease-out, transform 0.15s ease-out, filter 0.2s ease-out; font-size: 13.5px; }
        .btn-submit:hover:not(:disabled) { filter: brightness(1.05); }
        .btn-submit:active:not(:disabled) { transform: scale(0.98); }
        .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .btn-primary { padding: 7px 14px; background: var(--brand-primary); color: #fff; border: none; border-radius: var(--radius-btn); font-weight: 500; font-size: 13px; cursor: pointer; transition: background-color 0.2s ease-out, transform 0.15s ease-out, filter 0.2s ease-out; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
        .btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-danger { padding: 7px 14px; background: transparent; color: #dc2626; border: 1px solid #fca5a5; border-radius: var(--radius-btn); font-weight: 500; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #ef4444; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .new-tag { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; background: #dbeafe; color: #1e40af; margin-left: 8px; vertical-align: middle; }
        
        .note-container { margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
        .note-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; font-size: 13px; color: var(--text-primary); outline: none; transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out; background: #f8fafc; resize: none; min-height: 60px; }
        .note-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); background: #ffffff; }
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
        .card-actions { display: flex; gap: 8px; padding-top: 14px; border-top: 1px solid var(--border-color); }
        .card-btn { flex: 1; padding: 7px 0; border-radius: 6px; border: 1px solid transparent; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 0.15s ease-out; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
        .card-btn-apply { background: var(--brand-primary); color: #ffffff; }
        .card-btn-apply:hover:not(:disabled) { filter: brightness(1.05); }
        .card-btn-apply:active:not(:disabled) { transform: scale(0.98); }
        .card-btn-done { background: #f3f4f6; color: #111827; border-color: #e5e7eb; }
        .card-btn-done:hover:not(:disabled) { background: #e5e7eb; }
        .card-btn-done:disabled { opacity: 0.5; cursor: default; }
        .card-btn-remove { background: #fff; color: #dc2626; border-color: #fca5a5; }
        .card-btn-remove:hover { background: #fef2f2; border-color: #ef4444; }
        .card-btn-edit { background: #fff; color: #4b5563; border-color: #e5e7eb; }
        .card-btn-edit:hover { background: #f9fafb; border-color: #cbd5e1; color: #111827; }
        /* Done card blurring and dimming */
        .app-card.is-done { 
          opacity: 0.45; 
          filter: blur(1.2px) grayscale(0.2);
          transition: all 0.3s ease-out;
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
        .dark { 
          --bg-color: #030712;
          --surface-color: #1f2937;
          --text-primary: #f9fafb;
          --text-heading: #ffffff;
          --text-secondary: #9ca3af;
          --border-color: #374151;
          --brand-primary: #3b82f6;
          --brand-primary-hover: #60a5fa;

          background-color: var(--bg-color); 
          color: var(--text-primary); 
          min-height: 100vh; 
        }
        .dark .sidebar { background-color: #111827; border-color: #1f2937; }
        .dark .logo-box { background: #0f766e; color: #ccfbf1; }
        .dark .logo-text { color: #2dd4bf; }
        .dark .nav-item { color: #9ca3af; }
        .dark .nav-item:hover { background: #1f2937; color: #f9fafb; }
        .dark .nav-item.active { background: #374151; border-color: #2dd4bf; color: #2dd4bf; }
        .dark .sidebar-bottom { border-color: #1f2937; }
        
        .dark .topbar { background: rgba(3, 7, 18, 0.8); border-color: var(--border-color); }
        .dark .search-container input { background-color: #111827; border-color: var(--border-color); color: var(--text-primary); }
        .dark .search-container input:focus { border-color: var(--brand-primary); background-color: #111827; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dark .search-container input::placeholder { color: var(--text-secondary); }
        .dark .outline-btn { background: var(--surface-color); border-color: var(--border-color); color: var(--text-primary); }
        .dark .outline-btn:hover { background: #374151; border-color: #4b5563; color: #ffffff; }
        
        .dark .page-title { color: #f8fafc; }
        .dark .page-subtitle { color: #cbd5e1; }
        
        .dark .stat-card { 
          background: var(--surface-color); 
          border-color: var(--border-color); 
        }
        .dark .stat-card:hover {
          border-color: #3f3f46;
        }
        .dark .stat-label { color: #94a3b8; }
        .dark .stat-value { color: #f8fafc; }
        .dark .stat-card.total .stat-icon { background: #064e3b; color: #2dd4bf; }
        .dark .stat-card.urgent .stat-icon { background: #450a0a; color: #fca5a5; }
        .dark .stat-card.unmarked .stat-icon { background: #451a03; color: #fbbf24; }
        .dark .stat-trend { background: #064e3b; color: #4ade80; }
        .dark .stat-subtext { color: #64748b; }
        
        .dark .filters { background: var(--surface-color); border-color: var(--border-color); }
        .dark .filter-btn { color: var(--text-secondary); }
        .dark .filter-btn.active { background: var(--text-primary); color: var(--surface-color); }
        .dark .filter-btn:hover:not(.active) { background: var(--bg-color); border-color: var(--border-color); color: var(--text-primary); }
        
        /* Dark Mode Extensions */
        .dark .app-card {
          background: #111827;
          border-color: var(--border-color);
        }
        .dark .app-card:hover {
          border-color: #3f3f46;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
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
        .dark .status-new { background: rgba(75, 85, 99, 0.2); color: #9ca3af; border-color: rgba(107, 114, 128, 0.3); }
        .dark .status-applied { background: rgba(55, 48, 163, 0.2); color: #a5b4fc; border-color: rgba(79, 70, 229, 0.3); }
        .dark .status-interview { background: rgba(22, 101, 52, 0.2); color: #86efac; border-color: rgba(34, 197, 94, 0.3); }
        .dark .status-offer { background: rgba(30, 64, 175, 0.2); color: #93c5fd; border-color: rgba(59, 130, 246, 0.3); }
        .dark .status-rejected { background: rgba(153, 27, 27, 0.2); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
        .dark .status-done { background: rgba(75, 85, 99, 0.2); color: #9ca3af; border-color: rgba(107, 114, 128, 0.3); }
        .dark .app-footer { border-color: #334155; color: #94a3b8; }
        
        .dark .modal-content { background: var(--surface-color); color: var(--text-primary); border: 1px solid var(--border-color); }
        .dark .modal-title { color: var(--text-primary); }
        .dark .form-label { color: var(--text-secondary); }
        .dark .form-input, .dark .form-select { background: var(--bg-color); border-color: var(--border-color); color: var(--text-primary); }
        .dark .form-input:focus, .dark .form-select:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dark .btn-cancel { background: transparent; border-color: var(--border-color); color: var(--text-primary); }
        .dark .btn-cancel:hover { background: #27272a; border-color: #3f3f46; color: #fff; }
        .dark .note-input { background: var(--bg-color); border-color: var(--border-color); color: var(--text-primary); }
        .dark .note-input:focus { background: var(--surface-color); border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        
        .dark .card-actions { border-color: var(--border-color); }
        .dark .card-btn-done { background: #27272a; border-color: transparent; color: #fafafa; }
        .dark .card-btn-done:hover:not(:disabled) { background: #3f3f46; border-color: #52525b; }
        .dark .card-btn-remove { background: transparent; border-color: #7f1d1d; color: #fca5a5; }
        .dark .card-btn-remove:hover { background: rgba(153, 27, 27, 0.2); border-color: #991b1b; }
        .dark .card-btn-apply { background: var(--brand-primary); border-color: transparent; color: #ffffff; }
        .dark .card-btn-apply:hover { background: var(--brand-primary-hover); }
        .dark .card-btn-edit { background: transparent; border-color: var(--border-color); color: var(--text-secondary); }
        .dark .card-btn-edit:hover { background: #27272a; border-color: #3f3f46; color: var(--text-primary); }
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

        /* Event / Hackathon type badge */
        .event-type-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: #0f766e;
          background: #f0fdfa;
          border: 1px solid #99f6e4;
          padding: 3px 10px;
          border-radius: 6px;
          width: fit-content;
          margin-top: 2px;
          letter-spacing: 0.01em;
        }
        .dark .event-type-badge {
          background: #022c22;
          border-color: #065f46;
          color: #2dd4bf;
        }

        .info-modal-content {
          max-width: 550px;
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
            <div className="logo-box">📧</div>
            <div>
              <div className="logo-text">Email Tracker</div>
              <div className="logo-sub">Placement Department Mails</div>
            </div>
          </div>

          <nav>
            {[
              { label: "Dashboard", value: "all" },
              { label: "New", value: "new" },
              { label: "Deadline today", value: "deadlines" },
              { label: "Applied", value: "applied" },
              { label: "Done", value: "done" },
              { label: "Unmarked", value: "unmarked" },
            ].map(({ label, value }) => (
              <div
                key={value}
                className={`nav-item ${activeFilter === value ? 'active' : ''}`}
                onClick={() => setActiveFilter(value)}
              >
                {label}
              </div>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="nav-item" style={{ marginTop: 0 }}>
              <span>Support ⚙️</span>
            </div>
          </div>
        </aside>

        <div className="main-wrapper">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, marginRight: '24px' }}>
              <button className="hamburger" onClick={() => setIsSidebarOpen(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="search-container" style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn-outline-primary" onClick={handleSync} disabled={syncing || syncStatus === "pending"}>
                {(syncing || syncStatus === "pending") ? "Syncing" : "Sync Emails"}
              </button>
              <button className="btn-danger" onClick={handleClearAll} disabled={clearing}>
                {clearing ? "Clearing..." : "Clear All"}
              </button>

              <div className="user-dropdown-container">
                <button
                  className="user-avatar-btn"
                  onClick={() => { setShowUserDropdown(!showUserDropdown); setShowThemeSubmenu(false); }}
                >
                  U
                </button>
                {showUserDropdown && (
                  <div className="user-dropdown-menu">
                    <div className="user-dropdown-header">
                      <span className="user-dropdown-email">{userEmail}</span>
                    </div>

                    {!showThemeSubmenu ? (
                      <>
                        <button className="user-dropdown-item" onClick={(e) => { e.stopPropagation(); setShowThemeSubmenu(true); }}>
                          Theme ❯
                        </button>
                        <button className="user-dropdown-item text-danger" onClick={() => { handleLogout(); setShowUserDropdown(false); }}>
                          Logout
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="user-dropdown-item" onClick={(e) => { e.stopPropagation(); setShowThemeSubmenu(false); }}>
                          ❮ Back
                        </button>
                        <button className="user-dropdown-item" onClick={() => { setIsDarkMode(false); setShowUserDropdown(false); localStorage.setItem('darkMode', 'false'); }}>
                          ☀️ Light Mode
                        </button>
                        <button className="user-dropdown-item" onClick={() => { setIsDarkMode(true); setShowUserDropdown(false); localStorage.setItem('darkMode', 'true'); }}>
                          🌙 Dark Mode
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
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
                <p className="page-subtitle">Track and manage emails from placement@msrit.edu</p>
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



            {loading && applications.length === 0 ? (
              <p style={{ color: '#6d7a77', marginTop: 24 }}>Loading applications...</p>
            ) : (
              <div className="app-grid">
                {applications
                  .map(app => {
                    let derivedStatus = (app.status || "new").toLowerCase();
                    if (derivedStatus === "new") {
                      const ageInMs = Date.now() - new Date(app.date || app.createdAt || 0).getTime();
                      if (ageInMs > 24 * 60 * 60 * 1000) {
                        derivedStatus = "unmarked";
                      }
                    }
                    return { ...app, derivedStatus };
                  })
                  .filter((app) => {
                    const query = searchQuery.toLowerCase();
                    const matchesSearch =
                      (app.company || "").toLowerCase().includes(query) ||
                      (app.role || "").toLowerCase().includes(query);

                    const isDeadlineToday = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString();
                    const matchesFilter =
                      activeFilter === "all" ||
                      (activeFilter === "deadlines" && isDeadlineToday) ||
                      activeFilter === app.derivedStatus;

                    return matchesSearch && matchesFilter;
                  })
                  .sort((a, b) => {
                    const dateA = new Date(a.date || a.createdAt || 0);
                    const dateB = new Date(b.date || b.createdAt || 0);
                    return dateB - dateA;
                  })
                  .map((app) => {
                    const dateToShow = app.deadlineISO || app.date || app.testDate || app.createdAt;
                    const formattedDate = dateToShow
                      ? new Date(dateToShow).toLocaleString(undefined, app.deadlineISO ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' })
                      : "N/A";
                    const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();
                    const statusKey = app.derivedStatus;
                    const isUrgent = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString() && statusKey !== "done";
                    const isDone = statusKey === "done";

                    const getDeterministicColor = (str) => {
                      let hash = 0;
                      for (let i = 0; i < str.length; i++) {
                        hash = str.charCodeAt(i) + ((hash << 5) - hash);
                      }
                      const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
                      return "00000".substring(0, 6 - c.length) + c;
                    };
                    const fallbackColor = getDeterministicColor(app.company || "Unknown");
                    const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.company || "U")}&background=${fallbackColor}&color=fff&size=128&bold=true`;

                    return (
                      <div
                        key={app._id}
                        className={`app-card status-outline-${statusKey}${isUrgent ? " is-urgent" : ""}${isDone ? " is-done" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          if (e.target.closest('.card-btn') || e.target.closest('.note-input') || e.target.closest('a') || e.target.closest('button')) return;
                          setSelectedApp(app);
                          setShowInfoModal(true);
                        }}
                      >
                        <div className="app-header">
                          <div className="app-info">
                            <div className="company-logo-container">
                              {app.companyInfo?.logo || app.companyInfo?.domain ? (
                                <img
                                  src={app.companyInfo?.logo || uiAvatarUrl}
                                  alt={app.company}
                                  className="company-logo-img"
                                  onError={(e) => {
                                    const domain = app.companyInfo?.domain || `${app.company.toLowerCase().replace(/\s+/g, '')}.com`;
                                    const googleFallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                                    if (!e.target.src.includes('google.com') && !e.target.src.includes('ui-avatars.com')) {
                                      e.target.src = googleFallback;
                                    } else if (!e.target.src.includes('ui-avatars.com')) {
                                      e.target.src = uiAvatarUrl;
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
                              {/* Show subtitle (new records) or fall back to role (legacy records) */}
                              {(() => {
                                const sub = app.subtitle
                                  || (app.role && app.role.toLowerCase() !== "unknown role" && app.role.toLowerCase() !== "event" ? app.role : "");
                                return sub ? <div className="company-name">{sub}</div> : null;
                              })()}
                            </div>
                          </div>
                          <div className="status-badge-container">
                            <span className={`status-badge status-${app.derivedStatus}`}>
                              {app.derivedStatus}
                            </span>
                          </div>
                        </div>



                        {/* ── Display fields ─────────────────────────────────────────────────────
                             NEW records: app.displayFields = [{label, value}] — rendered directly.
                             LEGACY records: app.fieldsToDisplay = ["role","stipend",...] — rendered
                             using FIELD_CONFIG lookup from individual programRoles/programStipend etc.
                        ── */}
                        {(() => {
                          // NEW flexible format — [{label, value}]
                          // DEV DEBUG: Log display fields
                          console.log("CARD_DISPLAY_FIELDS", app.displayFields);

                          const flexFields = Array.isArray(app.displayFields) && app.displayFields.length > 0
                            ? app.displayFields.filter(f => f && f.label && f.value)
                            : null;

                          if (flexFields && flexFields.length > 0) {
                            return (
                              <div className="program-details">
                                {flexFields.map(({ label, value }) => (
                                  <div key={label} className="program-detail">
                                    <span className="program-detail-label">{label}</span>
                                    <span className="program-detail-value">{value}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          // LEGACY format — string array + fixed FIELD_CONFIG lookup
                          let legacyFields = app.fieldsToDisplay;
                          if ((!Array.isArray(legacyFields) || legacyFields.length === 0) && app.emailType !== "event" && app.emailType !== "nonRecruitment") {
                            legacyFields = [];
                            if (app.programRoles) legacyFields.push("role");
                            if (app.programStipend) legacyFields.push("stipend");
                            if (app.deadlineText) legacyFields.push("deadline");
                            if (app.programDuration) legacyFields.push("duration");
                            if (app.venue) legacyFields.push("venue");
                          }
                          if (!Array.isArray(legacyFields) || legacyFields.length === 0) return null;

                          const FIELD_CONFIG = {
                            role: { label: "Roles", value: app.programRoles },
                            stipend: { label: "Stipend", value: app.programStipend },
                            deadline: { label: "Deadline", value: app.deadlineText },
                            duration: { label: "Duration", value: app.programDuration },
                            venue: { label: "Venue", value: app.venue },
                            eventName: { label: "Event", value: app.subtitle },
                          };
                          const rows = legacyFields
                            .map(f => FIELD_CONFIG[f])
                            .filter(r => r && r.value && r.value.trim().length > 0);
                          if (rows.length === 0) return null;
                          return (
                            <div className="program-details">
                              {rows.map(({ label, value }) => (
                                <div key={label} className="program-detail">
                                  <span className="program-detail-label">{label}</span>
                                  <span className="program-detail-value">{value}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Deadline badge — legacy fallback for records that predate fieldsToDisplay */}
                        {app.deadline && !app.deadlineText && (!Array.isArray(app.fieldsToDisplay) || app.fieldsToDisplay.length === 0) && (
                          <div className={`deadline-badge ${app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString()
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
                          <button
                            className="card-btn card-btn-edit"
                            onClick={() => {
                              setEditingApp(app);

                              const getField = (label, dbField) => {
                                if (app.displayFields && app.displayFields.length > 0) {
                                  const f = app.displayFields.find(df => df.label === label);
                                  if (f) return f.value;
                                }
                                return dbField || "";
                              };

                              const standardLabels = ["Stipend", "CTC", "Duration", "Location", "Joining", "Deadline", "Role"];
                              const dynamicFields = [];
                              if (app.displayFields && app.displayFields.length > 0) {
                                app.displayFields.forEach(df => {
                                  if (!standardLabels.includes(df.label)) {
                                    dynamicFields.push({ label: df.label, value: df.value });
                                  }
                                });
                              }

                              setEditFormData({
                                company: app.company || "",
                                role: app.subtitle || app.role || "",
                                stipend: getField("Stipend", app.programStipend),
                                ctc: getField("CTC", app.salaryText),
                                duration: getField("Duration", app.programDuration),
                                location: getField("Location", app.venue),
                                joining: getField("Joining", ""),
                                deadline: getField("Deadline", app.deadlineText),
                                date: app.date ? new Date(app.date).toISOString().substring(0, 10) : "",
                                link: app.link || "",
                                dynamicFields: dynamicFields
                              });
                              setShowEditModal(true);
                            }}
                          >
                            Edit
                          </button>
                          {app.link && !isDone && (
                            <a
                              className="card-btn card-btn-apply"
                              href={app.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                console.log("[DEBUG_LINK] Clicked app ID:", app._id);
                                console.log("[DEBUG_LINK] Original app.link value:", app.link);
                                console.log("[DEBUG_LINK] Rendered href on click:", e.currentTarget.href);
                                if (app.derivedStatus === "new" || app.derivedStatus === "unmarked") {
                                  handleApply(app._id);
                                }
                              }}
                            >
                              {((app.derivedStatus === "new" || app.derivedStatus === "unmarked") && app.isFormLink) ? "Apply" : "Open Link"}
                            </a>
                          )}
                          <button
                            className="card-btn card-btn-done"
                            onClick={() => handleMarkDone(app._id)}
                            disabled={isDone}
                          >
                            {isDone ? "Done" : "Mark Done"}
                          </button>
                          <button
                            className="card-btn card-btn-remove"
                            onClick={() => handleDeleteOne(app._id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!loading && applications.length === 0 && (
              <p style={{ textAlign: 'center', marginTop: 60, color: '#6d7a77' }}>
                {syncStatus === "pending"
                  ? "Emails are being synced in the background. Please wait..."
                  : "No applications found. Try syncing emails."}
              </p>
            )}
          </main>

          <button
            className="floating-add-btn"
            onClick={() => setShowAddModal(true)}
            title="Add Application"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Software Engineer"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stipend</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 50k / month"
                    value={formData.stipend}
                    onChange={(e) => setFormData({ ...formData, stipend: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CTC</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 15 LPA"
                    value={formData.ctc}
                    onChange={(e) => setFormData({ ...formData, ctc: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Duration</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 6 Months"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Bangalore"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Joining</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jan 2025"
                    value={formData.joining}
                    onChange={(e) => setFormData({ ...formData, joining: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deadline</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Oct 15"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Link (Google Form, etc.)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
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

      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Edit Details</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleEditSubmit}>
              {editFormError && <div className="form-error">{editFormError}</div>}

              <div className="form-group">
                <label className="form-label">Company *</label>
                <input type="text" className="form-input" value={editFormData.company || ""} onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <input type="text" className="form-input" value={editFormData.role || ""} onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stipend</label>
                  <input type="text" className="form-input" value={editFormData.stipend || ""} onChange={(e) => setEditFormData({ ...editFormData, stipend: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CTC</label>
                  <input type="text" className="form-input" value={editFormData.ctc || ""} onChange={(e) => setEditFormData({ ...editFormData, ctc: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Duration</label>
                  <input type="text" className="form-input" value={editFormData.duration || ""} onChange={(e) => setEditFormData({ ...editFormData, duration: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Location</label>
                  <input type="text" className="form-input" value={editFormData.location || ""} onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Joining</label>
                  <input type="text" className="form-input" value={editFormData.joining || ""} onChange={(e) => setEditFormData({ ...editFormData, joining: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deadline</label>
                  <input type="text" className="form-input" value={editFormData.deadline || ""} onChange={(e) => setEditFormData({ ...editFormData, deadline: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={editFormData.date || ""} onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })} />
                </div>
                {editFormData.dynamicFields && editFormData.dynamicFields.map((df, index) => (
                  <div className="form-group" style={{ marginBottom: 0 }} key={df.label}>
                    <label className="form-label">{df.label}</label>
                    <input type="text" className="form-input" value={df.value || ""} onChange={(e) => {
                      const newDynamicFields = [...editFormData.dynamicFields];
                      newDynamicFields[index].value = e.target.value;
                      setEditFormData({ ...editFormData, dynamicFields: newDynamicFields });
                    }} />
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Link (Google Form, etc.)</label>
                <input type="url" className="form-input" value={editFormData.link || ""} onChange={(e) => setEditFormData({ ...editFormData, link: e.target.value })} />
              </div>

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button type="button" className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={editSubmitting}>{editSubmitting ? "Saving..." : "Save Changes"}</button>
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
                <p style={{ fontSize: '14px', color: '#64748b' }}>Application Details</p>
              </div>
              <button className="modal-close" onClick={() => setShowInfoModal(false)}>&times;</button>
            </div>

            {/* Info modal details — also driven by fieldsToDisplay */}
            {(() => {
              let displayFields = selectedApp.fieldsToDisplay;
              if ((!Array.isArray(displayFields) || displayFields.length === 0) && selectedApp.emailType !== "event" && selectedApp.emailType !== "nonRecruitment") {
                displayFields = [];
                if (selectedApp.programRoles) displayFields.push("role");
                if (selectedApp.programStipend) displayFields.push("stipend");
                if (selectedApp.deadlineText) displayFields.push("deadline");
                if (selectedApp.programDuration) displayFields.push("duration");
                if (selectedApp.venue) displayFields.push("venue");
              }
              if (!Array.isArray(displayFields) || displayFields.length === 0) return null;
              const FIELD_CONFIG = {
                role: { label: "Roles", value: selectedApp.programRoles },
                stipend: { label: "Stipend", value: selectedApp.programStipend },
                deadline: { label: "Deadline", value: selectedApp.deadlineText },
                duration: { label: "Duration", value: selectedApp.programDuration },
                venue: { label: "Venue", value: selectedApp.venue },
                eventName: { label: "Event", value: selectedApp.subtitle },
              };
              const rows = displayFields
                .map(f => FIELD_CONFIG[f])
                .filter(r => r && r.value && r.value.trim().length > 0);
              if (rows.length === 0) return null;
              return (
                <div className="program-details" style={{ marginBottom: '20px' }}>
                  {rows.map(({ label, value }) => (
                    <div key={label} className="program-detail">
                      <span className="program-detail-label">{label}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {selectedApp.events && selectedApp.events.length > 0 && (
              <div className="event-timeline" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <h4 style={{ marginTop: '0', marginBottom: '16px', fontSize: '16px', color: '#1e293b', fontWeight: '600' }}>Application Timeline</h4>
                <div className="timeline-container" style={{ position: 'relative', marginLeft: '8px' }}>
                  {selectedApp.events.map((ev, i) => {
                    const d = new Date(ev.date);
                    const formattedD = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
                    return (
                      <div key={i} className="timeline-event" style={{ display: 'flex', position: 'relative', marginBottom: i === selectedApp.events.length - 1 ? '0' : '16px' }}>
                        <div className="timeline-date" style={{ width: '48px', fontSize: '13px', color: '#64748b', textAlign: 'right', marginRight: '16px', flexShrink: 0, paddingTop: '1px', fontWeight: '500' }}>
                          {formattedD}
                        </div>
                        <div className="timeline-dot" style={{ position: 'absolute', left: '59px', top: '7px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', zIndex: 1, border: '1px solid #fff' }}></div>
                        {i !== selectedApp.events.length - 1 && (
                          <div className="timeline-line" style={{ position: 'absolute', left: '62px', top: '15px', bottom: '-16px', width: '2px', backgroundColor: '#e2e8f0' }}></div>
                        )}
                        <div className="timeline-content" style={{ marginLeft: '24px', flex: 1, paddingBottom: '4px' }}>
                          <div className="timeline-title" style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                            {ev.title || "Email Notification"}
                          </div>
                          <div className="timeline-subtitle" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: '1.4' }}>
                            {ev.status && <span style={{ textTransform: 'capitalize', marginRight: '6px', fontWeight: '600', color: '#3b82f6' }}>[{ev.status}]</span>}
                            <span style={{ opacity: 0.9 }}>{ev.subject ? (ev.subject.length > 60 ? ev.subject.substring(0, 60) + "..." : ev.subject) : ""}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

