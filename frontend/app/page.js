"use client";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

import React, { useEffect, useState } from "react";

export default function JobTrackerDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Add Application Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({
    company: "",
    role: "",
    status: "applied",
    email: "",
    date: ""
  });

  const [searchQuery, setSearchQuery] = useState("");

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
      setFormData({ company: "", role: "", status: "applied", email: "", date: "" });
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

  const interviews = applications.filter((a) => {
    const s = (a.status || "").toLowerCase();
    const t = (a.type || "").toLowerCase();
    return s === "interview" || t === "test" || s === "test";
  }).length;

  const rejections = applications.filter((a) => {
    const s = (a.status || "").toLowerCase();
    return s === "rejected" || s === "done";
  }).length;

  const offers = applications.filter((a) => {
    const s = (a.status || "").toLowerCase();
    return s === "offer" || s === "accepted";
  }).length;

  const getStatusClass = (app) => {
    const s = (app.status || "").toLowerCase();
    const t = (app.type || "").toLowerCase();
    if (s === "offer" || s === "accepted") return "status-offer";
    if (s === "rejected" || s === "done") return "status-rejected";
    if (s === "interview" || t === "test" || s === "test") return "status-interview";
    return "status-applied";
  };

  const getStatusLabel = (app) => {
    const s = (app.status || "").toLowerCase();
    const t = (app.type || "").toLowerCase();
    if (s === "offer" || s === "accepted") return "Offer";
    if (s === "rejected" || s === "done") return "Rejected";
    if (s === "interview" || t === "test" || s === "test") return "Interview";
    return "Applied";
  };

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
        .outline-btn { padding: 8px 16px; border: 1px solid #ccfbf1; background: #f0fdfa; color: #0f766e; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .outline-btn:hover { background: #ccfbf1; }
        
        /* Content */
        .content { padding: 32px; max-width: 1400px; margin: 0 auto; width: 100%; }
        .page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
        .page-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: #171d1c; margin-bottom: 4px; }
        .page-subtitle { color: #3d4947; font-size: 15px; }
        
        /* Stats */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-bottom: 32px; }
        .stat-card { background: #fff; border: 1px solid #dee4e1; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.02); display: flex; flex-direction: column; gap: 8px; position: relative; overflow: hidden; }
        .stat-title { font-size: 12px; font-weight: 600; color: #3d4947; text-transform: uppercase; letter-spacing: 0.05em; z-index: 1; }
        .stat-value { font-size: 42px; font-family: 'Manrope', sans-serif; font-weight: 700; color: #171d1c; line-height: 1; z-index: 1; }
        .stat-card.total .stat-value { color: #00685f; }
        
        /* Filters */
        .filters { display: flex; gap: 8px; background: #f0f5f2; padding: 8px; border-radius: 12px; border: 1px solid #dee4e1; margin-bottom: 24px; overflow-x: auto; align-items: center; }
        .filter-btn { padding: 8px 16px; border-radius: 999px; border: none; background: transparent; color: #3d4947; font-weight: 500; font-size: 14px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
        .filter-btn.active { background: #00685f; color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .filter-btn:hover:not(.active) { background: #e4e9e7; }
        
        /* App Grid */
        .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        .app-card { background: #fff; border: 1px solid #dee4e1; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 24px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .app-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(13, 148, 136, 0.08); border-color: #bcc9c6; }
        
        .app-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .app-info { display: flex; gap: 16px; }
        .company-logo { width: 48px; height: 48px; border-radius: 12px; background: #f5faf8; border: 1px solid #dee4e1; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #00685f; font-size: 20px; flex-shrink: 0; }
        .role-title { font-family: 'Manrope', sans-serif; font-size: 18px; font-weight: 700; color: #171d1c; margin-bottom: 4px; line-height: 1.2; }
        .company-name { font-size: 14px; color: #3d4947; }
        
        .status-badge { padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
        .status-badge::before { content: ''; display: block; width: 6px; height: 6px; border-radius: 50%; }
        
        .status-interview { background: #e0f2f1; color: #00695c; }
        .status-interview::before { background: #00695c; }
        
        .status-rejected { background: #ffdad6; color: #93000a; }
        .status-rejected::before { background: #93000a; }
        
        .status-offer { background: #fef08a; color: #854d0e; }
        .status-offer::before { background: #854d0e; }
        
        .status-applied { background: #e4e9e7; color: #3d4947; }
        .status-applied::before { background: #3d4947; }
        
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
      `}} />

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo-box">ET</div>
            <div>
              <div className="logo-text">Email Tracker</div>
              <div className="logo-sub">Dashboard</div>
            </div>
          </div>

          <div className="sidebar-bottom">
            <button className="sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Emails"}
            </button>
            <nav>
              <a className="nav-item" onClick={handleLogout} style={{ cursor: "pointer" }}>Logout</a>
            </nav>
          </div>
        </aside>

        <div className="main-wrapper">
          <header className="topbar">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search applications, roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="topbar-actions">
              <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                + Add Application
              </button>
              <button className="outline-btn" onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Emails"}
              </button>
              <div style={{ width: 36, height: 36, background: '#00685f', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                U
              </div>
            </div>
          </header>

          <main className="content">
            <div className="page-header">
              <div>
                <h2 className="page-title">Applications Overview</h2>
                <p className="page-subtitle">Track and manage your active job pursuits.</p>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card total">
                <span className="stat-title">Total Applications</span>
                <span className="stat-value">{total}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">Interviews</span>
                <span className="stat-value">{interviews}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">Rejections</span>
                <span className="stat-value">{rejections}</span>
              </div>
              <div className="stat-card" style={{ borderColor: '#fef08a' }}>
                <span className="stat-title">Offers</span>
                <span className="stat-value" style={{ color: '#854d0e' }}>{offers}</span>
              </div>
            </div>

            <div className="filters">
              <button className="filter-btn active">All Status</button>
              <button className="filter-btn">Applied</button>
              <button className="filter-btn">Interview</button>
              <button className="filter-btn">Offer</button>
              <button className="filter-btn">Rejected</button>
            </div>

            {loading && applications.length === 0 ? (
              <p style={{ color: '#6d7a77', marginTop: 24 }}>Loading applications...</p>
            ) : (
              <div className="app-grid">
                {applications
                  .filter((app) => {
                    const query = searchQuery.toLowerCase();
                    return (
                      (app.company || "").toLowerCase().includes(query) ||
                      (app.role || "").toLowerCase().includes(query)
                    );
                  })
                  .sort((a, b) => {
                    const dateA = new Date(a.date || a.createdAt || 0);
                    const dateB = new Date(b.date || b.createdAt || 0);
                    return dateB - dateA;
                  })
                  .map((app) => {
                    const statusClass = getStatusClass(app);
                    const statusLabel = getStatusLabel(app);
                    const dateToShow = app.date || app.testDate || app.deadline || app.createdAt;
                    const formattedDate = dateToShow ? new Date(dateToShow).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A";
                    const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();

                    return (
                      <div key={app._id} className="app-card">
                        <div className="app-header">
                          <div className="app-info">
                            <div className="company-logo">{companyInitials}</div>
                            <div>
                              <div className="role-title">{app.role || "Unknown Role"}</div>
                              <div className="company-name">{app.company || "Unknown Company"}</div>
                            </div>
                          </div>
                          <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                        </div>
                        <div className="app-footer">
                          <div className="email-info">
                            <span style={{ fontSize: 16 }}>✉️</span>
                            <span>{app.email || "user@gmail.com"}</span>
                          </div>
                          <span>{formattedDate}</span>
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

      {/* Add Application Modal */}
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
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="applied">Applied</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                </select>
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
    </>
  );
}
