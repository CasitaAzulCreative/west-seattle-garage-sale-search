# West Seattle Garage Sale Search

This folder is ready to publish on GitHub Pages as a static site.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `data/sales-data.js`
- `.nojekyll`

## Publish On GitHub Pages

1. Create a new GitHub repository.
2. Upload everything in this folder to the root of that repository.
3. On GitHub, open:
   `Settings` -> `Pages`
4. Under `Build and deployment`, choose:
   `Source: Deploy from a branch`
5. Choose:
   `Branch: main`
   `Folder: / (root)`
6. Save.
7. Wait for GitHub Pages to finish publishing.

Your site URL will look like one of these:

- `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`
- or, if this is a project site inside an org:
  `https://ORG-NAME.github.io/YOUR-REPO-NAME/`

## Notes

- This app is fully static. No build step is required.
- The app loads sale data from `data/sales-data.js`, so it works on GitHub Pages without a backend.
- If you later want to use a custom domain, add it in GitHub Pages settings after the first publish.
