import { Router } from "express";

// The Privacy Policy and Terms of Service live on the website — web/privacy.html and web/terms.html
// are the only copy (the app links there too). These API URLs used to serve their own copies; they
// now redirect so any old link keeps working and can never show outdated text.
const router = Router();

router.get("/privacy", (_req, res) => {
  res.redirect(301, "https://upvital.app/privacy");
});

router.get("/terms", (_req, res) => {
  res.redirect(301, "https://upvital.app/terms");
});

export default router;
