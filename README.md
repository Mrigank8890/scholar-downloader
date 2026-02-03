# 🚀 ScholarFetch — Full Deployment Guide
### Google Scholar Research Paper Downloader (KNN Nanorods)

---

## 📁 Project Structure (what you're deploying)

```
scholar-downloader/
│
├── backend/
│   ├── app.py              ← Flask API (the server brain)
│   ├── requirements.txt    ← Python packages
│   └── Procfile            ← Tells Render how to start the server
│
├── frontend/
│   ├── index.html          ← The webpage
│   ├── style.css           ← All styling
│   └── app.js              ← All frontend logic + API calls
│
├── render.yaml             ← Render auto-deploy config
├── .gitignore
└── README.md               ← This file
```

---

## 🏗️  ARCHITECTURE (How it works)

```
  User's Browser
       │
       │  (loads static files)
       ▼
  ┌─────────────┐          ┌─────────────────┐
  │  GitHub      │   POST   │  Render.com      │
  │  Pages       │─────────▶│  (Flask API)     │
  │  (Frontend)  │◀─────────│  (Backend)       │
  └─────────────┘   JSON /  └─────────────────┘
                    PDF/ZIP          │
                                    │ scrapes
                                    ▼
                            Google Scholar
```

- **Frontend** = static HTML/CSS/JS → hosted FREE on GitHub Pages
- **Backend** = Python Flask server → hosted FREE on Render.com
- The frontend calls the backend via fetch() API calls
- The backend does all the scraping and PDF downloading server-side

---

## ✅ STEP-BY-STEP DEPLOYMENT

---

### 📌 STEP 1 — Create a GitHub Account
- Go to https://github.com
- Click "Sign up" → create your account
- Verify your email

---

### 📌 STEP 2 — Create a New Repository
1. Click the **+** icon (top-right) → "New repository"
2. Name it: `scholar-downloader`
3. Check "Add a README" (optional)
4. Click **Create repository**

---

### 📌 STEP 3 — Upload Your Files to GitHub
**Option A — Via the Web (no terminal needed):**
1. Open your new repo page
2. Click "Add file" → "Create new file" or "Upload file"
3. Upload all files maintaining the folder structure:
   - `backend/app.py`
   - `backend/requirements.txt`
   - `backend/Procfile`
   - `frontend/index.html`
   - `frontend/style.css`
   - `frontend/app.js`
   - `render.yaml`
   - `.gitignore`
4. Click "Commit changes" after each upload

**Option B — Via Terminal (recommended):**
```bash
cd scholar-downloader          # go into the project folder
git init                       # initialize git
git add .                      # stage all files
git commit -m "Initial commit" # save locally
git remote add origin https://github.com/YOUR_USERNAME/scholar-downloader.git
git push -u origin main        # push to GitHub
```

---

### 📌 STEP 4 — Deploy the BACKEND on Render.com

> Render = free cloud server for Python apps. No credit card needed for free tier.

1. Go to https://render.com
2. Click **"Sign up"** → sign in with your GitHub account
3. Click **"New"** → **"Web Service"**
4. Click **"Connect a repository"**
5. Select your `scholar-downloader` repo
6. Fill in the settings:

   | Field              | Value                        |
   |--------------------|------------------------------|
   | **Name**           | `scholar-downloader-api`     |
   | **Root Directory** | `backend`                    |
   | **Runtime**        | `Python 3`                   |
   | **Build Command**  | `pip install -r requirements.txt` |
   | **Start Command**  | `gunicorn app:app --host 0.0.0.0 --port $PORT` |
   | **Instance Type**  | `Free`                       |

7. Click **"Create Web Service"**
8. Wait for it to build (1–2 minutes)
9. ✅ Once it says **"Live"**, copy the URL shown:
   ```
   https://scholar-downloader-api.onrender.com
   ```
   **You will need this URL in the next step.**

---

### 📌 STEP 5 — Wire the Frontend to the Backend

1. Open `frontend/app.js`
2. Find this line near the top:
   ```js
   const API_BASE = "YOUR_RENDER_URL_HERE";
   ```
