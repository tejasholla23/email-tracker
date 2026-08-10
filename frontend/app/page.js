"use client";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
let activeRefreshPromise = null;

import React, { useEffect, useState, useRef } from "react";
import OfflinePage from "./components/OfflinePage";

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
  const [linkedToast, setLinkedToast] = useState(null);

  // Email Reparse State
  const [reparsingId, setReparsingId] = useState(null);
  const [reparseToast, setReparseToast] = useState(null);

  const handleReparseEmail = async (appId) => {
    if (!appId || reparsingId) return;
    setReparsingId(appId);
    setReparseToast(null);

    try {
      const res = await apiFetch(`${BASE_URL}/applications/${appId}/reparse`, {
        method: "POST"
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
        if (!active) {
          // If permission is granted but no active browser subscription exists, try to register
          try {
            await registerAndSubscribe(apiFetch);
            if (isMounted) setIsSubscribed(true);
          } catch (e) {
            console.warn("[PushManager] Silent subscription registration failed:", e.message);
            if (isMounted) setIsSubscribed(false);
          }
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

    return `Last Synced: ${date.toLocaleDateString()}`;
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
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsSidebarCollapsed(false);
  };

  const handleSidebarMouseLeave = () => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    collapseTimeoutRef.current = setTimeout(() => {
      setIsSidebarCollapsed(true);
      setIsClickedToKeepOpen(false);
    }, 250);
  };

  const handleSidebarClick = () => {
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
          border-radius: 8px;
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
          transition: padding-left 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding-right 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          padding-left: calc(32px + (280px - var(--sidebar-width)) * 0.5);
          padding-right: calc(32px + (280px - var(--sidebar-width)) * 0.5);
        }
        .search-container { flex: 1; width: 100%; position: relative; }
        .search-container input { padding: 9px 16px 9px 40px; border-radius: 999px; border: 1px solid var(--border-color); background: #f1f5f9 url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>') no-repeat 14px center; width: 100%; outline: none; font-size: 14px; color: var(--text-primary); transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out; }
        .search-container input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); background-color: #ffffff; }
        .search-container input::placeholder { color: var(--text-secondary); }
        .topbar-actions { display: flex; align-items: center; gap: 16px; }
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
        .settings-container { display: flex; flex-direction: column; gap: 24px; max-width: 100%; margin: 0 auto; width: 100%; padding-bottom: 40px; }
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
          grid-template-columns: repeat(3, 1fr); 
          gap: 20px; 
          margin-bottom: 32px; 
        }
        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: 1fr; }
        }
        .stat-card { 
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%);
          border-radius: 18px; 
          padding: 20px 22px; 
          display: flex; 
          align-items: center; 
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .stat-card.total {
          border: 1.5px solid rgba(20, 184, 166, 0.35);
        }
        .stat-card.urgent {
          border: 1.5px solid rgba(239, 68, 68, 0.35);
        }
        .stat-card.unmarked {
          border: 1.5px solid rgba(245, 158, 11, 0.35);
        }
        .stat-card:hover {
          transform: translateY(-2px);
        }
        .stat-card.total:hover {
          box-shadow: 0 8px 24px rgba(20, 184, 166, 0.15);
          border-color: rgba(20, 184, 166, 0.6);
        }
        .stat-card.urgent:hover {
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.6);
        }
        .stat-card.unmarked:hover {
          box-shadow: 0 8px 24px rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.6);
        }
        .stat-card-left {
          display: flex;
          align-items: center;
          gap: 16px;
          z-index: 2;
        }
        .stat-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stat-card.total .stat-icon { 
          background: rgba(20, 184, 166, 0.14); 
          border: 1px solid rgba(20, 184, 166, 0.3);
          color: #0d9488; 
        }
        .stat-card.urgent .stat-icon { 
          background: rgba(239, 68, 68, 0.14); 
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #dc2626; 
        }
        .stat-card.unmarked .stat-icon { 
          background: rgba(245, 158, 11, 0.14); 
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #d97706; 
        }
        .stat-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stat-label-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .stat-label { 
          font-size: 11px; 
          font-weight: 700; 
          color: #64748b; 
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-info-icon {
          font-size: 11px;
          color: #94a3b8;
          cursor: help;
          user-select: none;
          transition: color 0.15s ease;
        }
        .stat-info-icon:hover {
          color: #64748b;
        }
        .stat-main {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .stat-value { 
          font-size: 30px; 
          font-weight: 800; 
          color: #0f172a; 
          line-height: 1;
          font-family: 'Manrope', sans-serif;
        }
        .stat-pill {
          font-size: 11.5px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .trend-pill {
          background: rgba(20, 184, 166, 0.15);
          border: 1px solid rgba(20, 184, 166, 0.3);
          color: #0f766e;
        }
        .urgent-pill {
          background: rgba(148, 163, 184, 0.12);
          border: 1px solid rgba(148, 163, 184, 0.25);
          color: #64748b;
        }
        .urgent-pill.has-urgent {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #dc2626;
        }
        .unmarked-pill {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #b45309;
        }
        .stat-card-right {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 110px;
          height: 65px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 1;
          opacity: 0.6;
        }
        .stat-card-graphic {
          width: 100%;
          height: 100%;
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
          border-bottom: 1.5px solid rgba(20, 184, 166, 0.35);
        }
        .dark .pinned-section {
          border-bottom: 1.5px solid rgba(20, 184, 166, 0.3);
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
        .filters { -ms-overflow-style: none; scrollbar-width: none; }

        .modal-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
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
          .logo-text-wrapper {
            opacity: 1 !important;
            pointer-events: auto !important;
          }
          .logo-title-text {
            transform: none !important;
            opacity: 1 !important;
          }
          .logo-subtitle-text {
            transform: none !important;
            opacity: 1 !important;
          }
          .sidebar-divider {
            width: 100% !important;
          }
          .nav-item {
            width: 100% !important;
            height: 48px !important;
            padding: 4px !important;
            justify-content: flex-start !important;
            margin-bottom: 8px !important;
          }
          .nav-text {
            opacity: 1 !important;
            max-width: 150px !important;
            transform: none !important;
            overflow: visible !important;
          }
          .sidebar-bottom {
            align-items: stretch !important;
          }
          .sync-btn {
            width: 100% !important;
            height: 40px !important;
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
            display: block;
          }
          .topbar {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .search-container {
            flex: 1;
            max-width: none;
          }
          .search-container input {
            width: 100%;
          }
          .topbar-actions {
            gap: 8px;
          }
          .content {
            padding: 20px 16px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .page-title {
            font-size: 24px;
          }
          .stats-grid {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .app-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
          .modal-content {
            padding: 20px;
            width: calc(100% - 24px);
            margin: 0 auto;
            max-width: 500px;
          }
          .modal-grid-2col {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }

        @media (max-width: 480px) {
          .topbar { height: auto; padding: 12px 16px; flex-direction: column; gap: 12px; align-items: stretch; }
          .search-container { width: 100%; }
          .search-container input { width: 100%; }
          .topbar-actions { width: 100%; justify-content: center; flex-wrap: wrap; gap: 8px; }
          .topbar-actions > button { flex: 1; min-width: 100px; text-align: center; justify-content: center; display: flex; align-items: center; }
          
          .stats-grid { grid-template-columns: 1fr; gap: 14px; }
          .stat-card { padding: 16px; }
          
          .card-actions {
            flex-wrap: wrap;
            gap: 6px;
          }
          .card-btn {
            flex: 1 1 calc(50% - 4px);
            min-width: 100px;
          }
          
          .floating-add-btn {
            bottom: 20px;
            right: 20px;
            width: 54px;
            height: 54px;
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
        
        .dark .stat-card.total { 
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.12) 0%, rgba(13, 19, 33, 0.85) 100%);
          border-color: rgba(20, 184, 166, 0.35);
        }
        .dark .stat-card.urgent { 
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(13, 19, 33, 0.85) 100%);
          border-color: rgba(239, 68, 68, 0.35);
        }
        .dark .stat-card.unmarked { 
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(13, 19, 33, 0.85) 100%);
          border-color: rgba(245, 158, 11, 0.35);
        }
        .dark .stat-label { color: #94a3b8; }
        .dark .stat-value { color: #f8fafc; }
        .dark .stat-info-icon { color: #64748b; }
        .dark .stat-card.total .stat-icon { background: rgba(20, 184, 166, 0.18); border-color: rgba(20, 184, 166, 0.4); color: #2dd4bf; }
        .dark .stat-card.urgent .stat-icon { background: rgba(239, 68, 68, 0.18); border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
        .dark .stat-card.unmarked .stat-icon { background: rgba(245, 158, 11, 0.18); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24; }
        .dark .trend-pill { background: rgba(20, 184, 166, 0.2); border-color: rgba(20, 184, 166, 0.4); color: #2dd4bf; }
        .dark .urgent-pill { background: rgba(148, 163, 184, 0.15); border-color: rgba(148, 163, 184, 0.3); color: #94a3b8; }
        .dark .urgent-pill.has-urgent { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
        .dark .unmarked-pill { background: rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24; }
        
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

        .info-modal-content {
          max-width: 620px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          overflow: hidden;
        }
        .info-modal-header {
          padding: 20px 24px 14px;
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
        .meta-chip.status-no_response, .meta-chip.status-no-response { background: #fff7ed; border-color: #ffedd5; color: #ea580c; }
        .meta-chip.status-interview { background: #fefce8; border-color: #fde68a; color: #92400e; }
        .meta-chip.status-offer { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .meta-chip.status-rejected { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
        .meta-chip.status-done { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }

        .info-modal-body { overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1 1 auto; min-height: 0; max-height: none; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
        .info-modal-body::-webkit-scrollbar { width: 6px; }
        .info-modal-body::-webkit-scrollbar-track { background: transparent; }
        .info-modal-body::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 4px; }
        .info-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.7); }
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
              <img src="/logo.png" alt="Email Tracker Logo" className="logo-img" />
            </div>
            <div className="logo-text-wrapper">
              <div className="logo-title-text">Email Tracker</div>
              <div className="logo-subtitle-text">Placement Department Mails</div>
            </div>
          </div>

          <div className="sidebar-divider" />

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              className={`nav-item ${activeFilter !== 'calendar' && activeFilter !== 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveFilter('all'); setIsSidebarOpen(false); }}
            >
              <div className="nav-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              </div>
              <span className="nav-text">Dashboard</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, marginRight: '24px' }}>
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
                        <button className="user-dropdown-item" onClick={() => { setActiveFilter('settings'); setSettingsSubView('linked-accounts'); setShowUserDropdown(false); fetchLinkedAccounts(); }}>
                          Linked Gmail Accounts ❯
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
              <div className="settings-container">
                <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <h1 className="settings-main-title" style={{ margin: 0 }}>Google Calendar Integration</h1>
                  <a
                    href={userEmail ? `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(userEmail)}` : "https://calendar.google.com"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none',
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      minWidth: '180px'
                    }}
                  >
                    Open Google Calendar
                  </a>
                </div>

                <div className="settings-card" style={{ padding: '32px' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 className="settings-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>Google Calendar Integration</span>
                    </h3>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      Automatically add form deadlines, interviews, online assessments, and webinars directly to your configured Google Calendar.
                    </p>
                  </div>

                    {calendarSuccessMsg && (
                      <div className="success-banner" style={{ margin: '16px 0', padding: '12px 16px', borderRadius: '8px', background: 'rgba(46, 213, 115, 0.1)', border: '1px solid rgba(46, 213, 115, 0.3)', color: '#2ed573', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                        <span>✅</span>
                        <span>{calendarSuccessMsg}</span>
                      </div>
                    )}

                    {calendarErrorMsg && (
                      <div className="error-banner" style={{ margin: '16px 0', padding: '12px 16px', borderRadius: '8px', background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', color: '#ff4757', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                        <span>⚠️</span>
                        <span>{calendarErrorMsg}</span>
                      </div>
                    )}

                    {loadingCalendarStatus ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                        <span className="spinner">Loading calendar settings...</span>
                      </div>
                    ) : !hasCalendarScope ? (
                      <div className="about-info-box calendar-card-panel" style={{ padding: '24px' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>🔐</span>
                          <span>Authorization Required</span>
                        </h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                          To create and update calendar events automatically, Email Tracker needs permission to access your Google Calendar events. We request the <b>least-privilege</b> scope (<code>calendar.events</code>) strictly to read, create, and modify placement events. We will never view or edit unrelated personal events.
                        </p>
                        <a
                          href={`${BASE_URL}/auth/google/calendar`}
                          className="btn-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontWeight: '500', padding: '12px 24px', borderRadius: '8px' }}
                        >
                          Authorize & Connect Google Calendar
                        </a>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Integration Status Card */}
                        <div className="calendar-status-box" style={{ padding: '20px 24px' }}>
                          <div style={{ flex: '1', minWidth: '250px' }}>
                            <div style={{ fontWeight: '600', fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span>Integration Status:</span>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '700',
                                letterSpacing: '0.5px',
                                background: calendarSyncEnabled ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                color: calendarSyncEnabled ? '#2ed573' : 'var(--text-secondary)',
                                border: calendarSyncEnabled ? '1px solid rgba(46, 213, 115, 0.3)' : '1px solid var(--border-color)'
                              }}>
                                {calendarSyncEnabled ? "ACTIVE" : "PAUSED"}
                              </span>
                            </div>
                            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                              {calendarSyncEnabled
                                ? "Deadlines, OAs, and placement interviews are automatically synced to Google Calendar."
                                : "Background calendar synchronization is currently paused."}
                            </p>
                          </div>
                          <button
                            className={calendarSyncEnabled ? "btn-danger" : "btn-primary"}
                            onClick={handleToggleCalendarSync}
                            disabled={syncingCalendar}
                            style={{ minWidth: '130px', padding: '10px 18px', borderRadius: '8px' }}
                          >
                            {syncingCalendar ? "Updating..." : calendarSyncEnabled ? "Pause Sync" : "Enable Sync"}
                          </button>
                        </div>

                        {/* Destination Calendar Card */}
                        {hasCalendarScope && (
                          <div className="about-info-box calendar-card-panel" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                              <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span></span>
                                <span>Destination Calendar</span>
                              </h4>
                              <span style={{
                                fontSize: '12px',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                background: 'rgba(52, 152, 219, 0.12)',
                                color: '#3498db',
                                border: '1px solid rgba(52, 152, 219, 0.25)',
                                fontWeight: '500'
                              }}>
                                Active Target: {calendarTargetId ? (availableCalendars.find(c => c.id === calendarTargetId)?.summary || calendarTargetId) : "Primary Calendar"}
                              </span>
                            </div>

                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px' }}>
                              Select which Google Calendar Email Tracker should sync placement events into. Changing the destination calendar automatically migrates all existing synced events in the background.
                            </p>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                              {availableCalendars.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <select
                                      value={calendarTargetId || "primary"}
                                      onChange={(e) => {
                                        const val = e.target.value === "primary" ? "" : e.target.value;
                                        setCalendarTargetId(val);
                                        handleSaveCalendarTarget(val);
                                      }}
                                      disabled={savingTargetCalendar}
                                      style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        flex: 1,
                                        minWidth: '240px',
                                        outline: 'none'
                                      }}
                                    >
                                      <option value="primary">Primary Calendar (Default)</option>
                                      {availableCalendars
                                        .filter(c => !c.primary)
                                        .map(c => (
                                          <option key={c.id} value={c.id}>
                                            {c.summary} ({c.id})
                                          </option>
                                        ))
                                      }
                                    </select>
                                    {savingTargetCalendar && (
                                      <span style={{ fontSize: '13px', color: '#3498db', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="spinner" style={{ width: '14px', height: '14px' }}></span>
                                        Saving & Migrating...
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '260px' }}>
                                  <input
                                    type="text"
                                    placeholder="Calendar ID (leave blank for Primary)"
                                    value={calendarTargetId}
                                    onChange={(e) => setCalendarTargetId(e.target.value)}
                                    style={{
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      background: 'var(--bg-secondary)',
                                      border: '1px solid var(--border-color)',
                                      color: 'var(--text-primary)',
                                      fontSize: '14px',
                                      flex: 1
                                    }}
                                  />
                                  <button
                                    className="btn-primary"
                                    onClick={() => handleSaveCalendarTarget(calendarTargetId)}
                                    disabled={savingTargetCalendar}
                                    style={{ padding: '10px 18px', borderRadius: '8px', whiteSpace: 'nowrap' }}
                                  >
                                    {savingTargetCalendar ? "Saving..." : "Save & Migrate"}
                                  </button>
                                </div>
                              )}
                            </div>

                            <div style={{ marginTop: '12px', fontSize: '12px' }}>
                              <a
                                href="https://calendar.google.com/calendar/u/0/r/settings/createcalendar"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3498db', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                ➕ Create a new secondary calendar in Google Calendar ↗
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Diagnostics Card */}
                        {calendarSyncEnabled && (
                          <div className="about-info-box calendar-card-panel" style={{ padding: '24px' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span></span>
                              <span>Sync Diagnostics & Controls</span>
                            </h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '18px' }}>
                              Email Tracker is the single source of truth. If any calendar events are out of sync or if you want to push all active deadlines to your Google Calendar immediately, click "Re-sync All" below. This runs a delta sync using payload verification to ensure zero duplicate events are created.
                            </p>
                            <button
                              className="btn-outline-primary"
                              onClick={handleManualCalendarSync}
                              disabled={syncingCalendar}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px' }}
                            >
                              🔄 {syncingCalendar ? "Syncing..." : "Re-sync All Calendar Events"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>
            ) : activeFilter === "settings" ? (
              <div className="settings-container">
                {settingsSubView === "main" && (
                  <>
                    <div className="settings-header">
                      <h1 className="settings-main-title">Settings & Help</h1>
                    </div>

                    <div className="settings-about-card" style={{ marginBottom: '24px' }}>
                      <div className="about-info-box">
                        <h3>About Email Tracker</h3>
                        <span className="about-version-badge">VERSION 2.0.0 STABLE</span>
                        <p className="about-desc">
                          Email Tracker automatically tracks and organizes emails from the placement department. It extracts important information such as company details, deadlines, eligibility criteria, and application form links, presenting everything in a centralized dashboard and synchronizing key deadlines directly into your Google Calendar for quick access and easy tracking.
                        </p>
                        <div className="about-tech-container">
                          <span className="about-tech-label">Built with:</span>
                          <div className="about-tech-tags">
                            <span className="about-tech-tag">React</span>
                            <span className="about-tech-tag">Node.js</span>
                            <span className="about-tech-tag">MongoDB</span>
                            <span className="about-tech-tag">Llama 3.1 70B</span>
                            <span className="about-tech-tag">Google Calendar API</span>
                            <span className="about-tech-tag">Google OAuth</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="settings-grid-row">
                      <div className="settings-card">
                        <h3 className="settings-title">
                          <span className="settings-title-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="12" cy="11" r="3" /></svg>
                          </span>
                          <span>Legal & Support</span>
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
                          <button className="settings-item" onClick={() => alert("Report an Issue functionality coming soon!")}>
                            <span className="settings-item-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            </span>
                            <span className="settings-item-label">Report an Issue</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                        </div>
                      </div>

                      <div className="settings-card">
                        <h3 className="settings-title">
                          <span className="settings-title-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                          </span>
                          <span>Notifications</span>
                        </h3>
                        <div className="settings-list">
                          {pushSupported ? (
                            <>
                              <div className="settings-item" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '16px 20px' }}>
                                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Permission Status:</span>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    background: pushPermission === 'granted' ? 'rgba(46, 213, 115, 0.15)' : pushPermission === 'denied' ? 'rgba(255, 71, 87, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                    color: pushPermission === 'granted' ? '#2ed573' : pushPermission === 'denied' ? '#ff4757' : 'var(--text-secondary)'
                                  }}>
                                    {pushPermission.toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Device Notifications:</span>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    background: isSubscribed ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                    color: isSubscribed ? '#2ed573' : 'var(--text-secondary)'
                                  }}>
                                    {isSubscribed ? "ENABLED" : "DISABLED"}
                                  </span>
                                </div>
                                {isSubscribed && pushSubscriptionsCount > 0 && (
                                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    Active registered devices: <b>{pushSubscriptionsCount}</b>
                                  </div>
                                )}
                              </div>

                              {pushPermission === "denied" ? (
                                <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', background: 'rgba(255, 71, 87, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 71, 87, 0.1)', margin: '8px 20px' }}>
                                  Notifications are blocked. Please enable them in browser site settings to receive updates.
                                </div>
                              ) : isSubscribed ? (
                                <button className="settings-item" onClick={handleDisablePushNotifications}>
                                  <span className="settings-item-label text-danger">Disable on this device</span>
                                  <span className="settings-item-arrow">❯</span>
                                </button>
                              ) : pushPermission === "default" ? (
                                <button className="settings-item" onClick={handleRequestPushPermission}>
                                  <span className="settings-item-label" style={{ color: '#3b82f6', fontWeight: '600' }}>Enable Notifications</span>
                                  <span className="settings-item-arrow">❯</span>
                                </button>
                              ) : (
                                <button className="settings-item" onClick={handleEnablePushSubscription}>
                                  <span className="settings-item-label" style={{ color: '#3b82f6', fontWeight: '600' }}>Enable on this device</span>
                                  <span className="settings-item-arrow">❯</span>
                                </button>
                              )}


                            </>
                          ) : (
                            <div style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Push notifications are not supported in this browser.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="settings-card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                        <h3 className="settings-title" style={{ color: '#ef4444' }}>
                          <span className="settings-title-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </span>
                          <span>Delete</span>
                        </h3>
                        <div className="settings-list">
                          <button className="settings-item" onClick={() => { setShowClearModal(true); setClearConfirmText(""); setClearError(""); }}>
                            <span className="settings-item-icon" style={{ color: '#ef4444' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            </span>
                            <span className="settings-item-label">Clear Workspace</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
                          <button className="settings-item" onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); setDeleteError(""); }}>
                            <span className="settings-item-icon" style={{ color: '#ef4444' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
                            </span>
                            <span className="settings-item-label" style={{ color: '#ef4444' }}>Delete Account</span>
                            <span className="settings-item-arrow">❯</span>
                          </button>
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
                        <li><strong>Google OAuth credentials</strong> — securely stored tokens that let us access your Gmail and Google Calendar (if enabled) on your behalf. We never see or store your Google password.</li>
                        <li><strong>Placement-related Gmail messages</strong> — we read emails matching specific criteria (e.g., from your placement department) to extract application details.</li>
                        <li><strong>Google Calendar events metadata</strong> — if you enable Google Calendar integration, we store event identifiers and hashes to sync and update placement deadlines directly on your calendar.</li>
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
                        <li>Synchronize placement deadlines and events with your primary Google Calendar (if enabled).</li>
                        <li>Show summary statistics (total applications, upcoming deadlines, etc.).</li>
                        <li>Let you add notes, mark applications as done, and manage your workflow.</li>
                      </ul>
                      <p>We do not use your emails for advertising, profiling, or any purpose unrelated to placement tracking.</p>

                      <h2>4. AI processing</h2>
                      <p>
                        When we sync your emails, relevant message content is sent to <strong>NVIDIA's NIM API (running Meta's Llama 3.1 70B model)</strong> for processing.
                        The AI extracts structured placement information — company name, role, deadline, application link, and so on.
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
                        <li><strong>Google OAuth, Gmail & Calendar APIs</strong> — to authenticate you, read your emails, and sync events (if enabled).</li>
                        <li><strong>NVIDIA NIM API (Meta Llama 3.1 70B)</strong> — to parse email content into structured data.</li>
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

                {settingsSubView === "linked-accounts" && (
                  <div className="settings-container" style={{ maxWidth: '680px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <button
                        className="btn-outline-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => setActiveFilter("all")}
                      >
                        ❮ Back to Dashboard
                      </button>
                    </div>

                    <div className="settings-header" style={{ marginBottom: '24px' }}>
                      <h1 className="settings-main-title">Linked Gmail Accounts</h1>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.5' }}>
                        Connect secondary Gmail inboxes to ensure placement follow-up emails, test links, and interview invites delivered to your personal address are automatically captured.
                      </p>
                    </div>

                    {/* Primary Account Card */}
                    <div className="settings-card" style={{ marginBottom: '16px', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                            </svg>
                          </div>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading, #0f172a)' }}>
                              {userEmail}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Primary College Account (MSRIT Identity)
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '12px', background: 'rgba(20, 184, 166, 0.15)', color: '#14b8a6', border: '1px solid rgba(20, 184, 166, 0.3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          PRIMARY
                        </span>
                      </div>
                    </div>

                    {/* Secondary Linked Accounts */}
                    {linkedAccountsLoading ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        Loading connected accounts...
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                        {linkedAccounts.map((acc) => {
                          const isPending = acc.syncStatus === "pending";
                          const isFailed = acc.syncStatus === "failed";
                          return (
                            <div key={acc._id} className="settings-card" style={{ padding: '18px 20px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                    </svg>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '14.5px', fontWeight: '600', color: 'var(--text-heading)' }}>
                                      {acc.email}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                      Connected {new Date(acc.connectedAt).toLocaleDateString()} {acc.lastSyncTime ? `• Last synced ${formatRelativeTime(acc.lastSyncTime)}` : ""}
                                    </div>
                                    {isFailed && (
                                      <div style={{ fontSize: '11.5px', color: '#ef4444', marginTop: '4px' }}>
                                        ⚠️ {acc.syncError || "Sync failed. Try reconnecting."}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    padding: '3px 9px',
                                    borderRadius: '10px',
                                    background: isFailed ? 'rgba(239, 68, 68, 0.15)' : isPending ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                    color: isFailed ? '#ef4444' : isPending ? '#eab308' : '#22c55e',
                                    border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : isPending ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                                  }}>
                                    ● {isFailed ? "ERROR" : isPending ? "SYNCING..." : "CONNECTED"}
                                  </span>
                                  <button
                                    style={{
                                      fontSize: '12.5px',
                                      fontWeight: '500',
                                      padding: '6px 14px',
                                      color: '#ef4444',
                                      background: 'rgba(239, 68, 68, 0.08)',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease-out'
                                    }}
                                    disabled={disconnectingId === acc._id}
                                    onClick={() => handleDisconnectLinkedAccount(acc._id)}
                                  >
                                    {disconnectingId === acc._id ? "Disconnecting..." : "Disconnect"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {linkedAccounts.length < 3 && (
                          <button
                            className="btn-secondary"
                            style={{
                              padding: '16px',
                              borderRadius: '12px',
                              border: '1.5px dashed var(--border-color)',
                              background: 'transparent',
                              fontSize: '13.5px',
                              fontWeight: '600',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              marginTop: '8px'
                            }}
                            onClick={() => setShowLinkConfirmModal(true)}
                          >
                            <span>+</span> Connect Gmail Account
                          </button>
                        )}
                      </div>
                    )}
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
                  {/* Card 1: TOTAL APPLICATIONS */}
                  <div className="stat-card total">
                    <div className="stat-card-left">
                      <div className="stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10"></line>
                          <line x1="12" y1="20" x2="12" y2="4"></line>
                          <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-label-row">
                          <span className="stat-label">Total Applications</span>
                          <span className="stat-info-icon" title="Total number of placement emails tracked">ⓘ</span>
                        </div>
                        <div className="stat-main">
                          <span className="stat-value">{total}</span>
                          <span className="stat-pill trend-pill">
                            ↑ {newThisWeek > 0 ? `+${newThisWeek} this week` : "Active"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="stat-card-right">
                      <svg className="stat-card-graphic" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M 5 50 Q 30 48, 55 30 T 115 8" stroke="url(#teal-grad)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                        <path d="M 5 50 Q 30 48, 55 30 T 115 8 L 115 55 L 5 55 Z" fill="url(#teal-fill)" opacity="0.25" />
                        <circle cx="115" cy="8" r="3.5" fill="#2dd4bf" filter="drop-shadow(0 0 5px #2dd4bf)" />
                        <defs>
                          <linearGradient id="teal-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#2dd4bf" />
                          </linearGradient>
                          <linearGradient id="teal-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>

                  {/* Card 2: DEADLINES TODAY */}
                  <div className="stat-card urgent">
                    <div className="stat-card-left">
                      <div className="stat-icon" style={{ position: 'relative' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span className="bell-dot" style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: '#ef4444',
                          boxShadow: '0 0 6px #ef4444'
                        }} />
                      </div>
                      <div className="stat-content">
                        <div className="stat-label-row">
                          <span className="stat-label">Deadlines Today</span>
                          <span className="stat-info-icon" title="Applications with deadlines due today">ⓘ</span>
                        </div>
                        <div className="stat-main">
                          <span className="stat-value">{urgentDeadlines}</span>
                          <span className={`stat-pill urgent-pill ${urgentDeadlines > 0 ? "has-urgent" : ""}`}>
                            {urgentDeadlines === 0 ? "✓ All clear" : "⚠️ Requires attention"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="stat-card-right">
                      <svg className="stat-card-graphic" viewBox="0 0 80 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="8" y="14" width="64" height="46" rx="7" stroke="#f87171" strokeWidth="1.5" fill="rgba(239,68,68,0.04)" />
                        <line x1="8" y1="26" x2="72" y2="26" stroke="#f87171" strokeWidth="1" />
                        <line x1="24" y1="8" x2="24" y2="16" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                        <line x1="56" y1="8" x2="56" y2="16" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                        <rect x="17" y="31" width="8" height="6" rx="1.5" fill="rgba(248,113,113,0.25)" />
                        <rect x="36" y="31" width="8" height="6" rx="1.5" fill="rgba(248,113,113,0.25)" />
                        <rect x="55" y="31" width="8" height="6" rx="1.5" fill="rgba(248,113,113,0.25)" />
                        <rect x="17" y="42" width="8" height="6" rx="1.5" fill="rgba(248,113,113,0.25)" />
                        <rect x="36" y="42" width="8" height="6" rx="1.5" fill="#ef4444" filter="drop-shadow(0 0 5px #ef4444)" />
                        <rect x="55" y="42" width="8" height="6" rx="1.5" fill="rgba(248,113,113,0.25)" />
                      </svg>
                    </div>
                  </div>

                  {/* Card 3: UNMARKED */}
                  <div className="stat-card unmarked">
                    <div className="stat-card-left">
                      <div className="stat-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-label-row">
                          <span className="stat-label">Unmarked</span>
                          <span className="stat-info-icon" title="Applications needing user status review">ⓘ</span>
                        </div>
                        <div className="stat-main">
                          <span className="stat-value">{unmarkedCount}</span>
                          <span className="stat-pill unmarked-pill">
                            ● {unmarkedCount === 0 ? "All reviewed" : "Needs review"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="stat-card-right">
                      <svg className="stat-card-graphic" viewBox="0 0 90 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g transform="rotate(-10 45 32)">
                          <rect x="10" y="14" width="55" height="35" rx="6" stroke="#f59e0b" strokeWidth="1.2" fill="rgba(245,158,11,0.05)" />
                          <line x1="18" y1="24" x2="35" y2="24" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="18" y1="32" x2="50" y2="32" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
                          <circle cx="58" cy="17" r="2.5" fill="#fbbf24" filter="drop-shadow(0 0 4px #fbbf24)" />
                        </g>
                        <g transform="rotate(5 45 38)">
                          <rect x="15" y="20" width="60" height="38" rx="6" stroke="#fbbf24" strokeWidth="1.2" fill="rgba(245,158,11,0.1)" />
                          <line x1="23" y1="30" x2="40" y2="30" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="23" y1="38" x2="55" y2="38" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
                          <line x1="23" y1="45" x2="48" y2="45" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
                        </g>
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="dashboard-filters-row">
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

                  const renderCard = (app) => {
                    const dateToShow = app.latestEmailTime ? new Date(app.latestEmailTime) : (app.date || app.createdAt);
                    const formattedDate = dateToShow
                      ? new Date(dateToShow).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : "N/A";
                    const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();
                    const statusKey = app.derivedStatus;
                    const isUrgent = app.deadlineISO && new Date(app.deadlineISO).toDateString() === new Date().toDateString() && statusKey !== "done" && statusKey !== "applied";
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
                          if (e.target.closest('.card-btn') || e.target.closest('.pin-btn') || e.target.closest('.note-input') || e.target.closest('a') || e.target.closest('button')) return;
                          setSelectedApp(app);
                          setShowInfoModal(true);
                          if (app.companyInfo?.isEnriched) {
                            setCompanyProfile(app.companyInfo);
                            setCompanyProfileLoading(false);
                          } else if (app.company) {
                            setCompanyProfile(app.companyInfo || null);
                            fetchCompanyProfile(app.company);
                          } else {
                            setCompanyProfile(null);
                            setCompanyProfileLoading(false);
                          }
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
                              {(() => {
                                const sub = app.subtitle
                                  || (app.role && app.role.toLowerCase() !== "unknown role" && app.role.toLowerCase() !== "event" ? app.role : "");
                                return sub ? <div className="company-name">{sub}</div> : null;
                              })()}
                            </div>
                          </div>
                          {!isDone && (
                            <button
                              className={`pin-btn${app.isPinned ? " is-pinned" : ""}`}
                              onClick={(e) => { e.stopPropagation(); handleTogglePin(app._id); }}
                              title={app.isPinned ? "Unpin" : "Pin to top"}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 17v5"/><path d="M9 2h6l-1.5 5.5L16 11h-3.5l-.5 6-.5-6H8l2.5-3.5L9 2z"/>
                              </svg>
                            </button>
                          )}
                          <div className="status-badge-container">
                            <span className={`status-badge status-${app.derivedStatus}`}>
                              {app.derivedStatus === "no_response" ? "No response" : app.derivedStatus}
                            </span>
                          </div>
                        </div>

                                  {(() => {
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
                                      className={`card-btn card-btn-done ${isDone ? "active" : ""}`}
                                      onClick={() => isDone ? handleUnmarkDone(app._id) : handleMarkDone(app._id)}
                                    >
                                      {isDone ? "Unmark Done" : "Mark Done"}
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
                    };

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

              <div className="modal-grid-2col">
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
          role: { label: "Role(s)", value: app.programRoles },
          stipend: { label: "Stipend", value: app.programStipend },
          deadline: { label: "Deadline", value: app.deadlineText },
          duration: { label: "Duration", value: app.programDuration },
          venue: { label: "Venue", value: app.venue },
          eventName: { label: "Event", value: app.subtitle },
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 className="info-modal-company-name" style={{ margin: 0 }}>{app.company}</h3>
                        <button
                          className="btn-reparse"
                          title="Reparse email with AI"
                          disabled={reparsingId === app._id}
                          onClick={() => handleReparseEmail(app._id)}
                          style={{
                            background: 'rgba(37, 99, 235, 0.1)',
                            border: '1.5px solid rgba(37, 99, 235, 0.4)',
                            borderRadius: '6px',
                            padding: '3px 10px',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#2563eb',
                            cursor: reparsingId === app._id ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0,
                            boxShadow: '0 1px 2px rgba(37, 99, 235, 0.1)',
                            transition: 'all 0.15s ease-out'
                          }}
                        >
                          <span style={{
                            display: 'inline-block',
                            fontSize: '13px',
                            transform: reparsingId === app._id ? 'rotate(360deg)' : 'none',
                            transition: reparsingId === app._id ? 'transform 1s linear infinite' : 'none'
                          }}>
                            ↻
                          </span>
                          {reparsingId === app._id ? "Reparsing..." : "Reparse"}
                        </button>
                      </div>
                      {app.subtitle && <p className="info-modal-subtitle">{app.subtitle}</p>}
                    </div>
                  </div>
                  <button className="modal-close" onClick={closeInfoModal}>&times;</button>
                </div>
                <div className="info-modal-meta-chips">
                  <span className={`meta-chip status-${app.derivedStatus || statusKey}`} style={{ textTransform: 'capitalize' }}>
                    {app.derivedStatus === 'no_response' ? 'No response' : (app.status || 'New')}
                  </span>
                  {app.type && app.type !== 'unknown' && app.type !== app.emailType && (
                    <span className="meta-chip" style={{ textTransform: 'capitalize' }}>{app.type}</span>
                  )}
                  {app.emailType && app.emailType !== 'job' && (
                    <span className="meta-chip" style={{ textTransform: 'capitalize' }}>{app.emailType}</span>
                  )}
                </div>
              </div>

              {reparseToast && (
                <div style={{
                  margin: '12px 24px 0 24px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: reparseToast.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${reparseToast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: reparseToast.type === 'success' ? '#22c55e' : '#ef4444'
                }}>
                  <span>{reparseToast.message}</span>
                  <button
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}
                    onClick={() => setReparseToast(null)}
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* ── Scrollable body ── */}
              <div className="info-modal-body">

                {/* Company Overview Section */}
                {companyProfileLoading ? (
                  <div className="info-modal-section">
                    <div className="info-modal-section-header">About {app.company}</div>
                    <div className="info-modal-section-body">
                      <div className="company-skeleton">
                        <div className="skeleton-line" style={{ width: '92%' }}></div>
                        <div className="skeleton-line" style={{ width: '80%' }}></div>
                        <div className="skeleton-line" style={{ width: '65%' }}></div>
                      </div>
                    </div>
                  </div>
                ) : (() => {
                  const profile = companyProfile || app.companyInfo;
                  if (!profile || (!profile.description && !profile.industry && !profile.companyType && (!profile.knownFor || profile.knownFor.length === 0))) return null;

                  return (
                    <div className="info-modal-section">
                      <div className="info-modal-section-header">About {app.company}</div>
                      <div className="info-modal-section-body">
                        {profile.description && (
                          <p className="company-description" style={{ marginBottom: '14px', lineHeight: '1.6', fontSize: '13.5px' }}>
                            {profile.description}
                          </p>
                        )}
                        
                        <div className="company-info-grid" style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '10px 14px',
                          margin: '12px 0 14px',
                          padding: '12px 14px',
                          background: 'var(--bg-color, #f8fafc)',
                          borderRadius: '10px',
                          border: '1px solid var(--border-color, #e2e8f0)'
                        }}>
                          {profile.industry && (
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Industry</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary, #0f172a)', marginTop: '2px' }}>{profile.industry}</div>
                            </div>
                          )}
                          {profile.companyType && (
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary, #0f172a)', marginTop: '2px' }}>{profile.companyType}</div>
                            </div>
                          )}
                          {profile.headquarters && (
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headquarters</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary, #0f172a)', marginTop: '2px' }}>{profile.headquarters}</div>
                            </div>
                          )}
                          {profile.website && (
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Website</div>
                              <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: '600', color: '#3b82f6', textDecoration: 'underline', marginTop: '2px', display: 'inline-block' }}>
                                {profile.website.replace(/^https?:\/\//, '')} ↗
                              </a>
                            </div>
                          )}
                        </div>

                        {Array.isArray(profile.knownFor) && profile.knownFor.length > 0 && (
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary, #64748b)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Key Highlights</div>
                            <ul className="known-for-list">
                              {profile.knownFor.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

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
              <h3 className="modal-title" style={{ color: '#ef4444' }}>Clear Workspace</h3>
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
                  {clearing ? "Clearing..." : "Clear Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

