import React from "react";

export default function CompanyInfoModal({ isOpen, onClose, app }) {
  if (!isOpen || !app || !app.companyInfo) return null;
  const info = app.companyInfo;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content info-modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {info.logo && <img src={info.logo} style={{ width: 32, height: 32, objectFit: 'contain' }} alt="" />}
            <h3 className="modal-title">{app.company}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="info-description">
          {info.description || info.shortDescription || "No description available."}
        </div>

        <div className="info-grid">
          <div className="info-item">
            <div className="info-item-label">Industry</div>
            <div className="info-item-value">{info.industry || "Technology"}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Website</div>
            <div className="info-item-value">
              {info.domain ? (
                <a href={`https://${info.domain}`} target="_blank" rel="noreferrer" style={{ color: '#0d9488', textDecoration: 'none' }}>
                  {info.domain}
                </a>
              ) : "N/A"}
            </div>
          </div>
        </div>

        {(app.programRoles || app.programDuration || app.programStipend) && (
          <div className="program-details" style={{ marginTop: 24, padding: 16, background: 'rgba(13, 148, 136, 0.05)', borderRadius: 12, border: 'none' }}>
            <div className="info-item-label" style={{ marginBottom: 12 }}>Program Details</div>
            {app.programRoles && <div className="program-detail"><span className="program-detail-label">Roles</span><span className="program-detail-value">{app.programRoles}</span></div>}
            {app.programDuration && <div className="program-detail"><span className="program-detail-label">Duration</span><span className="program-detail-value">{app.programDuration}</span></div>}
            {app.programStipend && <div className="program-detail"><span className="program-detail-label">Stipend</span><span className="program-detail-value">{app.programStipend}</span></div>}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-submit" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
