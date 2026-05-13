import React from "react";

export default function AddApplicationModal({ isOpen, onClose, formData, setFormData, onSubmit, submitting, error }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">Add Application</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        {error && <div className="form-error">{error}</div>}
        
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Google"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Job Role</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. SDE Intern"
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Application Date</label>
            <input 
              type="date" 
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
