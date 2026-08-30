"use client";

import React from "react";

export default function EditModal({
  showEditModal,
  setShowEditModal,
  handleEditSubmit,
  editFormError,
  editFormData,
  setEditFormData,
  editCustomLabel,
  setEditCustomLabel,
  editCustomValue,
  setEditCustomValue,
  editSubmitting,
}) {
  if (!showEditModal) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
      <div className="modal-content edit-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal-header modal-header">
          <h3 className="modal-title">Edit Details</h3>
          <button className="modal-close" onClick={() => setShowEditModal(false)}>&times;</button>
        </div>

        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
          <div className="edit-modal-body">
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
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Recruitment Stage</label>
                <select
                  className="form-select"
                  value={editFormData.stage || "none"}
                  onChange={(e) => setEditFormData({ ...editFormData, stage: e.target.value })}
                >
                  <option value="none">None / Initial</option>
                  <option value="oa_scheduled">Online Assessment (OA)</option>
                  <option value="interview_scheduled">Interview Scheduled</option>
                  <option value="offered">Offered / Selected</option>
                  <option value="rejected">Not Shortlisted</option>
                  <option value="rejected_after_oa">Rejected (after OA)</option>
                  <option value="rejected_after_interview">Rejected (after Interview)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Application Status</label>
                <select
                  className="form-select"
                  value={editFormData.status || "new"}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                >
                  <option value="new">New</option>
                  <option value="applied">Applied</option>
                  <option value="done">Marked Done</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Opportunity Type</label>
                <select
                  className="form-select"
                  value={editFormData.opportunityType || "JOB_APPLICATION"}
                  onChange={(e) => setEditFormData({ ...editFormData, opportunityType: e.target.value })}
                >
                  <option value="JOB_APPLICATION">Placement Drive</option>
                  <option value="HACKATHON">Hackathon</option>
                  <option value="WEBINAR">Webinar / Talk</option>
                  <option value="OTHER_PLACEMENT_EVENT">Other College Event</option>
                </select>
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
          </div>

          <div className="edit-modal-footer">
            <button type="button" className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={editSubmitting}>{editSubmitting ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
