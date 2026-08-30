"use client";

import React from "react";

export default function InfoModal({
  showInfoModal,
  setShowInfoModal,
  selectedApp,
  reparsingId,
  handleReparseEmail,
  reparseToast,
  setReparseToast,
  attachmentError,
  attachmentToast,
  setAttachmentToast,
  attachmentActionId,
  handleAttachmentAction,
  companyProfileLoading,
  companyProfile,
}) {
  if (!showInfoModal || !selectedApp) return null;

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

  const getFileIcon = (mimeType, filename) => {
    const mt = (mimeType || '').toLowerCase();
    const fn = (filename || '').toLowerCase();

    // PDF
    if (mt === 'application/pdf' || fn.endsWith('.pdf')) {
      return {
        cls: 'pdf',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        )
      };
    }

    // Spreadsheets (XLSX, XLS, CSV)
    if (mt.includes('spreadsheet') || mt.includes('excel') || mt === 'text/csv' || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) {
      return {
        cls: 'spreadsheet',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M8 13h8" />
            <path d="M8 17h8" />
            <path d="M12 13v8" />
          </svg>
        )
      };
    }

    // Presentations (PPT, PPTX)
    if (mt.includes('presentation') || mt.includes('powerpoint') || fn.endsWith('.pptx') || fn.endsWith('.ppt')) {
      return {
        cls: 'presentation',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        )
      };
    }

    // Word / Documents (DOC, DOCX, ODT, RTF)
    if (mt.includes('word') || mt.includes('document') || mt === 'application/rtf' || fn.endsWith('.doc') || fn.endsWith('.docx') || fn.endsWith('.odt') || fn.endsWith('.rtf')) {
      return {
        cls: 'document',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        )
      };
    }

    // Images
    if (mt.startsWith('image/')) {
      return {
        cls: 'image',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      };
    }

    // Other / Generic Files
    return {
      cls: 'other',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      )
    };
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeLabel = (mimeType, filename) => {
    const fn = (filename || '').toLowerCase();
    if (fn.endsWith('.pdf')) return 'PDF';
    if (fn.endsWith('.xlsx') || fn.endsWith('.xls')) return fn.endsWith('.xlsx') ? 'XLSX' : 'XLS';
    if (fn.endsWith('.csv')) return 'CSV';
    if (fn.endsWith('.doc') || fn.endsWith('.docx')) return fn.endsWith('.docx') ? 'DOCX' : 'DOC';
    if (fn.endsWith('.odt')) return 'ODT';
    if (fn.endsWith('.pptx') || fn.endsWith('.ppt')) return fn.endsWith('.pptx') ? 'PPTX' : 'PPT';
    if (fn.endsWith('.rtf')) return 'RTF';
    if (fn.endsWith('.txt')) return 'TXT';
    const mt = (mimeType || '').toLowerCase();
    if (mt === 'application/pdf') return 'PDF';
    if (mt.startsWith('image/')) return mt.split('/')[1]?.toUpperCase() || 'Image';
    const ext = fn.split('.').pop();
    return ext && ext.length <= 5 ? ext.toUpperCase() : 'File';
  };

  const realAttachments = (app.attachments || []).filter(a => !a.isInline);
  const hasMultipleEmails = app.events && app.events.length > 1;
  const messageGroups = hasMultipleEmails
    ? [...new Set(realAttachments.map(a => a.messageId))].map(mid => ({
        messageId: mid,
        event: (app.events || []).find(e => e.messageId === mid),
        items: realAttachments.filter(a => a.messageId === mid)
      }))
    : [{ messageId: null, event: null, items: realAttachments }];

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
                    title="Reparse application source email with AI"
                    disabled={reparsingId === app._id || (typeof reparsingId === 'string' && reparsingId.startsWith(app._id))}
                    onClick={() => handleReparseEmail(app._id)}
                    style={{
                      background: 'rgba(37, 99, 235, 0.1)',
                      border: '1.5px solid rgba(37, 99, 235, 0.4)',
                      borderRadius: '6px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#2563eb',
                      cursor: (reparsingId === app._id || (typeof reparsingId === 'string' && reparsingId.startsWith(app._id))) ? 'not-allowed' : 'pointer',
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
            {app.stage && app.stage !== 'none' && (
              <span className={`meta-chip stage-badge stage-${app.stage === 'oa_scheduled' ? 'oa' : app.stage === 'interview_scheduled' ? 'interview' : app.stage}`} style={{ textTransform: 'capitalize' }}>
                {app.stage === 'oa_scheduled' ? 'OA' : app.stage === 'interview_scheduled' ? 'Interview Scheduled' : app.stage === 'offered' ? 'Offered' : app.stage === 'rejected' ? 'Not Shortlisted' : app.stage === 'rejected_after_oa' ? 'OA • Rejected' : app.stage === 'rejected_after_interview' ? 'Interview • Rejected' : app.stage}
              </span>
            )}
            {app.opportunityType && app.opportunityType !== 'JOB_APPLICATION' && (
              <span className="meta-chip" style={{ textTransform: 'capitalize' }}>
                {app.opportunityType === 'HACKATHON' ? 'Hackathon' : app.opportunityType === 'WEBINAR' ? 'Webinar' : 'Event'}
              </span>
            )}
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

          {/* ── Shortlist Match Banner ── */}
          {app.isShortlisted && (
            <div className="modal-shortlist-banner">
              <div className="modal-shortlist-banner-icon-badge">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#059669" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="modal-shortlist-banner-content">
                <div className="modal-shortlist-banner-title">You appear to be shortlisted</div>
                <div className="modal-shortlist-banner-sub">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#10b981' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h8" />
                    <path d="M8 17h8" />
                    <path d="M10 9H8" />
                  </svg>
                  <span>Found in <strong>{app.shortlistSummary?.matchedFilename || "placement spreadsheet"}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* ── Key Opportunity Details Section (All Extracted Fields) ── */}
          {(() => {
            const details = displayFieldRows.length > 0 ? displayFieldRows : displayRowsFromFields;
            if (details.length === 0) return null;

            return (
              <div className="info-modal-section">
                <div className="info-modal-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #3b82f6)', flexShrink: 0 }}>
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <span>DRIVE & OPPORTUNITY DETAILS</span>
                  </div>
                </div>
                <div className="info-modal-section-body">
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '10px 14px',
                    padding: '12px 14px',
                    background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))'
                  }}>
                    {details.map(({ label, value }, idx) => (
                      <div key={idx} style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          color: 'var(--text-secondary, #94a3b8)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: '2px'
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: '13.5px',
                          fontWeight: '600',
                          color: 'var(--text-primary, #f8fafc)',
                          wordBreak: 'break-word',
                          lineHeight: '1.4'
                        }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Attachments Section ── */}
          {realAttachments.length > 0 && (
            <div className="info-modal-section">
              <div className="info-modal-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #3b82f6)', flexShrink: 0 }}>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>ATTACHMENTS ({realAttachments.length})</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </div>
              <div className="info-modal-section-body">
                {attachmentError && (
                  <div className="attachment-error">{attachmentError}</div>
                )}
                {attachmentToast && (
                  <div className="attachment-toast">
                    <span>{attachmentToast.message}</span>
                    <button
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '13px', padding: '0 2px' }}
                      onClick={() => setAttachmentToast(null)}
                    >
                      &times;
                    </button>
                  </div>
                )}
                {messageGroups.map((group, gi) => (
                  <div key={gi}>
                    {hasMultipleEmails && group.event && (
                      <div className="attachment-source-label">
                        FROM: {(group.event.title || group.event.subject || (() => {
                          const d = new Date(group.event.date);
                          return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()} email`;
                        })()).toUpperCase()}
                      </div>
                    )}
                    {group.items.map((att, ai) => {
                      const { icon, cls } = getFileIcon(att.mimeType, att.filename);
                      const sizeStr = formatSize(att.size);
                      const typeLabel = getTypeLabel(att.mimeType, att.filename);
                      const isViewing = attachmentActionId === `${att.attachmentId}_view`;
                      const isDownloading = attachmentActionId === `${att.attachmentId}_download`;
                      const isAnyActionLoading = !!attachmentActionId;

                      return (
                        <div key={ai} className="attachment-row">
                          <div className={`attachment-icon ${cls}`}>{icon}</div>
                          <div className="attachment-info">
                            <div className="attachment-filename" title={att.filename}>
                              {att.filename || 'Unnamed attachment'}
                            </div>
                            <div className="attachment-meta">
                              {typeLabel}{sizeStr ? ` • ${sizeStr}` : ''}
                            </div>
                          </div>
                          <div className="attachment-actions">
                            <button
                              className="attachment-btn attachment-btn-view"
                              disabled={isAnyActionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAttachmentAction(app._id, att.attachmentId, att.filename, att.mimeType, 'view');
                              }}
                              title="Preview attachment in browser"
                            >
                              {isViewing ? (
                                <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '11px' }}>↻</span> View</>
                              ) : (
                                <>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                  <span>View</span>
                                </>
                              )}
                            </button>
                            <button
                              className="attachment-btn attachment-btn-download"
                              disabled={isAnyActionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAttachmentAction(app._id, att.attachmentId, att.filename, att.mimeType, 'download');
                              }}
                              title="Download attachment to device"
                            >
                              {isDownloading ? (
                                <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '11px' }}>↻</span> Saving…</>
                              ) : (
                                <>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>Download</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Application Timeline */}
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                            <div className="timeline-title" style={{ fontSize: '14.5px', fontWeight: '600', color: '#0f172a' }}>
                              {ev.title || ev.classification || 'Email Notification'}
                            </div>
                            {ev.messageId && (
                              <button
                                className="timeline-reparse-btn"
                                title="Reparse this specific email with AI"
                                disabled={reparsingId === `${app._id}_${ev.messageId}` || reparsingId === app._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReparseEmail(app._id, ev.messageId);
                                  }}
                                style={{
                                  background: 'rgba(37, 99, 235, 0.06)',
                                  border: '1px solid rgba(37, 99, 235, 0.2)',
                                  borderRadius: '5px',
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  color: '#2563eb',
                                  cursor: (reparsingId === `${app._id}_${ev.messageId}` || reparsingId === app._id) ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '11px',
                                  transform: reparsingId === `${app._id}_${ev.messageId}` ? 'rotate(360deg)' : 'none',
                                  transition: reparsingId === `${app._id}_${ev.messageId}` ? 'transform 1s linear infinite' : 'none'
                                }}>
                                  ↻
                                </span>
                                {reparsingId === `${app._id}_${ev.messageId}` ? "Reparsing..." : "Reparse"}
                              </button>
                            )}
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
}
