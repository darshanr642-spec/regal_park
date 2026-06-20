# Regal Park Villas — Construction Management App

**Company:** Sterlitee Developers LLP  
**Stack:** Expo (React Native Web) + FastAPI (Python) + MongoDB

Mobile-first construction management platform for ₹4 Cr luxury villa projects.  
18 user roles, CRM, procurement, billing, quality checklists, client portal, landowner dashboard.

---

## 🏗 Architecture

```
regal_park/
├── frontend/          # Expo (React Native Web) — static HTML/JS/CSS
│   ├── app/           # File-based routing (tabs, modules, portals)
│   ├── src/           # Components, API client, auth, theme
│   └── package.json   # Node.js dependencies
│
├── backend/           # FastAPI (Python) — REST API
│   ├── routes/        # 17 route modules (auth, CRM, portal, admin, etc.)
│   ├── server.py      # App assembly, middleware, startup
│   ├── config.py      # Database, JWT, CORS config
│   ├── seed.py        # Demo data seeding (idempotent)
│   └── models.py      # Data models
│
├── api/               # Vercel serverless entry point
│   └── index.py       # Wraps FastAPI app for Vercel Python runtime
│
├── vercel.json        # Vercel deployment config (frontend + API)
└── requirements.txt   # Python dependencies for Vercel
```

---

## ⚡ Quick Deploy on Vercel (with custom domain)

### Prerequisites
- GitHub account (repo: `darshanr642-spec/regal_park`)
- Vercel account (free)
- MongoDB Atlas account (free — **required**, see why below)

### Step 1: Create MongoDB Atlas (FREE, 2 min)

> **Why MongoDB is required:** This app stores 500+ records across 20+ collections —
> users, projects, stages, BOQ, procurement, billing, CRM leads, bookings, 251 plots,
> quality checklists, documents, approval workflows, and more.
> There is no way to run the app without a database.

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → Sign up with Google
2. Create **Free Shared Cluster** (M0) → Region: **Mumbai**
3. **Database Access** → Add user:
   - Username: `rpv_admin`
   - Password: `RegalPark2026` (NO special chars like `!@#$`)
4. **Network Access** → Add IP: `0.0.0.0/0` (required for Vercel)
5. **Connect** → **Drivers** → Copy connection string

Your connection string will look like:
```
mongodb+srv://rpv_admin:RegalPark2026@cluster0.xxxxx.mongodb.net/regal_park_villas?retryWrites=true&w=majority
```

### Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. **Import** → Select `darshanr642-spec/regal_park`
3. Settings:
   - **Root Directory:** `/` (leave empty — NOT `frontend/`)
   - **Framework Preset:** `Other`
4. **Environment Variables** — add these 4:

| Variable | Value |
|---|---|
| `MONGO_URL` | `mongodb+srv://rpv_admin:RegalPark2026@cluster0.xxxxx.mongodb.net/regal_park_villas?retryWrites=true&w=majority` |
| `JWT_SECRET` | `RegalParkVillasSterlitee2026SecretKeyForJWT` |
| `SEED_DEMO_DATA` | `true` |
| `ALLOWED_ORIGINS` | `*` |

5. Click **Deploy** → Wait ~3 min

### Step 3: Add Custom Domain (daearth.in)

1. In Vercel → Project → **Settings** → **Domains**
2. Add `daearth.in`
3. In your domain registrar (GoDaddy), add DNS records:

| Type | Name | Value |
|---|---|---|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

4. Wait 5 min → App live at **https://daearth.in**

---

## 🔑 Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@regalpark.com | Admin@123 |
| COO | coo@regalpark.com | Coo@123 |
| Sales Manager | salesmgr@regalpark.com | SalesMgr@123 |
| Project Director | director@regalpark.com | Director@123 |
| Project Manager | manager@regalpark.com | Manager@123 |
| Site Engineer | siteengineer@regalpark.com | Site@123 |
| Client | client@regalpark.com | Client@123 |
| Landowner | landowner@regalpark.com | Landowner@123 |

---

## 💻 Local Development

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Create backend/.env with required vars (see .env.example)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
yarn install
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001 npx expo start --web
```

### Required: Local MongoDB
```bash
# Install and start MongoDB locally, or use Atlas connection string in backend/.env
mongod --dbname regal_park_villas
```

---

## 🔧 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Min 32 chars. Used for auth tokens |
| `SEED_DEMO_DATA` | ✅ | `true` = populate demo data on first boot |
| `ALLOWED_ORIGINS` | ✅ | `*` for dev, or comma-separated domains |
| `DB_NAME` | Optional | Default: `regal_park_villas` |
| `REDIS_URL` | Optional | For distributed rate limiting |

---

## 📋 Vercel Build Settings

| Setting | Value |
|---|---|
| Root Directory | `/` |
| Framework | Other |
| Build Command | `cd frontend && yarn install --frozen-lockfile && npx expo export --platform web` |
| Output Directory | `frontend/dist` |
| Install Command | `echo 'skip default install'` |

These are auto-configured by `vercel.json` — you don't need to set them manually.
