# Design Spine

Look at every screen before you ship it.

Design Spine screenshots every route of your Next.js app in every state, width and theme, flags what broke, and gives you one contact sheet to approve or reject each screen. Approved screens become baselines, and `spine diff --strict` fails CI until every change has been looked at by a person.

Everything runs on your machine. No account, no upload, no per-snapshot bill.

![Design Spine contact sheet](docs/images/contact-sheet.png)

## Why

Most UI gets built and checked in one state: the happy path, at desktop width, in light mode. AI coding agents make this worse, because they build screen by screen and never open the 390px dark-mode empty state. Design Spine makes the full matrix visible and makes "someone looked at it" a recorded fact instead of a hope.

## Quick start

Requires [Bun](https://bun.sh) 1.3+ and a running copy of your app.

```bash
git clone https://github.com/forbiddenlink/design-spine && cd design-spine
pnpm install && pnpm exec playwright install chromium
alias spine="bun $PWD/src/cli.ts"

cd ~/code/your-next-app
spine plan                     # reads app/ and drafts design-spine.json
spine capture                  # screenshots route x state x 390/1280 x light/dark
spine review                   # opens the contact sheet at http://localhost:4747
```

In the contact sheet, press `j`/`k` to move, `a` to approve, `r` to reject and `Enter` to inspect a screenshot at full size against its baseline.

## What it checks on every screenshot

- HTTP errors, redirects and failed captures
- Console errors and uncaught page errors
- Horizontal overflow (the classic mobile bug)
- Near-blank regions, such as cards that rendered empty
- Broken images and clipped text
- Fixed overlays covering content, such as cookie banners and chat widgets
- Optional: axe accessibility scan, repeat-capture stability, and a Claude vision critique

Automatic checks never count as approval. Only a person approves.

## Reach the states nobody opens

Empty, loading and error states need data. Describe them in `design-spine.json` with mocked responses and interaction steps instead of seeding a database:

```json
{
  "path": "/dashboard",
  "states": [
    { "name": "ideal", "storageState": "auth/populated.json" },
    {
      "name": "error",
      "responses": [{ "url": "**/api/dashboard", "status": 503, "body": "Unavailable" }],
      "ready": { "selector": "[role=alert]" }
    }
  ]
}
```

`spine doctor` lists every state you have not made capturable yet, so missing coverage stays visible instead of silently passing.

## Gate CI on human review

```bash
spine approve           # approved tiles become baselines
spine diff --strict     # exit 1 unless every planned tile is captured, approved and unchanged
spine report --out review.html   # portable offline record of what was approved and why
```

## Commands

| Command | What it does |
|---|---|
| `plan` | Drafts `design-spine.json` from `app/` or `src/app/` |
| `doctor` | Validates the manifest and lists unfinished coverage, without a browser |
| `capture` | Screenshots every route x state x viewport x theme and runs the checks |
| `review` | Local contact sheet for approve, reject and notes |
| `critique` | Optional Claude vision pass through the `claude` CLI |
| `approve` | Promotes approved tiles to baselines |
| `diff` | Compares a run with baselines; `--strict` requires complete approved evidence |
| `report` | Self-contained HTML record of a review |
| `lint` | Ratchet on arbitrary Tailwind values such as `w-[37px]` |
| `status` | Writes `.design-spine/status.json` for dashboards |

Full reference: [docs/USAGE.md](docs/USAGE.md).

## How it compares

| | Design Spine | Chromatic, Percy, Argos | Playwright `toHaveScreenshot` |
|---|---|---|---|
| Runs locally, no upload | Yes | No | Yes |
| Plans the route x state matrix from your app | Yes | No | No |
| Human approval ledger per screenshot | Yes | Yes, in the cloud | No |
| Coverage gaps shown as unfinished | Yes | No | No |
| Needs Storybook | No | Chromatic: mostly | No |
| Pricing | Free | Per snapshot | Free |

## Limits

- Next.js App Router only for `plan`. Other apps can write the manifest by hand.
- Chromium only. Tested on macOS; Linux and Windows are not yet verified.
- Requires Bun to run the CLI.
