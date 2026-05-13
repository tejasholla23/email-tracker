import React from "react";

export default function ApplicationCard({ app, onMarkDone, onRemove, onOpenInfo }) {
  const companyInitials = (app.company || "U").substring(0, 1).toUpperCase();
  const isDone = (app.status || "").toLowerCase() === "done";
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "Unknown date";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getUrgencyClass = (iso) => {
    if (!iso) return "";
    const deadline = new Date(iso);
    const today = new Date();
    today.setHours(0,0,0,0);
    return deadline <= today ? "urgent" : "";
  };

  return (
    <div className={`app-card ${isDone ? "is-done" : ""}`}>
      <div className="app-header">
        <div className="app-info">
          <div className="company-logo-container">
            {app.companyInfo?.logo || app.companyInfo?.domain ? (
              <img 
                src={app.companyInfo?.logo || `https://www.google.com/s2/favicons?domain=${app.companyInfo?.domain}&sz=128`} 
                alt={app.company}
                className="company-logo-img"
                onError={(e) => {
                  const domain = app.companyInfo?.domain || `${app.company.toLowerCase().replace(/\s+/g, '')}.com`;
                  if (!e.target.src.includes('google.com')) {
                    e.target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
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
            <div className="role-title">{app.role || "Unknown Role"}</div>
            <div className="company-name">{app.company || "Unknown Company"}</div>
          </div>
        </div>
        <span className={`status-badge status-${(app.status || "applied").toLowerCase()}`}>
          {app.status || "applied"}
        </span>
      </div>

      {app.companyInfo?.shortDescription && (
        <div className="company-short-desc" onClick={() => onOpenInfo(app)}>
          {app.companyInfo.shortDescription}
        </div>
      )}

      <div className="app-footer">
        <div className="email-info">
          <span>{formatDate(app.date || app.createdAt)}</span>
        </div>
        {app.deadlineText && (
          <div className={`deadline-badge ${getUrgencyClass(app.deadlineISO)}`}>
            <span>Deadline: {app.deadlineText}</span>
          </div>
        )}
      </div>

      {!isDone && (
        <div className="card-actions">
          <button className="card-btn card-btn-done" onClick={() => onMarkDone(app._id)}>
            ✓ Done
          </button>
          <button className="card-btn card-btn-remove" onClick={() => onRemove(app._id)}>
            🗑 Remove
          </button>
          {app.link && (
            <a href={app.link} target="_blank" rel="noopener noreferrer" className="card-btn card-btn-apply">
              🔗 Apply
            </a>
          )}
        </div>
      )}
    </div>
  );
}
