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
              When you sign in using your Google account, we request permission to access your Gmail inbox through Google's OAuth authentication system.
            </p>
            <p style={{ marginBottom: "12px" }}>
              Depending on the permissions you grant, we may access:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Your Google account email address</li>
              <li>Gmail messages required to identify placement and recruitment emails</li>
              <li>Metadata associated with those emails, such as the sender, subject, and received date</li>
            </ul>
            <p>
              Email Tracker only processes email content necessary to identify placement opportunities and extract relevant application details.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>2. How We Use Your Information</h2>
            <p style={{ marginBottom: "12px" }}>
              The information obtained from Gmail is used solely to provide the core functionality of Email Tracker, including:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Detecting placement-related emails</li>
              <li>Extracting information such as:
                <ul style={{ paddingLeft: "20px", marginTop: "4px", listStyleType: "circle" }}>
                  <li>Company name</li>
                  <li>Job role</li>
                  <li>Deadlines</li>
                  <li>Eligibility criteria</li>
                  <li>Application links</li>
                  <li>Interview or assessment schedules</li>
                </ul>
              </li>
              <li>Organizing this information into your personal dashboard</li>
              <li>Maintaining the status of your applications</li>
              <li>Synchronizing newly received placement emails</li>
            </ul>
            <p>
              We do not use your Gmail data for advertising, marketing, profiling, or any unrelated purpose.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>3. Data Storage</h2>
            <p style={{ marginBottom: "12px" }}>
              To provide the application's functionality, we store certain information associated with your account, including:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Extracted application information</li>
              <li>Application status (such as New, Applied, or Done)</li>
              <li>Personal notes you choose to add</li>
              <li>Google OAuth tokens required to maintain your authorized connection</li>
              <li>Basic account information such as your email address</li>
            </ul>
            <p>
              Raw email content is processed only as necessary to extract placement-related information.
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
              Email Tracker accesses Gmail only with your explicit authorization.
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
