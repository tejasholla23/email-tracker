"use client";

import React from "react";

export default function SettingsView({
  settingsSubView,
  setSettingsSubView,
  setActiveFilter,
  pushSupported,
  pushPermission,
  isSubscribed,
  pushSubscriptionsCount,
  handleDisablePushNotifications,
  handleRequestPushPermission,
  handleEnablePushSubscription,
  userEmail,
  studentProfile,
  setStudentProfile,
  studentProfileSaving,
  studentProfileToast,
  setStudentProfileToast,
  handleSaveStudentProfile,
  linkedAccounts = [],
  linkedAccountsLoading,
  manualSyncingId,
  disconnectingId,
  fetchLinkedAccounts,
  handleSyncLinkedAccount,
  handleDisconnectLinkedAccount,
  setShowLinkConfirmModal,
  setShowClearModal,
  setClearConfirmText,
  setClearError,
  setShowDeleteModal,
  setDeleteConfirmText,
  setDeleteError,
  getCompactRelativeTime,
}) {
  return (
    <div className="settings-container">
      {settingsSubView === "main" && (
        <>
          <div className="settings-header">
            <h1 className="settings-main-title">Settings & Help</h1>
          </div>

          <div className="settings-about-card">
            <div className="about-info-box">
              <h3>About Email Tracker</h3>
              <span className="about-version-badge">VERSION 2.5.0 STABLE</span>
              <p className="about-desc">
                Email Tracker helps you keep track of campus recruitment emails without digging through your inbox. It automatically organizes opportunities, deadlines, application links, and shortlist updates in one place, making it easier to keep track of the companies you’re interested in and the next steps for each opportunity. You can also sync important deadlines with Google Calendar and receive real-time notifications when there are new updates, so important information doesn’t get buried among your other emails.
              </p>
              <div className="about-tech-container">
                <span className="about-tech-label">Built with:</span>
                <div className="about-tech-tags">
                  <span className="about-tech-tag">Next.js & React</span>
                  <span className="about-tech-tag">Node.js & Express</span>
                  <span className="about-tech-tag">MongoDB Atlas</span>
                  <span className="about-tech-tag">OpenAI GPT-OSS 20B</span>
                  <span className="about-tech-tag">OpenAI GPT-OSS 120B</span>
                  <span className="about-tech-tag">Mistral Small</span>
                  <span className="about-tech-tag">Gmail Pub/Sub</span>
                  <span className="about-tech-tag">Google Calendar API</span>
                  <span className="about-tech-tag">Real-time Notifications</span>
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
                <span>Accounts & Delete</span>
              </h3>
              <div className="settings-list">
                <button className="settings-item" onClick={() => { setSettingsSubView("linked-accounts"); fetchLinkedAccounts(); }}>
                  <span className="settings-item-icon" style={{ color: 'var(--text-primary)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </span>
                  <span className="settings-item-label">
                    Linked Gmail Accounts {linkedAccounts.some(a => a.syncStatus === "failed") ? "⚠️" : ""}
                  </span>
                  <span className="settings-item-arrow">❯</span>
                </button>

                <button className="settings-item" onClick={() => { setShowClearModal(true); setClearConfirmText(""); setClearError(""); }}>
                  <span className="settings-item-icon" style={{ color: '#ef4444' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </span>
                  <span className="settings-item-label">Clear Dashboard</span>
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
          <p className="legal-last-updated">Last updated: August 27, 2026</p>
          <div className="legal-content">
            <h2>1. What is Email Tracker?</h2>
            <p>
              Email Tracker is an AI-powered placement tracking platform designed to help students stay organized during campus placements.
              It connects securely to your primary and linked Gmail inboxes, identifies recruitment communications, parses schedules and job details, and presents everything in an actionable dashboard with Google Calendar integration and real-time push alerts.
            </p>

            <h2>2. What information do we access and collect?</h2>
            <p>When you use Email Tracker, we process only the data necessary to deliver your placement workflow:</p>
            <ul>
              <li><strong>Google Account Information</strong> — your email address and profile info to authenticate your account.</li>
              <li><strong>OAuth Credentials</strong> — securely encrypted and hashed tokens allowing access to your primary and linked Gmail inboxes and Google Calendar (if enabled). We never handle or store your Google password.</li>
              <li><strong>Placement Emails & Attachments</strong> — messages and circular attachments (PDF job descriptions, Excel candidate rosters) to extract placement metadata.</li>
              <li><strong>Student Profile</strong> — candidate name, USN / Roll Number, and target roles used for local shortlist matching.</li>
              <li><strong>Google Calendar Metadata</strong> — event identifiers and hashes to sync drive deadlines without creating duplicate events.</li>
              <li><strong>Web Push Tokens</strong> — browser push tokens used to deliver critical deadline alerts.</li>
            </ul>

            <h2>3. How do we process and use your data?</h2>
            <p>All data processed serves one direct purpose: simplifying your placement tracking:</p>
            <ul>
              <li><strong>Dual-LLM AI Parsing</strong> — unstructured emails are parsed using OpenAI GPT-OSS 20B and NVIDIA Nemotron 3.5 Lightning (via NVIDIA NIM API) into clean application cards.</li>
              <li><strong>Spreadsheet Shortlist Detection</strong> — attached candidate rosters are parsed in-memory during sync to determine if your name or USN is shortlisted.</li>
              <li><strong>Multi-Inbox Sync</strong> — coordinating primary and secondary linked accounts seamlessly.</li>
              <li><strong>Calendar Integration</strong> — synchronizing deadlines, PPTs, assessments, and interviews to your Google Calendar.</li>
            </ul>
            <p>We do <strong>not</strong> sell, rent, monetize, or use your data for advertising, profiling, or training public AI models.</p>

            <h2>4. Zero-Storage Attachment Policy</h2>
            <p>
              Email attachments and candidate rosters are parsed strictly in-memory during synchronization. Raw files and resumes are never stored permanently on the server disk.
            </p>

            <h2>5. Data Storage and Tenant Isolation</h2>
            <p>
              Your structured applications and timeline events are stored in <strong>MongoDB Atlas</strong>. Every database query is strictly scoped to your authenticated account ID (`userId`), guaranteeing complete tenant separation.
            </p>

            <h2>6. Your Controls and Account Deletion</h2>
            <p>
              You can disconnect any linked secondary account at any time, toggle calendar and notification features, or permanently delete your Email Tracker account from Settings to erase all stored applications, notes, and credentials.
            </p>

            <h2>7. Contact</h2>
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
          <p className="legal-last-updated">Last updated: August 27, 2026</p>
          <div className="legal-content">
            <h2>1. Acceptance of These Terms</h2>
            <p>
              By creating an account or using Email Tracker, you agree to these Terms. If you do not agree, please do not use the application.
            </p>

            <h2>2. Eligibility and Linked Inboxes</h2>
            <p>
              You represent that you own and are authorized to connect all primary and linked secondary Gmail accounts. You may unlink secondary inboxes or revoke permissions at any time.
            </p>

            <h2>3. AI Parsing & Shortlist Verification Notice</h2>
            <p>
              Email Tracker uses advanced Dual-LLM extraction (OpenAI GPT-OSS & Nemotron 3.5) and automated spreadsheet parsing to organize recruitment communications and detect candidate shortlist status.
              <br />
              <strong>Important:</strong> AI and automated extractors can occasionally misinterpret ambiguous notices. <strong>You are solely responsible for independently verifying all critical deadlines, eligibility criteria, assessment links, and interview schedules with the official communications from your institution or employer.</strong>
            </p>

            <h2>4. Acceptable Use</h2>
            <p>You agree not to misuse the service, connect unauthorized student profiles or accounts, or attempt to disrupt application operations or security mechanisms.</p>

            <h2>5. Service Availability</h2>
            <p>
              Email Tracker is provided on an "as is" and "as available" basis. We may modify or temporarily update components of the service to perform maintenance and improvements.
            </p>

            <h2>6. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Email Tracker shall not be liable for any direct or indirect loss arising from missed application deadlines, parsing discrepancies, or service interruptions.
            </p>

            <h2>7. Termination</h2>
            <p>
              You may stop using Email Tracker at any time by deleting your account from Settings.
            </p>

            <h2>8. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
              <br />
              <strong>tejasholla23@gmail.com</strong>
            </p>
          </div>
        </div>
      )}

      {settingsSubView === "student-profile" && (
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
            <h1 className="settings-main-title">Student Details</h1>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.5' }}>
              Provide your details to automatically check placement shortlist spreadsheets (.xlsx) received via recruitment emails.
            </p>
          </div>

          {studentProfileToast && (
            <div style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: studentProfileToast.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${studentProfileToast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: studentProfileToast.type === 'success' ? '#22c55e' : '#ef4444'
            }}>
              <span>{studentProfileToast.message}</span>
              <button
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '15px' }}
                onClick={() => setStudentProfileToast(null)}
              >
                &times;
              </button>
            </div>
          )}

          <form onSubmit={handleSaveStudentProfile} className="settings-card" style={{ padding: '24px' }}>
            {/* Derived USN (Read-Only) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                University Seat Number (USN)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={studentProfile.derivedUsn || "Not detected"}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary, rgba(0,0,0,0.05))',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '600',
                    letterSpacing: '0.04em'
                  }}
                />
                {studentProfile.derivedUsn && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '5px 10px',
                    borderRadius: '12px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    whiteSpace: 'nowrap'
                  }}>
                    ✓ AUTOMATIC
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                Automatically derived from your authenticated college email ({studentProfile.email || userEmail || "college account"}).
              </p>
            </div>

            {/* Full Name (Optional) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Full Name <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={studentProfile.fullName}
                onChange={(e) => setStudentProfile({ ...studentProfile, fullName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg, transparent)',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                The name you commonly use when applying for campus placements (e.g. matching "Candidate Name" columns).
              </p>
            </div>

            {/* Personal Email (Optional) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Personal Email <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>(Optional)</span>
              </label>
              <input
                type="email"
                placeholder="e.g. yourname@gmail.com"
                value={studentProfile.personalEmail}
                onChange={(e) => setStudentProfile({ ...studentProfile, personalEmail: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg, transparent)',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                Used to match against shortlists that list personal email addresses instead of college IDs.
              </p>
            </div>

            {/* Mobile Number (Optional) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Mobile Number <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>(Optional)</span>
              </label>
              <input
                type="tel"
                placeholder="Enter 10-digit mobile number"
                value={studentProfile.mobileNumber}
                onChange={(e) => setStudentProfile({ ...studentProfile, mobileNumber: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg, transparent)',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
                10-digit mobile number used for contact-number shortlist checks.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={studentProfileSaving}
                style={{ padding: '9px 20px', fontSize: '13.5px', fontWeight: '600', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {studentProfileSaving ? (
                  <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '12px' }}>↻</span> Saving…</>
                ) : (
                  "Save Details"
                )}
              </button>
            </div>
          </form>
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
                    Primary College Account
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
                  <div key={acc._id} className="settings-card" style={{ padding: '18px 20px', border: isFailed ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--border-color)', background: isFailed ? 'rgba(239, 68, 68, 0.03)' : 'var(--bg-secondary)' }}>
                    {/* Header Row: Info on Left, Status Badge on Right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: isFailed ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.06)', color: isFailed ? '#ef4444' : 'var(--text-heading)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-heading)' }}>
                            {acc.email}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Connected {new Date(acc.connectedAt).toLocaleDateString('en-GB')} {acc.lastSyncTime ? `• Last synced ${getCompactRelativeTime(acc.lastSyncTime)}` : ""}
                          </div>
                          {isFailed && (
                            <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', fontWeight: '500' }}>
                              ⚠️ {acc.syncError || "Authentication expired or permissions revoked. Click Reconnect to restore sync."}
                            </div>
                          )}
                        </div>
                      </div>

                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: isFailed ? 'rgba(239, 68, 68, 0.15)' : isPending ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: isFailed ? '#ef4444' : isPending ? '#eab308' : '#3b82f6',
                        border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : isPending ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        flexShrink: 0
                      }}>
                        {isFailed ? "ERROR" : isPending ? "SYNCING" : "LINKED"}
                      </span>
                    </div>

                    {/* Action Footer Row */}
                    <div className="linked-card-footer">
                      <div className="linked-card-status" style={{ color: isFailed ? '#ef4444' : isPending ? '#eab308' : '#22c55e' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isFailed ? '#ef4444' : isPending ? '#eab308' : '#22c55e', display: 'inline-block' }} />
                        <span>{isFailed ? "Sync Paused" : isPending ? "Syncing emails..." : "Active & Auto-Syncing"}</span>
                      </div>

                      <div className="linked-card-actions">
                        {!isFailed && (
                          <button
                            className="btn-outline-primary linked-action-btn"
                            disabled={manualSyncingId === acc._id}
                            onClick={() => handleSyncLinkedAccount(acc._id)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: manualSyncingId === acc._id ? 'spin 1s linear infinite' : 'none' }}>
                              <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
                            </svg>
                            <span>{manualSyncingId === acc._id ? "Syncing..." : "Sync Now"}</span>
                          </button>
                        )}
                        {isFailed && (
                          <button
                            className="btn-submit linked-action-btn"
                            onClick={() => setShowLinkConfirmModal(true)}
                          >
                            Reconnect
                          </button>
                        )}
                        <button
                          className="btn-danger-outline linked-action-btn"
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
  );
}
