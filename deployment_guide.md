# Cloud Deployment Guide — Automated AI Resume Parsing & Screening Platform

This guide provides instructions to deploy the complete application (Frontend, Backend, and Relational Database) publicly to the internet for free.

---

## 1. Database Deployment (Supabase or Neon PostgreSQL)
Because SQLite runs on a local file, it is not suitable for serverless platforms like Render (files get wiped out on restart). You should migrate to a cloud-hosted PostgreSQL database.

1. Create a free account on [Supabase](https://supabase.com) or [Neon Tech](https://neon.tech).
2. Create a new database project and copy the **PostgreSQL Connection String**:
   ```
   postgresql://postgres:password@db-id.supabase.co:5432/postgres
   ```
3. Update the database driver in `backend/src/db.ts` to use PostgreSQL (by swapping the `sqlite3` driver with the `pg` package).


---

## 2. Backend API Deployment (Render or Railway)
Deploy the Node.js/Express backend service to [Render](https://render.com) for free:

1. Create a free account on **Render**.
2. Create a new **Web Service** and connect it to your GitHub Repository.
3. Configure the following settings:
   * **Root Directory**: `backend`
   * **Runtime**: `Node`
   * **Build Command**: `npm install && npm run build`
   * **Start Command**: `npm start`
4. Add the following **Environment Variables** in the Render Dashboard:
   * `NODE_ENV` = `production`
   * `PORT` = `10000`
   * `JWT_SECRET` = `your_custom_secure_jwt_token`
   * `DATABASE_URL` = `your_postgresql_connection_string` (from Step 1)
5. Deploy. Render will compile your TypeScript files and run the Express API on a public URL (e.g., `https://ai-screener-api.onrender.com`).

---

## 3. Frontend Web Deployment (Vercel or Netlify)
Deploy the React client SPA to [Vercel](https://vercel.com) for free:

1. In `frontend/src/App.tsx`, update the `API_BASE` fallback to point dynamically to your deployed Render URL:
   ```typescript
   const API_BASE = import.meta.env.PROD 
     ? 'https://ai-screener-api.onrender.com/api' // Replace with your Render API url
     : '/api';
   ```
2. Create a free account on **Vercel**.
3. Create a new **Project** and connect your GitHub Repository.
4. Configure Vercel settings:
   * **Root Directory**: `frontend`
   * **Framework Preset**: `Vite`
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
5. Click **Deploy**. Vercel will build the frontend assets and host them on a public `.vercel.app` domain (e.g., `https://ai-resume-screener.vercel.app`).
6. Share this Vercel link with anyone in the world! It will connect dynamically to the backend API and database.
