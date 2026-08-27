"use strict";

export default function TermsPage() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: "100vh",
      padding: "60px 24px",
      background: "radial-gradient(circle at 50% 50%, #090d16 0%, #02040a 100%)",
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      color: "#f8fafc",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "680px",
        background: "rgba(17, 24, 39, 0.7)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid #1f2937",
        borderRadius: "20px",
        padding: "48px 40px",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", borderBottom: "1px solid #374151", paddingBottom: "16px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ffffff", margin: 0 }}>Terms of Service</h1>
          <a href="/" style={{
            fontSize: "14px",
            color: "#14b8a6",
            textDecoration: "none",
            fontWeight: "600",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px"
          }}>
            ← Back to Login
          </a>
        </div>

        <div style={{ fontSize: "14.5px", color: "#94a3b8", lineHeight: "1.7", display: "flex", flexDirection: "column", gap: "24px" }}>
          <p>
            <strong>Last Updated:</strong> August 27, 2026
          </p>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>1. Acceptance of Terms</h2>
            <p>
              By accessing or using Email Tracker ("the Service"), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use the application.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>2. Description of Service</h2>
            <p>
              Email Tracker is an automated productivity application that ingests, parses, and organizes placement-related communications from authorized Gmail accounts, synchronizes relevant recruitment events to Google Calendar, and delivers push notifications to students.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>3. Account Authorization & Linked Inboxes</h2>
            <p style={{ marginBottom: "12px" }}>
              To use Email Tracker, you authorize the Service to access your Gmail and Google Calendar via Google OAuth 2.0.
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>You represent that you own and are authorized to connect all primary and linked secondary Gmail accounts.</li>
              <li>You may unlink secondary accounts or disconnect the Service at any time through application settings or Google Account permissions.</li>
              <li>You are responsible for maintaining the security of your Google credentials and connected devices.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>4. AI Parsing & Shortlist Matching Disclaimer</h2>
            <p style={{ marginBottom: "12px" }}>
              Email Tracker utilizes state-of-the-art AI models (Gemma 4 31B and Nemotron 3.5 Lightning) and spreadsheet parsing algorithms to extract recruitment details and detect candidate shortlist status.
            </p>
            <p style={{ marginBottom: "12px" }}>
              <strong>Important Verification Notice:</strong> While we strive for high precision, AI models and automated spreadsheet extractors may occasionally misinterpret ambiguous notices or formatting. <strong>You are solely responsible for independently verifying all critical deadlines, eligibility requirements, assessment links, and interview schedules with the official communications sent by your institution or employer.</strong>
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>5. Acceptable Use Policy</h2>
            <p style={{ marginBottom: "12px" }}>
              You agree not to:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Use the Service for any unlawful purpose or in violation of institutional codes of conduct.</li>
              <li>Attempt to reverse-engineer, disrupt, or bypass rate limiters or security mechanisms of the Service.</li>
              <li>Connect accounts or student profiles that do not belong to you.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>6. Service Availability & Modifications</h2>
            <p>
              Email Tracker is provided on an "as is" and "as available" basis. We reserve the right to modify, upgrade, or temporarily suspend features (such as synchronizers, AI providers, or calendar sync) to perform maintenance or improve performance.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Email Tracker and its maintainers shall not be liable for any direct, indirect, incidental, or consequential damages resulting from missed application deadlines, parsing discrepancies, email delivery delays, or service interruptions.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>8. Termination</h2>
            <p>
              You may terminate your use of the Service at any time by deleting your account from the application settings. We reserve the right to suspend or revoke access to any user found violating these Terms.
            </p>
          </section>

          <section style={{ borderTop: "1px solid #374151", paddingTop: "24px", marginTop: "12px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>9. Contact Information</h2>
            <p>
              For any questions regarding these Terms of Service, please contact:
            </p>
            <p style={{ marginTop: "8px", fontWeight: "600", color: "#14b8a6" }}>
              Email: tejasholla23@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
