"use client";

import React from "react";

export default function CalendarView({
  userEmail,
  BASE_URL,
  calendarSuccessMsg,
  calendarErrorMsg,
  loadingCalendarStatus,
  hasCalendarScope,
  calendarSyncEnabled,
  availableCalendars = [],
  calendarTargetId,
  setCalendarTargetId,
  handleToggleCalendarSync,
  handleSaveCalendarTarget,
  handleManualCalendarSync,
  syncingCalendar,
  savingTargetCalendar,
}) {
  return (
    <div className="settings-container">
      <div className="settings-header calendar-header-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 className="settings-main-title" style={{ margin: 0 }}>Google Calendar Integration</h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Automatically sync form deadlines, interviews, online assessments, and webinars directly with Google Calendar.
          </p>
        </div>
        <a
          href={userEmail ? `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(userEmail)}` : "https://calendar.google.com"}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            textDecoration: 'none',
            padding: '10px 20px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            background: '#2563eb',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          <span>Open Google Calendar</span>
        </a>
      </div>

      {calendarSuccessMsg && (
        <div className="success-banner" style={{ marginBottom: '20px', padding: '12px 18px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
          <span>✅</span>
          <span>{calendarSuccessMsg}</span>
        </div>
      )}

      {calendarErrorMsg && (
        <div className="error-banner" style={{ marginBottom: '20px', padding: '12px 18px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
          <span>⚠️</span>
          <span>{calendarErrorMsg}</span>
        </div>
      )}

      {loadingCalendarStatus ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <span className="spinner">Loading calendar settings...</span>
        </div>
      ) : !hasCalendarScope ? (
        <div className="cal-panel-card" style={{ padding: '28px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔐</span>
            <span>Authorization Required</span>
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
            To create and update calendar events automatically, Email Tracker needs permission to access your Google Calendar events. We request the <b>least-privilege</b> scope (<code>calendar.events</code>) strictly to read, create, and modify placement events. We will never view or edit unrelated personal events.
          </p>
          <a
            href={`${BASE_URL}/auth/google/calendar`}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontWeight: '600', padding: '12px 24px', borderRadius: '10px' }}
          >
            Authorize & Connect Google Calendar
          </a>
        </div>
      ) : (
        <div className="cal-cards-container">
          {/* Card 1: Integration Status */}
          <div className={`cal-status-card ${!calendarSyncEnabled ? 'paused' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1', minWidth: '260px' }}>
              <div className="cal-status-icon-circle">
                {calendarSyncEnabled ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="10" y1="15" x2="10" y2="9"></line>
                    <line x1="14" y1="15" x2="14" y2="9"></line>
                  </svg>
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>Integration Status</span>
                  <span className={`cal-status-pill ${!calendarSyncEnabled ? 'paused' : ''}`}>
                    {calendarSyncEnabled ? "ACTIVE" : "PAUSED"}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {calendarSyncEnabled
                    ? "Deadlines, OAs, and placement interviews are automatically synced to Google Calendar."
                    : "Background calendar synchronization is currently paused."}
                </p>
              </div>
            </div>
            <button
              className={calendarSyncEnabled ? "cal-btn-pause" : "cal-btn-resume"}
              onClick={handleToggleCalendarSync}
              disabled={syncingCalendar}
            >
              {calendarSyncEnabled ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="10" y1="15" x2="10" y2="9"></line>
                    <line x1="14" y1="15" x2="14" y2="9"></line>
                  </svg>
                  <span>{syncingCalendar ? "Updating..." : "Pause Sync"}</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>{syncingCalendar ? "Updating..." : "Resume Sync"}</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: Destination Calendar */}
          <div className="cal-panel-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Destination Calendar</span>
              </div>
              <span className="cal-target-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="22" y1="12" x2="18" y2="12"></line>
                  <line x1="6" y1="12" x2="2" y2="12"></line>
                  <line x1="12" y1="6" x2="12" y2="2"></line>
                  <line x1="12" y1="22" x2="12" y2="18"></line>
                </svg>
                <span>Active Target: {calendarTargetId ? (availableCalendars.find(c => c.id === calendarTargetId)?.summary || calendarTargetId) : "Primary Calendar"}</span>
              </span>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: '1.5', margin: '8px 0 16px 0' }}>
              Choose where Email Tracker creates and syncs placement events. Changing the destination calendar automatically migrates all existing synced events in the background.
            </p>

            {availableCalendars.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <div className="cal-select-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <select
                    value={calendarTargetId || "primary"}
                    onChange={(e) => {
                      const val = e.target.value === "primary" ? "" : e.target.value;
                      setCalendarTargetId(val);
                      handleSaveCalendarTarget(val);
                    }}
                    disabled={savingTargetCalendar}
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                {savingTargetCalendar && (
                  <span style={{ fontSize: '13px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span className="spinner" style={{ width: '14px', height: '14px' }}></span>
                    Saving & Migrating...
                  </span>
                )}
              </div>
            ) : (
              <div className="calendar-manual-input-container">
                <input
                  type="text"
                  placeholder="Calendar ID (leave blank for Primary)"
                  value={calendarTargetId}
                  onChange={(e) => setCalendarTargetId(e.target.value)}
                  className="calendar-target-input"
                />
                <button
                  className="btn-primary calendar-target-btn"
                  onClick={() => handleSaveCalendarTarget(calendarTargetId)}
                  disabled={savingTargetCalendar}
                >
                  {savingTargetCalendar ? "Saving..." : "Save & Migrate"}
                </button>
              </div>
            )}

            <a
              href="https://calendar.google.com/calendar/u/0/r/settings/createcalendar"
              target="_blank"
              rel="noopener noreferrer"
              className="cal-create-link"
            >
              <span style={{ fontSize: '16px', fontWeight: '600' }}>+</span>
              <span>Create a new secondary calendar in Google Calendar</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginLeft: 'auto' }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>

          {/* Card 3: Diagnostics & Controls */}
          <div className="cal-panel-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6"/>
                  <path d="M2.5 22v-6h6"/>
                  <path d="M2 11.5a10 10 0 0 1 18.8-4.3"/>
                  <path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Sync Diagnostics & Controls</span>
              </div>
              <span className="cal-sync-pill">
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                <span>Last sync: Just now</span>
              </span>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: '1.5', margin: '8px 0 16px 0' }}>
              Email Tracker is the single source of truth. If any calendar events are out of sync or you want to push all active deadlines to your Google Calendar immediately, click &quot;Re-sync All&quot; below.
            </p>

            <button
              className="cal-resync-wide-btn"
              onClick={handleManualCalendarSync}
              disabled={syncingCalendar}
            >
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{
                  animation: syncingCalendar ? 'spin 1s linear infinite' : 'none',
                  flexShrink: 0
                }}
              >
                <path d="M21.5 2v6h-6"/>
                <path d="M2.5 22v-6h6"/>
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3"/>
                <path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
              <span>{syncingCalendar ? "Syncing Calendar Events..." : "Re-sync All Calendar Events"}</span>
            </button>

            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span>Runs a delta sync using payload verification to ensure zero duplicate events.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
