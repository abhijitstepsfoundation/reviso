# Reviso — an AI examiner, not another AI tutor

**Live:** https://reviso-ai-903171002994.asia-south1.run.app

Reviso examines students on their own study material and reports honestly on
what they understand. Upload a chapter of a textbook, your own notes or a
syllabus; sit an adaptive oral viva or a written paper you answer by hand and
photograph; and get back a profile that separates what you have not learned
yet from what you have learned wrong.

Built for the Google Cloud × Hack2skill Gen AI Ideathon.

---

## The original feature enhancement (Phase 3)

The base challenge asks for an authenticated journal with multi-turn Gemini
chat. Reviso is a different application built on that foundation, and three
things in it go beyond the starter spec.

**1. An adaptive oral examiner that probes instead of correcting.**
Every turn sends the full exchange back to Gemini and asks for one decision:
judge the answer, then choose to `probe`, `advance` or `end`. When an answer
is wrong the examiner does not say so — it asks what follows from what the
student just said. The prompt forbids explaining, correcting or reassuring
during the exam, because a student who is told the answer stops revealing
what they know. Question six genuinely depends on answers one through five.

**2. Handwritten scripts marked from photographs.**
Reviso sets a paper, the student answers it on real paper the way they will
in an exam hall, photographs the pages, and Gemini marks them against a
rubric it wrote when setting the paper. Marks are awarded per question with
partial credit, and the rubric is revealed only after marking.

**3. A cross-modal learning profile.**
Because the same student is assessed both aloud and in writing, Reviso can
compare the two. Performing better on paper than under questioning suggests
memorised material that has not become flexible understanding; the reverse
suggests real understanding that is not reaching the page in the structure a
written answer needs. Those are different problems with different fixes, and
neither is visible to a single-mode study tool.

Underneath all three is one design rule: **assessment before explanation**,
and a strict separation between a *gap* (not learned yet) and a
*misconception* (learned wrong). Reviso only calls something a misconception
when the same faulty reasoning recurs across turns or across assessments.

---

## Core requirements

| Requirement | Implementation |
|---|---|
| Deployed on Cloud Run | Single service `reviso-ai`, `asia-south1`, label `dev-tutorial=cloud-run-ai-challenge` |
| Firebase Authentication | Google sign-in; ID token verified server-side on every API request |
| Multi-turn Gemini | Oral viva replays the whole exchange each turn; the next question is chosen from it |
| Firestore isolation | All data under `/users/{uid}/…`; rules deny by default; verified by an automated test |
| Secret Manager | `GEMINI_API_KEY` read at runtime, never in source, client or logs |

---

## Architecture

One Cloud Run service serves both the built React app and the API from the
same origin. There is no second deployment and no cross-origin traffic.

```
Browser (React, Firebase ID token)
        │  same-origin HTTPS
        ▼
Cloud Run  ── reviso-ai ── Express: static assets + /api
        │
        ├── Firestore        /users/{uid}/…
        ├── Cloud Storage    backend-only; clients denied
        └── Secret Manager   GEMINI_API_KEY ──► Gemini API
```

The browser never holds a bucket credential, never receives the Gemini key,
and never talks to Firestore directly. Every path to data goes through a
request whose identity was established by verifying a Firebase ID token.

### Stack

- **Frontend** React 19, Vite, React Router, plain CSS with a variable-driven
  light/dark theme. No UI framework.
- **Backend** Node 22, Express 5, TypeScript, Firebase Admin SDK.
- **Model** Gemini via the REST API, called directly with `fetch`. Model name
  and reasoning depth are configurable per call.
- **Deploy** One Dockerfile, multi-stage, built by Cloud Build.

---

## Data model

```
users/{uid}
  ├── displayName, email, createdAt
  ├── materials/{materialId}
  │     title, subject, summary, topics[], keyConcepts[],
  │     extractedText, status, storagePath, pageCount
  ├── sessions/{sessionId}            ← oral vivas
  │     materialId, status, turns[], report
  ├── exams/{examId}                  ← written papers
  │     paper{questions[], markingPoints[]}, result, scriptPaths[]
  └── profile/current
        profile{...}, signature, generatedAt
```

`signature` is the sorted list of assessment ids the profile was built from.
When it is unchanged the cached profile is returned and no model call is made.

---

## Security model

**Identity.** The uid comes only from `verifyIdToken`. A `userId` in a body,
query or path is never used for authorisation. Every Firestore read is scoped
by construction: `db.collection('users').doc(req.uid)`, so a query that
returns another user's data cannot be expressed.

