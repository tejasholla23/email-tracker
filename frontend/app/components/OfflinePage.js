"use client";

import React, { useState, useEffect } from "react";

export default function OfflinePage({ lastSyncTime, onRetry }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState(null);

  // Detect browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsRestored(true);
      if (onRetry) {
        onRetry();
      } else {
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    };

    const handleOffline = () => {
      setIsRestored(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [onRetry]);

  const handleManualRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setRetryFeedback(null);

    // Check navigator.onLine and perform a quick ping
    if (typeof window !== "undefined" && navigator.onLine) {
      try {
        const res = await fetch("/manifest.json", { cache: "no-store", method: "HEAD" });
        if (res.ok || res.status < 500) {
          setIsRestored(true);
          if (onRetry) {
            await onRetry();
          } else {
            window.location.reload();
          }
          setIsRetrying(false);
          return;
        }
      } catch (e) {
        // Still offline or server unreachable
      }
    }

    // Still offline feedback
    setTimeout(() => {
      setIsRetrying(false);
      setRetryFeedback("Still offline. Checking again automatically...");
      setTimeout(() => setRetryFeedback(null), 4000);
    }, 800);
  };

  // Format relative sync time
  const getFormattedSyncTime = () => {
    if (!lastSyncTime) return "Recently";
    try {
      const date = new Date(lastSyncTime);
      if (isNaN(date.getTime())) return "Recently";
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "Just now";
      if (diffMins === 1) return "1 minute ago";
      if (diffMins < 60) return `${diffMins} minutes ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < 24) return `${diffHours} hours ago`;

      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="offline-container">
      <style jsx>{`
        .offline-container {
          min-height: 100vh;
          width: 100%;
          background-color: #070a11;
          background-image: 
            radial-gradient(circle at 50% 20%, rgba(20, 184, 166, 0.07) 0%, transparent 50%),
            radial-gradient(circle at 50% 80%, rgba(14, 165, 233, 0.04) 0%, transparent 60%);
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        .offline-content {
          max-width: 520px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          z-index: 2;
          animation: offlineFadeIn 0.5s ease-out;
        }

        @keyframes offlineFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Hero Illustration */
        .illustration-wrapper {
          position: relative;
          width: 100%;
          max-width: 380px;
          height: 220px;
          margin-bottom: 24px;
          display: flex;
          justify-content: center;
          align-items: flex-end;
        }

        .hero-svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        /* Floating animations */
        .floating-envelope {
          animation: floatEnvelope 4s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes floatEnvelope {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-7px) rotate(1deg); }
        }

        .floating-astronaut {
          animation: floatAstronaut 6s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes floatAstronaut {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }

        .twinkle-star {
          animation: pulseStar 3s ease-in-out infinite alternate;
        }

        .twinkle-star-delayed {
          animation: pulseStar 4s ease-in-out 1.5s infinite alternate;
        }

        @keyframes pulseStar {
          0% { opacity: 0.2; transform: scale(0.8); }
          100% { opacity: 0.9; transform: scale(1.1); }
        }

        /* Heading & Typography */
        .offline-title {
          font-size: 28px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 10px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          letter-spacing: -0.02em;
        }

        .wifi-off-icon {
          color: #14b8a6;
          display: inline-flex;
          align-items: center;
        }

        .offline-subtitle {
          font-size: 14px;
          line-height: 1.55;
          color: #94a3b8;
          margin: 0 0 24px 0;
          max-width: 360px;
          font-weight: 400;
        }

        /* Retry Button */
        .retry-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(20, 184, 166, 0.08);
          border: 1px solid rgba(20, 184, 166, 0.4);
          color: #14b8a6;
          font-size: 14px;
          font-weight: 600;
          padding: 10px 28px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          outline: none;
          box-shadow: 0 2px 10px rgba(20, 184, 166, 0.1);
        }

        .retry-btn:hover:not(:disabled) {
          background: rgba(20, 184, 166, 0.18);
          border-color: #14b8a6;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(20, 184, 166, 0.2);
          color: #2dd4bf;
        }

        .retry-btn:active:not(:disabled) {
          transform: translateY(0);
          background: rgba(20, 184, 166, 0.25);
        }

        .retry-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        /* Auto reconnect status */
        .auto-reconnect-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
          margin-top: 14px;
          margin-bottom: 28px;
        }

        .auto-reconnect-icon {
          color: #64748b;
        }

        .feedback-banner {
          font-size: 12px;
          color: #f59e0b;
          margin-top: -18px;
          margin-bottom: 20px;
          animation: offlineFadeIn 0.3s ease;
        }

        .restored-banner {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: offlineFadeIn 0.3s ease;
        }

        /* Last Synced Card */
        .sync-card {
          width: 100%;
          background: rgba(13, 19, 33, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          border-radius: 12px;
          padding: 16px 20px;
          box-sizing: border-box;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          text-align: left;
          margin-bottom: 16px;
          transition: border-color 0.2s ease;
        }

        .sync-card:hover {
          border-color: rgba(255, 255, 255, 0.14);
        }

        .sync-left {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .clock-badge {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(20, 184, 166, 0.12);
          border: 1px solid rgba(20, 184, 166, 0.25);
          color: #14b8a6;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .sync-info {
          display: flex;
          flex-direction: column;
        }

        .sync-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 400;
          margin-bottom: 2px;
        }

        .sync-time {
          font-size: 15px;
          font-weight: 600;
          color: #f1f5f9;
          margin-bottom: 4px;
        }

        .sync-desc {
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
        }

        .sync-verified {
          color: #14b8a6;
          padding-top: 2px;
          flex-shrink: 0;
        }

        /* Network Tip Strip */
        .tip-strip {
          width: 100%;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 12px 18px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #94a3b8;
          text-align: left;
        }

        .tip-icon {
          color: #64748b;
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        /* Mobile Adjustments */
        @media (max-width: 480px) {
          .illustration-wrapper {
            height: 180px;
            margin-bottom: 16px;
          }
          .offline-title {
            font-size: 24px;
          }
          .offline-subtitle {
            font-size: 13px;
            margin-bottom: 20px;
          }
          .retry-btn {
            width: 100%;
            padding: 12px 20px;
          }
          .sync-card {
            padding: 14px 16px;
          }
          .tip-strip {
            padding: 10px 14px;
            font-size: 12px;
          }
        }
      `}</style>

      <div className="offline-content">
        {/* HERO ILLUSTRATION */}
        <div className="illustration-wrapper">
          <svg
            className="hero-svg"
            viewBox="0 0 400 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Moon gradient */}
              <linearGradient id="moonGrad" x1="200" y1="160" x2="200" y2="240" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              {/* Envelope glow */}
              <radialGradient id="envGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(20, 184, 166, 0.25)" />
                <stop offset="100%" stopColor="rgba(20, 184, 166, 0)" />
              </radialGradient>

              {/* Saturn ring gradient */}
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(148, 163, 184, 0.4)" />
                <stop offset="100%" stopColor="rgba(148, 163, 184, 0.05)" />
              </linearGradient>
            </defs>

            {/* Stars background */}
            <circle className="twinkle-star" cx="60" cy="40" r="1.5" fill="#e2e8f0" />
            <circle className="twinkle-star-delayed" cx="110" cy="70" r="1" fill="#14b8a6" />
            <circle className="twinkle-star" cx="290" cy="35" r="1.5" fill="#e2e8f0" />
            <circle className="twinkle-star-delayed" cx="340" cy="85" r="1" fill="#38bdf8" />
            <circle className="twinkle-star" cx="170" cy="30" r="1" fill="#94a3b8" />
            <circle className="twinkle-star-delayed" cx="240" cy="50" r="1.2" fill="#14b8a6" />

            {/* Faint Shooting Star / Sparkle */}
            <path className="twinkle-star-delayed" d="M 270 20 L 260 30" stroke="rgba(226, 232, 240, 0.4)" strokeWidth="1" strokeLinecap="round" />
            
            {/* Saturn planet (Top-Left) */}
            <g transform="translate(85, 45) rotate(-20)">
              <ellipse cx="0" cy="0" rx="14" ry="4" fill="url(#ringGrad)" />
              <circle cx="0" cy="0" r="7" fill="#334155" />
            </g>

            {/* Disconnected Wi-Fi Indicator (Top-Center) */}
            <g transform="translate(200, 30)">
              {/* Wi-Fi Arcs */}
              <path d="M -16 -6 A 18 18 0 0 1 16 -6" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
              <path d="M -10 0 A 12 12 0 0 1 10 0" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
              <path d="M -4 5 A 5 5 0 0 1 4 5" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
              {/* Disconnected Small X */}
              <path d="M -3 13 L 3 19 M 3 13 L -3 19" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" />
            </g>

            {/* Moon Surface Horizon */}
            <path
              d="M -40 240 C 80 160, 320 160, 440 240 L 440 260 L -40 260 Z"
              fill="url(#moonGrad)"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
            />
            {/* Moon Craters */}
            <ellipse cx="140" cy="205" rx="16" ry="6" fill="#152032" opacity="0.6" />
            <ellipse cx="280" cy="215" rx="22" ry="7" fill="#152032" opacity="0.5" />
            <ellipse cx="220" cy="225" rx="12" ry="4" fill="#152032" opacity="0.4" />

            {/* ASTRONAUT (Left-Center sitting on Moon) */}
            <g className="floating-astronaut" transform="translate(130, 115)">
              {/* Legs */}
              <rect x="0" y="38" width="12" height="14" rx="5" fill="#cbd5e1" transform="rotate(30)" />
              <rect x="14" y="38" width="12" height="14" rx="5" fill="#94a3b8" transform="rotate(15)" />
              <circle cx="10" cy="52" r="5" fill="#475569" />
              <circle cx="24" cy="50" r="5" fill="#334155" />

              {/* Body / Suit */}
              <rect x="-4" y="18" width="28" height="26" rx="10" fill="#f8fafc" />
              {/* Suit Details / Badge */}
              <rect x="2" y="24" width="8" height="6" rx="2" fill="#14b8a6" />
              <circle cx="16" cy="27" r="2.5" fill="#0ea5e9" />

              {/* Arms */}
              <rect x="-10" y="20" width="8" height="16" rx="4" fill="#e2e8f0" transform="rotate(15)" />
              <rect x="22" y="20" width="8" height="16" rx="4" fill="#cbd5e1" transform="rotate(-20)" />

              {/* Helmet */}
              <circle cx="10" cy="6" r="16" fill="#ffffff" />
              {/* Visor */}
              <ellipse cx="12" cy="6" rx="11" ry="9" fill="#0b0f19" />
              {/* Visor Reflection */}
              <path d="M 6 3 A 8 6 0 0 1 18 3" stroke="rgba(20, 184, 166, 0.6)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <circle cx="17" cy="4" r="1.5" fill="#ffffff" opacity="0.8" />
            </g>

            {/* FLOATING EMAIL TRACKER ENVELOPE LOGO (Dead-Center Horizontally at X=200) */}
            <g className="floating-envelope" transform="translate(160, 60)">
              {/* Glow backdrop */}
              <circle cx="40" cy="30" r="50" fill="url(#envGlow)" />

              {/* Outer Outline & Inner Body */}
              <rect
                x="5"
                y="5"
                width="70"
                height="50"
                rx="10"
                fill="#0d1321"
                stroke="#ffffff"
                strokeWidth="3.5"
              />

              {/* Envelope Flap Line (V-Shape) */}
              <path
                d="M 9 10 L 40 33 L 71 10"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Teal Circular Notification Dot at Upper-Right */}
              <circle cx="64" cy="10" r="8.5" fill="#14b8a6" stroke="#0d1321" strokeWidth="2.5" />
            </g>
          </svg>
        </div>

        {/* CONNECTION RESTORED BADGE */}
        {isRestored && (
          <div className="restored-banner">
            <span>✨</span>
            <span>Connection restored! Reconnecting...</span>
          </div>
        )}

        {/* MAIN HEADING */}
        <h1 className="offline-title">
          <span>You're offline</span>
          <span className="wifi-off-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </span>
        </h1>

        {/* SUBTITLE */}
        <p className="offline-subtitle">
          We can't connect to the internet right now.<br />
          Check your connection and try again.
        </p>

        {/* RETRY BUTTON */}
        <button
          className="retry-btn"
          onClick={handleManualRetry}
          disabled={isRetrying || isRestored}
        >
          <svg
            className={isRetrying ? "spinning" : ""}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>{isRetrying ? "Checking..." : "Retry"}</span>
        </button>

        {/* STILL OFFLINE FEEDBACK */}
        {retryFeedback && <div className="feedback-banner">{retryFeedback}</div>}

        {/* AUTOMATIC RECONNECTION NOTICE */}
        <div className="auto-reconnect-status">
          <svg className="auto-reconnect-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          <span>Will automatically reconnect when you're back online.</span>
        </div>

        {/* LAST SYNCED CARD */}
        <div className="sync-card">
          <div className="sync-left">
            <div className="clock-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="sync-info">
              <span className="sync-label">Last synced</span>
              <span className="sync-time">{getFormattedSyncTime()}</span>
              <span className="sync-desc">Your data is safe. We'll sync new emails once you're back.</span>
            </div>
          </div>
          <div className="sync-verified" title="Data Secured">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          </div>
        </div>

        {/* NETWORK TIP */}
        <div className="tip-strip">
          <div className="tip-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
            </svg>
          </div>
          <span>Tip: Check your Wi-Fi, mobile data, or try switching networks.</span>
        </div>
      </div>
    </div>
  );
}
