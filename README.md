# Tempo

A band coordination tool for scheduling rehearsals, managing gigs, and discovering musicians.

**Live at:** [tempocal.app](https://tempocal.app)

---

## What is Tempo?

Tempo helps bands stay organized by replacing chaotic group text chains with a simple, centralized tool. Band leaders can create gigs, musicians can mark their availability, and everyone stays on the same page.

Features include:
- **Gig scheduling** — Create gigs with date, time, and location
- **Availability polling** — Band members can respond with their availability
- **Musician profiles** — Musicians can create discoverable profiles with their instruments, location, and bio
- **Musician discovery** — Band leaders can find musicians for gigs

---

## Project Structure
```
tempo/
├── public/              ← Frontend (this is where most edits happen)
│   ├── index.html       ← Main HTML structure
│   ├── styles.css       ← Styling (colors, layout, fonts)
│   └── app.js           ← App logic and interactivity
├── functions/           ← Firebase Cloud Functions (backend)
├── firebase.json        ← Firebase hosting configuration
├── firestore.rules      ← Database security rules
└── .github/workflows/   ← Auto-deploy configuration
```

### Where to make changes

| Type of change | File(s) to edit |
|----------------|-----------------|
| Visual/design changes | `public/styles.css` |
| New features or behavior | `public/app.js` |
| Page structure | `public/index.html` |
| Backend logic (emails, etc.) | `functions/` |

---

## Getting Started (for contributors)

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- A code editor like [VS Code](https://code.visualstudio.com/)

### Setup

1. **Clone the repo**
```bash
   git clone https://github.com/YOUR_USERNAME/tempo.git
   cd tempo
```

2. **Install dependencies** (for Cloud Functions)
```bash
   cd functions
   npm install
   cd ..
```

3. **Run locally** (optional)
```bash
   firebase serve
```
   Then open `http://localhost:5000` in your browser.

### Making Changes

1. Edit files in the `public/` folder
2. Test locally with `firebase serve` (optional)
3. Commit and push to `main`
4. GitHub Actions will automatically deploy to Firebase

---

## Deployment

This project uses **GitHub Actions** for automatic deployment. When you push to the `main` branch, it automatically deploys to Firebase Hosting.

You can monitor deployments in the [Actions tab](../../actions) of this repo.

---

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Firebase (Firestore, Cloud Functions, Hosting, Storage)
- **Deployment:** GitHub Actions → Firebase Hosting

---

## Questions?

Reach out to the project maintainer if you have questions or want to contribute.
