<div align="center">
  <img src="https://img.shields.io/badge/LeetPulse-Platform-4F46E5?style=for-the-badge&logo=react" alt="LeetPulse Logo">
  <h1>LeetPulse</h1>
  <p>An intelligent, automated platform for educators and students to track, manage, and verify LeetCode progress seamlessly.</p>
  <p><strong>🌐 Live Demo: <a href="https://leet-pulse.vercel.app/login">https://leet-pulse.vercel.app/login</a></strong></p>
</div>

---

## 📖 What is LeetPulse?

LeetPulse is a specialized Learning Management System (LMS) designed specifically for Data Structures and Algorithms (DSA) training. It bridges the gap between coding instructors and their students by replacing manual spreadsheets and honor-system tracking with **automated, real-time API integrations**.

**For Teachers:** Create batches, design problem-set assignments with strict deadlines, and view a beautiful, automated matrix of student progress. You'll instantly know who completed an assignment `ON_TIME`, who was `LATE`, and who `MISSED` the deadline entirely.
**For Students:** Link your LeetCode account once, join your teacher's batch, and let the platform do the rest. Your global LeetCode ranking is displayed, and your assignment progress is automatically verified and synced in the background.

## ✨ Core Features

* **Automated Progress Verification:** Directly scrapes LeetCode's GraphQL API to verify if a student actually solved a required problem before the deadline.
* **Smart Cooldown Syncing:** Allows students to manually push their progress for instant gratification, but enforces a 10-minute API cooldown to prevent rate-limiting.
* **Invisible Background Cron Jobs:** Utilizes a distributed `Celery Beat` scheduler to silently sync all active students' LeetCode stats every 6 hours in the background.
* **Distributed Microservices:** Decouples the API from background tasks using Aiven Redis, ensuring the API stays lightning fast even during massive data syncs.
* **Zero-Cost Architecture:** Designed explicitly to run on a $0/month budget using Vercel, Hugging Face Docker Spaces, Aiven, Render, and Neon PostgreSQL.

---

## 🛠 Tech Stack

* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
* **Backend:** Python, Flask, SQLAlchemy, Celery, Redis
* **Database:** PostgreSQL (Neon Serverless)
* **Authentication:** JWT (JSON Web Tokens)
* **DevOps:** Docker Compose (Local), GitHub Actions (CI/CD)

---

## 🚀 Local Development Setup

Follow these exact steps to run the complete LeetPulse platform on your local machine using Docker.

### 1. Prerequisites
* Ensure you have [Git](https://git-scm.com/) installed.
* Ensure you have [Docker and Docker Compose](https://www.docker.com/) installed and running.

### 2. Clone the Repository
```bash
git clone https://github.com/yourusername/LeetPulse.git
cd LeetPulse
```

### 3. Setup Environment Variables
You need to provide a PostgreSQL database for the backend to run locally.
1. Create a free database on [Neon.tech](https://neon.tech) (or run a local Postgres instance).
2. Create a `.env` file inside the `backend/` directory:
```bash
cd backend
touch .env
```
3. Add the following keys to your `backend/.env` file:
```env
DATABASE_URL="postgresql://username:password@your-neon-url.com/dbname"
JWT_SECRET="your-super-secret-random-string"
```

### 4. Run with Docker Compose
We use a monorepo setup. The `docker-compose.yml` in the root folder will automatically build and link the frontend and backend together.
```bash
# From the root directory of the project
docker compose up --build
```
* The **Frontend** will be available at: `http://localhost:5173`
* The **Backend API** will be available at: `http://localhost:5000`

---

## 🌍 Production Deployment

This project is fully automated for zero-cost deployment using GitHub Actions. For a highly detailed explanation of the architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### 1. Database & Message Broker
1. Create a free Serverless Postgres database on [Neon.tech](https://neon.tech).
2. Create a free Redis instance on [Aiven](https://aiven.io).

### 2. Backend API Node (Hugging Face Spaces)
1. Create a new Space on [Hugging Face](https://huggingface.co/spaces) (SDK: **Docker**, Hardware: Free).
2. Go to your Space Settings -> Variables and Secrets.
3. Add `DATABASE_URL` (your Neon string), `REDIS_URL` (your Aiven string), and `JWT_SECRET`.
4. Go to your Hugging Face Profile Settings -> Access Tokens. Create a token with **Write** permissions.
5. In this GitHub Repository, go to **Settings -> Secrets and variables -> Actions**.
6. Add a new secret named `HF_TOKEN` with your Hugging Face token.
7. Any code pushed to the `main` branch will automatically be built and deployed to Hugging Face!

### 3. Background Worker Node (Render)
1. Create a new **Web Service** on [Render](https://render.com) pointing to this GitHub repository.
2. Set the Root Directory to `backend` and select the **Docker** environment.
3. Under **Docker Command**, enter `bash start.sh` (this safely runs the dummy server and Celery together).
4. Add the exact same `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` environment variables.
5. Once deployed, set up a free 10-minute ping on [cron-job.org](https://cron-job.org) pointing to your Render URL's root (`/`) to permanently prevent Render from sleeping!

### 2. Frontend (Vercel)
1. Go to [Vercel](https://vercel.com) and import this repository.
2. Under "Root Directory", click Edit and select **`frontend`**.
3. Under "Framework Preset", ensure **`Vite`** is selected.
4. Open the "Environment Variables" tab and add:
   * **Name:** `VITE_API_URL`
   * **Value:** `https://yourusername-yourspacename.hf.space/api` *(Make sure to include `/api`!)*
5. Click **Deploy**!

> **Note on Vercel SPA Routing:** The frontend directory includes a `vercel.json` file with a rewrite rule `(.*) -> /index.html`. This ensures that manual page refreshes do not result in a 404 error, allowing React Router to handle the URL correctly in production.
