"use client";

import React, { useState } from "react";
import api from "../utils/api";

const CATEGORIES = [
  "Parsing / AI Extraction",
  "Missing Email / Application",
  "Google Calendar Sync",
  "UI / Visual Bug",
  "Feature Request",
  "Other",
];

export default function ReportIssueModal({ isOpen, onClose }) {
  const [category, setCategory] = useState("Parsing / AI Extraction");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Please enter a brief subject.");
      return;
    }
    if (!description.trim()) {
      setError("Please provide a description of the issue.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const metadata = includeDiagnostics
        ? {
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            screenResolution:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : "",
            appVersion: "1.0.0",
            theme:
              typeof document !== "undefined" &&
              document.documentElement.getAttribute("data-theme")
                ? document.documentElement.getAttribute("data-theme")
                : "dark",
          }
        : {};

      await api.post("/applications/report-issue", {
        category,
        subject: subject.trim(),
        description: description.trim(),
        metadata,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSubject("");
        setDescription("");
        setCategory("Parsing / AI Extraction");
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Failed to submit issue:", err);
      setError(
        err.response?.data?.message || "Failed to submit your report. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    if (loading) return;
    setError("");
    setSuccess(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={handleModalClose}
    >
      <div
        style={{
          background: "var(--card-bg, #181920)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "var(--text-primary, #ffffff)",
          animation: "scaleUp 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
                Report an Issue
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "var(--text-secondary, #9ca3af)",
                }}
              >
                Help us improve Email Tracker
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #9ca3af)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.08)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        {success ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(46, 213, 115, 0.15)",
                color: "#2ed573",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
              Report Received!
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--text-secondary, #9ca3af)",
                maxWidth: "340px",
                lineHeight: "1.5",
              }}
            >
              Thank you for helping us make Email Tracker better. We have logged
              your ticket and are investigating.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  fontSize: "13px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Category */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "600",
                  marginBottom: "6px",
                  color: "var(--text-secondary, #9ca3af)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Issue Type
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  background: "var(--input-bg, rgba(255, 255, 255, 0.04))",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "14px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option
                    key={cat}
                    value={cat}
                    style={{ background: "#1f2937", color: "#ffffff" }}
                  >
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "600",
                  marginBottom: "6px",
                  color: "var(--text-secondary, #9ca3af)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Application for Google is missing deadline"
                maxLength={200}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  background: "var(--input-bg, rgba(255, 255, 255, 0.04))",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "var(--text-secondary, #9ca3af)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Description
                </label>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-secondary, #9ca3af)",
                  }}
                >
                  {description.length}/3000
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe what happened, what you expected, or the steps to reproduce..."
                rows={4}
                maxLength={3000}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  background: "var(--input-bg, rgba(255, 255, 255, 0.04))",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "14px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Diagnostics Checkbox */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                color: "var(--text-secondary, #9ca3af)",
                cursor: "pointer",
                marginBottom: "20px",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Include diagnostic info (browser version, screen size) to help debug
            </label>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={handleModalClose}
                disabled={loading}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "transparent",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                  color: "var(--text-primary, #ffffff)",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "9px 20px",
                  borderRadius: "8px",
                  background: "#3b82f6",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
