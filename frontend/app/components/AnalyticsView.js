"use client";

import React, { useState, useMemo, useEffect } from "react";

export default function AnalyticsView({ applications = [] }) {
  const [timeFilter, setTimeFilter] = useState("all"); // "all" | "7d" | "30d" | "60d"
  const [categoryFilter, setCategoryFilter] = useState("placement"); // "placement" | "events"
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  // Restore saved filter preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedTime = localStorage.getItem("analytics_timeFilter");
      if (savedTime && ["all", "7d", "30d", "60d"].includes(savedTime)) {
        setTimeFilter(savedTime);
      }
      const savedCategory = localStorage.getItem("analytics_categoryFilter");
      if (savedCategory && ["placement", "events"].includes(savedCategory)) {
        setCategoryFilter(savedCategory);
      } else {
        setCategoryFilter("placement");
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  const handleTimeFilterChange = (val) => {
    setTimeFilter(val);
    try {
      localStorage.setItem("analytics_timeFilter", val);
    } catch (e) {}
  };

  const handleCategoryFilterChange = (val) => {
    setCategoryFilter(val);
    try {
      localStorage.setItem("analytics_categoryFilter", val);
    } catch (e) {}
  };

  const handleResetFilters = () => {
    handleTimeFilterChange("all");
    handleCategoryFilterChange("placement");
  };

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

      if (timeFilter === "7d" && ageInDays > 7) return false;
      if (timeFilter === "30d" && ageInDays > 30) return false;
      if (timeFilter === "60d" && ageInDays > 60) return false;

      // 2. Category Filter (Placement vs Hackathons & Others)
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

    // Placement counts
    let placementCount = 0;
    let placementAppliedCount = 0;
    let oaCount = 0;
    let interviewCount = 0;
    let offerCount = 0;
    let rejectedCount = 0;
    let noResponseCount = 0;

    // Mutually exclusive status breakdown for Placement Donut Chart
    let donutPlacementOffers = 0;
    let donutPlacementRejected = 0;
    let donutPlacementDone = 0;
    let donutPlacementAwaitingResponse = 0;
    let donutPlacementApplied = 0;
    let donutPlacementNew = 0;

    // Non-placement (Hackathons & Others) counts
    let nonPlacementCount = 0;
    let eventsAppliedCount = 0;
    let eventsShortlistedCount = 0;
    let eventsRejectedCount = 0;
    let eventsFinishedCount = 0;
    let eventsNoResponseCount = 0;

    // Mutually exclusive status breakdown for Hackathons & Others Donut Chart
    let donutEventsFinished = 0;
    let donutEventsRejected = 0;
    let donutEventsShortlisted = 0;
    let donutEventsApplied = 0;
    let donutEventsNotApplied = 0;

    let upcomingDeadlinesCount = 0;

    filteredApps.forEach((app) => {
      const isPlacement = !app.opportunityType || app.opportunityType === "JOB_APPLICATION";
      const status = (app.status || "new").toLowerCase();
      const stage = (app.stage || "none").toLowerCase();
      const latestTime = getLatestAppTime(app);
      const ageInDays = (now - latestTime) / DAY_MS;

      const isFinished = status === "done" || status === "finished" || stage === "finished" || !!app.isFinished;
      const isRejected = stage === "rejected" || stage.startsWith("rejected") || status === "rejected" || !!app.isRejected || (app.classification && /rejection|rejected/i.test(app.classification));
      const isShortlisted = !isRejected && (!!app.isShortlisted || stage === "shortlisted" || stage === "oa_scheduled" || stage === "interview_scheduled" || stage === "offered" || (app.classification && /shortlist/i.test(app.classification)));
      const hasApplied = !!app.hasApplied || status === "applied" || isShortlisted || isRejected || isFinished || (stage && stage !== "none");
      const isNoResponse = (status === "applied" || hasApplied) && !isFinished && !isRejected && !isShortlisted && ageInDays >= 20;

      if (isPlacement) {
        placementCount++;
        if (hasApplied) placementAppliedCount++;
        if (isNoResponse) noResponseCount++;

        // Cumulative stage milestones for placement funnel & KPI cards
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

        // Mutually exclusive partition for Placement Donut Chart
        if (stage === "offered") {
          donutPlacementOffers++;
        } else if (["rejected", "rejected_after_oa", "rejected_after_interview"].includes(stage)) {
          donutPlacementRejected++;
        } else if (status === "done") {
          donutPlacementDone++;
        } else if (isNoResponse) {
          donutPlacementAwaitingResponse++;
        } else if (hasApplied || status === "applied") {
          donutPlacementApplied++;
        } else {
          donutPlacementNew++;
        }
      } else {
        // Non-placement (Hackathons & Others)
        nonPlacementCount++;

        if (hasApplied) eventsAppliedCount++;
        if (isShortlisted) eventsShortlistedCount++;
        if (isRejected) eventsRejectedCount++;
        if (isFinished) eventsFinishedCount++;
        if (isNoResponse) eventsNoResponseCount++;

        // Mutually exclusive partition for Hackathons & Others Donut Chart
        if (isFinished) {
          donutEventsFinished++;
        } else if (isRejected) {
          donutEventsRejected++;
        } else if (isShortlisted) {
          donutEventsShortlisted++;
        } else if (hasApplied || status === "applied") {
          donutEventsApplied++;
        } else {
          donutEventsNotApplied++;
        }
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

    const placementNotAppliedCount = Math.max(0, placementCount - placementAppliedCount);
    const eventsNotAppliedCount = Math.max(0, nonPlacementCount - eventsAppliedCount);

    const applyRate = placementCount > 0 ? Math.round((placementAppliedCount / placementCount) * 100) : 0;
    const oaRate = placementAppliedCount > 0 ? Math.round((oaCount / placementAppliedCount) * 100) : 0;
    const interviewRate = oaCount > 0 ? Math.round((interviewCount / oaCount) * 100) : (placementAppliedCount > 0 ? Math.round((interviewCount / placementAppliedCount) * 100) : 0);
    const offerRate = interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : (placementAppliedCount > 0 ? Math.round((offerCount / placementAppliedCount) * 100) : 0);

    const eventsShortlistedRate = eventsAppliedCount > 0 ? Math.round((eventsShortlistedCount / eventsAppliedCount) * 100) : 0;
    const eventsFinishedRate = nonPlacementCount > 0 ? Math.round((eventsFinishedCount / nonPlacementCount) * 100) : 0;

    return {
      total,
      // Placement Metrics
      placementCount,
      placementAppliedCount,
      placementNotAppliedCount,
      oaCount,
      interviewCount,
      offerCount,
      rejectedCount,
      noResponseCount,
      applyRate,
      oaRate,
      interviewRate,
      offerRate,
      // Placement Donut partition counts
      donutPlacementOffers,
      donutPlacementRejected,
      donutPlacementDone,
      donutPlacementAwaitingResponse,
      donutPlacementApplied,
      donutPlacementNew,
      // Events Metrics
      nonPlacementCount,
      eventsAppliedCount,
      eventsNotAppliedCount,
      eventsShortlistedCount,
      eventsRejectedCount,
      eventsFinishedCount,
      eventsNoResponseCount,
      eventsShortlistedRate,
      eventsFinishedRate,
      // Events Donut partition counts
      donutEventsFinished,
      donutEventsRejected,
      donutEventsShortlisted,
      donutEventsApplied,
      donutEventsNotApplied,
      // General
      upcomingDeadlinesCount,
    };
  }, [filteredApps]);

  // ── Donut Chart Data Calculation ───────────────────────────────────────────
  const donutData = useMemo(() => {
    const isEvents = categoryFilter === "events";
    const totalCount = isEvents ? metrics.nonPlacementCount : metrics.placementCount;

    const segments = isEvents
      ? [
          { label: "Applied", count: metrics.donutEventsApplied, color: "#0891b2" },
          { label: "Not applied", count: metrics.donutEventsNotApplied, color: "#64748b" },
          { label: "Shortlisted", count: metrics.donutEventsShortlisted, color: "#8b5cf6" },
          { label: "Rejected", count: metrics.donutEventsRejected, color: "#ef4444" },
          { label: "Finished", count: metrics.donutEventsFinished, color: "#10b981" },
        ].filter((s) => s.count > 0)
      : [
          { label: "Applied", count: metrics.donutPlacementApplied, color: "#0891b2" },
          { label: "Awaiting Response", count: metrics.donutPlacementAwaitingResponse, color: "#d97706" },
          { label: "New / Unmarked", count: metrics.donutPlacementNew, color: "#2563eb" },
          { label: "Marked Done", count: metrics.donutPlacementDone, color: "#64748b" },
          { label: "Offers / Selected", count: metrics.donutPlacementOffers, color: "#059669" },
          { label: "Rejected", count: metrics.donutPlacementRejected, color: "#be123c" },
        ].filter((s) => s.count > 0);

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
  }, [metrics, categoryFilter]);

  const isEvents = categoryFilter === "events";

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
              className={`analytics-pill ${categoryFilter === "placement" ? "active" : ""}`}
              onClick={() => handleCategoryFilterChange("placement")}
            >
              Placement
            </button>
            <button
              className={`analytics-pill ${categoryFilter === "events" ? "active" : ""}`}
              onClick={() => handleCategoryFilterChange("events")}
            >
              Hackathons & Others
            </button>
          </div>

          {/* Time Filter Select */}
          <div className="analytics-time-select-wrapper">
            <select
              className="analytics-time-select"
              value={timeFilter}
              onChange={(e) => handleTimeFilterChange(e.target.value)}
              aria-label="Select analytics time range"
            >
              <option value="all">All</option>
              <option value="7d">Last 1 week</option>
              <option value="30d">Last 1 month</option>
              <option value="60d">Last 2 months</option>
            </select>
            <svg className="analytics-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
            onClick={handleResetFilters}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="analytics-kpi-grid">
            {/* KPI 1: Drives / Total Events */}
            <div className="kpi-card kpi-drives">
              <div className="kpi-header">
                <span className="kpi-label">{isEvents ? "EVENTS & HACKATHONS" : "RECRUITMENT DRIVES"}</span>
              </div>
              <div className="kpi-value">
                {isEvents ? metrics.nonPlacementCount : metrics.placementCount}
              </div>
              <div className="kpi-subtext">
                {isEvents ? "Total hackathons & college events" : "Total campus opportunities"}
              </div>
            </div>

            {/* KPI 2: Applied */}
            <div className="kpi-card kpi-applied">
              <div className="kpi-header">
                <span className="kpi-label">APPLIED</span>
              </div>
              <div className="kpi-value">{isEvents ? metrics.eventsAppliedCount : metrics.placementAppliedCount}</div>
              <div className="kpi-subtext">
                {isEvents
                  ? `${metrics.eventsNotAppliedCount} events not applied for`
                  : `${metrics.placementNotAppliedCount} drives not applied for`}
              </div>
            </div>

            {/* KPI 3: OA (Placement) / Shortlisted (Events) */}
            <div className="kpi-card kpi-oa">
              <div className="kpi-header">
                <span className="kpi-label">{isEvents ? "SHORTLISTED" : "ONLINE ASSESSMENTS"}</span>
              </div>
              <div className="kpi-value">{isEvents ? metrics.eventsShortlistedCount : metrics.oaCount}</div>
              <div className="kpi-subtext">
                {isEvents
                  ? `${metrics.eventsShortlistedRate}% shortlisted from applied`
                  : `${metrics.oaRate}% conversion from applied`}
              </div>
            </div>

            {/* KPI 4: Interviews (Placement) / Finished (Events) */}
            <div className="kpi-card kpi-interviews">
              <div className="kpi-header">
                <span className="kpi-label">{isEvents ? "FINISHED" : "INTERVIEWS"}</span>
              </div>
              <div className="kpi-value">{isEvents ? metrics.eventsFinishedCount : metrics.interviewCount}</div>
              <div className="kpi-subtext">
                {isEvents
                  ? `${metrics.eventsFinishedRate}% marked finished`
                  : `${metrics.interviewRate}% reaching interview rounds`}
              </div>
            </div>

            {/* KPI 5: Offers (Placement) / Rejected (Events) */}
            <div className="kpi-card kpi-offers">
              <div className="kpi-header">
                <span className="kpi-label">{isEvents ? "REJECTED" : "OFFERS / SELECTED"}</span>
              </div>
              <div className="kpi-value">{isEvents ? metrics.eventsRejectedCount : metrics.offerCount}</div>
              <div className="kpi-subtext">
                {isEvents
                  ? `${metrics.eventsRejectedCount} rejections recorded`
                  : `${metrics.rejectedCount} terminal rejections tracked`}
              </div>
            </div>

            {/* KPI 6: Awaiting Response */}
            <div className="kpi-card kpi-no-response">
              <div className="kpi-header">
                <span className="kpi-label">AWAITING RESPONSE</span>
              </div>
              <div className="kpi-value">{isEvents ? metrics.eventsNoResponseCount : metrics.noResponseCount}</div>
              <div className="kpi-subtext">
                {metrics.upcomingDeadlinesCount > 0
                  ? `${metrics.upcomingDeadlinesCount} upcoming deadlines within 7 days`
                  : isEvents
                  ? "Applied with no update >20 days"
                  : "No response since >20 days"}
              </div>
            </div>
          </div>

          {/* Charts Row: Horizontal Bar Chart & Donut */}
          <div className="analytics-charts-row">
            {/* Horizontal Bar Chart (Recruitment Distribution / Event Stages) */}
            <div className="analytics-chart-card funnel-card">
              <div className="chart-card-header">
                <h3>{isEvents ? "Event Progression" : "Recruitment Distribution"}</h3>
                <span className="chart-subtitle">
                  {isEvents
                    ? "Progression across hackathons & event stages"
                    : "Progression across placement hiring stages"}
                </span>
              </div>

              <div className="funnel-container">
                {isEvents ? (
                  /* ── Hackathons & Others Horizontal Bar Chart: 5 Stages Only ── */
                  <>
                    {/* 1. Applied */}
                    {(() => {
                      const total = metrics.nonPlacementCount;
                      const rate = total > 0 ? Math.round((metrics.eventsAppliedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Applied</span>
                            <span className="funnel-step-count">{metrics.eventsAppliedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-applied"
                              style={{ width: `${Math.max(metrics.eventsAppliedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-applied-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 2. Not applied */}
                    {(() => {
                      const total = metrics.nonPlacementCount;
                      const rate = total > 0 ? Math.round((metrics.eventsNotAppliedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Not applied</span>
                            <span className="funnel-step-count">{metrics.eventsNotAppliedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-not-applied"
                              style={{ width: `${Math.max(metrics.eventsNotAppliedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-not-applied-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 3. Shortlisted */}
                    {(() => {
                      const total = metrics.nonPlacementCount;
                      const rate = total > 0 ? Math.round((metrics.eventsShortlistedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Shortlisted</span>
                            <span className="funnel-step-count">{metrics.eventsShortlistedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-shortlisted"
                              style={{ width: `${Math.max(metrics.eventsShortlistedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-shortlisted-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 4. Rejected */}
                    {(() => {
                      const total = metrics.nonPlacementCount;
                      const rate = total > 0 ? Math.round((metrics.eventsRejectedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Rejected</span>
                            <span className="funnel-step-count">{metrics.eventsRejectedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-rejected"
                              style={{ width: `${Math.max(metrics.eventsRejectedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-rejected-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 5. Finished */}
                    {(() => {
                      const total = metrics.nonPlacementCount;
                      const rate = total > 0 ? Math.round((metrics.eventsFinishedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Finished</span>
                            <span className="funnel-step-count">{metrics.eventsFinishedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-finished"
                              style={{ width: `${Math.max(metrics.eventsFinishedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-finished-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  /* ── Placement Horizontal Bar Chart ── */
                  <>
                    {/* 1. Applied */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.placementAppliedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Applied</span>
                            <span className="funnel-step-count">{metrics.placementAppliedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-applied"
                              style={{ width: `${Math.max(metrics.placementAppliedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-applied-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 2. Not Applied */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.placementNotAppliedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Not Applied</span>
                            <span className="funnel-step-count">{metrics.placementNotAppliedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-not-applied"
                              style={{ width: `${Math.max(metrics.placementNotAppliedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-not-applied-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 3. Shortlisted for OA */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.oaCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Shortlisted for OA</span>
                            <span className="funnel-step-count">{metrics.oaCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-oa"
                              style={{ width: `${Math.max(metrics.oaCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-oa-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 4. Shortlisted for Interview */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.interviewCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Shortlisted for Interview</span>
                            <span className="funnel-step-count">{metrics.interviewCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-interview"
                              style={{ width: `${Math.max(metrics.interviewCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-interview-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 5. Offers / Selected */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.offerCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Offers / Selected</span>
                            <span className="funnel-step-count">{metrics.offerCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-offers"
                              style={{ width: `${Math.max(metrics.offerCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-offers-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 6. Rejected */}
                    {(() => {
                      const total = metrics.placementCount;
                      const rate = total > 0 ? Math.round((metrics.rejectedCount / total) * 100) : 0;
                      return (
                        <div className="funnel-step">
                          <div className="funnel-step-meta">
                            <span className="funnel-step-name">Rejected</span>
                            <span className="funnel-step-count">{metrics.rejectedCount}</span>
                          </div>
                          <div className="funnel-bar-track">
                            <div
                              className="funnel-bar-fill step-rejected"
                              style={{ width: `${Math.max(metrics.rejectedCount > 0 ? 12 : 0, rate)}%` }}
                            >
                              {rate > 0 && <span className="funnel-bar-percent">{rate}%</span>}
                            </div>
                            {rate === 0 && <span className="funnel-zero-pill step-rejected-zero">0%</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Footnote */}
              <div className="chart-footnote">
                <svg className="footnote-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>
                  {isEvents
                    ? "Percentages indicate the proportion of total hackathons and events."
                    : "Percentages indicate the proportion of total campus opportunities."}
                </span>
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
                    <circle className="donut-ring" cx="21" cy="21" r="15.91549430918954" fill="transparent" strokeWidth="5.5"></circle>

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

      {/* Scoped CSS with complete Light Mode and Dark Mode support */}
      <style jsx>{`
        /* ── Base (Light Mode) Styling ── */
        .analytics-container {
          padding: 0 0 32px 0;
          display: flex;
          flex-direction: column;
          gap: 32px;
          color: var(--text-primary, #334155);
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
          font-family: 'Manrope', 'IBM Plex Sans', -apple-system, sans-serif;
          font-size: 28px;
          font-weight: 700;
          color: var(--text-heading, #0f172a);
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
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
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
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .analytics-pill:hover {
          color: #0f172a;
          background: rgba(0, 0, 0, 0.04);
        }

        .analytics-pill.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
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
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          cursor: pointer;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .analytics-time-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }

        .analytics-select-chevron {
          position: absolute;
          right: 12px;
          color: #64748b;
          pointer-events: none;
        }

        /* ── KPI Cards Grid ── */
        .analytics-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
        }

        .kpi-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 16px;
          min-height: 108px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        }

        .kpi-card.kpi-drives {
          border: 1.5px solid rgba(37, 99, 235, 0.35);
        }
        .kpi-card.kpi-applied {
          border: 1.5px solid rgba(8, 145, 178, 0.35);
        }
        .kpi-card.kpi-oa {
          border: 1.5px solid rgba(99, 102, 241, 0.35);
        }
        .kpi-card.kpi-interviews {
          border: 1.5px solid rgba(217, 119, 6, 0.35);
        }
        .kpi-card.kpi-offers {
          border: 1.5px solid rgba(5, 150, 105, 0.35);
        }
        .kpi-card.kpi-no-response {
          border: 1.5px solid rgba(190, 18, 60, 0.35);
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
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .kpi-value {
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
          margin-bottom: 6px;
        }

        .kpi-subtext {
          font-size: 11px;
          color: #64748b;
          margin-top: auto;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Charts Row ── */
        .analytics-charts-row {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 24px;
        }

        .analytics-chart-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .chart-card-header {
          margin-bottom: 24px;
        }

        .chart-card-header h3 {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .chart-subtitle {
          font-size: 12.5px;
          color: #64748b;
          display: block;
          margin-top: 4px;
        }

        /* ── Funnel / Horizontal Bar Chart ── */
        .funnel-container {
          display: flex;
          flex-direction: column;
          gap: 18px;
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
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }

        .funnel-step-name {
          color: #1e293b;
        }

        .funnel-step-count {
          font-weight: 700;
          color: #0f172a;
        }

        .funnel-bar-track {
          height: 24px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
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
          border-radius: 5px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .funnel-bar-percent {
          font-size: 11.5px;
          font-weight: 700;
          color: #ffffff;
        }

        .funnel-bar-fill.step-applied { background: #0891b2; }
        .funnel-bar-fill.step-not-applied { background: #64748b; }
        .funnel-bar-fill.step-oa { background: #6366f1; }
        .funnel-bar-fill.step-interview { background: #d97706; }
        .funnel-bar-fill.step-offers { background: #059669; }
        .funnel-bar-fill.step-rejected { background: #ef4444; }
        .funnel-bar-fill.step-shortlisted { background: #8b5cf6; }
        .funnel-bar-fill.step-finished { background: #10b981; }

        .funnel-zero-pill {
          margin-left: 6px;
          padding: 1px 7px;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          color: #ffffff;
        }

        .step-applied-zero { background: #0891b2; }
        .step-not-applied-zero { background: #64748b; }
        .step-oa-zero { background: #6366f1; }
        .step-interview-zero { background: #d97706; }
        .step-offers-zero { background: #059669; }
        .step-rejected-zero { background: #ef4444; }
        .step-shortlisted-zero { background: #8b5cf6; }
        .step-finished-zero { background: #10b981; }

        /* ── Footnote ── */
        .chart-footnote {
          margin-top: 24px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: #64748b;
        }

        .footnote-icon {
          width: 16px;
          height: 16px;
          color: #2563eb;
          flex-shrink: 0;
        }

        /* ── Donut Chart ── */
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

        .donut-ring {
          stroke: #e2e8f0;
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
          font-size: 32px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1;
        }

        .donut-center-label {
          font-size: 9px;
          font-weight: 700;
          color: #64748b;
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
          color: #334155;
          padding: 3px 6px;
          border-radius: 6px;
          transition: background 0.15s ease;
          cursor: pointer;
        }

        .legend-item:hover,
        .legend-item.hovered {
          background: rgba(0, 0, 0, 0.05);
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 8px;
          flex-shrink: 0;
        }

        .legend-label {
          flex: 1;
          font-weight: 500;
          color: #334155;
        }

        .legend-count {
          font-weight: 700;
          color: #0f172a;
          margin-right: 8px;
          font-size: 12px;
        }

        .legend-percent {
          font-size: 11px;
          color: #64748b;
          width: 28px;
          text-align: right;
        }

        /* ── Empty State ── */
        .analytics-empty-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
          color: #0f172a;
        }

        .analytics-empty-icon {
          font-size: 42px;
          margin-bottom: 12px;
        }

        .analytics-empty-card h3 {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 6px 0;
        }

        .analytics-empty-card p {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }

        /* ── Dark Mode Overrides ── */
        :global(.dark) .analytics-container {
          color: #f8fafc;
        }

        :global(.dark) .analytics-title {
          color: #f8fafc;
        }

        :global(.dark) .analytics-filter-group {
          background: #0b1329;
          border-color: #1e293b;
        }

        :global(.dark) .analytics-pill {
          color: #94a3b8;
        }

        :global(.dark) .analytics-pill:hover {
          color: #f1f5f9;
          background: rgba(255, 255, 255, 0.05);
        }

        :global(.dark) .analytics-pill.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        :global(.dark) .analytics-time-select {
          background: #0b1329;
          border-color: #1e293b;
          color: #f8fafc;
        }

        :global(.dark) .analytics-select-chevron {
          color: #94a3b8;
        }

        :global(.dark) .kpi-card {
          background: #070e1e;
          box-shadow: none;
        }

        :global(.dark) .kpi-card:hover {
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }

        :global(.dark) .kpi-card.kpi-drives {
          border-color: rgba(37, 99, 235, 0.45);
        }
        :global(.dark) .kpi-card.kpi-applied {
          border-color: rgba(8, 145, 178, 0.45);
        }
        :global(.dark) .kpi-card.kpi-oa {
          border-color: rgba(99, 102, 241, 0.45);
        }
        :global(.dark) .kpi-card.kpi-interviews {
          border-color: rgba(217, 119, 6, 0.45);
        }
        :global(.dark) .kpi-card.kpi-offers {
          border-color: rgba(5, 150, 105, 0.45);
        }
        :global(.dark) .kpi-card.kpi-no-response {
          border-color: rgba(190, 18, 60, 0.45);
        }

        :global(.dark) .kpi-label {
          color: #94a3b8;
        }

        :global(.dark) .kpi-value {
          color: #f8fafc;
        }

        :global(.dark) .kpi-subtext {
          color: #94a3b8;
        }

        :global(.dark) .analytics-chart-card {
          background: #070e1e;
          border-color: #172338;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }

        :global(.dark) .chart-card-header h3 {
          color: #f8fafc;
        }

        :global(.dark) .chart-subtitle {
          color: #94a3b8;
        }

        :global(.dark) .funnel-step-meta {
          color: #f1f5f9;
        }

        :global(.dark) .funnel-step-name {
          color: #f8fafc;
        }

        :global(.dark) .funnel-step-count {
          color: #f8fafc;
        }

        :global(.dark) .funnel-bar-track {
          background: #0c1830;
          border-color: transparent;
        }

        :global(.dark) .funnel-bar-fill.step-not-applied {
          background: #3b4861;
        }

        :global(.dark) .step-not-applied-zero {
          background: #3b4861;
        }

        :global(.dark) .funnel-bar-fill.step-rejected {
          background: #be123c;
        }

        :global(.dark) .step-rejected-zero {
          background: #be123c;
        }

        :global(.dark) .chart-footnote {
          background: rgba(11, 21, 40, 0.6);
          border-color: #172338;
          color: #94a3b8;
        }

        :global(.dark) .footnote-icon {
          color: #3b82f6;
        }

        :global(.dark) .donut-ring {
          stroke: #172338;
        }

        :global(.dark) .donut-center-value {
          color: #ffffff;
        }

        :global(.dark) .donut-center-label {
          color: #94a3b8;
        }

        :global(.dark) .legend-item {
          color: #cbd5e1;
        }

        :global(.dark) .legend-item:hover,
        :global(.dark) .legend-item.hovered {
          background: rgba(255, 255, 255, 0.05);
        }

        :global(.dark) .legend-label {
          color: #cbd5e1;
        }

        :global(.dark) .legend-count {
          color: #ffffff;
        }

        :global(.dark) .legend-percent {
          color: #94a3b8;
        }

        :global(.dark) .analytics-empty-card {
          background: #070e1e;
          border-color: #172338;
          color: #f8fafc;
        }

        :global(.dark) .analytics-empty-card h3 {
          color: #f8fafc;
        }

        :global(.dark) .analytics-empty-card p {
          color: #94a3b8;
        }

        /* ── Responsive Layout Breakpoints ── */
        @media (max-width: 1200px) {
          .analytics-kpi-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 960px) {
          .analytics-charts-row {
            grid-template-columns: 1fr;
            gap: 20px;
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
