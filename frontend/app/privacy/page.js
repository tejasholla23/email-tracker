"use strict";

export default function PrivacyPage() {
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
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ffffff", margin: 0 }}>Privacy Policy</h1>
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

          <p>
            Email Tracker respects your privacy and is committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, and the choices you have regarding your data when using our application.
          </p>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>1. Information We Collect</h2>
            <p style={{ marginBottom: "12px" }}>
              When you sign in using your Google account and authorize scopes, we request permission to access your Gmail inbox and Google Calendar (if enabled) through Google's OAuth authentication system.
            </p>
            <p style={{ marginBottom: "12px" }}>
              Depending on the permissions you grant, we may collect and store:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Your Google account email address.</li>
              <li>Gmail messages matching specific criteria (e.g. from your placement department) to extract application details.</li>
              <li>Google Calendar event identifiers and hashes required to synchronize and update placement deadlines directly on your primary calendar.</li>
              <li>Metadata associated with those emails and calendar events (such as timestamps, sender info, event fingerprints, and hashes).</li>
            </ul>
            <p>
              Email Tracker only processes email and calendar content necessary to identify placement opportunities, extract details, and maintain your calendar sync.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>2. How We Use Your Information</h2>
            <p style={{ marginBottom: "12px" }}>
              The information obtained from Google APIs is used solely to provide the core functionality of Email Tracker, including:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Detecting placement-related emails and parsing their contents using AI (Google's Gemma 4 31B via NVIDIA NIM API).</li>
              <li>Extracting information such as company names, roles, deadlines, eligibility criteria, and application links.</li>
              <li>Organizing this information into your personal dashboard.</li>
              <li>Synchronizing placement deadlines and events with your primary Google Calendar (if enabled).</li>
              <li>Maintaining the status of your applications and handling soft-deletions safely.</li>
              <li>Synchronizing newly received placement emails.</li>
            </ul>
            <p>
              We do not use your Gmail or Calendar data for advertising, marketing, profiling, or any unrelated purpose.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>3. Data Storage</h2>
            <p style={{ marginBottom: "12px" }}>
              To provide the application's functionality, we store certain information associated with your account in our MongoDB database, including:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Extracted application details and statuses.</li>
              <li>Personal notes you choose to add.</li>
              <li>Google OAuth credentials (access/refresh tokens) required to maintain authorized API connection.</li>
              <li>Google Calendar event IDs and hashes for synchronization integrity.</li>
              <li>Basic account details such as your email address.</li>
            </ul>
            <p>
              Raw email content is processed temporarily only as necessary to perform parsing and extraction.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>4. Data Sharing</h2>
            <p style={{ marginBottom: "12px" }}>
              We do not sell, rent, or share your personal information or Gmail data with advertisers or third parties.
            </p>
            <p>
              Information obtained through Google APIs is used only to provide and improve the user-facing features of Email Tracker.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>5. Data Security</h2>
            <p style={{ marginBottom: "12px" }}>
              We implement reasonable technical and organizational measures to help protect your information from unauthorized access, modification, disclosure, or loss.
            </p>
            <p>
              While we strive to protect your data, no method of electronic storage or transmission over the Internet can be guaranteed to be completely secure.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>6. Your Choices</h2>
            <p style={{ marginBottom: "12px" }}>
              You remain in control of your information at all times.
            </p>
            <p style={{ marginBottom: "12px" }}>
              You may:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Disconnect your Google account by revoking Email Tracker's access through your Google Account settings.</li>
              <li>Delete your Email Tracker account from within the application.</li>
              <li>Request that your stored application data be removed.</li>
            </ul>
            <p>
              Deleting your account removes your application data and associated authentication information from our active systems.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>7. Google API Services</h2>
            <p style={{ marginBottom: "12px" }}>
              Email Tracker accesses Gmail and Google Calendar only with your explicit authorization.
            </p>
            <p>
              Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>8. Changes to This Policy</h2>
            <p style={{ marginBottom: "12px" }}>
              We may update this Privacy Policy from time to time to reflect changes in the application or legal requirements.
            </p>
            <p>
              The "Last Updated" date at the top of this page will always indicate the most recent revision.
            </p>
          </section>

          <section style={{ borderTop: "1px solid #374151", paddingTop: "24px", marginTop: "12px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>9. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy or how your information is handled, please contact:
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
