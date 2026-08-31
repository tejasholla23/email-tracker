"use client";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let activeRefreshPromise = null;

import React, { useEffect, useState, useRef } from "react";
import OfflinePage from "./components/OfflinePage";
import AnalyticsView from "./components/AnalyticsView";
import CalendarView from "./components/CalendarView";
import SettingsView from "./components/SettingsView";
import ApplicationCard from "./components/ApplicationCard";
import EditModal from "./components/EditModal";
import InfoModal from "./components/InfoModal";

export default function JobTrackerDashboard() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("success");
  const [syncError, setSyncError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);

      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

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
  const [companyProfile, setCompanyProfile] = useState(null);
  const [companyProfileLoading, setCompanyProfileLoading] = useState(false);

  // Linked Gmail Accounts State
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(false);
  const [showLinkConfirmModal, setShowLinkConfirmModal] = useState(false);
  const [linkInitiating, setLinkInitiating] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [manualSyncingId, setManualSyncingId] = useState(null);
  const [linkedToast, setLinkedToast] = useState(null);

  // Email Reparse State
  const [reparsingId, setReparsingId] = useState(null);
  const [reparseToast, setReparseToast] = useState(null);

  // Quick Status/Stage Menu State
  const [activeStatusMenuId, setActiveStatusMenuId] = useState(null);

  useEffect(() => {
    if (!activeStatusMenuId) return;
    const handleDocumentClick = (e) => {
      if (!e.target.closest('.status-quick-container')) {
        setActiveStatusMenuId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setActiveStatusMenuId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeStatusMenuId]);

  // Student Profile State (Phase 2)
  const [studentProfile, setStudentProfile] = useState({
    fullName: "",
    personalEmail: "",
    mobileNumber: "",
    derivedUsn: "",
    email: "",
  });
  const [studentProfileLoading, setStudentProfileLoading] = useState(false);
  const [studentProfileSaving, setStudentProfileSaving] = useState(false);
  const [studentProfileToast, setStudentProfileToast] = useState(null);

  const fetchStudentProfile = async () => {
    setStudentProfileLoading(true);
    try {
      const res = await apiFetch(`${BASE_URL}/auth/student-profile`);
      if (res.ok) {
        const data = await res.json();
        setStudentProfile({
          fullName: data.studentProfile?.fullName || "",
          personalEmail: data.studentProfile?.personalEmail || "",
          mobileNumber: data.studentProfile?.mobileNumber || "",
          derivedUsn: data.derivedUsn || "",
          email: data.email || "",
        });
      }
    } catch (err) {
      console.error("Failed to fetch student profile:", err);
    } finally {
      setStudentProfileLoading(false);
    }
  };

  const handleSaveStudentProfile = async (e) => {
    if (e) e.preventDefault();
    setStudentProfileSaving(true);
    setStudentProfileToast(null);

    try {
      const res = await apiFetch(`${BASE_URL}/auth/student-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: studentProfile.fullName,
          personalEmail: studentProfile.personalEmail,
          mobileNumber: studentProfile.mobileNumber,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStudentProfile((prev) => ({
          ...prev,
          fullName: data.studentProfile?.fullName || prev.fullName,
          personalEmail: data.studentProfile?.personalEmail || prev.personalEmail,
          mobileNumber: data.studentProfile?.mobileNumber || prev.mobileNumber,
          derivedUsn: data.derivedUsn || prev.derivedUsn,
        }));

        let msg = "Student details updated successfully.";
        if (data.newMatchesCount > 0) {
          msg = `Student details updated! Found ${data.newMatchesCount} new shortlist match${data.newMatchesCount > 1 ? "es" : ""}.`;
          fetchApplications();
        }
        setStudentProfileToast({ type: "success", message: msg });
      } else {
        const errData = await res.json().catch(() => ({}));
        setStudentProfileToast({ type: "error", message: errData.message || "Failed to update profile." });
      }
    } catch (err) {
      console.error("Failed to save student profile:", err);
      setStudentProfileToast({ type: "error", message: "Failed to save student profile." });
    } finally {
      setStudentProfileSaving(false);
    }
  };

  // Attachment Action State (view / download)
  const [attachmentActionId, setAttachmentActionId] = useState(null);
  const [attachmentError, setAttachmentError] = useState(null);
  const [attachmentToast, setAttachmentToast] = useState(null);

  const handleAttachmentAction = async (appId, attachmentId, filename, mimeType, action = 'view') => {
    const actionKey = `${attachmentId}_${action}`;
    if (attachmentActionId) return;
    setAttachmentActionId(actionKey);
    setAttachmentError(null);
    setAttachmentToast(null);

    const mt = (mimeType || '').toLowerCase();
    const fn = (filename || '').toLowerCase();
    const isViewable =
      mt === 'application/pdf' ||
      mt.startsWith('image/') ||
      mt.startsWith('text/') ||
      fn.endsWith('.pdf') ||
      fn.endsWith('.png') ||
      fn.endsWith('.jpg') ||
      fn.endsWith('.jpeg') ||
      fn.endsWith('.webp') ||
      fn.endsWith('.svg') ||
      fn.endsWith('.txt') ||
      fn.endsWith('.csv');

    try {
      if (action === 'view') {
        if (isViewable) {
          const res = await apiFetch(`${BASE_URL}/applications/${appId}/attachments/${attachmentId}?disposition=inline`);
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Failed to open (${res.status})`);
          }

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } else {
          // Graceful fallback for non-viewable formats (DOCX, XLSX, ODT, etc.)
          const res = await apiFetch(`${BASE_URL}/applications/${appId}/attachments/${attachmentId}?disposition=attachment`);
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Failed to download (${res.status})`);
          }

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename || 'attachment';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          const ext = filename ? `.${filename.split('.').pop()}` : 'this';
          setAttachmentToast({
            type: 'info',
            message: `In-browser preview is not supported for ${ext} files. File has been downloaded to your device.`
          });
        }
      } else {
        // Explicit Download
        const res = await apiFetch(`${BASE_URL}/applications/${appId}/attachments/${attachmentId}?disposition=attachment`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to download (${res.status})`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'attachment';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('[ATTACHMENT_ACTION_ERR]', err);
      setAttachmentError(err.message || 'Failed to process attachment');
    } finally {
      setAttachmentActionId(null);
    }
  };

  const handleReparseEmail = async (appId, messageId = null) => {
    if (!appId || reparsingId) return;
    const loadingKey = messageId ? `${appId}_${messageId}` : appId;
    setReparsingId(loadingKey);
    setReparseToast(null);

    try {
      const res = await apiFetch(`${BASE_URL}/applications/${appId}/reparse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: messageId ? JSON.stringify({ messageId }) : undefined
      });

      if (res.ok) {
        const updatedApp = await res.json();
        setSelectedApp(updatedApp);
        setApplications(prev => prev.map(a => a._id === appId ? updatedApp : a));
        setReparseToast({ type: "success", message: "✓ Email reparsed successfully" });
        setTimeout(() => setReparseToast(null), 3500);
      } else {
        const errData = await res.json();
        setReparseToast({ type: "error", message: errData.message || "Failed to reparse email. Please try again." });
      }
    } catch (err) {
      console.error("Reparse error:", err);
      setReparseToast({ type: "error", message: "Failed to reparse email. Please try again." });
    } finally {
      setReparsingId(null);
    }
  };

  const userDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
        setShowThemeSubmenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchLinkedAccounts = async () => {
    setLinkedAccountsLoading(true);
    try {
      const res = await apiFetch(`${BASE_URL}/auth/linked-accounts`);
      if (res.ok) {
        const data = await res.json();
        setLinkedAccounts(data.linkedAccounts || []);
      }
    } catch (err) {
      console.error("Failed to fetch linked accounts:", err);
    } finally {
      setLinkedAccountsLoading(false);
    }
  };

  const handleConfirmLinkAccount = async () => {
    setLinkInitiating(true);
    try {
      const res = await apiFetch(`${BASE_URL}/auth/google/link`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const errData = await res.json();
        alert(errData.message || "Failed to initiate Google OAuth link.");
      }
    } catch (err) {
      console.error("Link account error:", err);
      alert("Failed to initiate account linking.");
    } finally {
      setLinkInitiating(false);
      setShowLinkConfirmModal(false);
    }
  };

  const handleDisconnectLinkedAccount = async (id) => {
    if (!confirm("Are you sure you want to disconnect this Gmail account? Previously imported placement emails will remain safe in your dashboard.")) return;
    setDisconnectingId(id);
    try {
      const res = await apiFetch(`${BASE_URL}/auth/linked-accounts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLinkedAccounts(prev => prev.filter(a => a._id !== id));
        setLinkedToast({ type: "success", message: "Gmail account disconnected successfully." });
      } else {
        const errData = await res.json();
        setLinkedToast({ type: "error", message: errData.message || "Failed to disconnect account." });
      }
    } catch (err) {
      console.error("Disconnect error:", err);
      setLinkedToast({ type: "error", message: "Failed to disconnect account." });
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleSyncLinkedAccount = async (id) => {
    if (!id || manualSyncingId) return;
    setManualSyncingId(id);
    try {
      const res = await apiFetch(`${BASE_URL}/auth/linked-accounts/${id}/sync`, { method: "POST" });
      if (res.ok) {
        setLinkedToast({ type: "success", message: "Sync initiated. Fetching latest emails..." });
        setTimeout(() => fetchLinkedAccounts(), 2500);
      } else {
        const errData = await res.json();
        setLinkedToast({ type: "error", message: errData.message || "Failed to trigger sync." });
      }
    } catch (err) {
      console.error("Manual sync error:", err);
      setLinkedToast({ type: "error", message: "Failed to trigger sync." });
    } finally {
      setManualSyncingId(null);
    }
  };

  const fetchCompanyProfile = async (companyName) => {
    if (!companyName) return;
    setCompanyProfileLoading(true);
    try {
      const res = await apiFetch(`${BASE_URL}/applications/company-info/${encodeURIComponent(companyName)}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyProfile(data);
      }
    } catch (err) {
      console.error("Failed to fetch fallback company profile:", err);
    } finally {
      setCompanyProfileLoading(false);
    }
  };


  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter]);
  const [settingsSubView, setSettingsSubView] = useState("main");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearError, setClearError] = useState("");
  const [accountDeletedJustNow, setAccountDeletedJustNow] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isClickedToKeepOpen, setIsClickedToKeepOpen] = useState(false);
  const collapseTimeoutRef = React.useRef(null);
  const [timeTick, setTimeTick] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);

  const [userEmail, setUserEmail] = useState(null);

  // Google Calendar Integration State
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const [loadingCalendarStatus, setLoadingCalendarStatus] = useState(true);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [calendarSuccessMsg, setCalendarSuccessMsg] = useState("");
  const [calendarErrorMsg, setCalendarErrorMsg] = useState("");
  const [calendarTargetId, setCalendarTargetId] = useState("");
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [savingTargetCalendar, setSavingTargetCalendar] = useState(false);



  // Push Notifications State
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState("default");
  const [pushSubscriptionsCount, setPushSubscriptionsCount] = useState(0);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

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

  // Push Notifications Setup
  useEffect(() => {
    const initPushState = async () => {
      const { isPushSupported, getPushPermissionState, hasActiveSubscription } = await import("./utils/pushManager");
      const supported = isPushSupported();
      setPushSupported(supported);
      if (supported) {
        setPushPermission(getPushPermissionState());
        const active = await hasActiveSubscription();
        setIsSubscribed(active);
      }
    };
    initPushState();
  }, [userEmail]);

  // Deferred push notification permission banner logic
  useEffect(() => {
    if (!userEmail) return;

    let isMounted = true;
    let timer;

    const checkDeferredBanner = async () => {
      const { isPushSupported, getPushPermissionState, hasActiveSubscription, registerAndSubscribe } = await import("./utils/pushManager");
      if (!isPushSupported()) return;

      const perm = getPushPermissionState();
      if (!isMounted) return;
      setPushPermission(perm);

      const active = await hasActiveSubscription();
      if (!isMounted) return;
      setIsSubscribed(active);

      if (perm === "granted") {
        try {
          await registerAndSubscribe(apiFetch);
          if (isMounted) setIsSubscribed(true);
        } catch (e) {
          console.warn("[PushManager] Silent subscription registration/sync failed:", e.message);
          if (isMounted) setIsSubscribed(false);
        }

        // Refresh registered device count
        try {
          const res = await apiFetch(`${BASE_URL}/auth/me`);
          if (res.ok && isMounted) {
            const data = await res.json();
            setPushSubscriptionsCount(data.pushSubscriptionsCount || 0);
          }
        } catch (e) {
          console.warn("[PushManager] Failed to fetch device count:", e.message);
        }
        return;
      }

      if (perm === "denied") return;

      const dismissedAt = localStorage.getItem("pushBannerDismissedAt");
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (elapsed < sevenDays) {
          return;
        }
      }

      timer = setTimeout(() => {
        if (isMounted) {
          setShowPushBanner(true);
        }
      }, 3000);
    };

    checkDeferredBanner();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [userEmail]);

  const handleRequestPushPermission = async () => {
    try {
      const { registerAndSubscribe, getPushPermissionState, hasActiveSubscription } = await import("./utils/pushManager");
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      setShowPushBanner(false);

      if (permission === "granted") {
        console.log("[Push] Permission granted, subscribing...");
        await registerAndSubscribe(apiFetch);
        const active = await hasActiveSubscription();
        setIsSubscribed(active);

        const res = await apiFetch(`${BASE_URL}/auth/me`);
        if (res.ok) {
          const data = await res.json();
          setPushSubscriptionsCount(data.pushSubscriptionsCount || 0);
        }
        alert("Push notifications enabled successfully!");
      } else {
        setIsSubscribed(false);
        alert("Notifications permission was denied or dismissed.");
      }
    } catch (err) {
      setIsSubscribed(false);
      console.error("[Push] Error enabling notifications:", err.message);
      let errMsg = err.message || "";
      if (errMsg.toLowerCase().includes("push service error")) {
        errMsg += "\n\nFor Brave Browser: Go to Brave Settings -> 'Privacy and security' and toggle ON 'Use Google services for push messaging', then restart Brave.";
      }
      alert("Failed to enable push notifications: " + errMsg);
    }
  };

  const handleEnablePushSubscription = async () => {
    try {
      const { registerAndSubscribe, hasActiveSubscription } = await import("./utils/pushManager");
      await registerAndSubscribe(apiFetch);
      const active = await hasActiveSubscription();
      setIsSubscribed(active);

      const res = await apiFetch(`${BASE_URL}/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setPushSubscriptionsCount(data.pushSubscriptionsCount || 0);
      }
      alert("Push notifications enabled on this device successfully!");
    } catch (err) {
      setIsSubscribed(false);
      console.error("[Push] Error enabling subscription:", err.message);
      let errMsg = err.message || "";
      if (errMsg.toLowerCase().includes("push service error")) {
        errMsg += "\n\nFor Brave Browser: Go to Brave Settings -> 'Privacy and security' and toggle ON 'Use Google services for push messaging', then restart Brave.";
      }
      alert("Failed to enable push notifications: " + errMsg);
    }
  };

  const handleDisablePushNotifications = async () => {
    if (!confirm("Are you sure you want to disable push notifications on this device?")) {
      return;
    }

    try {
      const { unsubscribePush, getPushPermissionState, hasActiveSubscription } = await import("./utils/pushManager");
      await unsubscribePush(apiFetch);
      setPushPermission(getPushPermissionState());
      const active = await hasActiveSubscription();
      setIsSubscribed(active);

      const res = await apiFetch(`${BASE_URL}/auth/me`);
      if (res.ok) {
        const data = await res.json();
        setPushSubscriptionsCount(data.pushSubscriptionsCount || 0);
      }
      alert("Disabled push notifications on this device successfully.");
    } catch (err) {
      console.error("[Push] Error disabling notifications:", err.message);
      alert("Failed to disable notifications: " + err.message);
    }
  };

  const handleDismissPushBanner = () => {
    setShowPushBanner(false);
    localStorage.setItem("pushBannerDismissedAt", Date.now().toString());
  };

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

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (typeof window !== "undefined" && (!navigator.onLine || err.name === "TypeError")) {
        setIsOffline(true);
      }
      throw err;
    }

    if (response.status === 401) {
      console.warn("Access token expired, attempting refresh...");
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        handleLocalLogout();
        return response;
      }

      try {
        if (!activeRefreshPromise) {
          activeRefreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
          }).then(async (refreshRes) => {
            if (!refreshRes.ok) {
              throw new Error("Refresh failed");
            }
            const data = await refreshRes.json();
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            return data.accessToken;
          }).finally(() => {
            activeRefreshPromise = null;
          });
        }

        const newAccessToken = await activeRefreshPromise;

        // Retry the original request once
        options.headers["Authorization"] = `Bearer ${newAccessToken}`;
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

      if (error === "insufficient_scopes") {
        alert("Access Denied: Gmail access permission was not granted. Please sign in again and check the checkbox to allow access to your email messages.");
        window.history.replaceState({}, document.title, "/");
        return;
      }

      const linkedParam = params.get("linked");
      if (linkedParam === "success") {
        const email = params.get("email") || "Gmail account";
        setLinkedToast({ type: "success", message: `Successfully connected ${email}` });
        fetchLinkedAccounts();
        window.history.replaceState({}, document.title, "/");
      } else if (linkedParam === "error") {
        const reason = params.get("reason");
        let msg = "Failed to connect Gmail account.";
        if (reason === "insufficient_scopes") {
          msg = "Access Denied: Gmail reading permission was not granted. Please reconnect and check the checkbox to allow email access.";
        } else if (reason === "same_as_primary") {
          msg = "Cannot link your primary college account as a secondary account.";
        } else if (reason === "max_limit") {
          msg = "Maximum limit of 3 linked Gmail accounts reached.";
        }
        setLinkedToast({ type: "error", message: msg });
        fetchLinkedAccounts();
        window.history.replaceState({}, document.title, "/");
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
            if (typeof data.pushSubscriptionsCount === "number") {
              setPushSubscriptionsCount(data.pushSubscriptionsCount);
            }
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

  const fetchCalendarStatus = async () => {
    try {
      setLoadingCalendarStatus(true);
      const res = await apiFetch(`${BASE_URL}/auth/calendar/status`);
      if (res.ok) {
        const data = await res.json();
        setCalendarSyncEnabled(data.calendarSyncEnabled);
        setCalendarTargetId(data.calendarTargetId || "");
        setHasCalendarScope(data.hasCalendarScope);
      }

      const listRes = await apiFetch(`${BASE_URL}/auth/calendar/list`);
      if (listRes.ok) {
        const listData = await listRes.json();
        setAvailableCalendars(listData.calendars || []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar status:", err);
    } finally {
      setLoadingCalendarStatus(false);
    }
  };

  const handleSaveCalendarTarget = async (targetIdToSave) => {
    try {
      setSavingTargetCalendar(true);
      setCalendarSuccessMsg("");
      setCalendarErrorMsg("");

      const res = await apiFetch(`${BASE_URL}/auth/calendar/target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarTargetId: targetIdToSave })
      });

      if (res.ok) {
        const data = await res.json();
        setCalendarTargetId(data.calendarTargetId || "");
        setCalendarSuccessMsg("Destination calendar updated! Existing events are being migrated in the background.");
      } else {
        const err = await res.json().catch(() => ({}));
        setCalendarErrorMsg(err.message || "Failed to update destination calendar.");
      }
    } catch (err) {
      console.error("Save target calendar error:", err);
      setCalendarErrorMsg("Failed to connect to backend server.");
    } finally {
      setSavingTargetCalendar(false);
    }
  };



  useEffect(() => {
    if (userEmail) {
      fetchCalendarStatus();
    }
  }, [userEmail]);

  const handleToggleCalendarSync = async () => {
    try {
      setSyncingCalendar(true);
      setCalendarSuccessMsg("");
      setCalendarErrorMsg("");

      const res = await apiFetch(`${BASE_URL}/auth/calendar/toggle`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarSyncEnabled(data.calendarSyncEnabled);
        setCalendarSuccessMsg(data.calendarSyncEnabled ? "Calendar integration enabled! Syncing active deadlines..." : "Calendar integration disabled.");
      } else {
        const err = await res.json().catch(() => ({}));
        setCalendarErrorMsg(err.message || "Failed to update calendar integration settings.");
      }
    } catch (err) {
      console.error("Toggle calendar error:", err);
      setCalendarErrorMsg("Failed to connect to backend server.");
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleManualCalendarSync = async () => {
    try {
      setSyncingCalendar(true);
      setCalendarSuccessMsg("");
      setCalendarErrorMsg("");

      const res = await apiFetch(`${BASE_URL}/auth/calendar/sync`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarSuccessMsg("Calendar re-sync successfully queued in the background!");
      } else {
        const err = await res.json().catch(() => ({}));
        setCalendarErrorMsg(err.message || "Failed to trigger calendar re-sync.");
      }
    } catch (err) {
      console.error("Manual calendar sync error:", err);
      setCalendarErrorMsg("Failed to connect to backend server.");
    } finally {
      setSyncingCalendar(false);
    }
  };

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
    const timer = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const formatRelativeTime = (dateString) => {
    if (!dateString) return "Never synced";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Last Synced: Just now";
    if (diffMins === 1) return "Last Synced: 1 min ago";
    if (diffMins < 60) return `Last Synced: ${diffMins} mins ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "Last Synced: 1 hour ago";
    if (diffHours < 24) return `Last Synced: ${diffHours} hours ago`;

    return `Last Synced: ${date.toLocaleDateString('en-GB')}`;
  };

  const getCompactRelativeTime = (dateString) => {
    const formatted = formatRelativeTime(dateString);
    return formatted.replace("Last Synced: ", "");
  };

  const getFormattedISTDate = () => {
    return new Date().toLocaleDateString("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  };

  const handleSidebarMouseEnter = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsSidebarCollapsed(false);
  };

  const handleSidebarMouseLeave = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    collapseTimeoutRef.current = setTimeout(() => {
      setIsSidebarCollapsed(true);
      setIsClickedToKeepOpen(false);
    }, 250);
  };

  const handleSidebarClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    setIsClickedToKeepOpen(true);
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

  useEffect(() => {
    const isAnyModalOpen = showInfoModal || showAddModal || showEditModal || showDeleteModal || showClearModal;
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
  }, [showInfoModal, showAddModal, showEditModal, showDeleteModal, showClearModal]);

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

  const handleClearSubmit = async (e) => {
    if (e) e.preventDefault();
    if (clearConfirmText !== "CLEAR") {
      setClearError("Please type CLEAR to confirm clearing workspace.");
      return;
    }

    setClearing(true);
    setClearError("");

    try {
      const response = await apiFetch(`${BASE_URL}/clear-all-applications`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Clear failed");
      const data = await response.json();
      await fetchApplications();
      setShowClearModal(false);
      setClearConfirmText("");
      alert(`All applications cleared. (${data.deletedCount ?? "?"} records removed)`);
    } catch (error) {
      console.error("Clear all failed:", error);
      setClearError("Failed to clear applications. Please try again.");
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
        prev.map((app) => app._id === id ? { ...app, status: "done", isPinned: false, pinnedAt: null } : app)
      );
    } catch (error) {
      console.error("Mark done failed:", error);
      alert("Could not mark as done. Please try again.");
    }
  };

  const handleUnmarkDone = async (id) => {
    try {
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "new" }),
      });
      if (!response.ok) throw new Error("Failed to unmark as done");
      setApplications((prev) =>
        prev.map((app) => app._id === id ? { ...app, status: "new" } : app)
      );
    } catch (error) {
      console.error("Unmark done failed:", error);
      alert("Could not unmark as done. Please try again.");
    }
  };

  const handleApply = async (id) => {
    try {
      const response = await apiFetch(`${BASE_URL}/applications/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "applied", hasApplied: true }),
      });
      if (!response.ok) throw new Error("Failed to mark as applied");
      setApplications((prev) =>
        prev.map((app) => app._id === id ? { ...app, status: "applied", hasApplied: true } : app)
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

  const handleTogglePin = async (id) => {
    const app = applications.find(a => a._id === id);
    if (!app) return;
    const wasPinned = app.isPinned;
    // Optimistic update
    setApplications(prev => prev.map(a => a._id === id ? {
      ...a,
      isPinned: !wasPinned,
      pinnedAt: !wasPinned ? new Date().toISOString() : null
    } : a));
    try {
      const response = await apiFetch(`${BASE_URL}/applications/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) throw new Error("Failed to toggle pin");
    } catch (error) {
      console.error("Pin toggle failed:", error);
      setApplications(prev => prev.map(a => a._id === id ? {
        ...a, isPinned: wasPinned, pinnedAt: app.pinnedAt
      } : a));
    }
  };

  const handleLogout = async () => {
    if (!confirm("Are you sure you want to log out?")) {
      return;
    }
    let pushEndpoint = "";
    try {
      const { getCurrentPushEndpoint } = await import("./utils/pushManager");
      pushEndpoint = await getCurrentPushEndpoint();
    } catch (e) {
      console.warn("[Push] Error getting endpoint for logout:", e.message);
    }

    try {
      await apiFetch(`${BASE_URL}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushEndpoint })
      });
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
    if (editFormData.status && editFormData.status !== (original.status || "new")) manualEdits.status = editFormData.status;
    if (editFormData.stage && editFormData.stage !== (original.stage || "none")) manualEdits.stage = editFormData.stage;
    if (editFormData.opportunityType && editFormData.opportunityType !== (original.opportunityType || "JOB_APPLICATION")) manualEdits.opportunityType = editFormData.opportunityType;
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

    if (manualEdits.status === "applied" || (manualEdits.stage && manualEdits.stage !== "none")) {
      manualEdits.hasApplied = true;
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

  const handleQuickUpdate = async (appId, updates) => {
    const isApplied = updates.status === "applied" || (updates.stage && updates.stage !== "none");
    const extraUpdates = isApplied ? { hasApplied: true } : {};
    setApplications(prev => prev.map(a => {
      if (a._id === appId) {
        return { ...a, ...updates, ...extraUpdates };
      }
      return a;
    }));
    setActiveStatusMenuId(null);

    try {
      const response = await apiFetch(`${BASE_URL}/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualEdits: { ...updates, ...(isApplied ? { hasApplied: true } : {}) } })
      });
      if (!response.ok) {
        console.error("Failed to update status/stage via quick update");
      }
    } catch (err) {
      console.error("Quick update failed:", err);
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
    const statusLower = (a.status || "").toLowerCase();
    return d.toDateString() === now.toDateString() && statusLower !== "done" && statusLower !== "applied";
  }).length;

  const unmarkedCount = applications.filter(a => {
    let derivedStatus = (a.status || "new").toLowerCase();
    if (derivedStatus === "new") {
      const ageInMs = Date.now() - new Date(a.date || a.createdAt || 0).getTime();
      if (ageInMs > 24 * 60 * 60 * 1000) {
        derivedStatus = "unmarked";
      }
    }
    return derivedStatus === "unmarked";
  }).length;



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

            @media (max-width: 480px) {
              .login-container {
                padding: 0 16px;
                justify-content: flex-start !important;
              }
              .login-card {
                padding: 48px 24px 36px 24px;
                border-top: none !important;
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
                border-bottom-left-radius: 24px !important;
                border-bottom-right-radius: 24px !important;
                margin-top: 0 !important;
                margin-bottom: auto !important;
                width: 100% !important;
                max-width: 420px;
              }
              .login-title {
                font-size: 26px;
              }
              .login-subtitle {
                font-size: 13.5px;
                margin-bottom: 28px;
              }
              .login-btn {
                padding: 13px 20px;
                font-size: 14.5px;
              }
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
            <div className="logo-box" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
              <img src="/logo.png" alt="Email Tracker Logo" style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'contain' }} />
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
          --bg-color: #f8fafc;
          --surface-color: #ffffff;
          --text-primary: #334155;
          --text-heading: #0f172a;
          --text-secondary: #64748b;
          --border-color: #cbd5e1;
          --brand-primary: #2563eb;
          --brand-primary-hover: #1d4ed8;
          --sidebar-bg: #ffffff;
          --font-geist: 'IBM Plex Sans', -apple-system, sans-serif;
          --radius-card: 16px;
          --radius-btn: 8px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input, select, textarea, a { touch-action: manipulation; }
        body { font-family: var(--font-geist); background-color: var(--bg-color); color: var(--text-primary); transition: background-color 0.25s ease-out, color 0.25s ease-out; }
        
        .layout {
          display: flex;
          min-height: 100vh;
          --sidebar-width: 64px;
        }
        
        .layout.sidebar-expanded {
          --sidebar-width: 280px;
        }
        
        /* Sidebar */
        .sidebar {
          width: var(--sidebar-width);
          background-color: var(--sidebar-bg);
          border-right: 1px solid var(--border-color);
          padding: 24px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: fixed;
          height: 100vh;
          z-index: 50;
          transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          overflow: hidden;
        }

        .layout.sidebar-expanded .sidebar {
          padding: 24px 16px;
          align-items: stretch;
        }
        
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 32px;
          height: 48px;
          flex-shrink: 0;
          width: 100%;
          transition: justify-content 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .layout.sidebar-expanded .sidebar-header {
          justify-content: flex-start;
          padding: 0 4px;
        }
        
        .sidebar-logo-box {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .logo-img {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          object-fit: contain;
          flex-shrink: 0;
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }
        
        .logo-text-wrapper {
          display: flex;
          flex-direction: column;
          transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1), max-width 0.3s cubic-bezier(0.25, 1, 0.5, 1);
          max-width: 200px;
          overflow: hidden;
        }
        
        .logo-title-text {
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 19px;
          font-weight: 700;
          color: #0d9488;
          line-height: 1.2;
          white-space: nowrap;
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.05s, opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.05s;
        }
        
        .logo-subtitle-text {
          font-size: 11px;
          color: #6b7280;
          white-space: nowrap;
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.12s, opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.12s;
        }
        
        .layout:not(.sidebar-expanded) .logo-text-wrapper {
          opacity: 0;
          max-width: 0;
          pointer-events: none;
        }
        .layout:not(.sidebar-expanded) .logo-title-text {
          transform: translateX(-15px);
          opacity: 0;
        }
        .layout:not(.sidebar-expanded) .logo-subtitle-text {
          transform: translateX(-20px);
          opacity: 0;
        }
        
        .nav-item {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 12px;
          color: #475569;
          text-decoration: none;
          font-weight: 500;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
          font-size: 15px;
          position: relative;
          height: 40px;
          width: 40px;
          gap: 12px;
          flex-shrink: 0;
        }

        .layout.sidebar-expanded .nav-item {
          width: 100%;
          height: 48px;
          padding: 4px;
          justify-content: flex-start;
        }
        
        .nav-item:hover {
          background: #f1f5f9;
          color: var(--text-heading);
        }
        
        .nav-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
          flex-shrink: 0;
        }
        
        .nav-text {
          opacity: 1;
          max-width: 150px;
          transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.1s, max-width 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.1s, transform 0.3s cubic-bezier(0.25, 1, 0.5, 1) 0.1s;
          white-space: nowrap;
        }
        
        .layout:not(.sidebar-expanded) .nav-text {
          opacity: 0;
          max-width: 0;
          overflow: hidden;
          transform: translateX(-10px);
        }

        .nav-item.active {
          color: #0f766e;
          font-weight: 600;
        }
        
        .nav-item.active .nav-icon-wrapper {
          background: rgba(20, 184, 166, 0.12);
          border: 1px solid rgba(20, 184, 166, 0.35);
          box-shadow: 0 0 10px rgba(20, 184, 166, 0.25);
          color: #0d9488;
        }

        .sidebar-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 20px 0;
          opacity: 0.5;
          flex-shrink: 0;
          width: 24px;
          transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .layout.sidebar-expanded .sidebar-divider {
          width: 100%;
        }
        
        /* Dashboard Filters Row */
        .dashboard-filters-row {
          display: flex;
          width: 100%;
          border-bottom: 1px solid var(--border-color);
          margin-top: 32px;
          margin-bottom: 24px;
          gap: 16px;
        }

        .mobile-filter-wrapper {
          display: none;
        }
        
        .filter-tab {
          flex: 1;
          font-family: var(--font-geist);
          font-size: 14.5px;
          font-weight: 500;
          color: var(--text-secondary);
          background: none;
          border: none;
          padding: 14px 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          outline: none;
          transition: color 0.25s ease;
          position: relative;
        }

        .filter-tab:hover {
          color: var(--text-primary);
        }

        .filter-tab.active {
          color: #0f766e;
          font-weight: 600;
        }

        .filter-tab-text {
          position: relative;
          display: inline-block;
        }

        .filter-tab::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, rgba(20, 184, 166, 0) 0%, rgba(20, 184, 166, 1) 40%, rgba(20, 184, 166, 1) 60%, rgba(20, 184, 166, 0) 100%);
          transform: scaleX(0);
          transform-origin: bottom center;
          opacity: 0;
          transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease-out;
          border-radius: 99px;
          box-shadow: 0 1px 12px rgba(20, 184, 166, 0.4), 0 3px 20px rgba(20, 184, 166, 0.15);
        }

        .filter-tab.active::after {
          transform: scaleX(1);
          opacity: 1;
        }

        .dark .filter-tab.active {
          color: #2dd4bf;
        }

        .dark .filter-tab::after {
          background: linear-gradient(90deg, rgba(45, 212, 191, 0) 0%, rgba(45, 212, 191, 1) 40%, rgba(45, 212, 191, 1) 60%, rgba(45, 212, 191, 0) 100%);
          box-shadow: 0 0 16px rgba(45, 212, 191, 0.95), 0 6px 28px rgba(45, 212, 191, 0.65), 0 12px 50px rgba(45, 212, 191, 0.4), 0 20px 80px rgba(45, 212, 191, 0.2);
        }
        
        .sidebar-bottom {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding-bottom: 8px;
          flex-shrink: 0;
          width: 100%;
        }
        .layout.sidebar-expanded .sidebar-bottom {
          align-items: stretch;
        }
        .sync-btn {
          width: 100%;
          height: 40px;
          padding: 0 12px;
          background: var(--brand-primary);
          color: white;
          border: none;
          border-radius: var(--radius-btn);
          font-weight: 600;
          cursor: pointer;
          transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1), border-radius 0.4s ease, background-color 0.2s ease-out, transform 0.15s ease-out, filter 0.2s ease-out;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sync-btn:hover:not(:disabled) { filter: brightness(1.05); }
        .sync-btn:active:not(:disabled) { transform: scale(0.98); }
        .sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .layout:not(.sidebar-expanded) .sync-btn {
          width: 40px;
          height: 40px;
          padding: 0;
          border-radius: 10px;
          margin: 0 auto;
          gap: 0;
        }
        
        .sync-btn-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .sync-btn-text {
          white-space: nowrap;
          transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }
        
        .layout:not(.sidebar-expanded) .sync-btn-text {
          opacity: 0;
          width: 0;
          pointer-events: none;
        }
        
        .sync-time-text {
          font-size: 11px;
          color: var(--text-secondary);
          text-align: center;
          transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          white-space: nowrap;
          opacity: 0.85;
        }
        
        .layout:not(.sidebar-expanded) .sync-time-text {
          font-size: 10px;
          margin-top: 4px;
        }
        
        /* Main Area */
        .main-wrapper {
          margin-left: var(--sidebar-width);
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          transition: margin-left 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }
        
        .topbar {
          height: 64px;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 40;
          gap: 24px;
          transition: padding-left 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding-right 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          padding-left: calc(32px + (280px - var(--sidebar-width)) * 0.5);
          padding-right: calc(32px + (280px - var(--sidebar-width)) * 0.5);
        }
        .topbar-search-wrapper {
          display: flex;
          align-items: center;
          gap: 16px;
          flex: 1;
          margin-right: 28px;
        }
        .search-container { flex: 1; width: 100%; position: relative; }
        .search-container input { padding: 9px 16px 9px 40px; border-radius: 999px; border: 1px solid var(--border-color); background: #f1f5f9 url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 14px center; width: 100%; outline: none; font-size: 14px; color: var(--text-primary); transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out; }
        .search-container input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); background-color: #ffffff; }
        .search-container input::placeholder { color: var(--text-secondary); }
        .topbar-actions { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
        @keyframes dropdownPopup {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.94);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .user-dropdown-container { position: relative; }
        .user-avatar-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--brand-primary); color: white; border: none; font-weight: 600; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-out; }
        .user-avatar-btn:hover { filter: brightness(1.1); transform: scale(1.05); }
        .user-dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 16px 32px -4px rgba(0, 0, 0, 0.25), 0 6px 12px -2px rgba(0, 0, 0, 0.12); width: 220px; overflow: hidden; z-index: 100; transform-origin: top right; animation: dropdownPopup 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
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
        .btn-outline-primary { padding: 8px 16px; border: 1px solid #cbd5e1; background: #ffffff; color: var(--text-primary); border-radius: var(--radius-btn); font-weight: 500; font-size: 13px; cursor: pointer; transition: all 0.2s ease-out; }
        .btn-outline-primary:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; color: var(--text-heading); filter: none; }
        .btn-outline-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-outline-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .dark .btn-outline-primary { background: transparent; border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }
        .dark .btn-outline-primary:hover:not(:disabled) { background: rgba(59, 130, 246, 0.1); border-color: #60a5fa; filter: none; }
        
        /* Content */
        .content {
          max-width: calc(1400px + (280px - var(--sidebar-width)));
          margin: 0 auto;
          width: 100%;
          transition: padding-left 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding-right 0.4s cubic-bezier(0.25, 1, 0.5, 1), max-width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          padding-top: 32px;
          padding-bottom: 32px;
          padding-left: calc(32px + (280px - var(--sidebar-width)) * 0.5);
          padding-right: calc(32px + (280px - var(--sidebar-width)) * 0.5);
        }
        .page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
        .page-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: var(--text-heading); margin-bottom: 4px; }
        .page-subtitle { color: #64748b; font-size: 15px; }
        .page-header-date-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--text-primary);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
          transition: all 0.2s ease;
          user-select: none;
          margin-bottom: 4px;
        }
        .page-header-date-badge:hover {
          border-color: rgba(20, 184, 166, 0.35);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }
        .dark .page-header-date-badge {
          background: #0d1321;
          border-color: rgba(255, 255, 255, 0.09);
          color: #f1f5f9;
        }
        .date-badge-icon {
          color: #14b8a6;
          flex-shrink: 0;
        }

        /* Settings Page */
        .settings-container { display: flex; flex-direction: column; gap: 32px; max-width: 100%; margin: 0 auto; width: 100%; padding-bottom: 40px; }
        .settings-header { margin-bottom: 8px; }
        .settings-main-title { font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 700; color: var(--text-heading); margin-bottom: 6px; }
        .settings-main-subtitle { color: var(--text-secondary); font-size: 15px; }
        .settings-grid-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
        .settings-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-card); padding: 28px; box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 6px -1px rgba(15, 23, 42, 0.02); }
        .settings-title { font-size: 20px; font-weight: 700; color: var(--text-heading); margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
        .settings-title-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(13, 148, 136, 0.1); color: #0d9488; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .dark .settings-title-icon { background: rgba(45, 212, 191, 0.15); color: #2dd4bf; }
        
        .settings-list { display: flex; flex-direction: column; gap: 12px; }
        .settings-item { display: flex; align-items: center; padding: 14px 18px; border-radius: 12px; background: var(--bg-color); cursor: pointer; transition: all 0.2s ease; border: 1px solid var(--border-color); color: var(--text-primary); font-weight: 500; font-size: 14.5px; text-align: left; width: 100%; gap: 12px; }
        .settings-item:hover { background: rgba(0, 0, 0, 0.03); color: var(--text-heading); transform: translateY(-1px); }
        .dark .settings-item:hover { background: rgba(255, 255, 255, 0.05); }
        .settings-item-label { flex: 1; }
        .settings-item-icon { color: var(--text-secondary); display: flex; align-items: center; font-size: 16px; width: 24px; justify-content: center; }
        .settings-item-arrow { color: var(--text-secondary); font-size: 12px; margin-left: auto; }
        
        /* Settings About Section (Clean style) */
        .settings-about-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-card); padding: 32px; box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 6px -1px rgba(15, 23, 42, 0.02); }
        .about-info-box { display: flex; flex-direction: column; gap: 12px; }
        .about-info-box h3 { font-size: 20px; font-weight: 700; color: var(--text-heading); margin: 0; }
        .about-version-badge { display: inline-block; font-size: 11px; font-weight: 700; color: #0d9488; background: rgba(13, 148, 136, 0.1); padding: 4px 10px; border-radius: 999px; width: fit-content; letter-spacing: 0.05em; margin-top: -4px; }
        .dark .about-version-badge { color: #2dd4bf; background: rgba(45, 212, 191, 0.15); }
        .about-desc { font-size: 14.5px; line-height: 1.6; color: var(--text-primary); margin: 0; text-align: justify; }
        .about-tech-container { margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px; }
        .about-tech-label { font-weight: 600; color: var(--text-heading); font-size: 14px; display: block; margin-bottom: 8px; }
        .about-tech-tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .about-tech-tag { font-size: 12px; font-weight: 600; color: var(--text-secondary); background: var(--bg-color); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 6px; }
        
        .calendar-card-panel { background: #f8fafc; border: 1px solid var(--border-color); padding: 24px; border-radius: 12px; }
        .dark .calendar-card-panel { background: rgba(255, 255, 255, 0.03); }
        .calendar-status-box { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-radius: 12px; background: #f8fafc; border: 1px solid var(--border-color); flex-wrap: wrap; gap: 16px; }
        .dark .calendar-status-box { background: rgba(255, 255, 255, 0.02); }
        .feature-panel { padding: 16px; border-radius: 8px; background: #f8fafc; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: flex-start; }
        .dark .feature-panel { background: rgba(255, 255, 255, 0.02); }

        /* Modern Calendar Visual Styles */
        .cal-cards-container {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .cal-panel-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px 28px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .dark .cal-panel-card {
          background: #0d1525;
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.5);
        }
        .cal-status-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #10b981;
          border-radius: 16px;
          padding: 22px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .dark .cal-status-card {
          background: #0d1525;
          border-color: rgba(255, 255, 255, 0.08);
          border-left: 4px solid #10b981;
          box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.5);
        }
        .cal-status-card.paused {
          border-left-color: #f59e0b;
        }
        .cal-status-icon-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .dark .cal-status-icon-circle {
          background: rgba(16, 185, 129, 0.18);
          color: #34d399;
        }
        .cal-status-pill {
          padding: 3px 9px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
        }
        .dark .cal-status-pill {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .cal-status-pill.paused {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
        }
        .cal-btn-pause {
          border: 1px solid rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.06);
          color: #ef4444;
          border-radius: 8px;
          padding: 9px 20px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        }
        .dark .cal-btn-pause {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.08);
          color: #f87171;
        }
        .cal-btn-pause:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.14);
          border-color: #ef4444;
        }
        .cal-btn-resume {
          border: 1px solid rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.06);
          color: #16a34a;
          border-radius: 8px;
          padding: 9px 20px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        }
        .dark .cal-btn-resume {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.08);
          color: #4ade80;
        }
        .cal-target-pill {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: #3b82f6;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dark .cal-target-pill {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.35);
          color: #60a5fa;
        }
        .cal-select-box {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          height: 48px;
          width: 100%;
          position: relative;
        }
        .dark .cal-select-box {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.12);
        }
        .cal-select-box select {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          width: 100%;
          height: 100%;
          outline: none;
          cursor: pointer;
          appearance: none;
          padding-right: 24px;
        }
        .cal-select-box select option {
          background: #ffffff;
          color: #0f172a;
        }
        .dark .cal-select-box select option {
          background: #0f172a;
          color: #f8fafc;
        }
        .cal-create-link {
          border: 1px dashed rgba(59, 130, 246, 0.35);
          border-radius: 10px;
          padding: 13px 18px;
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #3b82f6;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .dark .cal-create-link {
          border-color: rgba(59, 130, 246, 0.3);
          color: #60a5fa;
        }
        .cal-create-link:hover {
          background: rgba(59, 130, 246, 0.06);
          border-color: #3b82f6;
        }
        .cal-sync-pill {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #10b981;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dark .cal-sync-pill {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.35);
          color: #34d399;
        }
        .cal-resync-wide-btn {
          width: 100%;
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.06);
          color: #2563eb;
          border-radius: 10px;
          padding: 13px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.15s ease;
        }
        .dark .cal-resync-wide-btn {
          border-color: rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.06);
          color: #60a5fa;
        }
        .cal-resync-wide-btn:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.14);
          border-color: #3b82f6;
          color: #1d4ed8;
        }
        .dark .cal-resync-wide-btn:hover:not(:disabled) {
          color: #93c5fd;
        }
        
        .settings-container p { text-align: justify; }
        .legal-content { font-size: 14.5px; line-height: 1.75; color: var(--text-primary); text-align: justify; }
        .legal-content h2 { font-size: 17px; font-weight: 700; color: var(--text-heading); margin-top: 28px; margin-bottom: 10px; text-align: left; }
        .legal-content h2:first-of-type { margin-top: 8px; }
        .legal-content p { margin-bottom: 12px; text-align: justify; }
        .legal-content ul { margin: 8px 0 16px 20px; list-style-type: disc; text-align: justify; }
        .legal-content ul li { margin-bottom: 4px; }
        .legal-content strong { color: var(--text-heading); }
        .legal-last-updated { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; font-style: italic; text-align: left; }
        
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
        
        /* Pagination */
        .pagination-container { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 40px; margin-bottom: 24px; }
        .pagination-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e5e7eb; background: transparent; color: #4b5563; cursor: pointer; transition: all 180ms ease; }
        .pagination-btn:hover:not(:disabled) { background: rgba(71, 85, 105, 0.08); border-color: #cbd5e1; color: #1f2937; }
        .pagination-btn:disabled { opacity: 0.4; cursor: not-allowed; border-color: rgba(148, 163, 184, 0.18) !important; color: rgba(148, 163, 184, 0.45) !important; }
        .pagination-info { font-size: 14px; font-weight: 500; color: #4b5563; }
        
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
          box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04), 0 4px 6px -1px rgba(15, 23, 42, 0.02);
        }
        .app-card:hover {
          border-color: #94a3b8;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 2px 8px -1px rgba(15, 23, 42, 0.04);
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
        .status-new { background: #eff6ff; border-color: rgba(59, 130, 246, 0.25); color: #1d4ed8; }
        .status-unmarked { background: #fffbeb; border-color: rgba(245, 158, 11, 0.25); color: #b45309; }
        .status-applied { background: #f0fdfa; border-color: rgba(20, 184, 166, 0.25); color: #0f766e; }
        .status-no_response, .status-no-response { background: #fff7ed; border-color: rgba(249, 115, 22, 0.35); color: #ea580c; }
        .status-done { background: #f0fdf4; border-color: rgba(34, 197, 94, 0.25); color: #15803d; }
        .stage-oa { background: #f3e8ff; border-color: rgba(168, 85, 247, 0.3); color: #7e22ce; }
        .stage-interview { background: #fef3c7; border-color: rgba(245, 158, 11, 0.3); color: #b45309; }
        .stage-offered { background: #dcfce7; border-color: rgba(34, 197, 94, 0.3); color: #15803d; }
        .stage-rejected { background: #fee2e2; border-color: rgba(239, 68, 68, 0.3); color: #b91c1c; }
        .stage-rejected_after_oa { background: #fdf2f8; border-color: rgba(225, 29, 72, 0.35); color: #be123c; }
        .stage-rejected_after_interview { background: #fff1f2; border-color: rgba(225, 29, 72, 0.35); color: #9f1239; }
        .opp-hackathon { background: #ede9fe; border-color: rgba(139, 92, 246, 0.3); color: #6d28d9; }
        .opp-webinar { background: #e0f2fe; border-color: rgba(14, 165, 233, 0.3); color: #0369a1; }
        .opp-event { background: #f1f5f9; border-color: rgba(100, 116, 139, 0.3); color: #475569; }
        .app-card.is-urgent { border-color: #dc2626; box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.18); }

        .status-quick-container {
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .status-badge-interactive {
          cursor: pointer;
          user-select: none;
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .status-badge-interactive:hover {
          transform: translateY(-1px);
          filter: brightness(0.95);
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        .dark .status-badge-interactive:hover {
          filter: brightness(1.2);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .status-badge-chevron {
          font-size: 7.5px;
          opacity: 0.65;
          margin-left: 2px;
          transition: transform 0.15s ease;
        }
        .status-quick-container.open .status-badge-chevron {
          transform: rotate(180deg);
        }
        .status-quick-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          z-index: 50;
          min-width: 190px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
          padding: 6px;
          animation: scaleUp 0.15s ease-out;
        }
        .dark .status-quick-menu {
          background: #0f172a;
          border-color: #1e293b;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        }
        .status-quick-header {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #94a3b8;
          padding: 6px 8px 4px;
        }
        .status-quick-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 7px 8px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          background: transparent;
          border: none;
          text-align: left;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .dark .status-quick-item {
          color: #e2e8f0;
        }
        .status-quick-item:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .dark .status-quick-item:hover {
          background: #1e293b;
          color: #ffffff;
        }
        .status-quick-item.active {
          background: #eff6ff;
          color: #2563eb;
          font-weight: 600;
        }
        .dark .status-quick-item.active {
          background: rgba(37, 99, 235, 0.18);
          color: #60a5fa;
        }
        .status-quick-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }
        .status-quick-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 4px 0;
        }
        .dark .status-quick-divider {
          background: #1e293b;
        }
        
        .app-footer { border-top: 1px solid #eaefed; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #6d7a77; }
        .email-info { display: flex; align-items: center; gap: 6px; }
        
        /* Modal Styles */
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
        .form-input, .form-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: var(--radius-btn); font-family: inherit; font-size: 14px; color: var(--text-primary); outline: none; transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out; background: #f8fafc; }
        .form-input:focus, .form-select:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); background-color: #ffffff; }
        .form-error { color: #b91c1c; font-size: 13px; margin-bottom: 16px; background: #fef2f2; padding: 10px 12px; border-radius: 8px; border: 1px solid #fecaca; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
        .btn-cancel { padding: 9px 18px; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: var(--radius-btn); font-weight: 500; cursor: pointer; transition: background 0.2s; font-size: 13.5px; }
        .btn-cancel:hover { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
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
        
        .note-container { margin-top: 8px; flex-grow: 1; display: flex; flex-direction: column; gap: 8px; }
        .note-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; font-size: 13px; color: var(--text-primary); outline: none; transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out; background: #f8fafc; resize: none; min-height: 60px; flex-grow: 1; }
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
        .card-btn { flex: 1; padding: 7px 0; border-radius: 6px; border: 1px solid transparent; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 180ms ease; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; background: transparent; }
        .card-btn-edit { background: transparent; border-color: rgba(148, 163, 184, 0.3); color: #64748B; }
        .card-btn-edit:hover:not(:disabled) { background: rgba(148, 163, 184, 0.05); border-color: #64748B; color: #334155; }
        .card-btn-edit:active:not(:disabled) { background: rgba(148, 163, 184, 0.12); }
        .card-btn-apply { background: transparent; border-color: rgba(20, 184, 166, 0.45); color: #0D9488; }
        .card-btn-apply:hover:not(:disabled) { background: rgba(20, 184, 166, 0.05); border-color: #0D9488; color: #0F766E; }
        .card-btn-apply:active:not(:disabled) { background: rgba(20, 184, 166, 0.12); }
        .card-btn-done { background: transparent; border-color: rgba(34, 197, 94, 0.3); color: #16A34A; }
        .card-btn-done:hover:not(:disabled) { background: rgba(34, 197, 94, 0.05); border-color: #16A34A; color: #15803D; }
        .card-btn-done:active:not(:disabled) { background: rgba(34, 197, 94, 0.12); }
        .card-btn-done.active { background: transparent; border-color: rgba(245, 158, 11, 0.3); color: #D97706; }
        .card-btn-done.active:hover:not(:disabled) { background: rgba(245, 158, 11, 0.05); border-color: #D97706; color: #B45309; }
        .card-btn-done.active:active:not(:disabled) { background: rgba(245, 158, 11, 0.12); }
        .card-btn-remove { background: transparent; border-color: rgba(239, 68, 68, 0.3); color: #DC2626; }
        .card-btn-remove:hover:not(:disabled) { background: rgba(239, 68, 68, 0.05); border-color: #DC2626; color: #B91C1C; }
        .card-btn-remove:active:not(:disabled) { background: rgba(239, 68, 68, 0.12); }
        .card-btn:disabled { background: transparent !important; border-color: rgba(148, 163, 184, 0.18) !important; color: rgba(148, 163, 184, 0.45) !important; cursor: not-allowed !important; opacity: 0.7 !important; }
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

        /* Pin Button */
        .pin-btn {
          position: absolute;
          top: 0px;
          left: 50%;
          right: auto;
          transform: translateX(-50%) translateY(-6px) scale(0.95);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 180ms ease-out, transform 180ms ease-out, background 150ms ease, border-color 150ms ease;
          z-index: 10;
          padding: 0;
          outline: none;
        }
        .app-header { position: relative; }
        .app-card:hover .pin-btn { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        .app-card:not(:hover) .pin-btn { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.95); pointer-events: none; }
        .app-card .pin-btn.is-pinned { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); pointer-events: auto; }
        .pin-btn:hover { background: rgba(13, 148, 136, 0.2); border-color: rgba(20, 184, 166, 0.5); }
        .pin-btn:active { transform: translateX(-50%) scale(0.9); }
        .pin-btn svg { width: 14px; height: 14px; color: #94a3b8; transition: color 150ms ease, transform 200ms ease; }
        .pin-btn:hover svg { color: #14b8a6; }
        .pin-btn.is-pinned svg { color: #14b8a6; transform: rotate(45deg); }
        .pin-btn.is-pinned { background: rgba(13, 148, 136, 0.2); border-color: rgba(20, 184, 166, 0.45); }
        .app-card.is-done .pin-btn { display: none; }

        /* Pinned Section */
        .pinned-section {
          margin-bottom: 36px;
          padding-bottom: 28px;
          border-bottom: 2px solid rgba(20, 184, 166, 0.65);
        }
        .dark .pinned-section {
          border-bottom: 2px solid rgba(20, 184, 166, 0.6);
        }
        .pinned-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-color);
        }
        .pinned-section-icon { color: #14b8a6; display: flex; align-items: center; }
        .pinned-section-label {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #14b8a6;
        }
        .pinned-section-count {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
          background: rgba(20, 184, 166, 0.1);
          color: #14b8a6;
          border: 1px solid rgba(20, 184, 166, 0.2);
        }

        @keyframes pinSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pinned-section .app-card { animation: pinSlideIn 250ms ease-out; }
        
        /* Responsive Styles */
        .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; color: #0d9488; }
        .sidebar-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 45; backdrop-filter: blur(2px); }

        .filters::-webkit-scrollbar { display: none; }
        .filters {
          -ms-overflow-style: none;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        .modal-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .linked-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border-color);
          flex-wrap: wrap;
          gap: 10px;
        }
        .linked-card-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .linked-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .linked-action-btn {
          font-size: 12px;
          padding: 6px 14px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease-out;
        }
        .btn-danger-outline {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .calendar-manual-input-container {
          display: flex;
          gap: 10px;
          flex: 1;
          width: 100%;
        }
        .calendar-target-input {
          padding: 10px 14px;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-size: 14px;
          flex: 1;
          min-width: 0;
          outline: none;
        }
        .calendar-target-btn {
          padding: 10px 18px;
          border-radius: 8px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Touch Device Pin Button Support */
        @media (hover: none), (max-width: 768px) {
          .pin-btn {
            opacity: 0.8 !important;
            pointer-events: auto !important;
            transform: translateX(-50%) translateY(0) scale(1) !important;
            width: 32px !important;
            height: 32px !important;
            background: var(--surface-color) !important;
            border: 1px solid var(--border-color) !important;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12) !important;
          }
          .dark .pin-btn {
            background: #1e293b !important;
            border-color: #334155 !important;
          }
          .pin-btn.is-pinned {
            opacity: 1 !important;
            background: rgba(20, 184, 166, 0.18) !important;
            border-color: rgba(20, 184, 166, 0.45) !important;
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            width: 280px !important;
            padding: 24px 16px !important;
            align-items: stretch !important;
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .sidebar-overlay.show {
            display: block;
          }
          .sidebar-header {
            justify-content: flex-start !important;
            padding: 0 4px !important;
          }
          /* Fix Issue 3: Force full mobile drawer title/subtitle expansion */
          .sidebar.open .logo-text-wrapper,
          .layout:not(.sidebar-expanded) .sidebar.open .logo-text-wrapper {
            opacity: 1 !important;
            max-width: 220px !important;
            pointer-events: auto !important;
            display: flex !important;
          }
          .sidebar.open .logo-title-text,
          .layout:not(.sidebar-expanded) .sidebar.open .logo-title-text {
            transform: none !important;
            opacity: 1 !important;
            display: block !important;
          }
          .sidebar.open .logo-subtitle-text,
          .layout:not(.sidebar-expanded) .sidebar.open .logo-subtitle-text {
            transform: none !important;
            opacity: 1 !important;
            display: block !important;
          }
          .sidebar-divider {
            width: 100% !important;
          }
          .nav-item {
            width: 100% !important;
            height: 48px !important;
            padding: 4px 10px !important;
            justify-content: flex-start !important;
            margin-bottom: 8px !important;
          }
          .sidebar.open .nav-text,
          .layout:not(.sidebar-expanded) .sidebar.open .nav-text {
            opacity: 1 !important;
            max-width: 160px !important;
            transform: none !important;
            overflow: visible !important;
            display: block !important;
          }
          .sidebar-bottom {
            align-items: stretch !important;
          }
          .sync-btn {
            width: 100% !important;
            height: 42px !important;
            border-radius: var(--radius-btn) !important;
            padding: 0 12px !important;
            gap: 8px !important;
            margin: 0 !important;
          }
          .sync-btn-text {
            opacity: 1 !important;
            width: auto !important;
            pointer-events: auto !important;
          }
          .sync-time-text {
            font-size: 11px !important;
            margin-top: 0 !important;
          }
          .main-wrapper {
            margin-left: 0 !important;
          }
          .hamburger {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
            background: var(--surface-color);
            color: #0d9488;
            cursor: pointer;
            flex-shrink: 0;
            padding: 0;
          }
          .dark .hamburger {
            color: #2dd4bf;
            background: rgba(45, 212, 191, 0.08);
            border-color: rgba(45, 212, 191, 0.25);
          }
          .topbar {
            padding: 10px 16px !important;
            gap: 12px !important;
            align-items: center !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 40 !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
          }
          .topbar-search-wrapper {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            flex: 1 !important;
            min-width: 0 !important;
            margin-right: 0 !important;
          }
          .search-container {
            flex: 1 !important;
            min-width: 0 !important;
            max-width: none !important;
          }
          .search-container input {
            width: 100% !important;
            height: 38px !important;
            font-size: 13.5px !important;
            border-radius: 10px !important;
          }
          .topbar-actions {
            gap: 8px !important;
            flex-shrink: 0 !important;
          }
          .user-avatar-btn {
            width: 38px !important;
            height: 38px !important;
          }
          .content {
            padding: 16px 14px !important;
          }
          .stats-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
            gap: 12px !important;
          }
          .app-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
            gap: 14px !important;
          }
          .modal-grid-2col {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }

        @media (max-width: 640px) {
          /* Fix Issue 1: Applications Overview Top Header Center Alignment */
          .page-header {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 8px !important;
            margin-bottom: 20px !important;
            width: 100% !important;
          }
          .page-title {
            text-align: center !important;
            font-size: 24px !important;
            width: 100% !important;
          }
          .page-subtitle {
            text-align: center !important;
            font-size: 13.5px !important;
            width: 100% !important;
          }
          .page-header-date-badge {
            width: auto !important;
            max-width: 100% !important;
            margin: 4px auto 0 auto !important;
            display: inline-flex !important;
            justify-content: center !important;
            padding: 7px 16px !important;
            font-size: 12.5px !important;
            border-radius: 12px !important;
          }

          /* Fix Issue 2: Mobile Center-Aligned Dropdown Filter */
          .desktop-only-filters {
            display: none !important;
          }
          .mobile-filter-wrapper {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            margin: 18px 0 22px 0 !important;
          }
          .mobile-filter-container {
            width: 100% !important;
            max-width: 320px !important;
            display: flex !important;
            justify-content: center !important;
          }
          .mobile-filter-select-box {
            position: relative !important;
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            background: var(--surface-color) !important;
            border: 1.5px solid var(--border-color) !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
            transition: all 0.2s ease !important;
          }
          .dark .mobile-filter-select-box {
            background: #111827 !important;
            border-color: rgba(45, 212, 191, 0.3) !important;
            box-shadow: 0 0 15px rgba(45, 212, 191, 0.08) !important;
          }
          .mobile-filter-icon {
            position: absolute !important;
            left: 14px !important;
            color: #0d9488 !important;
            pointer-events: none !important;
          }
          .dark .mobile-filter-icon {
            color: #2dd4bf !important;
          }
          .mobile-filter-select {
            width: 100% !important;
            height: 44px !important;
            padding: 0 38px 0 38px !important;
            background: transparent !important;
            border: none !important;
            color: var(--text-heading, #0f172a) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            text-align: center !important;
            text-align-last: center !important;
            cursor: pointer !important;
            outline: none !important;
            appearance: none !important;
            -webkit-appearance: none !important;
          }
          .dark .mobile-filter-select {
            color: #f1f5f9 !important;
          }
          .dark .mobile-filter-select option {
            background: #111827 !important;
            color: #f1f5f9 !important;
          }
          .mobile-filter-chevron {
            position: absolute !important;
            right: 14px !important;
            color: var(--text-secondary) !important;
            pointer-events: none !important;
          }

          .stats-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .stat-card {
            padding: 14px 16px !important;
            border-radius: 14px !important;
          }
          .stat-icon {
            width: 42px !important;
            height: 42px !important;
            border-radius: 10px !important;
            font-size: 18px !important;
          }
          .stat-value {
            font-size: 24px !important;
          }
          .app-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .app-card {
            padding: 16px !important;
            border-radius: 14px !important;
          }
          .company-logo-container {
            width: 40px !important;
            height: 40px !important;
            border-radius: 9px !important;
          }
          .role-title {
            font-size: 14.5px !important;
          }
          .card-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            padding-top: 12px !important;
          }
          .card-btn {
            width: 100% !important;
            height: 38px !important;
            padding: 0 6px !important;
            font-size: 12.5px !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .floating-add-btn {
            bottom: max(20px, calc(env(safe-area-inset-bottom) + 12px)) !important;
            right: max(16px, calc(env(safe-area-inset-right) + 12px)) !important;
            width: 52px !important;
            height: 52px !important;
          }

          /* Settings & Linked Accounts on Mobile */
          .settings-header {
            text-align: center !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 8px !important;
          }
          .settings-main-title {
            text-align: center !important;
            font-size: 24px !important;
          }
          .settings-main-subtitle {
            text-align: center !important;
            font-size: 13.5px !important;
          }
          .settings-card {
            padding: 20px 16px !important;
          }
          .settings-grid-row {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }

          /* Fix Issue 4: Linked Accounts symmetrical action footer */
          .linked-card-footer {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .linked-card-status {
            justify-content: center !important;
            width: 100% !important;
          }
          .linked-card-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .linked-action-btn {
            width: 100% !important;
            height: 40px !important;
            font-size: 13px !important;
          }

          /* Fix Issue 5: Google Calendar page alignment and container overflow */
          .calendar-header-wrapper {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 12px !important;
          }
          .calendar-header-wrapper .btn-primary {
            width: 100% !important;
            max-width: 280px !important;
            margin: 0 auto !important;
          }
          .calendar-status-box {
            flex-direction: column !important;
            text-align: center !important;
            align-items: center !important;
            padding: 16px !important;
          }
          .calendar-status-box > div {
            min-width: 0 !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }
          .calendar-status-box button {
            width: 100% !important;
            margin-top: 12px !important;
          }
          .calendar-card-panel {
            padding: 16px !important;
          }
          .calendar-manual-input-container {
            flex-direction: column !important;
            gap: 10px !important;
            width: 100% !important;
          }
          .calendar-target-input,
          .calendar-target-btn {
            width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          /* Bottom Sheet Mobile Modals */
          .modal-overlay {
            align-items: flex-end !important;
            padding: 0 !important;
          }
          .modal-content {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 20px 20px 0 0 !important;
            max-height: 88vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 20px 18px calc(20px + env(safe-area-inset-bottom)) !important;
            margin: 0 !important;
            animation: modalSlideUpMobile 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .edit-modal-content,
          .info-modal-content {
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            max-height: 88vh !important;
            height: auto !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain !important;
          }
          .edit-modal-header,
          .info-modal-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 20 !important;
            background: var(--surface-color) !important;
            padding: 12px 16px 10px !important;
            flex-shrink: 0 !important;
            border-bottom: 1px solid var(--border-color) !important;
          }
          .dark .edit-modal-header,
          .dark .info-modal-header {
            background: #0f172a !important;
            border-color: #1e293b !important;
          }
          .edit-modal-body,
          .info-modal-body {
            flex: 1 0 auto !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            padding: 12px 14px !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
          }
          .info-modal-section {
            overflow: visible !important;
          }
          .edit-modal-footer,
          .info-modal-footer {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 20 !important;
            background: var(--surface-color) !important;
            padding: 10px 16px calc(10px + env(safe-area-inset-bottom)) !important;
            flex-shrink: 0 !important;
            border-top: 1px solid var(--border-color) !important;
          }
          .dark .edit-modal-footer,
          .dark .info-modal-footer {
            background: #0f172a !important;
            border-color: #1e293b !important;
          }
          .info-modal-footer button {
            width: 100% !important;
            height: 42px !important;
            font-size: 14px !important;
          }
          @keyframes modalSlideUpMobile {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          .modal-title {
            font-size: 20px !important;
          }
          .modal-actions {
            display: flex !important;
            gap: 10px !important;
            margin-top: 20px !important;
          }
          .modal-actions button, .modal-actions .btn-cancel, .modal-actions .btn-submit {
            flex: 1 !important;
            height: 42px !important;
            font-size: 13.5px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .user-dropdown-menu {
            right: 0 !important;
            width: calc(100vw - 32px) !important;
            max-width: 260px !important;
          }
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
        .dark .sidebar {
          background-color: rgba(17, 24, 39, 0.7);
          border-color: #1f2937;
        }
        .dark .logo-title-text {
          color: #2dd4bf;
        }
        .dark .logo-subtitle-text {
          color: #9ca3af;
        }
        .dark .nav-item {
          color: #9ca3af;
        }
        .dark .nav-item:hover {
          background: rgba(31, 41, 55, 0.4);
          color: #f9fafb;
        }
        .dark .nav-item.active {
          color: #2dd4bf;
        }
        .dark .nav-item.active .nav-icon-wrapper {
          background: rgba(45, 212, 191, 0.15);
          border: 1px solid rgba(45, 212, 191, 0.4);
          box-shadow: 0 0 12px rgba(45, 212, 191, 0.25);
          color: #2dd4bf;
        }
        .dark .sidebar-divider {
          background: #374151;
        }
        
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
        .dark .status-new { background: rgba(37, 99, 235, 0.08); color: #3b82f6; border-color: #1d4ed8; }
        .dark .status-unmarked { background: rgba(245, 158, 11, 0.08); color: #f59e0b; border-color: #d97706; }
        .dark .status-applied { background: rgba(20, 184, 166, 0.08); color: #14b8a6; border-color: #0d9488; }
        .dark .status-no_response, .dark .status-no-response { background: rgba(249, 115, 22, 0.12); color: #f97316; border-color: #ea580c; }
        .dark .status-done { background: rgba(34, 197, 94, 0.08); color: #22c55e; border-color: #16a34a; }
        .dark .stage-oa { background: rgba(168, 85, 247, 0.15); border-color: #a855f7; color: #d8b4fe; }
        .dark .stage-interview { background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #fcd34d; }
        .dark .stage-offered { background: rgba(34, 197, 94, 0.15); border-color: #22c55e; color: #86efac; }
        .dark .stage-rejected { background: rgba(239, 68, 68, 0.15); border-color: #ef4444; color: #fca5a5; }
        .dark .stage-rejected_after_oa { background: rgba(225, 29, 72, 0.15); border-color: #e11d48; color: #fda4af; }
        .dark .stage-rejected_after_interview { background: rgba(225, 29, 72, 0.15); border-color: #e11d48; color: #fda4af; }
        .dark .opp-hackathon { background: rgba(139, 92, 246, 0.15); border-color: #8b5cf6; color: #c4b5fd; }
        .dark .opp-webinar { background: rgba(14, 165, 233, 0.15); border-color: #0ea5e9; color: #7dd3fc; }
        .dark .opp-event { background: rgba(100, 116, 139, 0.15); border-color: #64748b; color: #cbd5e1; }
        .dark .app-footer { border-color: #334155; color: #94a3b8; }
        
        .dark .modal-content { background: var(--surface-color); color: var(--text-primary); border: 1px solid var(--border-color); }
        .dark .modal-title { color: var(--text-primary); }
        .dark .form-label { color: var(--text-secondary); }
        .dark .form-input, .dark .form-select { background: var(--bg-color); border-color: var(--border-color); color: var(--text-primary); }
        .dark .form-input:focus, .dark .form-select:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dark .btn-cancel { background: transparent; border-color: var(--border-color); color: var(--text-primary); }
        .dark .btn-cancel:hover { background: #27272a; border-color: #3f3f46; color: #fff; }
        .dark .btn-danger { background: transparent; border-color: #ef4444; color: #fca5a5; }
        .dark .btn-danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; }
        .dark .note-input { background: #0d1321; border-color: #1f2937; color: var(--text-primary); }
        .dark .note-input:focus { background: #0d1321; border-color: var(--brand-primary); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        
        .dark .card-actions { border-color: #1f2937; }
        .dark .card-btn-edit { background: transparent; border-color: rgba(148, 163, 184, 0.15); color: #475569; }
        .dark .card-btn-edit:hover:not(:disabled) { background: rgba(148, 163, 184, 0.05); border-color: #475569; color: #94A3B8; }
        .dark .card-btn-edit:active:not(:disabled) { background: rgba(148, 163, 184, 0.12); }
        .dark .card-btn-apply { background: transparent; border-color: rgba(20, 184, 166, 0.25); color: #0D9488; }
        .dark .card-btn-apply:hover:not(:disabled) { background: rgba(20, 184, 166, 0.05); border-color: #0D9488; color: #14B8A6; }
        .dark .card-btn-apply:active:not(:disabled) { background: rgba(20, 184, 166, 0.12); }
        .dark .card-btn-done { background: transparent; border-color: rgba(34, 197, 94, 0.15); color: #15803D; }
        .dark .card-btn-done:hover:not(:disabled) { background: rgba(34, 197, 94, 0.05); border-color: #16A34A; color: #22C55E; }
        .dark .card-btn-done:active:not(:disabled) { background: rgba(34, 197, 94, 0.12); }
        .dark .card-btn-done.active { background: transparent; border-color: rgba(245, 158, 11, 0.15); color: #B45309; }
        .dark .card-btn-done.active:hover:not(:disabled) { background: rgba(245, 158, 11, 0.05); border-color: #D97706; color: #F59E0B; }
        .dark .card-btn-done.active:active:not(:disabled) { background: rgba(245, 158, 11, 0.12); }
        .dark .card-btn-remove { background: transparent; border-color: rgba(239, 68, 68, 0.15); color: #B91C1C; }
        .dark .card-btn-remove:hover:not(:disabled) { background: rgba(239, 68, 68, 0.05); border-color: #DC2626; color: #EF4444; }
        .dark .card-btn-remove:active:not(:disabled) { background: rgba(239, 68, 68, 0.12); }
        .dark .app-card.is-done .role-title { color: #94a3b8; }
        .dark .app-card.is-done { opacity: 0.35; filter: blur(1.5px) grayscale(0.4); }
        .dark .app-card.is-done:hover { opacity: 0.6; filter: blur(0.5px); }
        .dark .pagination-btn { border-color: #334155; color: #94a3b8; }
        .dark .pagination-btn:hover:not(:disabled) { background: rgba(148, 163, 184, 0.08); border-color: #475569; color: #cbd5e1; }
        .dark .pagination-btn:disabled { border-color: rgba(148, 163, 184, 0.18) !important; color: rgba(148, 163, 184, 0.45) !important; }
        .dark .pagination-info { color: #94a3b8; }
        
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
          gap: 12px;
        }
        .program-detail-label {
          font-weight: 600;
          color: #64748b;
          width: 95px;
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

        .card-attachment-indicator {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          margin-top: 10px;
          margin-bottom: 2px;
          background: rgba(241, 245, 249, 0.6);
          border: 1px solid rgba(203, 213, 225, 0.8);
          border-radius: 8px;
          transition: all 0.15s ease;
          user-select: none;
          cursor: pointer;
        }
        .card-attachment-indicator:hover {
          background: rgba(226, 232, 240, 0.8);
          border-color: rgba(148, 163, 184, 0.8);
        }
        .card-attachment-left {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }
        .card-attachment-icon {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          display: block;
          color: var(--text-secondary, #64748b);
        }
        .card-attachment-label {
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .card-attachment-right {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
        }
        .card-attachment-shortlist-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2.5px 9px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.35);
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: #059669;
          letter-spacing: 0.01em;
          line-height: 1.3;
        }
        .card-attachment-chevron {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
          display: block;
          color: var(--text-secondary, #64748b);
          opacity: 0.7;
        }
        .dark .card-attachment-indicator {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .dark .card-attachment-indicator:hover {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .dark .card-attachment-icon {
          color: #94a3b8;
        }
        .dark .card-attachment-label {
          color: #94a3b8;
        }
        .dark .card-attachment-shortlist-pill {
          background: rgba(6, 78, 59, 0.3);
          border-color: rgba(16, 185, 129, 0.4);
          color: #2dd4bf;
        }
        .dark .card-attachment-chevron {
          color: #94a3b8;
        }

        .edit-modal-content,
        .info-modal-content {
          max-width: 620px;
          width: 100%;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          overflow: hidden;
          border-radius: 16px;
        }
        .edit-modal-header,
        .info-modal-header {
          padding: 16px 20px 10px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          flex-shrink: 0;
        }
        .info-modal-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .info-modal-company-row { display: flex; align-items: center; gap: 12px; }
        .info-modal-logo { width: 40px; height: 40px; border-radius: 8px; object-fit: contain; background: #f1f5f9; padding: 3px; }
        .info-modal-company-name { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; color: var(--text-heading, #0f172a); margin: 0; }
        .info-modal-subtitle { font-size: 12.5px; color: #64748b; margin: 2px 0 0; }
        .info-modal-meta-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .meta-chip { font-size: 11.5px; font-weight: 500; padding: 3px 8px; border-radius: 16px; border: 1px solid var(--border-color, #e2e8f0); color: var(--text-secondary, #64748b); background: var(--bg-color, #f8fafc); }
        .meta-chip.urgent { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
        .meta-chip.status-new { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
        .meta-chip.status-applied { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .meta-chip.status-no_response, .meta-chip.status-no-response { background: #fff7ed; border-color: #ffedd5; color: #ea580c; }
        .meta-chip.status-interview { background: #fefce8; border-color: #fde68a; color: #92400e; }
        .meta-chip.status-offer { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .meta-chip.status-rejected { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
        .meta-chip.status-done { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }

        .edit-modal-body,
        .info-modal-body {
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          flex: 1 1 auto;
          min-height: 0;
          max-height: none;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overscroll-behavior: contain;
        }
        .edit-modal-body::-webkit-scrollbar,
        .info-modal-body::-webkit-scrollbar { width: 6px; }
        .edit-modal-body::-webkit-scrollbar-track,
        .info-modal-body::-webkit-scrollbar-track { background: transparent; }
        .edit-modal-body::-webkit-scrollbar-thumb,
        .info-modal-body::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 6px; }
        .edit-modal-body::-webkit-scrollbar-thumb:hover,
        .info-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.7); }
        .edit-modal-footer {
          padding: 12px 20px;
          border-top: 1px solid var(--border-color, #e2e8f0);
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: var(--surface-color, #ffffff);
        }
        .dark .edit-modal-footer {
          background: var(--surface-color, #1e293b);
          border-color: var(--border-color, #334155);
        }
        .info-modal-section { background: var(--surface-color, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; overflow: visible; }
        .info-modal-section-header { padding: 10px 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary, #64748b); border-bottom: 1px solid var(--border-color, #e2e8f0); background: var(--bg-color, #f8fafc); border-top-left-radius: 9px; border-top-right-radius: 9px; }
        .info-modal-section-body { padding: 10px 14px; }

        .info-detail-row { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-color, #f1f5f9); }
        .info-detail-row:last-child { border-bottom: none; padding-bottom: 0; }
        .info-detail-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary, #64748b); min-width: 85px; flex-shrink: 0; }
        .info-detail-value { font-size: 13px; color: var(--text-primary, #1e293b); line-height: 1.45; }

        .company-description { font-size: 13px; color: var(--text-primary, #1e293b); line-height: 1.55; margin: 0 0 8px; text-align: justify; }
        .known-for-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
        .known-for-list li { font-size: 12.5px; color: var(--text-secondary, #64748b); display: flex; align-items: flex-start; gap: 6px; }
        .known-for-list li::before { content: "•"; color: #3b82f6; font-weight: 700; flex-shrink: 0; }

        .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .skill-chip { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; display: flex; align-items: center; gap: 5px; }
        .skill-chip::before { content: "✓"; font-weight: 700; }

        .company-skeleton { display: flex; flex-direction: column; gap: 8px; }
        .skeleton-line { height: 12px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .info-modal-footer { padding: 12px 20px; border-top: 1px solid var(--border-color, #e2e8f0); display: flex; justify-content: flex-end; flex-shrink: 0; background: var(--surface-color, #fff); }

        .dark .info-modal-section { background: var(--surface-color); border-color: var(--border-color); }
        .dark .info-modal-section-header { background: rgba(255,255,255,0.04); }
        .dark .info-modal-section-body { background: var(--surface-color); }
        .dark .info-detail-row { border-color: var(--border-color); }
        .dark .meta-chip { background: rgba(255,255,255,0.06); border-color: var(--border-color); }
        .dark .skill-chip { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); }
        .dark .skeleton-line { background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%); background-size: 200% 100%; }

        /* ── Attachment Row Styles ── */
        .attachment-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border-color, #f1f5f9);
        }
        .attachment-row:last-child { border-bottom: none; padding-bottom: 0; }
        .attachment-row:first-child { padding-top: 0; }
        .attachment-icon {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #f1f5f9;
          border: 1px solid var(--border-color, #e2e8f0);
          color: #64748b;
          transition: transform 0.15s ease;
        }
        .attachment-icon svg {
          width: 18px;
          height: 18px;
          display: block;
        }
        .attachment-icon.pdf { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
        .attachment-icon.spreadsheet { background: #f0fdf4; border-color: #bbf7d0; color: #10b981; }
        .attachment-icon.document { background: #eff6ff; border-color: #bfdbfe; color: #3b82f6; }
        .attachment-icon.presentation { background: #fefce8; border-color: #fde68a; color: #d97706; }
        .attachment-icon.image { background: #faf5ff; border-color: #e9d5ff; color: #9333ea; }
        .attachment-icon.other { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
        .attachment-info {
          flex: 1;
          min-width: 0;
        }
        .attachment-filename {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .attachment-meta {
          font-size: 11.5px;
          color: var(--text-secondary, #64748b);
          margin-top: 1px;
          font-weight: 500;
        }
        .attachment-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .attachment-btn {
          font-size: 11.5px;
          font-weight: 600;
          padding: 5px 11px;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          line-height: 1.2;
          user-select: none;
        }
        .attachment-btn svg {
          width: 12px;
          height: 12px;
          flex-shrink: 0;
          display: block;
        }
        .attachment-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .attachment-btn-view {
          border: 1px solid var(--border-color, #cbd5e1);
          background: rgba(148, 163, 184, 0.08);
          color: var(--text-primary, #334155);
        }
        .attachment-btn-view:hover:not(:disabled) {
          background: rgba(148, 163, 184, 0.18);
          border-color: #94a3b8;
          color: #0f172a;
        }
        .attachment-btn-download {
          border: 1.5px solid rgba(37, 99, 235, 0.35);
          background: rgba(37, 99, 235, 0.06);
          color: #2563eb;
        }
        .attachment-btn-download:hover:not(:disabled) {
          background: rgba(37, 99, 235, 0.14);
          border-color: rgba(37, 99, 235, 0.55);
        }
        .attachment-source-label {
          font-size: 10.5px;
          font-weight: 600;
          color: var(--text-secondary, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-top: 12px;
          margin-bottom: 4px;
        }
        .attachment-source-label:first-child { margin-top: 0; }
        .attachment-error {
          font-size: 12px;
          color: #ef4444;
          padding: 7px 11px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 7px;
          margin-bottom: 8px;
        }
        .attachment-toast {
          font-size: 12px;
          color: #0284c7;
          padding: 7px 11px;
          background: rgba(2, 132, 199, 0.08);
          border: 1px solid rgba(2, 132, 199, 0.2);
          border-radius: 7px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        /* ── Phase 2: Shortlist Detection Badges & Styling ── */
        .card-shortlist-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: #059669;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 3px 9px;
          border-radius: 6px;
          width: fit-content;
          margin-top: 4px;
          margin-bottom: 6px;
          letter-spacing: 0.01em;
        }
        .card-shortlist-dot {
          width: 6.5px;
          height: 6.5px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          flex-shrink: 0;
        }
        .dark .card-shortlist-badge {
          color: #34d399;
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .modal-shortlist-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(16, 185, 129, 0.05);
          border: 1px solid rgba(16, 185, 129, 0.28);
          border-left: 4px solid #10b981;
          padding: 14px 18px;
          border-radius: 12px;
          margin-bottom: 18px;
        }
        .modal-shortlist-banner-icon-badge {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .modal-shortlist-banner-content {
          flex: 1;
          min-width: 0;
        }
        .modal-shortlist-banner-title {
          font-size: 15px;
          font-weight: 700;
          color: #047857;
          line-height: 1.25;
          letter-spacing: -0.01em;
        }
        .modal-shortlist-banner-sub {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary, #475569);
          margin-top: 4px;
        }
        .modal-shortlist-banner-sub strong {
          color: var(--text-primary, #0f172a);
          font-weight: 600;
        }
        .dark .modal-shortlist-banner {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.28);
          border-left-color: #10b981;
        }
        .dark .modal-shortlist-banner-icon-badge {
          background: rgba(16, 185, 129, 0.2);
        }
        .dark .modal-shortlist-banner-title {
          color: #34d399;
        }
        .dark .modal-shortlist-banner-sub {
          color: #94a3b8;
        }
        .dark .modal-shortlist-banner-sub strong {
          color: #f1f5f9;
        }

        .attachment-shortlist-tag {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 4px;
          margin-left: 6px;
          vertical-align: middle;
        }
        .attachment-shortlist-tag.matched {
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .dark .attachment-shortlist-tag.matched {
          background: rgba(16, 185, 129, 0.18);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.35);
        }
        .attachment-shortlist-tag.no-match {
          background: rgba(148, 163, 184, 0.1);
          color: var(--text-secondary, #94a3b8);
        }
        /* Dark mode attachment overrides */
        .dark .attachment-row { border-color: var(--border-color); }
        .dark .attachment-icon { background: rgba(255,255,255,0.06); border-color: var(--border-color); color: #94a3b8; }
        .dark .attachment-icon.pdf { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.25); color: #f87171; }
        .dark .attachment-icon.spreadsheet { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.25); color: #4ade80; }
        .dark .attachment-icon.document { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.25); color: #60a5fa; }
        .dark .attachment-icon.presentation { background: rgba(234,179,8,0.12); border-color: rgba(234,179,8,0.25); color: #facc15; }
        .dark .attachment-icon.image { background: rgba(168,85,247,0.12); border-color: rgba(168,85,247,0.25); color: #c084fc; }
        .dark .attachment-icon.other { background: rgba(255,255,255,0.06); border-color: var(--border-color); color: #94a3b8; }
        .dark .attachment-btn-view { background: rgba(255, 255, 255, 0.06); border-color: var(--border-color); color: #cbd5e1; }
        .dark .attachment-btn-view:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.25); color: #f8fafc; }
        .dark .attachment-btn-download { background: rgba(96,165,250,0.1); border-color: rgba(96,165,250,0.3); color: #60a5fa; }
        .dark .attachment-btn-download:hover:not(:disabled) { background: rgba(96,165,250,0.18); border-color: rgba(96,165,250,0.45); }
        .dark .attachment-error { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.25); }
        .dark .attachment-toast { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.25); color: #38bdf8; }
        @media (max-width: 480px) {
          .attachment-row { gap: 8px; flex-wrap: wrap; }
          .attachment-icon { width: 32px; height: 32px; }
          .attachment-icon svg { width: 16px; height: 16px; }
          .attachment-filename { font-size: 12.5px; }
          .attachment-actions { width: 100%; justify-content: flex-end; margin-top: 4px; }
          .attachment-btn { padding: 4px 9px; font-size: 11px; }
        }

        
        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
          animation: slideDownFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
      {isOffline ? (
        <OfflinePage
          lastSyncTime={lastSyncTime}
          onRetry={async () => {
            if (typeof window !== "undefined" && navigator.onLine) {
              setIsOffline(false);
              if (userEmail) {
                await fetchApplications();
                await fetchSyncStatus();
              }
            }
          }}
        />
      ) : (
      <div className={`layout ${isDarkMode ? 'dark' : ''} ${!isSidebarCollapsed ? 'sidebar-expanded' : ''}`}>
        <div className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

        <aside
          className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          onClick={handleSidebarClick}
        >
          <div className="sidebar-header">
            <div className="sidebar-logo-box">
              <img src={isDarkMode ? "/logo.png" : "/logo-light.png"} alt="Email Tracker Logo" className="logo-img" />
            </div>
            <div className="logo-text-wrapper">
              <div className="logo-title-text">Email Tracker</div>
              <div className="logo-subtitle-text">Placement Department Mails</div>
            </div>
          </div>

          <div className="sidebar-divider" />

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              className={`nav-item ${activeFilter !== 'calendar' && activeFilter !== 'settings' && activeFilter !== 'analytics' ? 'active' : ''}`}
              onClick={() => { setActiveFilter('all'); setIsSidebarOpen(false); }}
            >
              <div className="nav-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              </div>
              <span className="nav-text">Dashboard</span>
            </div>

            <div
              className={`nav-item ${activeFilter === 'analytics' ? 'active' : ''}`}
              onClick={() => { setActiveFilter('analytics'); setIsSidebarOpen(false); }}
            >
              <div className="nav-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              </div>
              <span className="nav-text">Analytics</span>
            </div>

            <div
              className={`nav-item ${activeFilter === 'calendar' ? 'active' : ''}`}
              onClick={() => { setActiveFilter('calendar'); setIsSidebarOpen(false); }}
            >
              <div className="nav-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </div>
              <span className="nav-text">Calendar</span>
            </div>

            <div
              className={`nav-item ${activeFilter === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveFilter('settings'); setSettingsSubView('main'); setIsSidebarOpen(false); }}
            >
              <div className="nav-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </div>
              <span className="nav-text">Settings</span>
            </div>
          </nav>

          <div className="sidebar-divider" />

          <div className="sidebar-bottom">
            <button className="sync-btn" onClick={handleSync} disabled={syncing || syncStatus === "pending"}>
              <span className="sync-btn-icon-wrapper">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={syncing || syncStatus === "pending" ? "spin" : ""}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              </span>
              <span className="sync-btn-text">
                {(syncing || syncStatus === "pending") ? "Syncing" : "Sync Emails"}
              </span>
            </button>
            {lastSyncTime && (
              <div className="sync-time-text">
                {isSidebarCollapsed ? getCompactRelativeTime(lastSyncTime) : formatRelativeTime(lastSyncTime)}
              </div>
            )}
          </div>
        </aside>

        <div className="main-wrapper">
          <header className="topbar">
            <div className="topbar-search-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
              <button className="hamburger" onClick={() => setIsSidebarOpen(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingRight: searchQuery ? '36px' : '16px' }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            <div className="topbar-actions">
              <div className="user-dropdown-container" ref={userDropdownRef}>
                <button
                  className="user-avatar-btn"
                  style={{ position: 'relative' }}
                  onClick={() => { setShowUserDropdown(!showUserDropdown); setShowThemeSubmenu(false); }}
                >
                  U
                  {linkedAccounts.some(a => a.syncStatus === "failed") && (
                    <span style={{ position: 'absolute', top: '-1px', right: '-1px', width: '9px', height: '9px', borderRadius: '50%', background: '#ef4444', border: '1.5px solid var(--bg-primary)' }} title="Linked account sync issue" />
                  )}
                </button>
                {showUserDropdown && (
                  <div className="user-dropdown-menu">
                    <div className="user-dropdown-header">
                      <span className="user-dropdown-email">{userEmail}</span>
                    </div>

                    {!showThemeSubmenu ? (
                      <>
                        <button className="user-dropdown-item" onClick={() => { setActiveFilter('settings'); setSettingsSubView('linked-accounts'); setShowUserDropdown(false); fetchLinkedAccounts(); }}>
                          Linked Gmail Accounts {linkedAccounts.some(a => a.syncStatus === "failed") ? "⚠️" : ""} ❯
                        </button>
                        <button className="user-dropdown-item" onClick={() => { setActiveFilter('settings'); setSettingsSubView('student-profile'); setShowUserDropdown(false); fetchStudentProfile(); }}>
                          Student Details ❯
                        </button>
                        <button className="user-dropdown-item" onClick={(e) => { e.stopPropagation(); setShowThemeSubmenu(true); }}>
                          Theme
                        </button>
                        <button className="user-dropdown-item" onClick={() => { setActiveFilter('settings'); setSettingsSubView('main'); setShowUserDropdown(false); }}>
                          Settings
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
            {linkedToast && (
              <div style={{
                margin: '0 0 16px 0',
                padding: '12px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: linkedToast.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${linkedToast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: linkedToast.type === 'success' ? '#22c55e' : '#ef4444'
              }}>
                <span>{linkedToast.type === 'success' ? '✅' : '⚠️'} {linkedToast.message}</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}
                  onClick={() => setLinkedToast(null)}
                >
                  &times;
                </button>
              </div>
            )}

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

            {showPushBanner && (
              <div className="sync-warning-banner" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#3b82f6', marginBottom: '16px' }}>
                <div className="sync-warning-content" style={{ color: 'var(--text-primary)' }}>
                  <span className="sync-warning-icon" style={{ fontSize: '18px' }}>🔔</span>
                  <span>
                    Get instant push notifications when new placement opportunities, OAs, or deadlines arrive.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={handleRequestPushPermission}
                    className="btn-primary"
                    style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}
                  >
                    Enable
                  </button>
                  <button
                    onClick={handleDismissPushBanner}
                    className="btn-outline"
                    style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            )}

            {activeFilter === "calendar" ? (
              <CalendarView
                userEmail={userEmail}
                BASE_URL={BASE_URL}
                calendarSuccessMsg={calendarSuccessMsg}
                calendarErrorMsg={calendarErrorMsg}
                loadingCalendarStatus={loadingCalendarStatus}
                hasCalendarScope={hasCalendarScope}
                calendarSyncEnabled={calendarSyncEnabled}
                availableCalendars={availableCalendars}
                calendarTargetId={calendarTargetId}
                setCalendarTargetId={setCalendarTargetId}
                handleToggleCalendarSync={handleToggleCalendarSync}
                handleSaveCalendarTarget={handleSaveCalendarTarget}
                handleManualCalendarSync={handleManualCalendarSync}
                syncingCalendar={syncingCalendar}
                savingTargetCalendar={savingTargetCalendar}
              />
            ) : activeFilter === "settings" ? (
              <SettingsView
                settingsSubView={settingsSubView}
                setSettingsSubView={setSettingsSubView}
                setActiveFilter={setActiveFilter}
                pushSupported={pushSupported}
                pushPermission={pushPermission}
                isSubscribed={isSubscribed}
                pushSubscriptionsCount={pushSubscriptionsCount}
                handleDisablePushNotifications={handleDisablePushNotifications}
                handleRequestPushPermission={handleRequestPushPermission}
                handleEnablePushSubscription={handleEnablePushSubscription}
                userEmail={userEmail}
                studentProfile={studentProfile}
                setStudentProfile={setStudentProfile}
                studentProfileSaving={studentProfileSaving}
                studentProfileToast={studentProfileToast}
                setStudentProfileToast={setStudentProfileToast}
                handleSaveStudentProfile={handleSaveStudentProfile}
                linkedAccounts={linkedAccounts}
                linkedAccountsLoading={linkedAccountsLoading}
                manualSyncingId={manualSyncingId}
                disconnectingId={disconnectingId}
                fetchLinkedAccounts={fetchLinkedAccounts}
                handleSyncLinkedAccount={handleSyncLinkedAccount}
                handleDisconnectLinkedAccount={handleDisconnectLinkedAccount}
                setShowLinkConfirmModal={setShowLinkConfirmModal}
                setShowClearModal={setShowClearModal}
                setClearConfirmText={setClearConfirmText}
                setClearError={setClearError}
                setShowDeleteModal={setShowDeleteModal}
                setDeleteConfirmText={setDeleteConfirmText}
                setDeleteError={setDeleteError}
                getCompactRelativeTime={getCompactRelativeTime}
              />
            ) : activeFilter === "analytics" ? (
              <AnalyticsView applications={applications} />
            ) : (
              <>
                <div className="page-header">
                  <div>
                    <h2 className="page-title">Applications Overview</h2>
                    <p className="page-subtitle">Track and manage emails from placement@msrit.edu</p>
                  </div>
                  <div className="page-header-date-badge">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="date-badge-icon">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>{getFormattedISTDate()}</span>
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stat-card total">
                    <div className="stat-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                      </svg>
                    </div>
                    <div className="stat-content">
                      <span className="stat-label">Total Applications</span>
                      <div className="stat-main">
                        <span className="stat-value">{total}</span>
                        {newThisWeek > 0 && <span className="stat-trend">+{newThisWeek} this week</span>}
                      </div>
                    </div>
                  </div>

                  <div className="stat-card urgent">
                    <div className="stat-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                      </svg>
                    </div>
                    <div className="stat-content">
                      <span className="stat-label">Deadlines Today</span>
                      <div className="stat-main">
                        <span className="stat-value">{urgentDeadlines}</span>
                        <span className="stat-subtext">{urgentDeadlines === 0 ? "No immediate action" : "Requires attention"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="stat-card unmarked">
                    <div className="stat-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                      </svg>
                    </div>
                    <div className="stat-content">
                      <span className="stat-label">Unmarked</span>
                      <div className="stat-main">
                        <span className="stat-value">{unmarkedCount}</span>
                        <span className="stat-subtext">Needs review</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Filter Tabs */}
                <div className="dashboard-filters-row desktop-only-filters">
                  {[
                    { label: "New Emails", value: "new" },
                    { label: "Deadline today", value: "deadlines" },
                    { label: "Applied", value: "applied" },
                    { label: "Marked Done", value: "done" },
                    { label: "Unmarked", value: "unmarked" }
                  ].map(({ label, value }) => {
                    const isActive = activeFilter === value;
                    return (
                      <button
                        key={value}
                        className={`filter-tab ${isActive ? "active" : ""}`}
                        onClick={() => {
                          if (isActive) {
                            setActiveFilter("all");
                          } else {
                            setActiveFilter(value);
                          }
                        }}
                      >
                        <span className="filter-tab-text">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile Center-Aligned Dropdown Filter */}
                <div className="mobile-filter-wrapper">
                  <div className="mobile-filter-container">
                    <div className="mobile-filter-select-box">
                      <svg className="mobile-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                      </svg>
                      <select
                        className="mobile-filter-select"
                        value={activeFilter}
                        onChange={(e) => setActiveFilter(e.target.value)}
                      >
                        <option value="all">All Applications ({applications.length})</option>
                        <option value="new">New Emails</option>
                        <option value="deadlines">Deadline Today</option>
                        <option value="applied">Applied</option>
                        <option value="done">Marked Done</option>
                        <option value="unmarked">Unmarked</option>
                      </select>
                      <svg className="mobile-filter-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>
                </div>



                {loading && applications.length === 0 ? (
                  <p style={{ color: '#6d7a77', marginTop: 24 }}>Loading applications...</p>
                ) : (() => {
                  const getLatestReceivedTime = (app) => {
                    let maxTime = app.latestEmailDate ? new Date(app.latestEmailDate).getTime() : 0;
                    if (!maxTime && app.date) {
                      maxTime = new Date(app.date).getTime();
                    }
                    if (Array.isArray(app.events) && app.events.length > 0) {
                      for (const ev of app.events) {
                        if (ev.date) {
                          const evTime = new Date(ev.date).getTime();
                          if (evTime > maxTime) maxTime = evTime;
                        }
                      }
                    }
                    if (!maxTime && app.createdAt) {
                      maxTime = new Date(app.createdAt).getTime();
                    }
                    return maxTime;
                  };

                  const filteredApps = applications
                    .map(app => {
                      const latestEmailTime = getLatestReceivedTime(app);
                      let derivedStatus = (app.status || "new").toLowerCase();
                      if (derivedStatus === "new") {
                        const ageInMs = Date.now() - latestEmailTime;
                        if (ageInMs > 24 * 60 * 60 * 1000) {
                          derivedStatus = "unmarked";
                        }
                      } else if (derivedStatus === "applied") {
                        const ageInMs = Date.now() - latestEmailTime;
                        if (ageInMs >= 20 * 24 * 60 * 60 * 1000) {
                          derivedStatus = "no_response";
                        }
                      }
                      return { ...app, derivedStatus, latestEmailTime };
                    })
                    .filter((app) => {
                      const query = searchQuery.toLowerCase();
                      const matchesSearch =
                        (app.company || "").toLowerCase().includes(query) ||
                        (app.role || "").toLowerCase().includes(query) ||
                        (app.displayFields || []).some(f =>
                          (f.value || "").toLowerCase().includes(query)
                        );

                      const isDeadlineToday = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString();
                      const matchesFilter =
                        activeFilter === "all" ||
                        (activeFilter === "deadlines" && isDeadlineToday) ||
                        activeFilter === app.derivedStatus ||
                        (activeFilter === "applied" && (app.derivedStatus === "applied" || app.derivedStatus === "no_response"));

                      return matchesSearch && matchesFilter;
                    })
                    .sort((a, b) => b.latestEmailTime - a.latestEmailTime);

                  // Split into pinned (sorted by pinnedAt) and unpinned
                  const pinnedApps = filteredApps
                    .filter(a => a.isPinned && a.derivedStatus !== "done")
                    .sort((a, b) => new Date(a.pinnedAt || 0) - new Date(b.pinnedAt || 0));
                  const unpinnedApps = filteredApps.filter(a => !a.isPinned || a.derivedStatus === "done");

                  const totalPages = Math.max(1, Math.ceil(unpinnedApps.length / 15));
                  const activePage = Math.min(currentPage, totalPages);
                  const paginatedApps = unpinnedApps.slice((activePage - 1) * 15, activePage * 15);

                  const renderCard = (app) => (
                    <ApplicationCard
                      key={app._id}
                      app={app}
                      activeStatusMenuId={activeStatusMenuId}
                      setActiveStatusMenuId={setActiveStatusMenuId}
                      handleQuickUpdate={handleQuickUpdate}
                      handleTogglePin={handleTogglePin}
                      handleUpdateNote={handleUpdateNote}
                      handleSaveNote={handleSaveNote}
                      handleApply={handleApply}
                      handleMarkDone={handleMarkDone}
                      handleUnmarkDone={handleUnmarkDone}
                      handleDeleteOne={handleDeleteOne}
                      setSelectedApp={setSelectedApp}
                      setShowInfoModal={setShowInfoModal}
                      setCompanyProfile={setCompanyProfile}
                      setCompanyProfileLoading={setCompanyProfileLoading}
                      fetchCompanyProfile={fetchCompanyProfile}
                      setEditingApp={setEditingApp}
                      setEditFormData={setEditFormData}
                      setShowEditModal={setShowEditModal}
                    />
                  );

                  return (
                    <>
                      {(pinnedApps.length > 0 || unpinnedApps.length > 0) ? (
                        <>
                          {pinnedApps.length > 0 && (
                            <div className="pinned-section">
                              <div className="pinned-section-header">
                                <span className="pinned-section-icon">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 17v5"/><path d="M9 2h6l-1.5 5.5L16 11h-3.5l-.5 6-.5-6H8l2.5-3.5L9 2z"/>
                                  </svg>
                                </span>
                                <span className="pinned-section-label">Pinned</span>
                                <span className="pinned-section-count">{pinnedApps.length}</span>
                              </div>
                              <div className="app-grid">
                                {pinnedApps.map(renderCard)}
                              </div>
                            </div>
                          )}

                          {paginatedApps.length > 0 && (
                            <div className="app-grid">
                              {paginatedApps.map(renderCard)}
                            </div>
                          )}

                          {totalPages > 1 && (
                            <div className="pagination-container">
                              <button
                                className="pagination-btn"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={activePage === 1}
                                title="Previous Page"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                              </button>
                              <span className="pagination-info">Page {activePage} of {totalPages}</span>
                              <button
                                className="pagination-btn"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={activePage === totalPages}
                                title="Next Page"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ textAlign: 'center', marginTop: 60, color: '#6d7a77' }}>
                          {syncStatus === "pending"
                            ? "Emails are being synced in the background. Please wait..."
                            : "No applications found. Try syncing emails."}
                        </p>
                      )}
                    </>
                  );
                })()}
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
      )}

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

              <div className="modal-grid-2col">
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

      <EditModal
        showEditModal={showEditModal}
        setShowEditModal={setShowEditModal}
        handleEditSubmit={handleEditSubmit}
        editFormError={editFormError}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        editCustomLabel={editCustomLabel}
        setEditCustomLabel={setEditCustomLabel}
        editCustomValue={editCustomValue}
        setEditCustomValue={setEditCustomValue}
        editSubmitting={editSubmitting}
      />

      <InfoModal
        showInfoModal={showInfoModal}
        setShowInfoModal={setShowInfoModal}
        selectedApp={selectedApp}
        reparsingId={reparsingId}
        handleReparseEmail={handleReparseEmail}
        reparseToast={reparseToast}
        setReparseToast={setReparseToast}
        attachmentError={attachmentError}
        attachmentToast={attachmentToast}
        setAttachmentToast={setAttachmentToast}
        attachmentActionId={attachmentActionId}
        handleAttachmentAction={handleAttachmentAction}
        companyProfileLoading={companyProfileLoading}
        companyProfile={companyProfile}
      />

      {/* ── Connect Gmail Confirmation Explanation Modal ── */}
      {showLinkConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowLinkConfirmModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '12px' }}>
              <h3 className="modal-title" style={{ margin: 0 }}>
                Connect Additional Gmail Account
              </h3>
              <button className="modal-close" onClick={() => setShowLinkConfirmModal(false)}>&times;</button>
            </div>
            <div style={{ padding: '6px 0 0 0', fontSize: '13.5px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
              <div style={{
                padding: '12px 14px',
                background: 'rgba(20, 184, 166, 0.08)',
                border: '1px solid rgba(20, 184, 166, 0.25)',
                borderRadius: '8px',
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                marginBottom: '14px'
              }}>
                <strong>Privacy & Scope:</strong> Only placement-department emails (from <code>placement@msrit.edu</code>, <code>dean.tap@msrit.edu</code>) will be processed. Personal emails are never accessed or stored.
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                You will be redirected to Google to choose a secondary account and grant read-only access for placement emails.
              </p>
            </div>
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button
                className="btn-cancel"
                style={{ border: '1.5px solid #ef4444', color: '#ef4444', background: 'transparent' }}
                onClick={() => setShowLinkConfirmModal(false)}
                disabled={linkInitiating}
              >
                Cancel
              </button>
              <button className="btn-submit" onClick={handleConfirmLinkAccount} disabled={linkInitiating}>
                {linkInitiating ? "Opening Google..." : "Continue to Google ↗"}
              </button>
            </div>
          </div>
        </div>
      )}


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

      {showClearModal && (
        <div className="modal-overlay" onClick={() => { setShowClearModal(false); setClearConfirmText(""); setClearError(""); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#ef4444' }}>Clear Dashboard</h3>
              <button className="modal-close" onClick={() => { setShowClearModal(false); setClearConfirmText(""); setClearError(""); }}>&times;</button>
            </div>

            <form onSubmit={handleClearSubmit} style={{ marginTop: '16px' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                <p style={{ marginBottom: '12px', fontWeight: '600' }}>
                  Warning: This action will delete all synced applications.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  Your account settings, notes, and Gmail credentials will remain intact, but all applications displayed on your dashboard will be removed.
                </p>
              </div>

              {clearError && (
                <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>
                  {clearError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  To confirm, type <strong style={{ color: '#ef4444' }}>CLEAR</strong> in the box below:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="CLEAR"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  disabled={clearing}
                  required
                  style={{ borderColor: clearConfirmText === "CLEAR" ? '#ef4444' : 'var(--border-color)', outline: 'none' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowClearModal(false); setClearConfirmText(""); setClearError(""); }}
                  disabled={clearing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  style={{ backgroundColor: clearConfirmText === "CLEAR" ? '#ef4444' : '#f87171', opacity: clearConfirmText === "CLEAR" ? 1 : 0.6 }}
                  disabled={clearing || clearConfirmText !== "CLEAR"}
                >
                  {clearing ? "Clearing..." : "Clear Dashboard"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