**Firestore rules** (`firestore.rules`) deny by default and permit only
`request.auth.uid == userId` inside that user's own subtree.

**Cloud Storage rules** (`storage.rules`) are `allow read, write: if false`.
This looks alarming and is deliberate — no client ever touches the bucket.
Uploads are posted to the backend, which verifies the token and writes the
object itself under `users/{uid}/…`.

**Secrets.** `GEMINI_API_KEY` is read from Secret Manager at runtime and
cached in memory. It is sent to Gemini as an `x-goog-api-key` header rather
than a URL parameter, so it cannot leak into request logs. The Firebase web
config in the frontend is public by design; Firebase security comes from
rules and token verification, not from hiding it.

**Authorisation is finer-grained than authentication.** A paper's
`markingPoints` are the answers. They are stored, but stripped from every API
response until the script has been marked — being signed in is not sufficient
to see them.

**Input validation runs before anything is written or paid for.** Size, MIME
type and PDF page count are checked before the Firestore write, the bucket
write and the Gemini call, so a rejected upload leaves no orphaned record and
costs nothing.

**Model output is untrusted.** JSON is parsed defensively, awarded marks are
clamped to the legal range for that question, and paper totals are recomputed
server-side rather than trusting the model's arithmetic.

**Other hardening.** Security headers including a CSP; per-user rate limiting,
tighter on the AI endpoints; 25 MB body cap; `x-powered-by` disabled;
diagnostics endpoints off unless `ENABLE_DIAG=true`; errors return an
actionable message while the detail stays in the server log.

---

## Cross-user isolation proof

Isolation is asserted by an automated test, not by inspection.

```bash
cd backend
node scripts/isolation-test.mjs https://reviso-ai-903171002994.asia-south1.run.app
```

The script creates two throwaway accounts, exchanges custom tokens for real
Firebase ID tokens, plants a material and a session under user B, then
verifies through the public API that user A cannot read, delete or build on
any of it — and that user B's data survives the attempt. It cleans up after
itself and makes no Gemini calls.

Signing custom tokens requires a service account identity, so the runner
needs permission to sign as one. Note that no service account key file is
downloaded at any point; signing goes through the IAM Credentials API using
the operator's own credentials.

```bash
gcloud services enable iamcredentials.googleapis.com --project PROJECT_ID

gcloud iam service-accounts add-iam-policy-binding \
  PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --member="user:YOUR_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project PROJECT_ID
```

### Result against the live deployment

```
Reviso cross-user isolation test
Target: https://reviso-ai-903171002994.asia-south1.run.app

Authentication boundary
  [PASS] No token is rejected                                401
  [PASS] Malformed token is rejected                         401
  [PASS] Token with tampered payload is rejected             401

Ownership boundary
  [PASS] User A can read their own profile                   200
  [PASS] User A cannot read user B's material                404
  [PASS] User A cannot read user B's session                 404
  [PASS] User A cannot delete user B's material              404
  [PASS] User A cannot start a session on user B's material  404
  [PASS] User A cannot set a paper on user B's material      404

No leakage through list endpoints
  [PASS] User B's material does not appear in user A's list  0 items

User B still has their data
  [PASS] User B's material survived the delete attempt       present

11 of 11 checks passed. Cross-user isolation verified.
```

Note that the cross-user reads return **404 rather than 403**. This is
deliberate. Every query is scoped to the caller's own subtree by
construction, so from user A's perspective user B's document genuinely does
not exist. A 403 would confirm that the identifier is real, which leaks
information; a 404 leaks nothing.

Checks performed:

| Check | Expected |
|---|---|
| Request with no token | 401 |
| Request with a malformed token | 401 |
| Request with a tampered token payload | 401 |
| User A reads their own profile | 200 |
| User A reads user B's material | 403 / 404 |
| User A reads user B's session | 403 / 404 |
| User A deletes user B's material | 403 / 404 |
| User A starts a viva on user B's material | 400 / 403 / 404 |
| User A sets a paper on user B's material | 400 / 403 / 404 |
| User B's material appears in user A's list | never |
| User B's material survives the delete attempt | still present |

---

## Running it yourself

Prerequisites: Node 22, `gcloud`, a Firebase project with Google sign-in,
Firestore and Storage enabled, and a Gemini API key.

