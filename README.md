# Reach Out

Reach Out is a local tool for planning stays, keeping candidate notes, preparing individual message drafts, and recording conversations for a Workaway host.

## Important platform limit

Workaway's published [Terms and Conditions](https://www.workaway.info/en/info/terms-conditions) restrict software access to its pages, compiling scraped data, and spam messages. Its [first-contact advice](https://www.workaway.info/en/info/workawayer/first-contact-advice) discourages copied or AI-written outreach. This release therefore has **no Workaway browser extension, profile scraper, inbox reader, or automatic sender**. The local server rejects legacy extension, profile-discovery, and sending requests. It does not bypass browser controls or Workaway's rules.

Add candidate details yourself, using only information you are permitted to record. Reach Out can compare those details with the host's dates and requirements, prepare an individual draft, copy it to your clipboard, and keep a status that you update yourself. Review the profile and send any message manually in Workaway. Ask candidates directly about exact arrival and departure dates; travel-month indicators are not confirmed availability. Record replies yourself and take over every conversation personally.

Automatic provider access may be considered only after Workaway gives written permission for the specific integration. A changed policy notice or host login alone does not enable it.

## Run locally

Requirements: Node.js 22.13 or newer.

1. Install dependencies with `npm ci`.
2. Start the local application with `npm start`.
3. Open `http://127.0.0.1:4173`.

The server binds to loopback and saves its SQLite database and recovery snapshots under `data/`. It does not send candidate information to a cloud AI service. Keep `data/`, backups, exported records, and browser downloads private; they are excluded from Git.

Use **Settings → Full backup** to export the workspace. To remove it from this computer, stop Reach Out and delete its complete project folder, including `data/`. Backups or exports saved elsewhere must be removed separately.

## Main features

- Host profile and exact availability periods.
- Manually entered candidate profiles, notes, and eligibility rules.
- Local matching explanations and one-to-one message drafts.
- Manual reply and conversation records, tasks, and calendar planning.
- Local JSON export, recovery snapshots, and restore.
- Local-only HTTP server with origin checks, request limits, and state validation.
- Fail-closed server routes for all legacy Workaway extension, discovery, and send operations.

Matching is a local aid, not a decision about whether someone should be hosted. Unknown availability and requirements should be checked with the person. The host remains responsible for profile accuracy, fair selection, privacy, and all communication and hosting decisions.

## Development checks

- `npm test` — server and domain checks.
- `npm run build` — production frontend build.
- `npm run check` — both checks.

Tests use local fixtures and do not contact Workaway or send real messages.

## Deployment

This version is a local application. It has no production deployment, hosted database, shared account service, or cloud integration. Do not expose the local server to a network.

## License

No license has been selected. Until a license file is added, no permission is granted to copy, modify, or distribute the source code.
