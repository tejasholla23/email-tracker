# Email Tracker

Simple full-stack starter project with:

- `backend` (Node.js + Express + MongoDB)
- `frontend` (Next.js)

## Project Structure

- `backend/` - API server
- `frontend/` - web dashboard

## Prerequisites

- Node.js (LTS recommended)
- npm
- MongoDB running locally (or a remote MongoDB URI)

## Backend Setup

1. Open a terminal in `backend/`
2. Install dependencies (already done, but safe to run again):

   ```bash
   npm install
   ```

3. Create a `.env` file in `backend/`:

   ```env
   MONGO_URI=mongodb://127.0.0.1:27017/email-tracker
   ```

4. Start backend:

   ```bash
   npm start
   ```

Backend runs on: `http://localhost:5000`

Test endpoint:

- `GET /` -> `API running`

## Frontend Setup

1. Open a terminal in `frontend/`
2. Install dependencies (already done, but safe to run again):

   ```bash
   npm install
   ```

3. Start frontend:

   ```bash
   npm run dev
   ```

Frontend runs on: `http://localhost:3000`

Homepage shows: `Email Tracker Dashboard`

## Run Both Independently

Use two terminals:

- Terminal 1: run backend (`npm start` in `backend/`)
- Terminal 2: run frontend (`npm run dev` in `frontend/`)
