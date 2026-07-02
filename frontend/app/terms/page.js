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
        webkitBackdropFilter: "blur(16px)",
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
            Last Updated: July 2, 2026
          </p>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>1. Acceptance of These Terms</h2>
            <p>
              By creating an account or using Email Tracker, you agree to these Terms. If you do not agree, please do not use the application.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>2. Eligibility and Account Access</h2>
            <p>
              Access to Email Tracker may be restricted to users from approved educational institutions. We reserve the right to accept or reject registrations based on supported email domains.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>3. Acceptable Use</h2>
            <p style={{ marginBottom: "12px" }}>
              You are responsible for:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Maintaining the security of your Google account</li>
              <li>Ensuring information you provide is accurate</li>
              <li>Complying with applicable laws and institutional policies while using Email Tracker</li>
            </ul>
            <p>
              You agree not to misuse the service or interfere with the operation or security of the service.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>4. Google Account Authorization</h2>
            <p>
              Your use of Email Tracker is also governed by our Privacy Policy, which explains how we collect, use, and protect your information. Email Tracker accesses Gmail only with your explicit authorization through Google's OAuth authentication system.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>5. Service Availability</h2>
            <p>
              Email Tracker is provided on an "as is" and "as available" basis. We may modify, suspend, or discontinue parts of the service at any time without prior notice.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>6. Intellectual Property</h2>
            <p>
              Email Tracker — including its design, branding, code, and user interface — belongs to its developer. You may not copy, redistribute, or create derivative works from the application without permission. Your data remains yours.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>7. Disclaimer of Warranties</h2>
            <p style={{ marginBottom: "12px" }}>
              While we strive for accuracy and reliability, we do not guarantee that:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Email synchronization will always succeed</li>
              <li>Extracted information will always be complete or accurate</li>
              <li>The service will be available without interruption</li>
            </ul>
            <p>
              Users should always verify important deadlines and application details using official communications from employers or their institution.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Email Tracker shall not be responsible for any loss arising from reliance on information displayed by the application, including missed deadlines, inaccurate parsing results, or service interruptions.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate access to Email Tracker if these Terms are violated or if continued access would compromise the security or operation of the service.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time to reflect changes to the service, legal requirements, or operational practices. Continued use of Email Tracker after updated Terms become effective constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section style={{ borderTop: "1px solid #374151", paddingTop: "24px", marginTop: "12px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>11. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
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
