# 🌱 SelfMate

A calm phone app for life admin: money, deadlines, trips, projects and a small company, built on **Google Sheets + Apps Script**.
Everything you enter lives in **your own Google Sheet**. This repository contains only code, never personal data.

**Home page:** https://samuelbud.github.io/selfmate/ (paste your private link once; it stays on your phone)

## What it does
- **Today**: a plant that grows one leaf per weekly check-in, with the sky following the season and live local weather; what you can still spend this week; upcoming deadlines; one insight.
- **Money**: bank-statement import (BT, Revolut, most CSVs), automatic categories that learn from your answers, colour blocks per category, a year view, cash & savings balances, plain-language questions ("car this year"), and insights with concrete tips.
- **Dates**: Romanian deadlines (RCA, ITP, rovinieta, impozite, Declarația unică…), synced to Google Calendar with reminders.
- **Trips**, **Projects** and a **company** tab (deadlines, invoices, costs, plan vs actual).
- Secret link + PIN lock, a partner link that hides private parts, and a Sunday summary email.

## Privacy by design
- `.gitignore` is an **allow-list**: every file is ignored unless it is named there.
- `.githooks/pre-commit` runs `tools/privacy-check.js` before every commit and blocks IBANs, emails, card numbers, private links, Sheet IDs and a local list of private words.
- Personal setup lives in `Config.gs` and generated `Import*.gs` files, which are never committed.

To enable the guard after cloning: `git config core.hooksPath .githooks`

## Set up your own copy
1. Create a Google Sheet, then install [clasp](https://github.com/google/clasp) and run `clasp login`.
2. `clasp create-script --type sheets --title SelfMate --rootDir apps-script`, then copy `apps-script/Config.example.txt` to `apps-script/Config.gs` and paste your Sheet ID.
3. `clasp push` and `clasp create-deployment`. Open the web app link once to set everything up and get your private links.

## Credits
Seedling icon: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT). Weather: [Open-Meteo](https://open-meteo.com). Fonts: Young Serif, Instrument Sans (Google Fonts, OFL).
