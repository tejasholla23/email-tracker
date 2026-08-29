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
      const hasApplied = app.hasApplied || status === "applied" || stage === "oa_scheduled" || stage === "interview_scheduled" || stage === "offered";
      if (hasApplied) {
        appliedCount++;
      }

      if (status === "done") {
        doneCount++;
      }

      // Derived No Response (>20 days inactive after apply, not done, not rejected, not offered)
      if (status === "applied" && ageInDays >= 20 && stage !== "offered" && stage !== "rejected" && stage !== "interview_scheduled") {
        noResponseCount++;
      }

      // New / Unmarked
      if (status === "new") {
        newUnmarkedCount++;
      }

      // Stages (Hierarchy: Offer > Interview > OA)
      if (stage === "offered") {
        offerCount++;
        interviewCount++;
        oaCount++;
      } else if (stage === "interview_scheduled") {
        interviewCount++;
        oaCount++;
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
      { label: "Applied", count: Math.max(0, metrics.appliedCount - metrics.noResponseCount - metrics.offerCount), color: "#14b8a6" },
      { label: "Awaiting Response", count: metrics.noResponseCount, color: "#f59e0b" },
      { label: "New / Unmarked", count: metrics.newUnmarkedCount, color: "#2563eb" },
      { label: "Marked Done", count: metrics.doneCount, color: "#475569" },
      { label: "Offers / Selected", count: metrics.offerCount, color: "#10b981" },
      { label: "Rejected", count: metrics.rejectedCount, color: "#ef4444" },
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
                {/* Stage 1: Received */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">1. Drives Received</span>
                    <span className="funnel-step-count">{metrics.placementCount}</span>
                  </div>
                  <div className="funnel-bar-track">
                    <div className="funnel-bar-fill step-1" style={{ width: "100%" }}>
                      <span className="funnel-bar-percent">100%</span>
                    </div>
                  </div>
                </div>

                {/* Stage 2: Applied */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">2. Applied</span>
                    <div className="funnel-step-count-group">
                      <span className="funnel-step-count">{metrics.appliedCount}</span>
                      {metrics.notAppliedCount > 0 && (
                        <span className="funnel-dropoff">(-{metrics.notAppliedCount})</span>
                      )}
                    </div>
                  </div>
                  <div className="funnel-bar-track">
                    <div
                      className="funnel-bar-fill step-2"
                      style={{ width: `${Math.max(metrics.appliedCount > 0 ? 12 : 0, metrics.applyRate)}%` }}
                    >
                      {metrics.applyRate > 0 && (
                        <span className="funnel-bar-percent">{metrics.applyRate}%</span>
                      )}
                    </div>
                    {metrics.applyRate === 0 && (
                      <span className="funnel-zero-pill step-2-zero">0%</span>
                    )}
                  </div>
                </div>

                {/* Stage 3: Online Assessment */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">3. Online Assessment (OA)</span>
                    <div className="funnel-step-count-group">
                      <span className="funnel-step-count">{metrics.oaCount}</span>
                      {metrics.appliedCount > metrics.oaCount && (
                        <span className="funnel-dropoff">(-{metrics.appliedCount - metrics.oaCount})</span>
                      )}
                    </div>
                  </div>
                  <div className="funnel-bar-track">
                    <div
                      className="funnel-bar-fill step-3"
                      style={{
                        width: `${Math.max(metrics.oaCount > 0 ? 12 : 0, metrics.placementCount > 0 ? (metrics.oaCount / metrics.placementCount) * 100 : 0)}%`,
                      }}
                    >
                      {metrics.oaRate > 0 && (
                        <span className="funnel-bar-percent">{metrics.oaRate}%</span>
                      )}
                    </div>
                    {metrics.oaRate === 0 && (
                      <span className="funnel-zero-pill step-3-zero">0%</span>
                    )}
                  </div>
                </div>

                {/* Stage 4: Interview */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">4. Interview Scheduled</span>
                    <div className="funnel-step-count-group">
                      <span className="funnel-step-count">{metrics.interviewCount}</span>
                      {metrics.oaCount > metrics.interviewCount && (
                        <span className="funnel-dropoff">(-{metrics.oaCount - metrics.interviewCount})</span>
                      )}
                    </div>
                  </div>
                  <div className="funnel-bar-track">
                    <div
                      className="funnel-bar-fill step-4"
                      style={{
                        width: `${Math.max(metrics.interviewCount > 0 ? 12 : 0, metrics.placementCount > 0 ? (metrics.interviewCount / metrics.placementCount) * 100 : 0)}%`,
                      }}
                    >
                      {metrics.interviewRate > 0 && (
                        <span className="funnel-bar-percent">{metrics.interviewRate}%</span>
                      )}
                    </div>
                    {metrics.interviewRate === 0 && (
                      <span className="funnel-zero-pill step-4-zero">0%</span>
                    )}
                  </div>
                </div>

                {/* Stage 5: Offer */}
                <div className="funnel-step">
                  <div className="funnel-step-meta">
                    <span className="funnel-step-name">5. Offers / Selected</span>
                    <div className="funnel-step-count-group">
                      <span className="funnel-step-count">{metrics.offerCount}</span>
                      {metrics.interviewCount > metrics.offerCount && (
                        <span className="funnel-dropoff">(-{metrics.interviewCount - metrics.offerCount})</span>
                      )}
                    </div>
                  </div>
                  <div className="funnel-bar-track">
                    <div
                      className="funnel-bar-fill step-5"
                      style={{
                        width: `${Math.max(metrics.offerCount > 0 ? 12 : 0, metrics.placementCount > 0 ? (metrics.offerCount / metrics.placementCount) * 100 : 0)}%`,
                      }}
                    >
                      {metrics.offerRate > 0 && (
                        <span className="funnel-bar-percent">{metrics.offerRate}%</span>
                      )}
                    </div>
                    {metrics.offerRate === 0 && (
                      <span className="funnel-zero-pill step-5-zero">0%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footnote */}
              <div className="chart-footnote">
                <svg className="footnote-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Percentages show conversion from the previous stage.</span>
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
          gap: 22px;
          color: #f8fafc;
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
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
          padding: 13px 14px;
          display: flex;
          flex-direction: column;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }

        .kpi-card.kpi-drives {
          border: 1.5px solid rgba(37, 99, 235, 0.5);
        }
        .kpi-card.kpi-applied {
          border: 1.5px solid rgba(20, 184, 166, 0.5);
        }
        .kpi-card.kpi-oa {
          border: 1.5px solid rgba(139, 92, 246, 0.5);
        }
        .kpi-card.kpi-interviews {
          border: 1.5px solid rgba(217, 119, 6, 0.5);
        }
        .kpi-card.kpi-offers {
          border: 1.5px solid rgba(16, 185, 129, 0.5);
        }
        .kpi-card.kpi-no-response {
          border: 1.5px solid rgba(220, 38, 38, 0.5);
        }

        .kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
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
          font-size: 28px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1.1;
          margin-bottom: 4px;
        }

        .kpi-subtext {
          font-size: 10.5px;
          color: #94a3b8;
          margin-top: auto;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Charts Row */
        .analytics-charts-row {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 960px) {
          .analytics-charts-row {
            grid-template-columns: 1fr;
          }
        }

        .analytics-chart-card {
          background: #070e1e;
          border: 1px solid #172338;
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }

        .chart-card-header {
          margin-bottom: 22px;
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
          gap: 16px;
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

        .funnel-bar-fill.step-1 { background: #2563eb; }
        .funnel-bar-fill.step-2 { background: #0d9488; }
        .funnel-bar-fill.step-3 { background: #8b5cf6; }
        .funnel-bar-fill.step-4 { background: #f59e0b; }
        .funnel-bar-fill.step-5 { background: #10b981; }

        .funnel-zero-pill {
          margin-left: 6px;
          padding: 1px 7px;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          color: #ffffff;
        }

        .step-2-zero { background: #0d9488; }
        .step-3-zero { background: #8b5cf6; }
        .step-4-zero { background: #f59e0b; }
        .step-5-zero { background: #10b981; }

        /* Footnote */
        .chart-footnote {
          margin-top: 24px;
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
          gap: 28px;
          flex-wrap: wrap;
          flex: 1;
        }

        .donut-svg-container {
          width: 175px;
          height: 175px;
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
          font-size: 30px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
        }

        .donut-center-label {
          font-size: 9.5px;
          font-weight: 700;
          color: #94a3b8;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .donut-legend {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 180px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          font-size: 13px;
          color: #f1f5f9;
          padding: 2px 4px;
          border-radius: 6px;
          transition: background 0.15s ease;
          cursor: pointer;
        }

        .legend-item.hovered {
          background: rgba(255, 255, 255, 0.05);
        }

        .legend-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          margin-right: 10px;
          flex-shrink: 0;
        }

        .legend-label {
          flex: 1;
          font-weight: 500;
          color: #e2e8f0;
        }

        .legend-count {
          font-weight: 700;
          color: #ffffff;
          margin-right: 12px;
        }

        .legend-percent {
          font-size: 12px;
          color: #94a3b8;
          width: 32px;
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
      `}</style>
    </div>
  );
}
