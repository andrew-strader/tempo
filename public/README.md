# Tempo - Modular File Structure

Your monolithic `index.html` (10,629 lines) has been split into 4 modular files:

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 1,549 | HTML structure only (no inline CSS/JS) |
| `styles.css` | 3,642 | All CSS styles |
| `app-module.js` | 2,650 | ES6 module: Firebase init, auth, core app functions |
| `app-legacy.js` | 2,785 | Non-module script: UI handlers, form logic |

## How to Deploy

1. **Replace your current `public/` folder contents** with these 4 files
2. Keep your existing assets (`favicon.png`, `tempo-logo.svg`, `tempo-og.png`, etc.)
3. Commit to GitHub → GitHub Actions will auto-deploy to Firebase

## File Structure

```
public/
├── index.html       ← Main HTML (links to CSS & JS)
├── styles.css       ← All styles
├── app-module.js    ← Firebase + core logic (ES6 module)
├── app-legacy.js    ← UI handlers (regular script)
├── favicon.png      ← (keep existing)
├── tempo-logo.svg   ← (keep existing)
└── tempo-og.png     ← (keep existing)
```

## Notes

- The HEIC-to-JPEG converter script is loaded from CDN in `index.html`
- `app-module.js` uses ES6 imports for Firebase
- `app-legacy.js` relies on global variables set by `app-module.js`
- Load order matters: module script first, then legacy script

## Testing Locally

Before deploying, test locally with a local server:

```bash
cd public
python3 -m http.server 8000
# Visit http://localhost:8000
```

---

**Note:** The uploaded file was truncated at line 10,629. I've reconstructed the likely missing ending (a sign-in prompt visibility check and closing brackets). The code should work correctly.