3. Replace with your actual Render URL:
   ```js
   const API_BASE = "https://scholar-downloader-api.onrender.com";
   ```
   > ⚠️ Do NOT add a trailing slash. No `/` at the end.
4. Save the file
5. Commit and push to GitHub:
   ```bash
   git add frontend/app.js
   git commit -m "Set backend API URL"
   git push
   ```

---

### 📌 STEP 6 — Deploy the FRONTEND on GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** (gear icon, top-right)
3. In the left sidebar → click **Pages**
4. Under "Source" → set **Branch** to `main`
5. Set **Folder** to `/ (root)` — ⚠️ this means the frontend files need to be at root level OR we adjust below
6. Click **Save**

> ⚠️ **IMPORTANT:** GitHub Pages serves from root by default.
> Your `index.html` is inside `frontend/`. You have TWO options:

**Option A (Easiest) — Move frontend files to root:**
- Move `index.html`, `style.css`, `app.js` to the **root** of your repo (same level as `backend/`)
- Commit and push
- GitHub Pages will find `index.html` automatically

**Option B — Use a subfolder path:**
- In GitHub Pages settings, set the folder to `frontend`
- Your site URL becomes: `https://YOUR_USERNAME.github.io/scholar-downloader/`

7. Wait 30–60 seconds
8. ✅ Your site is now live at:
   ```
   https://YOUR_USERNAME.github.io/scholar-downloader/
   ```

---

### 📌 STEP 7 — Test Everything

1. Open your live site URL
2. Check the top-right — it should say **"● Server online"**
   - If it says offline → double-check your `API_BASE` URL in `app.js`
3. The search box should already say "KNN nanorods"
4. Click **SEARCH**
5. Cards should appear with paper titles
6. Click **⬇ Download PDF** on any green-badge card
7. Check the checkboxes on multiple papers → click **⬇ Download ZIP**

---

## 🔧 TROUBLESHOOTING

| Problem | Likely Cause | Fix |
|---|---|---|
| "Server offline" | Wrong API_BASE URL | Copy the exact URL from Render dashboard |
| "No results returned" | Google Scholar CAPTCHA | See "CAPTCHA Solutions" section below |
| PDF download fails | External host blocks requests | Some PDFs are behind paywalls — expected |
| Site shows blank page | index.html not at the right path | Use Option A (move files to root) |
| CORS error in browser console | Backend not running | Check Render logs for errors |

---

## 🛡️ CAPTCHA SOLUTIONS (if Google Scholar blocks you)

Google Scholar blocks automated requests. If you get zero results:

**Option 1 — Use a Proxy (Best for production)**
Add a proxy service to your backend `app.py`:
```python
PROXIES = {
    "http":  "http://YOUR_PROXY:PORT",
    "https": "https://YOUR_PROXY:PORT"
}
# Then in scrape_scholar():
resp = requests.get(url, headers=HEADERS, proxies=PROXIES, timeout=15)
```
Proxy providers: Bright Data, Proxy Mesh, ScraperAPI

**Option 2 — Switch to Semantic Scholar API (Free, no CAPTCHA)**
Replace the scraping with Semantic Scholar's official API:
```
https://api.semanticscholar.org/graph/v1/paper/search?query=KNN+nanorods&limit=10&fields=title,authors,year,abstract,externalIds
```
This is the recommended long-term solution.

---

## 💰 COST BREAKDOWN

| Service        | Plan   | Cost    |
|----------------|--------|---------|
| GitHub         | Free   | $0      |
| GitHub Pages   | Free   | $0      |
| Render.com     | Free   | $0      |
| **TOTAL**      |        | **$0**  |

> Note: Render free tier sleeps after 15 min of inactivity.
> First request after sleep takes ~5 seconds to wake up.

---

## 📌 QUICK REFERENCE — All URLs

| What                     | URL                                                    |
|--------------------------|--------------------------------------------------------|
| Your GitHub repo         | `https://github.com/YOUR_USERNAME/scholar-downloader`  |
| Backend API (Render)     | `https://scholar-downloader-api.onrender.com`          |
| Frontend (GitHub Pages)  | `https://YOUR_USERNAME.github.io/scholar-downloader/`  |
| Health check             | `{API_BASE}/api/health`                                |

---