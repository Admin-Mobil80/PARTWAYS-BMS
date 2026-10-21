# PARTWAYS-BMS

Back-office (business management system) for the PartWays team, at https://bms.partways.org: organisations and their usage, credit adjustments, the team and an audit log. Plain HTML, CSS and ES modules, no build step; the design system (`css/base.css`, `js/lib.js`) is shared with PARTWAYS-PORTAL.

Sign-in is a 6-digit email code against the BMS's own Cognito user pool (separate from the website's). The root account is riyad@mobil80.com, who adds and removes team members.

Locally, run `npm run dev:bms` in `../PARTWAYS-BACKEND` (http://localhost:8788); the code is printed in its console.

Pushing to `main` deploys this folder to the `BMS/` folder of `webapps.partways.org` and refreshes CloudFront through GitHub Actions (`.github/workflows/deploy.yml`). The workflow's defaults are the `partways-bms` stack outputs in PARTWAYS-BACKEND.