```bash
# 1. Store the Gemini key
echo -n "YOUR_KEY" | gcloud secrets create GEMINI_API_KEY \
  --data-file=- --replication-policy=automatic

# 2. Let the Cloud Run service account read it
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. Deploy the security rules
firebase deploy --only firestore:rules,storage --project PROJECT_ID

# 4. Install and build
cd backend  && npm install && npm run build
cd ../frontend && npm install && npm run build

# 5. Deploy
gcloud run deploy reviso-ai --source . \
  --project PROJECT_ID --region asia-south1 --allow-unauthenticated \
  --labels dev-tutorial=cloud-run-ai-challenge \
  --set-env-vars GOOGLE_CLOUD_PROJECT=PROJECT_ID,FIREBASE_STORAGE_BUCKET=PROJECT_ID.firebasestorage.app
```

Finally add the Cloud Run hostname under Firebase → Authentication →
Settings → Authorized domains, or sign-in works locally but not in
production.

### Local development

```bash
cd backend  && npm run dev     # :8080
cd frontend && npm run dev     # :5173, proxies /api to :8080
```

Requires `gcloud auth application-default login` so the backend can reach
Secret Manager and Firestore.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | — | Project id |
| `FIREBASE_STORAGE_BUCKET` | — | Bucket for uploads and scripts |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model used for every call |
| `GEMINI_SECRET_NAME` | `GEMINI_API_KEY` | Secret Manager entry |
| `MAX_PDF_PAGES` | `20` | Upload page cap |
| `ENABLE_DIAG` | unset | Exposes `/api/diag/*` when `true` |

---

## Prompt design

Prompts live in `backend/src/prompts/` and carry the product's opinions.

- **`materialAnalysis.ts`** — produces structured notes *in the model's own
  words*. An earlier version asked for faithful transcription and triggered
  Gemini's recitation filter on published textbooks, returning nothing. The
  rewrite keeps technical terms, formulas and numbers exact while restating
  explanations, which is both more robust and more appropriate for
  copyrighted source material.
- **`examiner.ts`** — the viva. Forbids explaining or correcting mid-exam,
  requires probing on weak answers, and only records a misconception on
  recurrence.
- **`writtenExam.ts`** — sets the paper and marks the script. Marking is
  against the paper's own rubric, partial credit is required, and presentation
  is not penalised. Also reports whether the script looks handwritten, as a
  neutral observation that does not affect marks.
- **`profile.ts`** — cross-modal analysis. Refuses to compare modes without
  at least one of each, and refuses to claim a trend without repeat coverage.

---

## Known limitations

Stated plainly, because a tool that overclaims about a student's mind is
worse than one that admits what it cannot see.

- **No confidence detection.** Response time is measured and reported as an
  observation ("took noticeably longer on this topic"). Reviso never infers
  confidence, anxiety or motivation, because those are not observable from a
  text box, and every prompt forbids it explicitly.
- **Voice uses the browser's own speech recognition,** so no audio is
  uploaded or stored. That means no audio-derived signals such as hesitation
  or self-correction in speech. Availability varies by browser and typing is
  always offered.
- **Materials are capped at 20 pages and 10 MB.** This is a quality boundary
  as much as a technical one: questions drawn from twenty chapters at once
  are vague. Chapter scope is where the assessment is sharp.
- **Handwriting detection is advisory.** A printed script is flagged and
  marked identically. Vision models cannot reliably distinguish a printout
  from a photograph of neat handwriting, so this is never treated as evidence
  of misconduct.
- **Rate limiting is per-instance,** in memory. It stops one account from
  running away on a single Cloud Run instance; it is not a distributed limit.
  Redis or Cloud Armor would be the production answer.
- **Grading is synchronous.** Uploads and marking take 15–40 seconds with the
  request held open. A background queue would be better but needs
  CPU-always-on.
- **Model capability varies by variant.** Gemini 3 thinking levels differ
  between models in ways the general documentation does not always capture,
  so calls fall back to model defaults if a configuration is rejected.

---

## Repository layout

```
backend/
  src/
    lib/         firebase, secrets, gemini, pdf
    middleware/  auth, security, errors
    prompts/     the four prompt files
    routes/      health, me, materials, sessions, exams, profile, diag
    services/    materials, examiner, writtenExam, profile
  scripts/       isolation-test.mjs
frontend/
  src/
    auth/        Firebase auth context
    components/  TopBar, Spinner, Protected
    lib/         api, firebase, speech, theme, files
    pages/       Landing, Dashboard, Materials, Exam, Written, Profile, Review
  public/        favicon.svg, og.png
docs/            AI Studio custom instructions and screenshot
firestore.rules  storage.rules  Dockerfile
```
