# Tracklist

A personal coaster ranking and credit tracker for desktop and mobile. The static frontend runs on GitHub Pages; optional Firebase email/password accounts sync collections across devices. Local saving and downloaded backups work without an account.

## Run and deploy

Use Node.js 18 or newer. Run `npm start` and open http://127.0.0.1:4173. No installation is needed to run or build. For tests, run `npm ci` then `npm test`. `npm run build` creates `dist/` with all static assets; development packages are never shipped.

Push `main`, select **Settings → Pages → GitHub Actions**, and use the included deployment workflow. Relative asset paths support project subdirectories. See [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Public Web App configuration is in `firebase-config.js`. Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to enable Email/Password, create the default Firestore database, publish [firestore.rules](firestore.rules), and authorize the website domain. GitHub Pages can remain the host. The shared iOS/web services use Cloudflare Workers Free for trusted profile publication, moderation and account deletion, while Firebase stays on Spark. See [NATIVE_SERVICES.md](NATIVE_SERVICES.md) for the coordinated migration; guest tracking remains local.

## Rank and track credits

- Drag a handle with mouse or touch to reorder. Edge dragging scrolls the page.
- Click a rank to jump to any position, top, or bottom.
- **Rank by comparison** quizzes unranked credits against your existing ranking, reranks one ride, or rebuilds all credits from scratch. Choose **Rank higher**, **Rank lower**, **Much higher**, or **Much lower** to place the highlighted ride above or below the reference. Normal answers use binary insertion (at most nine comparisons for 500 reference rides); strong answers move the next question nearer the appropriate end without assuming untested comparisons. The final answer saves the position and immediately advances to the next ride, with no confirmation or delay. The first ride in an empty ranking is placed automatically.
- Buttons stay in the same place between questions. Use ↑ / ↓ for higher / lower, Shift + ↑ / ↓ for the stronger choices, or keys 1–4. **Back one answer** revisits the current comparison; **Undo last ride** restores the latest placement and returns to its final question. Skip preserves the ride’s status. Notes and links expand on demand.
- Click a ride’s rank and choose **Compare to rerank**, or choose **Rank now** after logging a new ride. A full rebuild compares against rides already processed in that quiz. As rides are placed, processed rides are reordered in their existing ranking slots; unprocessed rides stay in place. Previously unranked rides get new ranking slots. The completion screen highlights a single ride’s final rank (for example, **#7**) or lists each final position after a batch, with Undo last ride still available. Skipped rides retain their slots and ranking status.
- Pause or close the quiz to resume later. Pending answers are saved locally per account on this device; they are not synced or included in exported backups. Automatic placements use the normal collection saving, cloud sync, recovery, and undo. Changes to the ranking or credit membership invalidate a paused quiz so it cannot apply outdated comparisons.
- **Select multiple** reveals row checkboxes and Select all. Select several rides and move them together; shift-click selects a range. **Done selecting** hides the controls and clears the selection. Relative order is preserved, and leaving the page exits selection mode.
- Focus a handle and use arrows, Home, or End. Ctrl/Cmd+Z undoes changes outside text inputs; / focuses search.
- Use the menu to switch between **My Ranking**, **Unranked** and **Credits**. New logged credits start unranked. **Credits** includes every ridden ride, alphabetically by default. Its **View** dropdown switches to **Group by park**, with alphabetized parks and rides plus counts for each park. Ride type and manufacturer filters combine with search and either view. These display choices never change your saved ranking; **My Ranking** stays in ranked order. Use the single **Edit** action to change notes, first-ridden date, details, POV, or RCDB URL.
- **Explore parks** searches the bundled catalog by park, ride, manufacturer, and country. Select a park to see its catalog rides. Filter current/status-unknown entries or include historic/planned rides.
- **Wish list** has separate **Parks wish list** and **Rides wish list** buttons, with search and pagination. **Wish List a Park/Ride** opens a searchable catalog picker that saves wishes without logging credits. Saving a ride does not save its park; removing a park keeps its individual ride wishes, and removing a ride keeps its saved park. Open saved parks to see all catalog rides and your logged credits. **Log credit** adds a ridden ride, fills metadata and available links, and removes that individual ride wish. Saved parks remain until you remove them. Matching RCDB IDs or names/parks prevent duplicate logging.
- **Credits → Add a ride** starts with catalog search. Selecting a match fills its details; **Add manually** expands the fields for missing rides, and **Edit ride details** lets you adjust a catalog match. Multi-track rides show track choices before saving. You can also paste multiple lines as `Ride | Park` with **Add several manually**. After saving from Credits or logging through the catalog, **Rank now** starts a comparison quiz; **Do later** or dismissing the offer keeps the new credit safely in Credits and Unranked. New rides never append directly to the ranking. Ranking and Unranked link to Credits for adding rides.
- The initial sample is clearly marked. **Start my own list** removes demonstration rides while retaining personal additions. New accounts copy personal additions and planned rides, excluding samples.

The catalog currently contains **4,390 rides and 2,194 source park records**, with additional park groups derived from ride metadata from public Coasterpedia articles and supplemental Wikidata entries. It is a dated community snapshot, with incomplete coverage and non-live statuses. Historic names help match imported credits. Source links, RCDB ride pages, and available direct YouTube POVs are included; search links are offered when a direct link is missing. No video or article media is copied. Attribution and reuse terms are in [CATALOG_LICENSE.md](CATALOG_LICENSE.md).

## Separate tracks, one ranking

Open a ride's **Edit → This ride has separate tracks**. Give each track a name, mark the tracks you've ridden and optionally choose a favorite. Each ridden track adds one credit, while the ride has one ranking position and one comparison-quiz entry. **Credits → Track credits** shows its individual credited tracks. If no track is identified, an existing ridden ride remains one unspecified credit; Tracklist never assumes you've ridden every side. Up to eight tracks per ride are supported, within the overall 5,000-credit limit. Track notes and first-ride dates are private.

When adding a credit, track choices appear automatically when the ride data provides separate tracks. The add form has no separate-tracks toggle or track-name setup; choose which supplied tracks you rode and optionally a favorite. Ordinary credits show no track section. Custom track setup remains available later in Edit.

Stardust Racers has built-in **Green / Yellow** names, verified by [Universal's guide](https://blog.discoveruniversal.com/attractions/guide-to-stardust-racers-in-universal-epic-universe/). Original Gwazi at Busch Gardens Tampa has **Lion / Tiger** names, verified by [its catalog source](https://coasterpedia.net/wiki/Gwazi_(Busch_Gardens_Tampa)). These are scoped by ride and park; Iron Gwazi and Gwazi in Botswana are separate rides. Logging a catalog entry opens its track choices; **Tracks & credits** lets you log another side later without adding a second ranking entry. Other multi-track rides can be configured manually.

Identifiable Green/Yellow or Lion/Tiger entries from older backups are consolidated at their highest existing ranked position, retaining track notes/dates and their separate credits. Entries with unidentified sides, or combined notes that exceed the supported length, remain available for explicit review. **Edit → Combine separate track entries** combines another entry from the same park; choose distinct track names and the combined ride name. The selected ride keeps its rank, or inherits the other entry's rank if previously unranked. Undo restores separate entries. Combining unrelated rebuilt rides is never automatic.

Credit totals, manufacturer/type credit breakdowns, park pins and shared profiles count ridden tracks. Preference scores, top-10 appearances and ranking positions count the combined ride once. The private first-ride timeline also counts rides once, using the earliest recorded overall ride date; separate track dates remain in details.

Backups and synced collections now use **version 2**, which preserves tracks and favorites. Version 1 imports and recovery snapshots remain supported. JSON and CSV both retain track data; CSV stores the track list as a JSON cell and includes a derived credit count. Refresh existing tabs/devices before editing upgraded collections: the previous app rejects version 2 rather than silently stripping track details. Existing shared profiles upgrade on the next successful publication, including when the private revision has not changed. The collection version upgrade preserves existing private paths. The native companion integration separately requires the trusted-service rules and migration described in [NATIVE_SERVICES.md](NATIVE_SERVICES.md).

## Statistics and park map

Open **Statistics** in the navigation or use the shortcut on the ranking page. This page shows total credits, ranked/unranked rides, visited parks/countries, manufacturers, preferred manufacturer, ride type and park, ranking highlights, metadata coverage and a private first-ride-year timeline. Breakdowns compare manufacturers, types, parks and countries by credits, rank strength, top-10 appearances or individual ride wishes, with pagination for long lists. Ride wishes are kept separate from ridden credits.

Count bars show a share of the complete relevant total, rather than scaling to the largest category: all credits (including missing details), the actual top-10 list, or all ride wishes. Rank strength uses its 0–100 scale. First-ride-year bars show a share of all rides, including undated rides. Ranking, Statistics and shared profile displays use the same visited-park calculation, combining known park aliases and retaining named parks whose locations are unavailable.

Preferences use ranked positions rather than credit frequency. Each ranked ride has relative strength from 100 (first) to 0 (last); a group's strength is the average. Favorites first consider groups with three ranked credits (or the whole ranked count if smaller), falling back to the strongest available group with an early-signal label. Ties favor more ranked credits, then alphabetical order. Unranked rides never influence preferences. These are ranking summaries, not absolute ride ratings. Missing metadata can be enriched from an unambiguous bundled catalog match without changing saved rides; common manufacturer/country aliases are combined in the statistics view. Demonstration rides are excluded.

The interactive park map uses a bundled Natural Earth outline and Wikidata park coordinates plus source-attributed approximate centers from the existing public ride catalog: no map API key, location permission or visitor geocoding requests. Pins show logged credits per park; nearby parks cluster with a summed area count. Select a pin to see its constituent parks and rides. Zoom, fit, reset, drag and keyboard controls work alongside a searchable/paginated park list. Missing or ambiguous park locations remain unpinned and are explicitly listed, so map totals can be lower than collection totals. Matching aliases for the same public park are combined. Coordinates and coverage are community data rather than live or exhaustive geographic information. See [MAP_LICENSE.md](MAP_LICENSE.md); the official catalog pipeline adds available park coordinates automatically. The optional `node scripts/update-park-map.cjs` refreshes the fallback after bootstrap.

Shared profiles display preference summaries plus their own **Statistics** tab and park map. These statistics are computed from the existing sanitized shared collection; private notes and first-ride dates never enter that view. This feature adds no new database paths or rules. Turning off profile sharing hides statistics along with the rest of the profile.

## Social profiles and friends

New accounts choose a unique username during signup. Existing accounts can choose one from **Social** or **Account → Profile & username**. Usernames are case-insensitive, begin with a letter, contain 3–24 letters, numbers or underscores, and cannot be changed or transferred.

In **Social**, enter an exact username (with or without `@`) to see a shared profile's credit count, ranked count, parks visited, favorite, full ranking, all credits and park/ride wishes. Profile lists support search and pagination. **Add friend** saves that account to your private friends list for quick access; it does not send a request or create a mutual friendship. Friends sync with your account, with a limit of 500.

Sharing is an explicit checkbox at signup or username setup and can be disabled in **Profile settings**. Shared profiles are available only to signed-in users. Notes, first-ridden dates, email, friends and sample credits are never copied into shared profiles. A separate sanitized copy is published after successful private saves; pending changes and unresolved conflicts do not replace it. Hiding a profile stops new reads, but cannot retract information someone already viewed. The username remains reserved. Private saving continues independently if Social is unavailable.

Publish the current **firestore.rules** before enabling this version on a live site; the earlier private-sync rules do not permit Social. Username, sharing settings and friends are account data stored separately from collection backups. They are not included in collection JSON/CSV exports or restored by collection imports. Shared profiles are derived from the latest acknowledged private collection rather than separate user-edited collections.

## Import credits

Open **Data & backup → Import credits**. Paste a ride table, enter lines as `Ride | Park`, or choose a saved HTML, CSV, or TSV file. Review catalog matches before importing. Existing credits and notes are kept; new credits start unranked. Saved HTML requires a table with recognizable Name/Coaster Name and Park headers. Imported scripts are never executed.

## Saving, recovery, and sync

The header has explicit **Log in** and **Log out** controls. **Create account** is a separate tab in the login dialog. Guest status means this device only; **Account saved** confirms a cloud revision. Offline, blocked, pending, and conflicting account saves have distinct status text.

Every change saves to browser localStorage first. Private browsing, clearing site data, changing the site origin, or full storage can lose that copy. The app reports saving failures and keeps editing/export available. Unreadable saved data is preserved until an explicit replacement, with a recovery-file download.

**Export JSON** is the complete independent backup: ranking, notes, metadata, saved parks, and individual ride wishes. CSV contains ride entries with track details, a derived credit count, ranking and links. Potential spreadsheet formulas are prefixed with an apostrophe; use JSON for exact backups. Import offers merge or replacement. Merge keeps existing order and notes, merges newly ridden tracks into matching rides, skips unchanged duplicates, and appends new ranked rides. Undo keeps 30 changes in this tab. Up to 10 local recovery checkpoints per collection are kept within a shared 2 MB budget; they disappear if browser data is cleared.

With an account, a one-second debounce uploads edits to Firestore. Cloud saves retain 10 revisions and use transactions to prevent silent overwrites by other devices. A conflict offers **Use cloud**, **Merge both**, or **Use this device**, plus a backup download. Merge keeps the cloud ranking/notes and adds missing local credits; it cannot combine conflicting note edits or ranking orders. Offline changes stay local and retry when connected. Oversized sync payloads (over 6 MB) remain local and exportable. Guest and account collections have separate local copies; signing out returns to the guest collection.

### CSV format

CSV, semicolon-delimited files, TSV, UTF-8 BOMs, quoted commas, quotes, and multiline fields are supported. A header and data row are required.

```csv
name,park,rank,type,country,manufacturer,notes,pov,riddenOn,rcdb
Steel Vengeance,Cedar Point,1,Hybrid,United States,Rocky Mountain Construction,Back row,,2026-07-14,https://rcdb.com/15411.htm
New credit,Another park,,Steel,,,,,,
```

Only name is required. Name/Ride/Coaster/Coaster Name/Roller Coaster; Park/Park Name/Location; Rank/Ranking/Position; Country; Type; Manufacturer/Builder; Notes/Comments; POV/YouTube/Video; Ridden On/Date; RCDB/RCDB ID are recognized. Dates use real YYYY-MM-DD dates. Positive integer ranks are ordered numerically; blank ranks are unranked. No rank column means all entries go to Unranked. POVs require HTTPS YouTube links; RCDB links require a ride page. Collections and wish lists each support up to 5,000 entries; file imports are limited to 15 MB. Catalog-derived exports preserve source and license metadata.

## Maintenance and verification

Visitors search bundled data without provider requests. The official Coasterpedia API pipeline, staged validation, opt-in six-hour GitHub Actions workflow and shared JSON/manifest are ready to configure. Start with [CATALOG_SETUP.md](CATALOG_SETUP.md): add the provider key as an Actions secret, preview/review a bootstrap, publish it, then enable the schedule. Until that setup succeeds, the app retains its dated snapshot. The legacy bulk wiki and Wikidata updater commands are retired; the existing CC0 supplement remains in the catalog.

The app uses plain HTML/CSS/JS and modern browser APIs (dialog, Pointer Events, localStorage, Blob). Firebase SDK 12.19.0 loads from Google's CDN for auth/sync; no analytics are initialized. Google Fonts has system-font fallbacks. Collection data goes only to the configured Firebase project when signed in. External video, RCDB, and source links open separately.

Automated tests cover ranking, pointer/keyboard interactions, imports, catalog logging, wish lists, account isolation, recovery, offline queues, concurrent revisions, unsafe HTML/links, formula-safe CSV, and deployment artifact boundaries. DOM tests use jsdom; actual browser layout and CDN/CSP behavior need checking on the deployed site. Emulator tests exercise the real Firestore rule engine; they require the setup in [SECURITY.md](SECURITY.md). The live rules and provider console settings must also be verified before public release.

Run `npm run security:check -- --history` to scan tracked/current files, repository history and the build for credential and machine-path patterns. See [SECURITY.md](SECURITY.md) for the security boundary and release checks.

## Native companion services

[NATIVE_SERVICES.md](NATIVE_SERVICES.md) describes the coordinated iOS/web backend upgrade, free-plan quotas, operator responsibilities, account deletion, reporting and blocking. Deploy the services and compatible clients before enabling the new server-only Social rules.
