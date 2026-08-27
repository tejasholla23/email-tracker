"use strict";

const config = {
  isAllowedEmail: (email) => {
    if (!email || typeof email !== "string") return false;
    const cleanEmail = email.trim().toLowerCase();
    
    // If ALLOWED_EMAILS is configured via environment variable, check that list first
    if (process.env.ALLOWED_EMAILS) {
      const allowed = process.env.ALLOWED_EMAILS.split(",").map(e => e.trim().toLowerCase());
      return allowed.includes(cleanEmail);
    }
    
    // Otherwise, allow any email ending with @msrit.edu
    return cleanEmail.endsWith("@msrit.edu");
  },
  ALLOWED_SENDERS: process.env.ALLOWED_SENDERS
    ? process.env.ALLOWED_SENDERS.split(",").map(s => s.trim().toLowerCase())
    : ["placement@msrit.edu", "dean.tap@msrit.edu", "escnp.46@gmail.com"],
  LLM_DELAY_MS: Number(process.env.LLM_DELAY_MS ?? process.env.GEMINI_DELAY_MS ?? 6500),
  MAX_EMAILS_PER_SYNC: Number(process.env.MAX_EMAILS_PER_SYNC ?? 10),
  NVIDIA_PRIMARY_MODEL: process.env.NVIDIA_PRIMARY_MODEL || process.env.NVIDIA_MODEL || "google/gemma-4-31b-it",
  NVIDIA_FALLBACK_MODEL: process.env.NVIDIA_FALLBACK_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || null,
  GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || "gmail-push-notifications",
  GMAIL_WEBHOOK_SECRET: process.env.GMAIL_WEBHOOK_SECRET || null,
  GMAIL_WEBHOOK_AUDIENCE: process.env.GMAIL_WEBHOOK_AUDIENCE || null,
  GMAIL_PUBSUB_SERVICE_ACCOUNT: process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT || null,
  GMAIL_PUBSUB_ENABLED: !!(
    process.env.GCP_PROJECT_ID &&
    process.env.GMAIL_WEBHOOK_AUDIENCE &&
    process.env.GOOGLE_CLIENT_ID
  ),
};

module.exports = config;
