# GradeView — Aspen Grade Tracker PWA

A sleek, dark mobile app that pulls your grades from Aspen X2.

---

## Deploy to Vercel (5 minutes)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy
```bash
cd aspen-grades
vercel
```
Follow the prompts — choose defaults. Vercel gives you a free URL like `https://gradeview-xyz.vercel.app`.

### 3. Add to your iPhone home screen
1. Open your Vercel URL in **Safari**
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Name it **GradeView** and tap Add

It now works like a native app. 🎉

---

## Usage

- Enter your school's district slug (the part before `.myfollett.com`, e.g. `ma-yourschool` → type `yourschool`)
- Enter your Aspen username + password
- Tap **Sign In**

Your district slug is in your Aspen URL: `https://ma-YOURDISTRICT.myfollett.com/aspen/logon.do`

---

## Notes

- Credentials are **never stored** — only used in-session for the login request
- Your district name and username are saved locally for convenience
- The scraper may need tuning if your school's Aspen layout differs — open an issue

---

## Project structure

```
aspen-grades/
├── api/
│   └── grades.js       ← Vercel serverless function (login + scrape)
├── public/
│   ├── index.html      ← PWA frontend
│   ├── manifest.json   ← PWA manifest
│   └── sw.js           ← Service worker
└── vercel.json         ← Routing config
```
