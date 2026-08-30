"use client";

import React from "react";

export default function ApplicationCard({
  app,
  activeStatusMenuId,
  setActiveStatusMenuId,
  handleQuickUpdate,
  handleTogglePin,
  handleUpdateNote,
  handleSaveNote,
  handleApply,
  handleMarkDone,
  handleUnmarkDone,
  handleDeleteOne,
  setSelectedApp,
  setShowInfoModal,
  setCompanyProfile,
  setCompanyProfileLoading,
  fetchCompanyProfile,
  setEditingApp,
  setEditFormData,
  setShowEditModal,
}) {
  const dateToShow = app.appliedDate || app.emailDate || app.date || app.createdAt;
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
      className={`app-card status-outline-${statusKey}${isUrgent ? " is-urgent" : ""}${isDone ? " is-done" : ""}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        if (e.target.closest('.card-btn') || e.target.closest('.pin-btn') || e.target.closest('.note-input') || e.target.closest('a') || e.target.closest('button') || e.target.closest('.status-quick-container')) return;
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
        <div className="status-badge-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', position: 'relative' }}>
          {/* Main Status Badge (Top) */}
          <div className={`status-quick-container ${activeStatusMenuId === `${app._id}-status` ? "open" : ""}`}>
            <span
              className={`status-badge status-${app.derivedStatus} status-badge-interactive`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveStatusMenuId(activeStatusMenuId === `${app._id}-status` ? null : `${app._id}-status`);
              }}
              title="Click to change status or stage"
            >
              {app.derivedStatus === "no_response" ? "No response" : app.derivedStatus}
              <span className="status-badge-chevron">▼</span>
            </span>

            {activeStatusMenuId === `${app._id}-status` && (
              <div className="status-quick-menu" onClick={(e) => e.stopPropagation()}>
                <div className="status-quick-header">Application Status</div>
                <button
                  type="button"
                  className={`status-quick-item ${app.status === "new" || (!app.status && app.derivedStatus === "new") ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { status: "new" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#3b82f6' }}></span>New</span>
                  {(app.status === "new" || (!app.status && app.derivedStatus === "new")) && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.status === "applied" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { status: "applied" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#0f766e' }}></span>Applied</span>
                  {app.status === "applied" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.status === "done" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { status: "done" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#15803d' }}></span>Marked Done</span>
                  {app.status === "done" && <span>✓</span>}
                </button>

                <div className="status-quick-divider" />
                <div className="status-quick-header">Recruitment Stage</div>
                <button
                  type="button"
                  className={`status-quick-item ${(!app.stage || app.stage === "none") ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "none" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#94a3b8' }}></span>None</span>
                  {(!app.stage || app.stage === "none") && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "oa_scheduled" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "oa_scheduled" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#8b5cf6' }}></span>OA</span>
                  {app.stage === "oa_scheduled" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "interview_scheduled" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "interview_scheduled" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#f59e0b' }}></span>Interview</span>
                  {app.stage === "interview_scheduled" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "offered" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "offered" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#10b981' }}></span>Offered</span>
                  {app.stage === "offered" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "rejected" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "rejected" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#ef4444' }}></span>Not Shortlisted</span>
                  {app.stage === "rejected" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "rejected_after_oa" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "rejected_after_oa" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#be123c' }}></span>Rejected (after OA)</span>
                  {app.stage === "rejected_after_oa" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`status-quick-item ${app.stage === "rejected_after_interview" ? "active" : ""}`}
                  onClick={() => handleQuickUpdate(app._id, { stage: "rejected_after_interview" })}
                >
                  <span><span className="status-quick-dot" style={{ background: '#9f1239' }}></span>Rejected (after Interview)</span>
                  {app.stage === "rejected_after_interview" && <span>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Recruitment Stage Badge (Below status tag) */}
          {app.stage && app.stage !== "none" && (
            <div className={`status-quick-container ${activeStatusMenuId === `${app._id}-stage` ? "open" : ""}`}>
              <span
                className={`status-badge stage-badge stage-${app.stage === "oa_scheduled" ? "oa" : app.stage === "interview_scheduled" ? "interview" : app.stage} status-badge-interactive`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveStatusMenuId(activeStatusMenuId === `${app._id}-stage` ? null : `${app._id}-stage`);
                }}
                title="Click to change recruitment stage"
              >
                {app.stage === "oa_scheduled" ? "OA" : app.stage === "interview_scheduled" ? "Interview" : app.stage === "offered" ? "Offered" : app.stage === "rejected" ? "Not Shortlisted" : app.stage === "rejected_after_oa" ? "OA • Rejected" : app.stage === "rejected_after_interview" ? "Interview • Rejected" : app.stage}
                <span className="status-badge-chevron">▼</span>
              </span>
              {activeStatusMenuId === `${app._id}-stage` && (
                <div className="status-quick-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="status-quick-header">Recruitment Stage</div>
                  <button
                    type="button"
                    className={`status-quick-item ${(!app.stage || app.stage === "none") ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "none" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#94a3b8' }}></span>None / Initial</span>
                    {(!app.stage || app.stage === "none") && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "oa_scheduled" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "oa_scheduled" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#8b5cf6' }}></span>OA</span>
                    {app.stage === "oa_scheduled" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "interview_scheduled" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "interview_scheduled" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#f59e0b' }}></span>Interview</span>
                    {app.stage === "interview_scheduled" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "offered" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "offered" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#10b981' }}></span>Offered</span>
                    {app.stage === "offered" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "rejected" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "rejected" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#ef4444' }}></span>Not Shortlisted</span>
                    {app.stage === "rejected" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "rejected_after_oa" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "rejected_after_oa" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#be123c' }}></span>Rejected (after OA)</span>
                    {app.stage === "rejected_after_oa" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.stage === "rejected_after_interview" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { stage: "rejected_after_interview" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#9f1239' }}></span>Rejected (after Interview)</span>
                    {app.stage === "rejected_after_interview" && <span>✓</span>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Opportunity Type Badge (if event/hackathon/webinar) */}
          {app.opportunityType && app.opportunityType !== "JOB_APPLICATION" && (
            <div className={`status-quick-container ${activeStatusMenuId === `${app._id}-type` ? "open" : ""}`}>
              <span
                className={`status-badge opp-type-badge opp-${app.opportunityType === "HACKATHON" ? "hackathon" : app.opportunityType === "WEBINAR" ? "webinar" : "event"} status-badge-interactive`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveStatusMenuId(activeStatusMenuId === `${app._id}-type` ? null : `${app._id}-type`);
                }}
                title="Click to change opportunity type"
              >
                {app.opportunityType === "HACKATHON" ? "Hackathon" : app.opportunityType === "WEBINAR" ? "Webinar" : "Event"}
                <span className="status-badge-chevron">▼</span>
              </span>
              {activeStatusMenuId === `${app._id}-type` && (
                <div className="status-quick-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="status-quick-header">Opportunity Type</div>
                  <button
                    type="button"
                    className={`status-quick-item ${app.opportunityType === "JOB_APPLICATION" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { opportunityType: "JOB_APPLICATION" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#3b82f6' }}></span>Placement Drive</span>
                    {app.opportunityType === "JOB_APPLICATION" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.opportunityType === "HACKATHON" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { opportunityType: "HACKATHON" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#8b5cf6' }}></span>Hackathon</span>
                    {app.opportunityType === "HACKATHON" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.opportunityType === "WEBINAR" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { opportunityType: "WEBINAR" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#0ea5e9' }}></span>Webinar</span>
                    {app.opportunityType === "WEBINAR" && <span>✓</span>}
                  </button>
                  <button
                    type="button"
                    className={`status-quick-item ${app.opportunityType === "OTHER_PLACEMENT_EVENT" ? "active" : ""}`}
                    onClick={() => handleQuickUpdate(app._id, { opportunityType: "OTHER_PLACEMENT_EVENT" })}
                  >
                    <span><span className="status-quick-dot" style={{ background: '#64748b' }}></span>College Event</span>
                    {app.opportunityType === "OTHER_PLACEMENT_EVENT" && <span>✓</span>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(() => {
        const flexFields = Array.isArray(app.displayFields) && app.displayFields.length > 0
          ? app.displayFields.filter(f => f && f.label && f.value)
          : null;

        if (flexFields && flexFields.length > 0) {
          const cardFields = flexFields.slice(0, 5);
          const extraCount = flexFields.length - cardFields.length;
          return (
            <div className="program-details">
              {cardFields.map(({ label, value }) => (
                <div key={label} className="program-detail">
                  <span className="program-detail-label">{label}</span>
                  <span className="program-detail-value">{value}</span>
                </div>
              ))}
              {extraCount > 0 && (
                <div className="program-detail-more" style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'var(--accent, #3b82f6)',
                  paddingTop: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  opacity: 0.9
                }}>
                  <span>+{extraCount} more in details</span>
                  <span style={{ fontSize: '9px' }}>→</span>
                </div>
              )}
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

      {(() => {
        const realAttachments = (app.attachments || []).filter(a => !a.isInline);
        if (realAttachments.length === 0) {
          if (app.isShortlisted) {
            return (
              <div className="card-shortlist-badge" title={`Shortlist match detected in ${app.shortlistSummary?.matchedFilename || 'spreadsheet'}`}>
                <span className="card-shortlist-dot" />
                <span>Shortlisted</span>
              </div>
            );
          }
          return null;
        }
        return (
          <div className="card-attachment-indicator" title={`${realAttachments.length} attachment${realAttachments.length > 1 ? 's' : ''} available`}>
            <div className="card-attachment-left">
              <svg className="card-attachment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="card-attachment-label">Attachments ({realAttachments.length})</span>
            </div>
            <div className="card-attachment-right">
              {app.isShortlisted && (
                <span className="card-attachment-shortlist-pill" title={`Shortlist match detected in ${app.shortlistSummary?.matchedFilename || 'spreadsheet'}`}>
                  <span className="card-shortlist-dot" />
                  <span>Shortlisted</span>
                </span>
              )}
              <svg className="card-attachment-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        );
      })()}

      <div className="app-footer">
        <div className="email-info" title={`Received on ${app.accountEmail || app.email || "Gmail"}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', flexShrink: 0 }}>
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          <span>{app.accountEmail || app.email || "user@gmail.com"}</span>
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
              status: app.status || "new",
              stage: app.stage || "none",
              opportunityType: app.opportunityType || "JOB_APPLICATION",
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
}
