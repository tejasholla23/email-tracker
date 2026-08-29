"use client";

import React, { useState, useMemo } from "react";

export default function AnalyticsView({ applications = [] }) {
  const [timeFilter, setTimeFilter] = useState("all"); // "all" | "30d" | "60d"
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "placement" | "events"
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  // Helper to extract the most recent email/update timestamp for an application
  const getLatestAppTime = (app) => {
    let maxTime = app.date ? new Date(app.date).getTime() : 0;
    if (app.events && Array.isArray(app.events)) {
      for (const ev of app.events) {
        if (ev.date) {
          const t = new Date(ev.date).getTime();
          if (t > maxTime) maxTime = t;
        }
      }
    }
    if (!maxTime && app.createdAt) {
      maxTime = new Date(app.createdAt).getTime();
    }
    return maxTime || Date.now();
  };

  // ── Filter Applications by Time and Category ───────────────────────────────
  const filteredApps = useMemo(() => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    return applications.filter((app) => {
      // 1. Time Filter
      const appTime = getLatestAppTime(app);
      const ageInDays = (now - appTime) / DAY_MS;

      if (timeFilter === "30d" && ageInDays > 30) return false;
      if (timeFilter === "60d" && ageInDays > 60) return false;

      // 2. Category Filter
      const isPlacement = !app.opportunityType || app.opportunityType === "JOB_APPLICATION";
      if (categoryFilter === "placement" && !isPlacement) return false;
      if (categoryFilter === "events" && isPlacement) return false;

      return true;
    });
  }, [applications, timeFilter, categoryFilter]);

  // ── Compute Key Metrics & Pipeline Counts ──────────────────────────────────
  const metrics = useMemo(() => {
    const total = filteredApps.length;
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    let placementCount = 0;
    let nonPlacementCount = 0;
    let appliedCount = 0;
    let doneCount = 0;
    let newUnmarkedCount = 0;
    let noResponseCount = 0;
    let oaCount = 0;
    let interviewCount = 0;
    let offerCount = 0;
    let rejectedCount = 0;
    let upcomingDeadlinesCount = 0;

    filteredApps.forEach((app) => {
      const isPlacement = !app.opportunityType || app.opportunityType === "JOB_APPLICATION";
      if (isPlacement) {
        placementCount++;
      } else {
        nonPlacementCount++;
      }

      const status = (app.status || "new").toLowerCase();
      const stage = (app.stage || "none").toLowerCase();
      const latestTime = getLatestAppTime(app);
      const ageInDays = (now - latestTime) / DAY_MS;

      // Applied / In-Progress status: persistent hasApplied flag, or currently applied / in advanced stages
      const hasApplied = app.hasApplied || status === "applied" || ["oa_scheduled", "interview_scheduled", "offered", "rejected_after_oa", "rejected_after_interview"].includes(stage);
      if (hasApplied) {
        appliedCount++;
      }

      if (status === "done") {
        doneCount++;
      }

      // Derived No Response (>20 days inactive after apply, not done, not rejected, not offered)
      if (status === "applied" && ageInDays >= 20 && !["offered", "rejected", "rejected_after_oa", "rejected_after_interview", "interview_scheduled"].includes(stage)) {
        noResponseCount++;
      }

      // New / Unmarked
      if (status === "new") {
        newUnmarkedCount++;
      }

      // Stages (Hierarchy: Offer > Interview > OA + Rejection tracking)
      if (stage === "offered") {
        offerCount++;
        interviewCount++;
        oaCount++;
      } else if (stage === "interview_scheduled") {
        interviewCount++;
        oaCount++;
      } else if (stage === "rejected_after_interview") {
        interviewCount++;
        oaCount++;
        rejectedCount++;
      } else if (stage === "rejected_after_oa") {
        oaCount++;
        rejectedCount++;
      } else if (stage === "oa_scheduled" || app.isShortlisted) {
        oaCount++;
      }

      if (stage === "rejected") {
        rejectedCount++;
      }

      // Upcoming Deadlines (within 7 days)
      if (app.deadlineISO && status !== "done" && status !== "applied") {
        const deadlineDate = new Date(app.deadlineISO).getTime();
        const diffDays = (deadlineDate - now) / DAY_MS;
        if (diffDays >= 0 && diffDays <= 7) {
          upcomingDeadlinesCount++;
        }
      }
    });

    const notAppliedCount = Math.max(0, placementCount - appliedCount);
    const applyRate = placementCount > 0 ? Math.round((appliedCount / placementCount) * 100) : 0;
    const oaRate = appliedCount > 0 ? Math.round((oaCount / appliedCount) * 100) : 0;
    const interviewRate = oaCount > 0 ? Math.round((interviewCount / oaCount) * 100) : (appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0);
    const offerRate = interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : (appliedCount > 0 ? Math.round((offerCount / appliedCount) * 100) : 0);

    return {
      total,
      placementCount,
      nonPlacementCount,
      appliedCount,
      notAppliedCount,
      doneCount,
      newUnmarkedCount,
      noResponseCount,
      oaCount,
      interviewCount,
      offerCount,
      rejectedCount,
      upcomingDeadlinesCount,
      applyRate,
      oaRate,
      interviewRate,
      offerRate,
    };
  }, [filteredApps]);

  // ── Donut Chart Data Calculation ───────────────────────────────────────────
  const donutData = useMemo(() => {
    const segments = [
      { label: "Applied", count: Math.max(0, metrics.appliedCount - metrics.noResponseCount - metrics.offerCount), color: "#0891b2" },
      { label: "Awaiting Response", count: metrics.noResponseCount, color: "#d97706" },
      { label: "New / Unmarked", count: metrics.newUnmarkedCount, color: "#2563eb" },
      { label: "Marked Done", count: metrics.doneCount, color: "#475569" },
      { label: "Offers / Selected", count: metrics.offerCount, color: "#059669" },
      { label: "Rejected", count: metrics.rejectedCount, color: "#be123c" },
    ].filter((s) => s.count > 0);

    const totalCount = segments.reduce((sum, s) => sum + s.count, 0);

    let cumulativeAngle = 0;
    const segmentsWithGeometry = segments.map((seg) => {
      const percentage = totalCount > 0 ? (seg.count / totalCount) * 100 : 0;
      const strokeDasharray = `${percentage} ${100 - percentage}`;
      const strokeDashoffset = -cumulativeAngle;
      cumulativeAngle += percentage;

      return {
        ...seg,
        percentage: Math.round(percentage),
        strokeDasharray,
        strokeDashoffset,
      };
    });

    return { segments: segmentsWithGeometry, totalCount };
  }, [metrics]);

  return (
    <div className="analytics-container">
      {/* Header & Filter Bar */}
      <div className="analytics-header">
        <div>
          <h1 className="analytics-title">Recruitment Analytics</h1>
        </div>

        <div className="analytics-controls">
          {/* Category Filter Tabs */}
          <div className="analytics-filter-group">
            <button
              className={`analytics-pill ${categoryFilter === "all" ? "active" : ""}`}
              onClick={() => setCategoryFilter("all")}
            >
              All Types
            </button>
            <button
              className={`analytics-pill ${categoryFilter === "placement" ? "active" : ""}`}
              onClick={() => setCategoryFilter("placement")}
            >
              Placements
            </button>
            <button
              className={`analytics-pill ${categoryFilter === "events" ? "active" : ""}`}
              onClick={() => setCategoryFilter("events")}
            >
              Hackathons & Events
            </button>
          </div>

          {/* Time Filter Select */}
          <div className="analytics-time-select-wrapper">
            <select
              className="analytics-time-select"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="30d">Last 1 month</option>
              <option value="60d">Last 2 months</option>
            </select>
            <svg className="analytics-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="analytics-empty-card">
          <div className="analytics-empty-icon">📊</div>
          <h3>No applications found for selected filters</h3>
          <p>Try switching the time window or category filter to view your recruitment metrics.</p>
          <button
            className="btn-primary"
            style={{ marginTop: "16px" }}
            onClick={() => {
              setTimeFilter("all");
              setCategoryFilter("all");
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="analytics-kpi-grid">
            <div className="kpi-card kpi-drives">
              <div className="kpi-header">
                <span className="kpi-label">RECRUITMENT DRIVES</span>
              </div>
              <div className="kpi-value">
                {categoryFilter === "events" ? metrics.nonPlacementCount : metrics.placementCount}
              </div>
              <div className="kpi-subtext">
                {metrics.nonPlacementCount > 0 && categoryFilter === "all" ? `Includes ${metrics.nonPlacementCount} events / hackathons` : "Total campus opportunities"}
              </div>
            </div>

            <div className="kpi-card kpi-applied">
              <div className="kpi-header">
                <span className="kpi-label">APPLIED</span>
              </div>
              <div className="kpi-value">{metrics.appliedCount}</div>
              <div className="kpi-subtext">{metrics.notAppliedCount} drives not applied for</div>
            </div>

            <div className="kpi-card kpi-oa">
              <div className="kpi-header">
                <span className="kpi-label">ONLINE ASSESSMENTS</span>
              </div>
              <div className="kpi-value">{metrics.oaCount}</div>
              <div className="kpi-subtext">{metrics.oaRate}% conversion from applied</div>
            </div>

            <div className="kpi-card kpi-interviews">
              <div className="kpi-header">
                <span className="kpi-label">INTERVIEWS</span>
              </div>
              <div className="kpi-value">{metrics.interviewCount}</div>
              <div className="kpi-subtext">{metrics.interviewRate}% reaching interview rounds</div>
            </div>

            <div className="kpi-card kpi-offers">
              <div className="kpi-header">
                <span className="kpi-label">OFFERS / SELECTED</span>
              </div>
              <div className="kpi-value">{metrics.offerCount}</div>
              <div className="kpi-subtext">{metrics.rejectedCount} terminal rejections tracked</div>
            </div>

            <div className="kpi-card kpi-no-response">
              <div className="kpi-header">
                <span className="kpi-label">AWAITING RESPONSE</span>
              </div>
              <div className="kpi-value">{metrics.noResponseCount}</div>
              <div className="kpi-subtext">
                {metrics.upcomingDeadlinesCount > 0
                  ? `${metrics.upcomingDeadlinesCount} upcoming deadlines within 7 days`
                  : "No response since >20 days"}
              </div>
            </div>
          </div>

          {/* Charts Row: Distribution & Donut */}
          <div className="analytics-charts-row">
            {/* Recruitment Distribution */}
            <div className="analytics-chart-card funnel-card">
              <div className="chart-card-header">
                <h3>Recruitment Distribution</h3>
                <span className="chart-subtitle">Progression across placement hiring stages</span>
              </div>

              <div className="funnel-container">
                {/* 1. Applied */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">Applied</span>
                    <span className="funnel-step-count">{metrics.appliedCount}</span>
                  </div>
                  <div className="funnel-bar-track">
                    <div
                      className="funnel-bar-fill step-applied"
                      style={{ width: `${Math.max(metrics.appliedCount > 0 ? 12 : 0, metrics.applyRate)}%` }}
                    >
                      {metrics.applyRate > 0 && (
                        <span className="funnel-bar-percent">{metrics.applyRate}%</span>
                      )}
                    </div>
                    {metrics.applyRate === 0 && (
                      <span className="funnel-zero-pill step-applied-zero">0%</span>
                    )}
                  </div>
                </div>

                {/* 2. Not Applied */}
                {(() => {
                  const notAppliedRate = metrics.placementCount > 0 ? Math.round((metrics.notAppliedCount / metrics.placementCount) * 100) : 0;
                  return (
                    <div className="funnel-step">
                      <div className="funnel-step-meta">
                        <span className="funnel-step-name">Not Applied</span>
                        <span className="funnel-step-count">{metrics.notAppliedCount}</span>
                      </div>
                      <div className="funnel-bar-track">
                        <div
                          className="funnel-bar-fill step-not-applied"
                          style={{ width: `${Math.max(metrics.notAppliedCount > 0 ? 12 : 0, notAppliedRate)}%` }}
                        >
                          {notAppliedRate > 0 && (
                            <span className="funnel-bar-percent">{notAppliedRate}%</span>
                          )}
                        </div>
                        {notAppliedRate === 0 && (
                          <span className="funnel-zero-pill step-not-applied-zero">0%</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Shortlisted for OA */}
                {(() => {
                  const oaRateOfTotal = metrics.placementCount > 0 ? Math.round((metrics.oaCount / metrics.placementCount) * 100) : 0;
                  return (
                    <div className="funnel-step">
                      <div className="funnel-step-meta">
                        <span className="funnel-step-name">Shortlisted for OA</span>
                        <span className="funnel-step-count">{metrics.oaCount}</span>
                      </div>
                      <div className="funnel-bar-track">
                        <div
                          className="funnel-bar-fill step-oa"
                          style={{ width: `${Math.max(metrics.oaCount > 0 ? 12 : 0, oaRateOfTotal)}%` }}
                        >
                          {oaRateOfTotal > 0 && (
                            <span className="funnel-bar-percent">{oaRateOfTotal}%</span>
                          )}
                        </div>
                        {oaRateOfTotal === 0 && (
                          <span className="funnel-zero-pill step-oa-zero">0%</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Shortlisted for Interview */}
                {(() => {
                  const interviewRateOfTotal = metrics.placementCount > 0 ? Math.round((metrics.interviewCount / metrics.placementCount) * 100) : 0;
                  return (
                    <div className="funnel-step">
                      <div className="funnel-step-meta">
                        <span className="funnel-step-name">Shortlisted for Interview</span>
                        <span className="funnel-step-count">{metrics.interviewCount}</span>
                      </div>
                      <div className="funnel-bar-track">
                        <div
                          className="funnel-bar-fill step-interview"
                          style={{ width: `${Math.max(metrics.interviewCount > 0 ? 12 : 0, interviewRateOfTotal)}%` }}
                        >
                          {interviewRateOfTotal > 0 && (
                            <span className="funnel-bar-percent">{interviewRateOfTotal}%</span>
                          )}
                        </div>
                        {interviewRateOfTotal === 0 && (
                          <span className="funnel-zero-pill step-interview-zero">0%</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 5. Rejected */}
                {(() => {
                  const rejectedRateOfTotal = metrics.placementCount > 0 ? Math.round((metrics.rejectedCount / metrics.placementCount) * 100) : 0;
                  return (
                    <div className="funnel-step">
                      <div className="funnel-step-meta">
                        <span className="funnel-step-name">Rejected</span>
                        <span className="funnel-step-count">{metrics.rejectedCount}</span>
                      </div>
                      <div className="funnel-bar-track">
                        <div
                          className="funnel-bar-fill step-rejected"
                          style={{ width: `${Math.max(metrics.rejectedCount > 0 ? 12 : 0, rejectedRateOfTotal)}%` }}
                        >
                          {rejectedRateOfTotal > 0 && (
                            <span className="funnel-bar-percent">{rejectedRateOfTotal}%</span>
                          )}
                        </div>
                        {rejectedRateOfTotal === 0 && (
                          <span className="funnel-zero-pill step-rejected-zero">0%</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footnote */}
              <div className="chart-footnote">
                <svg className="footnote-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Percentages indicate the proportion of total campus opportunities.</span>
              </div>
            </div>

            {/* Status Distribution Donut Chart */}
            <div className="analytics-chart-card donut-card">
              <div className="chart-card-header">
                <h3>Status Distribution</h3>
                <span className="chart-subtitle">Breakdown of opportunities by current active state.</span>
              </div>

              <div className="donut-chart-wrapper">
                <div className="donut-svg-container">
                  <svg viewBox="0 0 42 42" className="donut-svg">
                    <circle className="donut-hole" cx="21" cy="21" r="15.91549430918954" fill="transparent"></circle>
                    <circle className="donut-ring" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#172338" strokeWidth="5.5"></circle>

                    {donutData.segments.map((seg, idx) => (
                      <circle
                        key={idx}
                        className="donut-segment"
                        cx="21"
                        cy="21"
                        r="15.91549430918954"
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth={hoveredDonutSegment === seg.label ? "6.8" : "5.5"}
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        onMouseEnter={() => setHoveredDonutSegment(seg.label)}
                        onMouseLeave={() => setHoveredDonutSegment(null)}
                        style={{
                          transition: "stroke-width 0.2s ease",
                          cursor: "pointer",
                        }}
                      ></circle>
                    ))}
                  </svg>

                  <div className="donut-center-text">
                    <span className="donut-center-value">
                      {hoveredDonutSegment
                        ? donutData.segments.find((s) => s.label === hoveredDonutSegment)?.count || donutData.totalCount
                        : donutData.totalCount}
                    </span>
                    <span className="donut-center-label">
                      {hoveredDonutSegment ? hoveredDonutSegment.toUpperCase() : "TOTAL OPPORTUNITIES"}
                    </span>
                  </div>
                </div>

                <div className="donut-legend">
                  {donutData.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className={`legend-item ${hoveredDonutSegment === seg.label ? "hovered" : ""}`}
                      onMouseEnter={() => setHoveredDonutSegment(seg.label)}
                      onMouseLeave={() => setHoveredDonutSegment(null)}
                    >
                      <span className="legend-dot" style={{ backgroundColor: seg.color }}></span>
                      <span className="legend-label">{seg.label}</span>
                      <span className="legend-count">{seg.count}</span>
                      <span className="legend-percent">{seg.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footnote */}
              <div className="chart-footnote">
                <svg className="footnote-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Statuses reflect the latest state of each opportunity.</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Embedded Component Styling scoped to analytics */}
      <style jsx>{`
        .analytics-container {
          padding: 0 0 32px 0;
          display: flex;
          flex-direction: column;
          gap: 32px;
          color: #f8fafc;
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 4px;
        }

        .analytics-title {
          font-family: 'Manrope', sans-serif;
          font-size: 30px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          line-height: 1.2;
        }

        .analytics-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .analytics-filter-group {
          display: flex;
          background: #0b1329;
          border: 1px solid #1e293b;
          border-radius: 9px;
          padding: 3px;
          gap: 2px;
        }

        .analytics-pill {
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .analytics-pill:hover {
          color: #f1f5f9;
        }

        .analytics-pill.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .analytics-time-select-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .analytics-time-select {
          padding: 7px 32px 7px 14px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 9px;
          border: 1px solid #1e293b;
          background: #0b1329;
          color: #f8fafc;
          cursor: pointer;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
        }

        .analytics-select-chevron {
          position: absolute;
          right: 12px;
          color: #94a3b8;
          pointer-events: none;
        }

        /* KPI Cards Grid */
        .analytics-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
        }

        @media (max-width: 1200px) {
          .analytics-kpi-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 680px) {
          .analytics-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .kpi-card {
          background: #070e1e;
          border-radius: 12px;
          padding: 16px 16px;
          min-height: 108px;
          display: flex;
          flex-direction: column;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }

        .kpi-card.kpi-drives {
          border: 1.5px solid rgba(37, 99, 235, 0.45);
        }
        .kpi-card.kpi-applied {
          border: 1.5px solid rgba(8, 145, 178, 0.45);
        }
        .kpi-card.kpi-oa {
          border: 1.5px solid rgba(99, 102, 241, 0.45);
        }
        .kpi-card.kpi-interviews {
          border: 1.5px solid rgba(217, 119, 6, 0.45);
        }
        .kpi-card.kpi-offers {
          border: 1.5px solid rgba(5, 150, 105, 0.45);
        }
        .kpi-card.kpi-no-response {
          border: 1.5px solid rgba(190, 18, 60, 0.45);
        }

        .kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .kpi-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .kpi-value {
          font-size: 30px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1.1;
          margin-bottom: 6px;
        }

        .kpi-subtext {
          font-size: 11px;
          color: #94a3b8;
          margin-top: auto;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Charts Row */
        .analytics-charts-row {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 24px;
        }

        @media (max-width: 960px) {
          .analytics-charts-row {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }

        .analytics-chart-card {
          background: #070e1e;
          border: 1px solid #172338;
          border-radius: 14px;
          padding: 26px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }

        .chart-card-header {
          margin-bottom: 26px;
        }

        .chart-card-header h3 {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .chart-subtitle {
          font-size: 12.5px;
          color: #94a3b8;
          display: block;
          margin-top: 4px;
        }

        /* Funnel / Distribution */
        .funnel-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
        }

        .funnel-step {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .funnel-step-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13.5px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .funnel-step-name {
          color: #f8fafc;
        }

        .funnel-step-count-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .funnel-step-count {
          font-weight: 700;
          color: #f8fafc;
        }

        .funnel-dropoff {
          font-size: 12px;
          color: #ef4444;
          font-weight: 600;
        }

        .funnel-bar-track {
          height: 24px;
          background: #0c1830;
          border-radius: 6px;
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
        }

        .funnel-bar-fill {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 10px;
          border-radius: 6px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .funnel-bar-percent {
          font-size: 11.5px;
          font-weight: 700;
          color: #ffffff;
        }

        .funnel-bar-fill.step-applied { background: #0891b2; }
        .funnel-bar-fill.step-not-applied { background: #3b4861; }
        .funnel-bar-fill.step-oa { background: #6366f1; }
        .funnel-bar-fill.step-interview { background: #d97706; }
        .funnel-bar-fill.step-rejected { background: #be123c; }

        .funnel-zero-pill {
          margin-left: 6px;
          padding: 1px 7px;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          color: #ffffff;
        }

        .step-applied-zero { background: #0891b2; }
        .step-not-applied-zero { background: #3b4861; }
        .step-oa-zero { background: #6366f1; }
        .step-interview-zero { background: #d97706; }
        .step-rejected-zero { background: #be123c; }

        /* Footnote */
        .chart-footnote {
          margin-top: 30px;
          background: rgba(11, 21, 40, 0.6);
          border: 1px solid #172338;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: #94a3b8;
        }

        .footnote-icon {
          width: 16px;
          height: 16px;
          color: #3b82f6;
          flex-shrink: 0;
        }

        /* Donut Chart */
        .donut-chart-wrapper {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
          flex: 1;
        }

        .donut-svg-container {
          width: 215px;
          height: 215px;
          position: relative;
          flex-shrink: 0;
          margin: 0 auto;
        }

        .donut-svg {
          transform: rotate(-90deg);
          width: 100%;
          height: 100%;
        }

        .donut-center-text {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          text-align: center;
          padding: 0 10px;
        }

        .donut-center-value {
          font-size: 34px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
        }

        .donut-center-label {
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .donut-legend {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 9px;
          min-width: 150px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          font-size: 11.5px;
          color: #cbd5e1;
          padding: 2px 4px;
          border-radius: 6px;
          transition: background 0.15s ease;
          cursor: pointer;
        }

        .legend-item.hovered {
          background: rgba(255, 255, 255, 0.05);
        }

        .legend-dot {
          width: 7.5px;
          height: 7.5px;
          border-radius: 50%;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .legend-label {
          flex: 1;
          font-weight: 500;
          color: #cbd5e1;
        }

        .legend-count {
          font-weight: 700;
          color: #ffffff;
          margin-right: 8px;
          font-size: 12px;
        }

        .legend-percent {
          font-size: 11px;
          color: #94a3b8;
          width: 28px;
          text-align: right;
        }

        /* Empty State */
        .analytics-empty-card {
          background: #070e1e;
          border: 1px solid #172338;
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
          color: #f8fafc;
        }

        .analytics-empty-icon {
          font-size: 42px;
          margin-bottom: 12px;
        }

        .analytics-empty-card h3 {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 6px 0;
        }

        .analytics-empty-card p {
          font-size: 14px;
          color: #94a3b8;
          margin: 0;
        }

        /* Responsive Styles */
        @media (max-width: 1200px) {
          .analytics-kpi-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 960px) {
          .analytics-charts-row {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }

        @media (max-width: 768px) {
          .analytics-container {
            gap: 18px;
          }

          .analytics-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .analytics-title {
            font-size: 24px;
          }

          .analytics-controls {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .analytics-filter-group {
            width: 100%;
          }

          .analytics-pill {
            flex: 1;
            text-align: center;
            padding: 7px 6px;
            font-size: 12px;
          }

          .analytics-time-select-wrapper {
            width: 100%;
          }

          .analytics-time-select {
            width: 100%;
          }

          .analytics-chart-card {
            padding: 18px 16px;
          }

          .chart-card-header {
            margin-bottom: 16px;
          }

          .chart-card-header h3 {
            font-size: 17px;
          }

          .donut-chart-wrapper {
            flex-direction: column;
            gap: 20px;
          }

          .donut-legend {
            width: 100%;
            min-width: 100%;
            gap: 10px;
          }
        }

        @media (max-width: 680px) {
          .analytics-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }

        @media (max-width: 480px) {
          .analytics-container {
            gap: 16px;
          }

          .analytics-title {
            font-size: 22px;
          }

          .analytics-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }

          .kpi-card {
            padding: 12px 10px;
            min-height: 94px;
            border-radius: 10px;
          }

          .kpi-label {
            font-size: 9.5px;
          }

          .kpi-value {
            font-size: 24px;
            margin-bottom: 4px;
          }

          .kpi-subtext {
            font-size: 9.5px;
            line-height: 1.2;
          }

          .analytics-pill {
            padding: 6px 3px;
            font-size: 11px;
          }

          .analytics-chart-card {
            padding: 16px 12px;
            border-radius: 12px;
          }

          .funnel-step {
            gap: 4px;
          }

          .funnel-step-meta {
            font-size: 12px;
          }

          .funnel-step-count {
            font-size: 12px;
          }

          .funnel-dropoff {
            font-size: 11px;
          }

          .funnel-bar-track {
            height: 22px;
          }

          .funnel-bar-percent {
            font-size: 10px;
          }

          .donut-svg-container {
            width: 175px;
            height: 175px;
          }

          .donut-center-value {
            font-size: 28px;
          }

          .donut-center-label {
            font-size: 8.5px;
          }

          .legend-item {
            font-size: 12px;
            padding: 3px 2px;
          }

          .legend-dot {
            width: 8px;
            height: 8px;
            margin-right: 8px;
          }

          .legend-count {
            margin-right: 8px;
          }

          .legend-percent {
            font-size: 11px;
            width: 28px;
          }

          .chart-footnote {
            margin-top: 18px;
            font-size: 11px;
            padding: 8px 10px;
            gap: 8px;
          }

          .footnote-icon {
            width: 14px;
            height: 14px;
          }
        }
      `}</style>
    </div>
  );
}
