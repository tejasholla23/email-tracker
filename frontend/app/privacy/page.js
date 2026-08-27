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
        WebkitBackdropFilter: "blur(16px)",
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
            <strong>Last Updated:</strong> August 27, 2026
          </p>

          <p>
            Email Tracker ("we", "our", or "the application") is committed to protecting your privacy and handling your data transparently. This Privacy Policy explains what information we access, how it is processed to deliver placement tracking features, and how you can manage or delete your data at any time.
          </p>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>1. Information We Access and Collect</h2>
            <p style={{ marginBottom: "12px" }}>
              When you sign in using Google OAuth and connect your primary or secondary linked Gmail accounts, we request authorization with minimal, necessary permissions:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li><strong>Google Account Information:</strong> Your email address and basic profile info to authenticate your account.</li>
              <li><strong>Gmail Messages & Attachments:</strong> Placement-related emails and circular attachments (such as PDF job descriptions and Excel candidate shortlist rosters) to extract recruitment details.</li>
              <li><strong>Google Calendar Data (Optional):</strong> If Calendar integration is enabled, we create and maintain placement event reminders and drive deadlines on your primary calendar.</li>
              <li><strong>Student Profile Data:</strong> Configurable student attributes (such as Candidate Name, USN / Roll Number, and target roles) used exclusively for local shortlist matching.</li>
              <li><strong>Web Push Tokens:</strong> Browser push subscriptions to deliver real-time notifications for drive deadlines and assessment alerts.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>2. How We Process and Use Your Information</h2>
            <p style={{ marginBottom: "12px" }}>
              Data accessed via Google APIs is used strictly to power the core functionality of Email Tracker:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li><strong>Dual-LLM AI Parsing:</strong> Converting unstructured placement emails into structured application records using Google Gemma 4 31B with automatic fallback to NVIDIA Nemotron 3.5 Lightning (via NVIDIA NIM API).</li>
              <li><strong>Spreadsheet Shortlist Detection:</strong> Inspecting attached candidate lists (`.xlsx`, `.xls`, `.csv`) in-memory during sync to determine if your name or USN appears on the shortlist.</li>
              <li><strong>Multi-Inbox Coordination:</strong> Synchronizing both your institutional and linked secondary accounts seamlessly without mixing credentials.</li>
              <li><strong>Automated Calendar Scheduling:</strong> Creating and updating calendar events for drive deadlines, online tests, PPTs, and interview schedules.</li>
              <li><strong>Real-Time Delivery:</strong> Sending browser notifications when new placement drives or shortlist announcements arrive.</li>
            </ul>
            <p>
              We do <strong>not</strong> sell, rent, monetize, or use your email content for advertising, marketing, or training commercial AI models.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>3. Data Storage and Retention</h2>
            <p style={{ marginBottom: "12px" }}>
              We store only structured metadata necessary to maintain your timeline in a secure MongoDB Atlas cluster:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li>Parsed application records (Company, Role, Deadline, Status, Eligibility, and Form Links).</li>
              <li>Encrypted and hashed OAuth credentials (short-lived access tokens and SHA-256 hashed refresh tokens).</li>
              <li>Calendar synchronization hashes to prevent duplicate entries.</li>
            </ul>
            <p>
              <strong>Zero-Storage Attachment Policy:</strong> Email attachments and spreadsheets are processed strictly in-memory during sync for metadata and shortlist matching; raw files and resumes are never stored permanently on the server disk.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>4. Third-Party Services</h2>
            <p style={{ marginBottom: "12px" }}>
              Email Tracker integrates with trusted industry providers solely to deliver service features:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li><strong>Google Cloud & Gmail APIs:</strong> For OAuth 2.0 authentication, mailbox change notifications (Pub/Sub), and calendar sync.</li>
              <li><strong>NVIDIA NIM API:</strong> For structured LLM extraction (Gemma 4 31B & Nemotron 3.5 Lightning) with strict privacy agreements.</li>
              <li><strong>MongoDB Atlas:</strong> For secure, encrypted database storage with strict per-tenant scoping.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>5. Your Rights and Data Control</h2>
            <p style={{ marginBottom: "12px" }}>
              You maintain complete ownership and control over your data:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "12px", listStyleType: "disc" }}>
              <li><strong>Unlink Accounts:</strong> Disconnect any linked secondary Gmail account at any time with one click.</li>
              <li><strong>Toggle Features:</strong> Enable or disable Google Calendar synchronization and Web Push alerts independently.</li>
              <li><strong>Account Deletion:</strong> Permanently delete your account from Settings, which removes all stored applications, notes, credentials, and sync history.</li>
              <li><strong>Revoke Permissions:</strong> Revoke Email Tracker's access directly via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: "#14b8a6" }}>Google Account Security</a> settings.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>6. Google API Limited Use Disclosure</h2>
            <p>
              Email Tracker's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "#14b8a6" }}>Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
          </section>

          <section style={{ borderTop: "1px solid #374151", paddingTop: "24px", marginTop: "12px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#ffffff", marginBottom: "12px" }}>7. Contact Us</h2>
            <p>
              If you have any questions or requests regarding your data and privacy, please contact:
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
