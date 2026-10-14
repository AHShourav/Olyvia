# Git-olyvia

Clean copy of the Olyvia nutrition app (same codebase as the `v1` snapshot).

## Structure

- **`Olyvia/frontend/`** — main React + Vite app (use this for dev and Vercel)
- **`backend/`** — Django API
- **`Olyvia/`** (root) — older/alternate Vite scaffold (optional)

## Local dev

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # if present; add keys locally
python manage.py migrate
python manage.py runserver

# Frontend
cd Olyvia/frontend
npm install
npm run dev
```

## Push to GitHub

Create an empty repo `Git-olyvia` under [AHShourav](https://github.com/AHShourav), then:

```bash
cd /path/to/Git-olyvia
git push -u origin main
```

Remote: `https://github.com/AHShourav/Git-olyvia.git`
