# VoteWise India 🗳️

> **AI-powered Indian election education assistant** — Understand how to vote, register, and participate in India's democracy.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini_API-blue)](https://ai.google.dev)
[![Cloud Run](https://img.shields.io/badge/Google-Cloud_Run-blue)](https://cloud.google.com/run)
[![Tests](https://img.shields.io/badge/Jest-99_passing-brightgreen)](./server.test.js)
[![Coverage](https://img.shields.io/badge/coverage-~93%25-brightgreen)](./server.test.js)
[![E2E](https://img.shields.io/badge/Playwright-30_passing-blue)](./e2e)
[![PromptWars](https://img.shields.io/badge/PromptWars-Virtual_2026-orange)](https://promptwars.in)

**🌐 Live:** [votewise-india-901504497544.asia-south1.run.app](https://votewise-india-901504497544.asia-south1.run.app/)
**Demo:** [Click Here](https://www.loom.com/share/af8625dfeb8844b0970327cf3bf32ab3)

---

## Chosen Vertical

**Election Process Education** — VoteWise India helps Indian citizens understand the complete election process: voter registration, how to vote on election day, types of elections, important dates, and their democratic rights — through an interactive AI assistant that works in English and Hindi.

---

## Approach & Logic

India has 96.8 crore eligible voters, many of them first-time voters, rural citizens, and non-English speakers. Existing ECI resources are exhaustive but scattered across dozens of PDFs and portals. VoteWise India consolidates that knowledge into a single, conversational, bilingual web app.

**Design philosophy:**

1. **Single page, zero friction** — No signup required to learn. Optional Google Sign-In only for quiz leaderboard.
2. **Bilingual by default** — Every interaction works in English and हिंदी; translation to 8 regional languages via Gemini.
3. **Authoritative, not political** — Content sourced from ECI / official references only. Never names parties or candidates.
4. **Accessible** — WCAG 2.1 AA contrast, full keyboard navigation, `prefers-reduced-motion` respected, ARIA live regions, skip links.
5. **Server-side secrets** — Gemini, Natural Language API, and Firestore credentials never leave the backend.

---

## What It Does

- 🤖 **AI Assistant** — Ask anything about Indian elections in English or Hindi, powered by Google Gemini
- 🔬 **Text Analyser** — Paste any election text; Google Cloud Natural Language API extracts named entities and sentiment in real time
- 🗳️ **How to Vote** — 7-step interactive guide from checking registration to casting your vote
- 📋 **Voter Registration** — 6-step guide with Form 6, document requirements, and official links
- 🎯 **Election Quiz** — 10-question quiz with explanations; scores saved to Firestore leaderboard
- 📍 **ECI Map** — Google Maps embed showing Election Commission of India HQ
- 📅 **Election Dates** — Upcoming elections with Google Calendar deep-link integration
- 🏛️ **Parliament & States** — Lok Sabha, Rajya Sabha, all 28 states + 8 UTs electoral data
- 🇮🇳 **President & VP** — Election process, powers, eligibility
- 🌐 **Translate** — Any election text → 8 Indian languages via Gemini
- 📢 **Updates** — Latest ECI announcements and policy updates

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            Browser (Single-Page App)                 │
│  index.html + styles.css + app.js (ES module)        │
│  Firebase modular SDK (Auth + Analytics)             │
│  Rotating Ashoka Chakra · scroll-reveal · count-up   │
│  prefers-reduced-motion aware · bilingual (EN/HI)    │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS REST
┌────────────────────▼────────────────────────────────┐
│           Express.js Backend (Node 18)               │
│  helmet · compression · express-rate-limit · CORS    │
│  In-memory cache (~30s TTL) · HSTS in production     │
│  trust proxy · static cache (1d prod) · full JSDoc   │
│                                                      │
│  14 routes:                                          │
│  /api/health  /api/config  /api/election  /api/steps │
│  /api/quiz    /api/quiz/submit  /api/leaderboard     │
│  /api/dates   /api/announcements  /api/parliament    │
│  /api/states  /api/president  /api/chat              │
│  /api/translate  /api/analyze                        │
└──────┬──────────────────┬──────────────────┬────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼──────┐  ┌───────▼──────┐
│ Gemini API  │  │  Cloud NL API  │  │  Firestore   │
│ chat +      │  │  entity +      │  │  quiz scores │
│ translation │  │  sentiment     │  │  leaderboard │
└─────────────┘  └───────────────┘  └──────────────┘
```

---

## Google Services Used

| Service | Integration | Usage |
|---|---|---|
| **Gemini Flash (latest)** | Server-side REST proxy | Bilingual election Q&A with full ECI knowledge context |
| **Gemini (Translation)** | Server-side REST proxy | Translate election content to 8 Indian languages |
| **Cloud Natural Language API** | Server-side REST (2 calls) | Entity extraction + sentiment analysis on election text |
| **Firebase Firestore** | Admin SDK (server) + client SDK | Quiz score persistence and leaderboard |
| **Firebase Authentication** | Modular SDK (client) | Google Sign-In via `signInWithRedirect` |
| **Google Analytics (GA4)** | Firebase Analytics modular SDK | Tab views, chat messages, quiz completions |
| **Google Maps Embed** | iframe | ECI Headquarters, New Delhi |
| **Google Calendar** | Deep-link URLs | Add election dates to personal calendar |
| **Google Cloud Run** | Deployment target | Serverless containerised Node.js hosting |
| **Google Fonts** | CDN | Playfair Display + DM Sans + DM Mono |
| **Google Identity Toolkit** | Firebase Auth | OAuth 2.0 Sign in with Google flow |

**11 Google Services integrated.**

---

## Evaluation Mapping

| Criterion | Evidence |
|---|---|
| **Code Quality** | `server.js` fully JSDoc-annotated with `@param`, `@returns`, `@typedef`. Clean route sections, helper extraction (`buildSystemPrompt`, `translateWithGemini`, `saveQuizScore`, `getTopScores`, `sentimentLabel`). No inline secrets. |
| **Security** | `helmet` (CSP + HSTS in production), `cors` via `ALLOWED_ORIGIN`, per-route rate limits (20/min chat, 30/min quiz submit, 100/min data), `trust proxy`, 10kb JSON cap, server-only API keys, `escHtml` XSS protection, Firebase OAuth. |
| **Efficiency** | In-memory API cache (30s TTL + X-Cache header), gzip compression, 1-day `Cache-Control` on static assets in production, lazy panel fetches, single bundle from `public/`. |
| **Testing** | **99** Jest + Supertest API tests covering all 14 routes, cache behaviour, input validation, and security headers. **30** Playwright E2E tests (navigation, quiz, chat, accessibility). CI via `.github/workflows/ci.yml`. |
| **Accessibility** | `role="tablist"` + `aria-controls` on every tab, skip link, `aria-live` for chat/quiz/translate/analyze, landmarks, single `h1`, WCAG 2.1 AA contrast, `prefers-reduced-motion` respected throughout. |
| **Google Services** | **11 services** — see table above. Three distinct AI/ML workflows: Gemini chat, Gemini translation, Cloud Natural Language entity+sentiment. |

---

## UI / Motion Highlights

- Animated saffron→gold→green gradient under active tab
- Hero: staggered fade-in for tag / title / subtitle
- **Rotating Ashoka Chakra** SVG — India's national emblem, 80s revolution
- Scroll-reveal for fact cards and election-type cards (IntersectionObserver)
- Count-up animation for numeric facts (96.8 Crore voters etc.)
- Shimmer sweep on fact card hover; radial pointer-glow on step cards
- Moving shine across quiz progress bar
- All motion respects `prefers-reduced-motion: reduce`

---

## Project Structure

```
VoteWiseIndia/
├── server.js              # Express backend (1087 lines) — full JSDoc, 14 routes
├── server.test.js         # Jest + Supertest — 99 API tests
├── public/
│   ├── index.html         # SPA markup — semantic, accessible, ES module
│   ├── styles.css         # Design system (1750+ lines)
│   └── app.js             # Frontend logic (933 lines) — Firebase modular SDK
├── e2e/
│   ├── navigation.spec.js      # 8 tests
│   ├── quiz.spec.js            # 6 tests
│   ├── chat.spec.js            # 7 tests
│   └── accessibility.spec.js   # 9 tests
├── playwright.config.js   # E2E configuration
├── Dockerfile             # Cloud Run — non-root user, healthcheck
├── .dockerignore
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## How to Run Locally

```bash
git clone https://github.com/SaiBhargavRallapalli/VoteWiseIndia.git
cd VoteWiseIndia
npm install
cp .env.example .env
# Edit .env — add GEMINI_API_KEY and Firebase config
npm start
# → http://localhost:8080

# API tests (99 tests)
npm test

# E2E browser tests (install browsers once)
npx playwright install
npm run test:e2e
```

---

## Deploy to Google Cloud Run

```bash
gcloud config set project promptwars-493418

# Enable all required APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com \
  language.googleapis.com

# Deploy
gcloud run deploy votewise-india \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,FIREBASE_API_KEY=YOUR_KEY,...
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Gemini API key (also used for Natural Language API) |
| `FIREBASE_API_KEY` | Yes | Firebase web app API key |
| `FIREBASE_AUTH_DOMAIN` | Yes | e.g. `your-project.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Yes | GCP project ID |
| `FIREBASE_STORAGE_BUCKET` | Yes | e.g. `your-project.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase sender ID |
| `FIREBASE_APP_ID` | Yes | Firebase web app ID |
| `FIREBASE_MEASUREMENT_ID` | Optional | GA4 measurement ID |
| `PORT` | Optional | Server port (default 8080, set automatically by Cloud Run) |
| `ALLOWED_ORIGIN` | Optional | CORS origin lock for production |

---

## Assumptions Made

1. Election data reflects state as of early 2026. Production would sync with ECI's live API/RSS.
2. The app is politically neutral — educates about the *process*, never parties or candidates.
3. Quiz scores use anonymous client session IDs — no PII is stored.
4. Translation uses Gemini rather than Cloud Translation API to preserve election domain context.
5. Natural Language API uses the same API key as Gemini (both enabled under the same GCP project).
6. Firebase is optional — app degrades gracefully if Firebase env vars are unset.

---

## Accessibility

- ✅ Skip-to-content link
- ✅ `aria-label` on all interactive elements
- ✅ `aria-live` regions for chat, quiz, translation, and NL analysis output
- ✅ Semantic HTML (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`)
- ✅ WCAG 2.1 AA contrast ratios
- ✅ Full keyboard navigation
- ✅ `prefers-reduced-motion: reduce` honoured
- ✅ Bilingual (EN / HI) interface + 8-language Gemini translation
- ✅ Mobile-responsive, tested to 360px width

---

*Built for PromptWars Virtual 2026 — Election Process Education vertical.*
