# Email Tracker

A full stack application that syncs with your Gmail account to automatically extract, categorize, and track placement related emails on a centralized dashboard.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB
- **Frontend:** Next.js (React)
- **AI/Parsing:** Google Gemini API with deterministic regex fallbacks
- **Authentication:** Google OAuth2

## Features

- Syncs placement related emails from Gmail using OAuth2.
- Categorizes emails into jobs, hackathons, webinars, etc.
- Extracts structured information using Gemini, with regex based fallbacks when extraction fails.

## Project Structure

- `backend/` - API server, database models, background cron sync, and email parsers.
- `frontend/` - Web dashboard displaying categorized cards with buttons to apply, edit, delete and mark as done.

## Prerequisites

- Node.js (LTS recommended)
- npm
- MongoDB running locally (or a remote MongoDB URI)
- A Google Cloud Console project with OAuth credentials and Gmail API enabled
- A Gemini API Key

## Backend Setup

1. Open a terminal in `backend/`
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in `backend/` and populate it:

   ```env
   PORT=5000
   FRONTEND_URL=http://localhost:3000
   MONGO_URI=mongodb://127.0.0.1:27017/email-tracker
   
   # Google OAuth Credentials
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

   # Gemini API Key for LLM Parsing
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. Start backend:

   ```bash
   npm start
   ```
   *The backend runs on `http://localhost:5000`*

## Frontend Setup

1. Open a terminal in `frontend/`
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start frontend:

   ```bash
   npm run dev
   ```
   *The frontend runs on `http://localhost:3000`*

## How to Run

Use two terminals:
- **Terminal 1:** Run backend (`npm start` in `backend/`)
- **Terminal 2:** Run frontend (`npm run dev` in `frontend/`)

## Using the App

1. **Login & Authenticate:** Navigate to `http://localhost:5000/auth/google` (or click "Connect Gmail" on the frontend) to grant read-only access to your Gmail.
2. **Dashboard:** Open `http://localhost:3000` to view the dashboard.
3. **Syncing:** The backend uses a cron job to sync periodically, but you can force a manual sync from the frontend dashboard. 
4. **Clear Database:** To reset the database for testing, visit `http://localhost:5000/clear-applications`.
