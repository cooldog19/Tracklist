# Shared native and web account services

Firebase Spark supplies the same accounts and version 2 private collections to web and iPhone. Trusted profile, moderation and deletion operations run on **Cloudflare Workers Free** at `https://tracklist-accounts.kmullendore19.workers.dev/`. GitHub Pages and the six-hour catalog workflow remain the public frontend/catalog host. Firebase Blaze and paid Firestore TTL are not used.

`firebase-config.js` selects `accountServicesURL`. The Firebase client SDK sends its authenticated callable protocol to that exact URL. The service verifies the Firebase ID token, checks revocation and binds the request to its initiating account. The CSP allows the specific Worker host. Private collection paths and account UIDs are unchanged.

## Coordinated deployment

1. Verify and deploy the native repository's locked `backend/` Worker. Its dedicated service identity has only Firestore data operations and Firebase user get/update/delete permissions; keep its private key solely in the encrypted Worker secret.
2. Publish the compatible web client and configure the same URL in iOS.
3. Deploy the matching server-only Firestore rules and two collection-group indexes. Reload older tabs for Social actions; private saves stay compatible.
4. Verify sanitized profiles, reports, bilateral blocking and complete deletion using explicitly disposable test accounts. See the native repository's `docs/BACKEND_DEPLOYMENT.md` for local emulator and actual Workers runtime tests.

## Behavior and operations

Sharing is opt-in. The service publishes the last acknowledged private revision and removes notes, ride dates, email, friends, sample entries and unknown fields. Its public-text filter can hold profiles for review. Reports are limited to 20 per reporter per day and retained for 90 days. The owner must review the restricted report queue, remove violating content and handle support/appeals.

Report, Block and Unblock are available on profiles. Firestore rules enforce blocks in both directions. Deletion requires a recent password sign-in, immediately hides the profile and prevents further account writes, then recursively removes account data and the Firebase identity. Updated clients remove local account/recovery copies. Exported backups and previously downloaded copies need an accurate privacy-policy explanation.

The Worker runs cleanup every 15 minutes: it retries pending deletion, processes profile backfill, repairs missed publication, prunes old snapshots and removes expired records. Pending jobs and their deletion markers do not expire. Completed markers remain for 24 hours so old ID tokens cannot recreate data. This uses ordinary Firestore operations instead of paid TTL.

Keep Cloudflare on Free and Firebase on Spark. Quotas are shared and finite; exhaustion can temporarily stop affected operations. Monitor Worker errors and pending deletion jobs. Finalize public privacy, community and support pages before App Store distribution. Never commit service-account keys or include them in a client build.

Run `npm ci`, `npm test`, `npm run build`, `npm run security:check` and the rule tests in `SECURITY.md`. Browser fixtures test the callable boundary; backend tests also exercise the real Workers/Auth/Firestore runtime, including 5,000-ride publication and scheduled cleanup.
