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
    subtitle: "",
    role: "",
    stipend: "",
    ctc: "",
    duration: "",
    location: "",
    joining: "",
    deadline: "",
    date: "",
    link: "",
    customFields: []
  });

  // Edit Application Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState("");
  const [editFormData, setEditFormData] = useState({});

  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomValue, setNewCustomValue] = useState("");
  const [editCustomLabel, setEditCustomLabel] = useState("");
  const [editCustomValue, setEditCustomValue] = useState("");

  // Company Info Modal State
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);


  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [settingsSubView, setSettingsSubView] = useState("main");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [accountDeletedJustNow, setAccountDeletedJustNow] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);

  const [userEmail, setUserEmail] = useState(null);

  const containerRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const glowRef = React.useRef(null);
  const exchangeInProgress = React.useRef(false);

  useEffect(() => {
    if (userEmail) return;

    const container = containerRef.current;
    const card = cardRef.current;
    const canvas = canvasRef.current;
    const glow = glowRef.current;

    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = container.clientHeight);

    const handleResize = () => {
      if (!container || !canvas) return;
      width = canvas.width = container.clientWidth;
      height = canvas.height = container.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    let mouse = { x: 0, y: 0 };
    let targetMouse = { x: 0, y: 0 };
    let currentX = 0;
    let currentY = 0;
    const ease = 0.08;

    const handleMouseMove = (e) => {
      if (glow && !prefersReducedMotion) {
        glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      }
      targetMouse.x = e.clientX - window.innerWidth / 2;
      targetMouse.y = e.clientY - window.innerHeight / 2;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const particles = [];
    const particleCount = prefersReducedMotion ? 0 : 45;

    class Particle {
      constructor() {
        this.reset(true);
      }

      reset(init = false) {
        this.x = Math.random() * width;
        this.y = init ? Math.random() * height : height + 10;
        this.size = Math.random() * 1.8 + 0.8;
        this.speedY = -(Math.random() * 0.2 + 0.08);
        this.speedX = (Math.random() - 0.5) * 0.15;
        this.opacity = Math.random() * 0.12 + 0.04;

        const colors = [
          "rgba(34, 211, 238,",
          "rgba(59, 130, 246,",
          "rgba(139, 92, 246,"
        ];
        this.colorPrefix = colors[Math.floor(Math.random() * colors.length)];

        this.offsetX = 0;
        this.offsetY = 0;
      }

      update() {
        this.x += this.speedX + this.offsetX;
        this.y += this.speedY + this.offsetY;

        this.offsetX *= 0.92;
        this.offsetY *= 0.92;

        if (mouse.x && mouse.y) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const repelRadius = 110;

          if (dist < repelRadius) {
            const force = (repelRadius - dist) / repelRadius;
            const angle = Math.atan2(dy, dx);
            const repelStrength = 1.8;
            this.offsetX += Math.cos(angle) * force * repelStrength;
            this.offsetY += Math.sin(angle) * force * repelStrength;
          }
        }

        if (this.y < -10 || this.x < -10 || this.x > width + 10) {
          this.reset(false);
        }
      }

      draw() {
        ctx.fillStyle = `${this.colorPrefix}${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    let rafId;
    let isTabVisible = true;

    const tick = () => {
      if (!isTabVisible) return;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }



      rafId = requestAnimationFrame(tick);
    };

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        rafId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafId);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelAnimationFrame(rafId);
    };
  }, [userEmail]);

  const handleLocalLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUserEmail(null);
    setApplications([]);
  };

  const apiFetch = async (url, options = {}) => {
    if (!options.headers) {
      options.headers = {};
    }
    const token = localStorage.getItem("accessToken");
    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    let response = await fetch(url, options);

    if (response.status === 401) {
      console.warn("Access token expired, attempting refresh...");
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        handleLocalLogout();
        return response;
      }

      try {
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });

        if (!refreshRes.ok) {
          throw new Error("Refresh failed");
        }

        const data = await refreshRes.json();
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);

        // Retry the original request once
        options.headers["Authorization"] = `Bearer ${data.accessToken}`;
        response = await fetch(url, options);
      } catch (err) {
        console.error("Refresh failed, logging out:", err);
        handleLocalLogout();
      }
    }

    return response;
  };

  useEffect(() => {
    const initializeSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const authCode = params.get("auth_code");
      const error = params.get("error");

      if (error === "unauthorized") {
        alert("Access Denied: Your account is not authorized to view this dashboard.");
        window.history.replaceState({}, document.title, "/");
        return;
      }

      if (authCode) {
        if (exchangeInProgress.current) return;
        exchangeInProgress.current = true;
        try {
          const res = await fetch(`${BASE_URL}/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: authCode })
          });
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            setUserEmail(data.email);
          } else {
            const errorData = await res.json().catch(() => ({}));
            console.error("Token exchange failed:", res.status, errorData.message || errorData);
          }
        } catch (err) {
          console.error("Error exchanging token:", err);
        }
        window.history.replaceState({}, document.title, "/");
        return;
      }

      // Check existing session
      const savedAccessToken = localStorage.getItem("accessToken");
      if (savedAccessToken) {
        try {
          const res = await apiFetch(`${BASE_URL}/auth/me`);
          if (res.ok) {
            const data = await res.json();
            setUserEmail(data.email);
          } else {
            handleLocalLogout();
          }
        } catch (err) {
          console.error("Session verification failed:", err);
          handleLocalLogout();
        }
      }
    };

    initializeSession();

    // Check local storage for dark mode preference
    const savedMode = localStorage.getItem("darkMode");
    if (savedMode === "false") {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
    }
  }, []);

  const fetchSyncStatus = async () => {
    if (!userEmail) return;
    try {
      const response = await apiFetch(`${BASE_URL}/applications/sync-status`);
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

  // Lock body scroll when any modal is active to prevent scroll leak
  useEffect(() => {
    const isAnyModalOpen = showInfoModal || showAddModal || showEditModal || showDeleteModal;
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [showInfoModal, showAddModal, showEditModal, showDeleteModal]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    localStorage.setItem("darkMode", !isDarkMode);
  };

  const fetchApplications = async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const response = await apiFetch(`${BASE_URL}/applications`);
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
      const response = await apiFetch(`${BASE_URL}/applications`);
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
      await apiFetch(`${BASE_URL}/sync`);
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
      const response = await apiFetch(`${BASE_URL}/clear-all-applications`, {
        method: "DELETE"
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
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
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
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
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
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "DELETE"
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
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
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
    try {
      await apiFetch(`${BASE_URL}/logout`);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      handleLocalLogout();
    }
  };

  const handleDeleteSubmit = async (e) => {
    e.preventDefault();
    if (deleteConfirmText !== "DELETE") {
      setDeleteError("Please type DELETE to confirm account deletion.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`${BASE_URL}/auth/account`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to delete account");
      }

      // Successful Deletion: sign out user completely
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUserEmail(null);
      setApplications([]);
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      setAccountDeletedJustNow(true);
    } catch (error) {
      console.error("Account deletion failed:", error);
      setDeleteError(error.message || "Failed to delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
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
      if (formData.role) displayFields.push({ label: "Role", value: formData.role });
      if (formData.ctc) displayFields.push({ label: "CTC", value: formData.ctc });
      if (formData.joining) displayFields.push({ label: "Joining", value: formData.joining });
      if (formData.stipend) displayFields.push({ label: "Stipend", value: formData.stipend });
      if (formData.duration) displayFields.push({ label: "Duration", value: formData.duration });
      if (formData.deadline) displayFields.push({ label: "Deadline", value: formData.deadline });
      if (formData.location) displayFields.push({ label: "Location", value: formData.location });

      if (formData.customFields && formData.customFields.length > 0) {
        formData.customFields.forEach(cf => {
          if (cf.value && cf.label) {
            displayFields.push({ label: cf.label, value: cf.value });
          }
        });
      }

      const payload = {
        company: formData.company,
        subtitle: formData.subtitle || "",
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

      const response = await apiFetch(`${BASE_URL}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to add application");
      }

      setShowAddModal(false);
      setFormData({ company: "", subtitle: "", role: "", stipend: "", ctc: "", duration: "", location: "", joining: "", deadline: "", date: "", link: "", customFields: [] });
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
    if (editFormData.role !== (original.role || "")) {
      manualEdits.role = editFormData.role;
    }
    if (editFormData.subtitle !== (original.subtitle || "")) {
      manualEdits.subtitle = editFormData.subtitle;
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
      const response = await apiFetch(`${BASE_URL}/applications/${editingApp._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
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
      <div className="login-container" ref={containerRef}>
        <style dangerouslySetInnerHTML={{
          __html: `
            @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
            
            .login-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              min-height: 100vh;
              padding: 0 24px;
              text-align: center;
              background: radial-gradient(circle at 50% 50%, #090d16 0%, #02040a 100%);
              font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #f8fafc;
              position: relative;
              overflow: hidden;
              perspective: 1000px;
            }

            .glow-primary {
              position: fixed;
              width: 600px;
              height: 600px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(45, 212, 191, 0.06) 0%, rgba(45, 212, 191, 0) 70%);
              filter: blur(80px);
              pointer-events: none;
              z-index: 2;
              left: 0;
              top: 0;
              transform: translate3d(-50%, -50%, 0);
              will-change: transform;
            }

            .glow-secondary {
              position: absolute;
              width: 850px;
              height: 850px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(45, 212, 191, 0.02) 0%, rgba(45, 212, 191, 0) 70%);
              filter: blur(100px);
              pointer-events: none;
              z-index: 1;
              left: 70%;
              top: 40%;
              transform: translate(-50%, -50%);
            }

            .particle-canvas {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: 3;
            }

            .login-card {
              background: rgba(17, 24, 39, 0.7);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
              border: 1px solid #1f2937;
              border-top: none;
              box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
              border-bottom-left-radius: 20px;
              border-bottom-right-radius: 20px;
              border-top-left-radius: 0;
              border-top-right-radius: 0;
              padding: 64px 40px 48px 40px;
              width: 100%;
              max-width: 420px;
              display: flex;
              flex-direction: column;
              align-items: center;
              margin-top: 0;
              position: relative;
              z-index: 10;
            }

            .logo-box {
              width: 64px;
              height: 64px;
              border-radius: 16px;
              background: rgba(45, 212, 191, 0.08);
              border: 1px solid rgba(45, 212, 191, 0.25);
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 28px;
              box-shadow: 0 0 20px rgba(45, 212, 191, 0.1);
            }

            .login-title {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 12px;
              color: #ffffff;
              letter-spacing: -0.5px;
            }

            .login-subtitle {
              font-size: 14px;
              color: #94a3b8;
              line-height: 1.6;
              margin-bottom: 32px;
              max-width: 320px;
            }

            .login-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              padding: 14px 24px;
              background: #14b8a6;
              color: #ffffff;
              border-radius: 12px;
              text-decoration: none;
              font-weight: 600;
              font-size: 15px;
              transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
              box-shadow: 0 4px 15px rgba(20, 184, 166, 0.15);
            }

            .login-btn:hover {
              background: #0d9488;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(20, 184, 166, 0.35);
            }

            .login-btn:active {
              transform: translateY(0);
            }

            .login-domain-tip {
              font-size: 13px;
              color: #64748b;
              margin-top: 20px;
              font-weight: 500;
            }

            .login-domain-highlight {
              color: #2dd4bf;
              font-weight: 600;
            }

            .login-divider {
              width: 100%;
              height: 1px;
              background: rgba(31, 41, 55, 0.5);
              margin: 32px 0 20px 0;
            }

            .login-footer-links {
              display: flex;
              gap: 16px;
              font-size: 12px;
              color: #475569;
            }

            .login-footer-link {
              color: #475569;
              text-decoration: none;
              transition: color 0.15s ease;
            }

            .login-footer-link:hover {
              color: #94a3b8;
            }
          `
        }} />

        <div className="glow-primary" ref={glowRef}></div>
        <div className="glow-secondary"></div>
        <canvas className="particle-canvas" ref={canvasRef}></canvas>

        {accountDeletedJustNow ? (
          <div className="login-card" ref={cardRef}>
            <div className="logo-box" style={{ borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}>
              <span style={{ fontSize: '28px' }}>👋</span>
            </div>

            <h1 className="login-title">Account Deleted</h1>
            <p className="login-subtitle" style={{ marginBottom: '28px', maxWidth: '340px' }}>
              Your account has been deleted.
              <br />
              Thank you for using Email Tracker.
            </p>

            <button
              onClick={() => setAccountDeletedJustNow(false)}
              className="login-btn"
              style={{ cursor: 'pointer', border: 'none' }}
            >
              Sign in again
            </button>
          </div>
        ) : (
          <div className="login-card" ref={cardRef}>
            <div className="logo-box">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
                <rect x="9" y="11" width="6" height="5" rx="1" fill="#030712" stroke="#2dd4bf" strokeWidth="1.5" />
                <path d="M10 11V9a2 2 0 1 1 4 0v2" stroke="#2dd4bf" strokeWidth="1.5" />
              </svg>
            </div>

            <h1 className="login-title">Email Tracker</h1>
            <p className="login-subtitle">Track placement related emails from your college Gmail account.</p>

            <a href={`${BASE_URL}/auth/google`} className="login-btn">
              Continue with Google
            </a>

            <p className="login-domain-tip">
              Sign in using your <span className="login-domain-highlight">@msrit.edu</span> account
            </p>

            <div className="login-divider"></div>

            <div className="login-footer-links">
              <a href="/privacy" className="login-footer-link">Privacy Policy</a>
              <span>·</span>
              <a href="/terms" className="login-footer-link">Terms of Service</a>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
        
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
          --font-geist: 'IBM Plex Sans', -apple-system, sans-serif;
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
        .logo-text { font-family: 'IBM Plex Sans', sans-serif; font-size: 20px; font-weight: 700; color: #0d9488; line-height: 1.2; }
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

        /* Settings Page */
        .settings-container { display: flex; flex-direction: column; gap: 24px; max-width: 100%; margin: 0 auto; width: 100%; padding-bottom: 40px; }
        .settings-header { margin-bottom: 8px; }
        .settings-main-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: var(--text-heading); margin-bottom: 6px; }
        .settings-main-subtitle { color: var(--text-secondary); font-size: 15px; }
        .settings-grid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 768px) {
          .settings-grid-row { grid-template-columns: 1fr; }
        }
        .settings-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-card); padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .settings-title { font-size: 20px; font-weight: 700; color: var(--text-heading); margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
        .settings-title-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(13, 148, 136, 0.1); color: #0d9488; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .dark .settings-title-icon { background: rgba(45, 212, 191, 0.15); color: #2dd4bf; }
        
        .settings-list { display: flex; flex-direction: column; gap: 12px; }
        .settings-item { display: flex; align-items: center; padding: 14px 18px; border-radius: 12px; background: var(--bg-color); cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-color); color: var(--text-primary); font-weight: 500; font-size: 14.5px; text-align: left; width: 100%; gap: 12px; }
        .settings-item:hover { background: var(--border-color); color: var(--text-heading); transform: translateY(-1px); }
        .settings-item-label { flex: 1; }
        .settings-item-icon { color: var(--text-secondary); display: flex; align-items: center; font-size: 16px; width: 24px; justify-content: center; }
        .settings-item-arrow { color: var(--text-secondary); font-size: 12px; margin-left: auto; }
        
        /* Settings About Section (Clean style) */
        .settings-about-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-card); padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .about-info-box { display: flex; flex-direction: column; gap: 12px; }
        .about-info-box h3 { font-size: 20px; font-weight: 700; color: var(--text-heading); margin: 0; }
        .about-version-badge { display: inline-block; font-size: 11px; font-weight: 700; color: #0d9488; background: rgba(13, 148, 136, 0.1); padding: 4px 10px; border-radius: 999px; width: fit-content; letter-spacing: 0.05em; margin-top: -4px; }
        .dark .about-version-badge { color: #2dd4bf; background: rgba(45, 212, 191, 0.15); }
        .about-desc { font-size: 14.5px; line-height: 1.6; color: var(--text-primary); margin: 0; text-align: justify; }
        .about-tech-container { margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px; }
        .about-tech-label { font-weight: 600; color: var(--text-heading); font-size: 14px; display: block; margin-bottom: 8px; }
        .about-tech-tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .about-tech-tag { font-size: 12px; font-weight: 600; color: var(--text-secondary); background: var(--bg-color); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 6px; }
        
        .legal-content { font-size: 14.5px; line-height: 1.75; color: var(--text-primary); }
        .legal-content h2 { font-size: 17px; font-weight: 700; color: var(--text-heading); margin-top: 28px; margin-bottom: 10px; }
        .legal-content h2:first-of-type { margin-top: 8px; }
        .legal-content p { margin-bottom: 12px; }
        .legal-content ul { margin: 8px 0 16px 20px; list-style-type: disc; }
        .legal-content ul li { margin-bottom: 4px; }
        .legal-content strong { color: var(--text-heading); }
        .legal-last-updated { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; font-style: italic; }
        
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
          background: #0d1321;
          border-color: #1f2937;
        }
        .dark .app-card.is-urgent { border-color: rgba(239, 68, 68, 0.5); box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.15); }
        
        .dark .app-card:hover {
          border-color: #374151;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }
        .dark .company-logo-container {
          background: #0d1321;
          border-color: #1f2937;
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
        .dark .note-input { background: #0d1321; border-color: #1f2937; color: var(--text-primary); }
        .dark .note-input:focus { background: #0d1321; border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        
        .dark .card-actions { border-color: #1f2937; }
        .dark .card-btn-done { background: #27272a; border-color: transparent; color: #fafafa; }
        .dark .card-btn-done:hover:not(:disabled) { background: #3f3f46; border-color: #52525b; }
        .dark .card-btn-remove { background: transparent; border-color: #7f1d1d; color: #fca5a5; }
        .dark .card-btn-remove:hover { background: rgba(153, 27, 27, 0.2); border-color: #991b1b; }
        .dark .card-btn-apply { background: var(--brand-primary); border-color: transparent; color: #ffffff; }
        .dark .card-btn-apply:hover { background: var(--brand-primary-hover); }
        .dark .card-btn-edit { background: transparent; border-color: #1f2937; color: var(--text-secondary); }
        .dark .card-btn-edit:hover { background: #1f2937; border-color: #374151; color: var(--text-primary); }
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
          max-width: 620px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          overflow: hidden;
        }
        .info-modal-header {
          padding: 24px 28px 16px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          flex-shrink: 0;
        }
        .info-modal-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .info-modal-company-row { display: flex; align-items: center; gap: 14px; }
        .info-modal-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: contain; background: #f1f5f9; padding: 4px; }
        .info-modal-company-name { font-family: 'Manrope', sans-serif; font-size: 22px; font-weight: 700; color: var(--text-heading, #0f172a); margin: 0; }
        .info-modal-subtitle { font-size: 13px; color: #64748b; margin: 2px 0 0; }
        .info-modal-meta-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .meta-chip { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-color, #e2e8f0); color: var(--text-secondary, #64748b); background: var(--bg-color, #f8fafc); }
        .meta-chip.urgent { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
        .meta-chip.status-new { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
        .meta-chip.status-applied { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .meta-chip.status-interview { background: #fefce8; border-color: #fde68a; color: #92400e; }
        .meta-chip.status-offer { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .meta-chip.status-rejected { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
        .meta-chip.status-done { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }

        .info-modal-body { overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; max-height: calc(85vh - 210px); padding: 20px 28px 28px; display: flex; flex-direction: column; gap: 16px; }
        .info-modal-section { background: var(--surface-color, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; overflow: hidden; }
        .info-modal-section-header { padding: 14px 18px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary, #64748b); border-bottom: 1px solid var(--border-color, #e2e8f0); background: var(--bg-color, #f8fafc); }
        .info-modal-section-body { padding: 16px 18px; }

        .info-detail-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-color, #f1f5f9); }
        .info-detail-row:last-child { border-bottom: none; padding-bottom: 0; }
        .info-detail-label { font-size: 13px; font-weight: 600; color: var(--text-secondary, #64748b); min-width: 90px; flex-shrink: 0; }
        .info-detail-value { font-size: 13.5px; color: var(--text-primary, #1e293b); line-height: 1.5; }

        .company-description { font-size: 13.5px; color: var(--text-primary, #1e293b); line-height: 1.65; margin: 0 0 12px; }
        .known-for-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
        .known-for-list li { font-size: 13px; color: var(--text-secondary, #64748b); display: flex; align-items: flex-start; gap: 8px; }
        .known-for-list li::before { content: "•"; color: #3b82f6; font-weight: 700; flex-shrink: 0; }

        .skills-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .skill-chip { font-size: 12.5px; font-weight: 500; padding: 5px 12px; border-radius: 20px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; display: flex; align-items: center; gap: 6px; }
        .skill-chip::before { content: "✓"; font-weight: 700; }

        .company-skeleton { display: flex; flex-direction: column; gap: 10px; }
        .skeleton-line { height: 14px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .info-modal-footer { padding: 16px 28px; border-top: 1px solid var(--border-color, #e2e8f0); display: flex; justify-content: flex-end; flex-shrink: 0; background: var(--surface-color, #fff); }

        .dark .info-modal-section { background: var(--surface-color); border-color: var(--border-color); }
        .dark .info-modal-section-header { background: rgba(255,255,255,0.04); }
        .dark .info-modal-section-body { background: var(--surface-color); }
        .dark .info-detail-row { border-color: var(--border-color); }
        .dark .meta-chip { background: rgba(255,255,255,0.06); border-color: var(--border-color); }
        .dark .skill-chip { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); }
        .dark .skeleton-line { background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%); background-size: 200% 100%; }

        
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
            <div
              className={`nav-item ${activeFilter === 'settings' ? 'active' : ''}`}
              style={{ marginTop: 0 }}
              onClick={() => { setActiveFilter('settings'); setSettingsSubView('main'); setIsSidebarOpen(false); }}
            >
              <span>Settings ⚙️</span>
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
                        <button className="user-dropdown-item" onClick={() => { setShowDeleteModal(true); setShowUserDropdown(false); }}>
                          Delete Account
                        </button>
                        <div style={{ borderBottom: '1px solid var(--border-color)', margin: '4px 0' }} />
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

            {activeFilter === "settings" ? (
              <div className="settings-container">
                {settingsSubView === "main" && (
                  <>
                    <div className="settings-header">
                      <h1 className="settings-main-title">Settings & Help</h1>
                    </div>

                    <div className="settings-grid-row">
                      <div className="settings-card">
                        <h3 className="settings-title">
                          <span className="settings-title-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="12" cy="11" r="3" /></svg>
                          </span>
                          <span>Support</span>
                        </h3>
                        <div className="settings-list">
                          <button className="settings-item" onClick={() => alert("Report an Issue functionality coming soon!")}>
                            <span className="settings-item-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            </span>
                            <span className="settings-item-label">Report an Issue</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                          <button className="settings-item" onClick={() => alert("Send Feedback functionality coming soon!")}>
                            <span className="settings-item-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                            </span>
                            <span className="settings-item-label">Send Feedback</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                        </div>
                      </div>

                      <div className="settings-card">
                        <h3 className="settings-title">
                          <span className="settings-title-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22" /><line x1="5" y1="7" x2="19" y2="7" /><path d="M5 9c0 3 1.5 5 3.5 5S12 12 12 9" /><path d="M12 9c0 3 1.5 5 3.5 5S19 12 19 9" /></svg>
                          </span>
                          <span>Legal</span>
                        </h3>
                        <div className="settings-list">
                          <button className="settings-item" onClick={() => setSettingsSubView("privacy")}>
                            <span className="settings-item-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                            </span>
                            <span className="settings-item-label">Privacy Policy</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                          <button className="settings-item" onClick={() => setSettingsSubView("terms")}>
                            <span className="settings-item-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                            </span>
                            <span className="settings-item-label">Terms of Service</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="settings-about-card">
                      <div className="about-info-box">
                        <h3>About Email Tracker</h3>
                        <span className="about-version-badge">VERSION 2.0.0 STABLE</span>
                        <p className="about-desc">
                          Email Tracker automatically tracks and organizes emails from the placement department. It extracts important information such as company details, deadlines, eligibility criteria, and application links, presenting everything in a centralized dashboard for quick access and easy tracking.
                        </p>
                        <div className="about-tech-container">
                          <span className="about-tech-label">Built with:</span>
                          <div className="about-tech-tags">
                            <span className="about-tech-tag">React</span>
                            <span className="about-tech-tag">Node.js</span>
                            <span className="about-tech-tag">MongoDB</span>
                            <span className="about-tech-tag">Gemini</span>
                            <span className="about-tech-tag">Google OAuth</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {settingsSubView === "privacy" && (
                  <div className="settings-card">
                    <button className="btn-outline-primary" style={{ marginBottom: '16px' }} onClick={() => setSettingsSubView("main")}>
                      ❮ Back to Settings
                    </button>
                    <h3 className="settings-title">Privacy Policy</h3>
                    <p className="legal-last-updated">Last updated: June 2026</p>
                    <div className="legal-content">
                      <h2>1. What is Email Tracker?</h2>
                      <p>
                        Email Tracker is an AI-powered tool that helps students track placement-related emails.
                        It connects to your Gmail account, identifies emails from your college placement department,
                        and organizes them into an actionable dashboard — so you never miss a deadline or opportunity.
                      </p>

                      <h2>2. What information do we collect?</h2>
                      <p>When you use Email Tracker, we collect and store the following:</p>
                      <ul>
                        <li><strong>Your Google account email address</strong> — used to identify your account.</li>
                        <li><strong>Google OAuth credentials</strong> — securely stored tokens that let us access your Gmail on your behalf. We never see or store your Google password.</li>
                        <li><strong>Placement-related Gmail messages</strong> — we read emails matching specific criteria (e.g., from your placement department) to extract application details.</li>
                        <li><strong>Parsed application data</strong> — company names, roles, deadlines, stipends, and other structured information extracted from your emails.</li>
                        <li><strong>Personal notes</strong> — any notes you add to applications within the dashboard.</li>
                        <li><strong>Synchronization metadata</strong> — timestamps and history IDs that help us sync efficiently without re-processing old emails.</li>
                      </ul>

                      <h2>3. How do we use your information?</h2>
                      <p>Everything we collect serves one purpose: making your placement tracking easier. Specifically, we use your data to:</p>
                      <ul>
                        <li>Synchronize placement emails from your Gmail inbox.</li>
                        <li>Extract and organize application details using AI.</li>
                        <li>Display your applications on a personal dashboard.</li>
                        <li>Show summary statistics (total applications, upcoming deadlines, etc.).</li>
                        <li>Let you add notes, mark applications as done, and manage your workflow.</li>
                      </ul>
                      <p>We do not use your emails for advertising, profiling, or any purpose unrelated to placement tracking.</p>

                      <h2>4. AI processing</h2>
                      <p>
                        When we sync your emails, relevant message content is sent to <strong>Google's Gemini API</strong> for processing.
                        Gemini extracts structured placement information — company name, role, deadline, application link, and so on.
                      </p>
                      <p>
                        This processing happens solely to turn unstructured email text into organized application cards.
                        We do not use your email content for training AI models, advertising, or any other purpose.
                      </p>

                      <h2>5. Where is your data stored?</h2>
                      <p>
                        Your account and application data is stored in <strong>MongoDB Atlas</strong>, a cloud-hosted database service.
                        Authentication is handled using <strong>JWT (JSON Web Tokens)</strong> — your session is verified on every request.
                      </p>
                      <p>
                        Each user's application data is fully isolated. One user cannot access another user's applications, notes, or sync history.
                      </p>
                      <p>
                        We do maintain a shared cache of company metadata (logos, domains) to improve loading performance.
                        This cache contains no user-specific information.
                      </p>

                      <h2>6. Do we share your data?</h2>
                      <p><strong>No.</strong> We do not sell your data. We do not share it with third parties for their own purposes.</p>
                      <p>The only external services that interact with your data are:</p>
                      <ul>
                        <li><strong>Google OAuth & Gmail API</strong> — to authenticate you and read your emails.</li>
                        <li><strong>Google Gemini API</strong> — to parse email content into structured data.</li>
                        <li><strong>MongoDB Atlas</strong> — to store your data.</li>
                      </ul>
                      <p>These services are necessary for Email Tracker to function. We do not send your data anywhere else.</p>

                      <h2>7. Deleting your account</h2>
                      <p>
                        You can delete your account at any time. When you do, we permanently remove:
                      </p>
                      <ul>
                        <li>Your account information and OAuth credentials.</li>
                        <li>All synchronized applications.</li>
                        <li>All personal notes.</li>
                        <li>All synchronization history and metadata.</li>
                      </ul>
                      <p>
                        Globally cached company metadata (logos, domains) is retained because it contains no user-specific information and is shared across the platform.
                      </p>

                      <h2>8. Security</h2>
                      <p>We take reasonable steps to protect your data:</p>
                      <ul>
                        <li>Authentication uses <strong>JWT tokens</strong> with short-lived access tokens and secure refresh rotation.</li>
                        <li>Google OAuth follows the standard secure authorization code flow — we never handle your Google password.</li>
                        <li>All API endpoints verify your identity before returning data.</li>
                        <li>User data is isolated at the database level — queries are scoped to your account.</li>
                      </ul>
                      <p>
                        That said, no system is perfectly secure. We do our best, but we cannot guarantee absolute security.
                        If you discover a vulnerability, please let us know.
                      </p>

                      <h2>9. Contact</h2>
                      <p>
                        If you have questions about this Privacy Policy or how your data is handled, reach out to us at{" "}
                        <strong>tejasholla23@gmail.com</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {settingsSubView === "terms" && (
                  <div className="settings-card">
                    <button className="btn-outline-primary" style={{ marginBottom: '16px' }} onClick={() => setSettingsSubView("main")}>
                      ❮ Back to Settings
                    </button>
                    <h3 className="settings-title">Terms of Service</h3>
                    <p className="legal-last-updated">Last updated: July 2, 2026</p>
                    <div className="legal-content">
                      <h2>1. Acceptance of These Terms</h2>
                      <p>
                        By creating an account or using Email Tracker, you agree to these Terms. If you do not agree, please do not use the application.
                      </p>

                      <h2>2. Eligibility and Account Access</h2>
                      <p>
                        Access to Email Tracker may be restricted to users from approved educational institutions. We reserve the right to accept or reject registrations based on supported email domains.
                      </p>

                      <h2>3. Acceptable Use</h2>
                      <p>You are responsible for:</p>
                      <ul>
                        <li>Maintaining the security of your Google account</li>
                        <li>Ensuring information you provide is accurate</li>
                        <li>Complying with applicable laws and institutional policies while using Email Tracker</li>
                      </ul>
                      <p>
                        You agree not to misuse the service or interfere with the operation or security of the service.
                      </p>

                      <h2>4. Google Account Authorization</h2>
                      <p>
                        Your use of Email Tracker is also governed by our Privacy Policy, which explains how we collect, use, and protect your information. Email Tracker accesses Gmail only with your explicit authorization through Google's OAuth authentication system.
                      </p>

                      <h2>5. Service Availability</h2>
                      <p>
                        Email Tracker is provided on an "as is" and "as available" basis. We may modify, suspend, or discontinue parts of the service at any time without prior notice.
                      </p>

                      <h2>6. Intellectual Property</h2>
                      <p>
                        Email Tracker — including its design, branding, code, and user interface — belongs to its developer. You may not copy, redistribute, or create derivative works from the application without permission. Your data remains yours.
                      </p>

                      <h2>7. Disclaimer of Warranties</h2>
                      <p>While we strive for accuracy and reliability, we do not guarantee that:</p>
                      <ul>
                        <li>Email synchronization will always succeed</li>
                        <li>Extracted information will always be complete or accurate</li>
                        <li>The service will be available without interruption</li>
                      </ul>
                      <p>
                        Users should always verify important deadlines and application details using official communications from employers or their institution.
                      </p>

                      <h2>8. Limitation of Liability</h2>
                      <p>
                        To the maximum extent permitted by law, Email Tracker shall not be responsible for any loss arising from reliance on information displayed by the application, including missed deadlines, inaccurate parsing results, or service interruptions.
                      </p>

                      <h2>9. Termination</h2>
                      <p>
                        We reserve the right to suspend or terminate access to Email Tracker if these Terms are violated or if continued access would compromise the security or operation of the service.
                      </p>

                      <h2>10. Changes to These Terms</h2>
                      <p>
                        We may update these Terms from time to time to reflect changes to the service, legal requirements, or operational practices. Continued use of Email Tracker after updated Terms become effective constitutes acceptance of the revised Terms.
                      </p>

                      <h2>11. Contact Information</h2>
                      <p>
                        If you have any questions about these Terms, please contact us at:
                        <br />
                        <strong>tejasholla23@gmail.com</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
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
                            {app.deadline && !app.deadlineText && 
                             (!Array.isArray(app.fieldsToDisplay) || app.fieldsToDisplay.length === 0) && 
                             (!Array.isArray(app.displayFields) || app.displayFields.length === 0) && (
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
                                    subtitle: app.subtitle || "",
                                    role: getField("Role", app.role),
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
              </>
            )}
          </main>

          {activeFilter !== "settings" && (
            <button
              className="floating-add-btn"
              onClick={() => setShowAddModal(true)}
              title="Add Application"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          )}
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
                  <label className="form-label">Subtitle</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. IoT Team (Agentic AI) unpaid intern"
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  />
                </div>
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

              <div className="custom-fields-section" style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <h4 className="form-section-title" style={{ fontSize: '14.5px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>Custom Fields</h4>

                {formData.customFields && formData.customFields.map((cf, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Label"
                        value={cf.label}
                        onChange={(e) => {
                          const updated = [...formData.customFields];
                          updated[index].label = e.target.value;
                          setFormData({ ...formData, customFields: updated });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Value"
                        value={cf.value}
                        onChange={(e) => {
                          const updated = [...formData.customFields];
                          updated[index].value = e.target.value;
                          setFormData({ ...formData, customFields: updated });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-remove-custom"
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}
                      onClick={() => {
                        const updated = formData.customFields.filter((_, i) => i !== index);
                        setFormData({ ...formData, customFields: updated });
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="New field label"
                      value={newCustomLabel}
                      onChange={(e) => setNewCustomLabel(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Value"
                      value={newCustomValue}
                      onChange={(e) => setNewCustomValue(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-add-custom"
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (!newCustomLabel.trim()) return;
                      const updated = [...(formData.customFields || []), { label: newCustomLabel.trim(), value: newCustomValue.trim() }];
                      setFormData({ ...formData, customFields: updated });
                      setNewCustomLabel("");
                      setNewCustomValue("");
                    }}
                  >
                    Add Field
                  </button>
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
                  <label className="form-label">Subtitle</label>
                  <input type="text" className="form-input" value={editFormData.subtitle || ""} onChange={(e) => setEditFormData({ ...editFormData, subtitle: e.target.value })} />
                </div>
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
              </div>

              <div className="custom-fields-section" style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <h4 className="form-section-title" style={{ fontSize: '14.5px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>Custom Fields</h4>

                {editFormData.dynamicFields && editFormData.dynamicFields.map((df, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Label"
                        value={df.label}
                        onChange={(e) => {
                          const updated = [...editFormData.dynamicFields];
                          updated[index].label = e.target.value;
                          setEditFormData({ ...editFormData, dynamicFields: updated });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Value"
                        value={df.value}
                        onChange={(e) => {
                          const updated = [...editFormData.dynamicFields];
                          updated[index].value = e.target.value;
                          setEditFormData({ ...editFormData, dynamicFields: updated });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-remove-custom"
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}
                      onClick={() => {
                        const updated = editFormData.dynamicFields.filter((_, i) => i !== index);
                        setEditFormData({ ...editFormData, dynamicFields: updated });
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="New field label"
                      value={editCustomLabel}
                      onChange={(e) => setEditCustomLabel(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Value"
                      value={editCustomValue}
                      onChange={(e) => setEditCustomValue(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-add-custom"
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (!editCustomLabel.trim()) return;
                      const updated = [...(editFormData.dynamicFields || []), { label: editCustomLabel.trim(), value: editCustomValue.trim() }];
                      setEditFormData({ ...editFormData, dynamicFields: updated });
                      setEditCustomLabel("");
                      setEditCustomValue("");
                    }}
                  >
                    Add Field
                  </button>
                </div>
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

      {showInfoModal && selectedApp && (() => {
        const app = selectedApp;
        const closeInfoModal = () => {
          setShowInfoModal(false);
        };
        const statusKey = (app.status || 'new').toLowerCase().replace(/\s+/g, '-');
        const isUrgent = app.deadlineISO && new Date(app.deadlineISO) - Date.now() < 72 * 60 * 60 * 1000;
        const logoSrc = app.companyInfo?.logo;
        const FIELD_CONFIG = {
          role:      { label: "Role(s)",   value: app.programRoles    },
          stipend:   { label: "Stipend",   value: app.programStipend  },
          deadline:  { label: "Deadline",  value: app.deadlineText    },
          duration:  { label: "Duration",  value: app.programDuration },
          venue:     { label: "Venue",     value: app.venue           },
          eventName: { label: "Event",     value: app.subtitle        },
        };
        const displayRowsFromFields = Array.isArray(app.fieldsToDisplay)
          ? app.fieldsToDisplay.map(f => FIELD_CONFIG[f]).filter(r => r && r.value?.trim())
          : [];
        const displayFieldRows = Array.isArray(app.displayFields)
          ? app.displayFields.filter(f => f?.label && f?.value?.trim())
          : [];
        const skills = Array.isArray(app.skills) ? app.skills : [];

        return (
          <div className="modal-overlay" onClick={closeInfoModal}>
            <div className="modal-content info-modal-content" onClick={e => e.stopPropagation()}>

              {/* ── Header ── */}
              <div className="info-modal-header">
                <div className="info-modal-header-top">
                  <div className="info-modal-company-row">
                    {logoSrc && (
                      <img src={logoSrc} alt={app.company} className="info-modal-logo"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <div>
                      <h3 className="info-modal-company-name">{app.company}</h3>
                      {app.subtitle && <p className="info-modal-subtitle">{app.subtitle}</p>}
                    </div>
                  </div>
                  <button className="modal-close" onClick={closeInfoModal}>&times;</button>
                </div>
                <div className="info-modal-meta-chips">
                  <span className={`meta-chip status-${statusKey}`} style={{ textTransform: 'capitalize' }}>
                    {app.status || 'New'}
                  </span>
                  {app.type && app.type !== 'unknown' && app.type !== app.emailType && (
                    <span className="meta-chip" style={{ textTransform: 'capitalize' }}>{app.type}</span>
                  )}
                  {app.deadlineText && (
                    <span className={`meta-chip${isUrgent ? ' urgent' : ''}`}>
                      {isUrgent ? '⚡ ' : '🗓 '}Deadline: {app.deadlineText}
                    </span>
                  )}
                  {app.emailType && app.emailType !== 'job' && (
                    <span className="meta-chip" style={{ textTransform: 'capitalize' }}>{app.emailType}</span>
                  )}
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div className="info-modal-body">

                {/* Application Timeline — Only section in body */}
                {app.events && app.events.length > 0 && (
                  <div className="info-modal-section">
                    <div className="info-modal-section-header">Application Timeline</div>
                    <div className="info-modal-section-body">
                      <div className="timeline-container" style={{ position: 'relative', marginLeft: '8px' }}>
                        {app.events.map((ev, i) => {
                          const d = new Date(ev.date);
                          const formattedD = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
                          return (
                            <div key={i} className="timeline-event" style={{ display: 'flex', position: 'relative', marginBottom: i === app.events.length - 1 ? '0' : '18px' }}>
                              <div className="timeline-date" style={{ width: '48px', fontSize: '13px', color: '#64748b', textAlign: 'right', marginRight: '16px', flexShrink: 0, paddingTop: '1px', fontWeight: '500' }}>
                                {formattedD}
                              </div>
                              <div className="timeline-dot" style={{ position: 'absolute', left: '59px', top: '7px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', zIndex: 1, border: '1px solid #fff' }}></div>
                              {i !== app.events.length - 1 && (
                                <div className="timeline-line" style={{ position: 'absolute', left: '62px', top: '15px', bottom: '-18px', width: '2px', backgroundColor: '#e2e8f0' }}></div>
                              )}
                              <div className="timeline-content" style={{ marginLeft: '24px', flex: 1, paddingBottom: '4px' }}>
                                <div className="timeline-title" style={{ fontSize: '14.5px', fontWeight: '600', color: '#0f172a' }}>
                                  {ev.title || ev.classification || 'Email Notification'}
                                </div>
                                <div className="timeline-subtitle" style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px', lineHeight: '1.5' }}>
                                  {ev.summary ? ev.summary : (ev.subject ? (ev.subject.length > 80 ? ev.subject.substring(0, 80) + '...' : ev.subject) : '')}
                                </div>
                                {ev.link && (
                                  <div style={{ marginTop: '6px' }}>
                                    <a href={ev.link} target="_blank" rel="noopener noreferrer"
                                       style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'underline', fontWeight: '500' }}
                                       onClick={e => e.stopPropagation()}>
                                      {ev.classification === 'Registration Link' || ev.classification === 'New Hiring Opportunity' || ev.classification === 'Internship Opportunity' ? 'Apply Link ↗' : 'Open Link ↗'}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ── Footer ── */}
              <div className="info-modal-footer">
                <button className="btn-primary" onClick={closeInfoModal}>
                  Close
                </button>
              </div>

            </div>
          </div>
        );
      })()}


      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(""); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc2626' }}>Delete Account</h3>
              <button className="modal-close" onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(""); }}>&times;</button>
            </div>

            <form onSubmit={handleDeleteSubmit} style={{ marginTop: '16px' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                <p style={{ marginBottom: '12px', fontWeight: '600' }}>
                  Warning: This action is permanent and irreversible.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  The following data associated with your account will be permanently deleted:
                </p>
                <ul style={{ paddingLeft: '20px', marginBottom: '16px', listStyleType: 'disc' }}>
                  <li>Your user account and credentials</li>
                  <li>All synced job applications</li>
                  <li>Any custom notes you have written</li>
                  <li>Your synchronization log history</li>
                </ul>
                <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  Note: Shared company metadata (such as logos and company domains) is not affected.
                </p>
              </div>

              {deleteError && (
                <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>
                  {deleteError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  To confirm, type <strong style={{ color: '#dc2626' }}>DELETE</strong> in the box below:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deletingAccount}
                  required
                  style={{ borderColor: deleteConfirmText === "DELETE" ? '#dc2626' : 'var(--border-color)', outline: 'none' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(""); }}
                  disabled={deletingAccount}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  style={{ backgroundColor: deleteConfirmText === "DELETE" ? '#dc2626' : '#ef4444', opacity: deleteConfirmText === "DELETE" ? 1 : 0.6 }}
                  disabled={deletingAccount || deleteConfirmText !== "DELETE"}
                >
                  {deletingAccount ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

