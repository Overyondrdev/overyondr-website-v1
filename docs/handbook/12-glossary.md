# 12 · Glossary

| Term | Meaning |
| --- | --- |
| **Access (Cloudflare Access / Zero Trust)** | Cloudflare's login gate. Charges a **seat** per person who logs in through it. We set it to **Bypass** everywhere and do sign-in ourselves |
| **Auto-fix** | Ops + a Claude agent fixing objective bugs automatically through a pull request, verified and revertible ([07](07-auto-fix.md)) |
| **Bypass** | An Access rule that lets requests through without logging anyone in: costs no seats |
| **CI / checks** | Automatic tests GitHub runs on every pull request; required ones must pass before merging |
| **Claude session / agent** | An AI assistant working in a repository; the **hub** session coordinates the others |
| **CSP** | Content Security Policy: a browser rule listing which sites a page may load scripts or data from |
| **Custom domain** | A Worker's own address, e.g. `ads.overyondrdev.com` |
| **Cutover** | The day overyondr.com switches from Squarespace to our own site. Owner sign-off only |
| **D1** | Cloudflare's database (SQLite). Each tool has its own |
| **Deploy** | Publishing a new version of a Worker. Workers Builds does it on merge; some repos use `npm run deploy` |
| **Dev Portal** | overyondrdev.com: the home page with every portal |
| **Directory / people picker** | Name and email autofill from the Yondr Team Contact List ([05](05-people-directory.md)) |
| **KV** | Cloudflare's key-value store (used for the directory and screenshots) |
| **Merge (squash)** | Accepting a pull request into `main` as one commit; this is what deploys |
| **Objective / subjective bug** | Verifiable fault vs matter of taste. Only objective bugs auto-fix |
| **Ops** | Yondr Ops at ops.overyondrdev.com: monitoring, alerts, backups, issues, auto-fix |
| **Owner** | The person who decides and approves the "ask first" list |
| **Pull request (PR)** | A proposed change, reviewed by checks before it's merged |
| **R2** | Cloudflare's file storage (backups, ad assets, request files) |
| **Repository (repo)** | A project's code on GitHub (org `Overyondrdev`; all public) |
| **Resend** | The email service for everything sent from overyondrdev.com |
| **Restore drill** | The monthly test that a backup can actually be restored |
| **Service account** | A robot Google identity with no password, here read-only on one sheet |
| **Session (`yondr_session`)** | The signed cookie that proves you're signed in, valid 12 hours on every site |
| **`session.js`** | The small file every site uses to check the session; copies must stay identical |
| **V1 / V2** | V1 = today's overyondr.com rebuilt off Squarespace; V2 = the redesign that will replace it |
| **Worker** | A small program running on Cloudflare; every site and tool here is one |
| **Workers Builds** | Cloudflare's build-and-deploy on merge, connected to GitHub |
| **Workers AI** | Cloudflare's AI models, used by Ops to classify bugs and by Feedback for summaries |
