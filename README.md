# Automated Competitor Analysis

Web service for performing the complete competitor-analysis workflow from Technical Assignment 2. A user provides a company website (optional), a detailed product description, and a target region. The service searches current public web data, verifies industry relevance, analyzes the client and competitors, stores previous runs, and exports the result to Excel.

## Features

- research from a website and description or from a description only;
- competitor discovery through Yandex Search API and open web sources;
- filtering of unrelated companies and duplicate domains;
- collection of product, assortment, positioning, pricing, geography, channels, cases, strengths, and weaknesses;
- additional bank-industry verification against the Bank of Russia registry;
- saved analysis history in Cloudflare D1;
- Excel export with the final comparison table and no technical worksheets;
- test authentication with `admin / admin`.

## Stack

- TypeScript, React 19, vinext, and Vite;
- Cloudflare Workers and D1;
- Drizzle ORM;
- Yandex Search API;
- Node.js `>=22.13.0`.

## Local Setup

```bash
npm install
```

Create `.env.local` or `.dev.vars` and provide Yandex Search API credentials:

```dotenv
YANDEX_SEARCH_API_KEY=your_api_key
YANDEX_SEARCH_FOLDER_ID=your_folder_id
```

Start the development server:

```bash
npm run dev
```

The interface uses the test credentials `admin / admin`.

## Commands

```bash
npm run dev
npm run build
npm test
npm run lint
npm run db:generate
```

## Project Structure

- `app/` contains the interface and API routes;
- `lib/analysis.ts` contains search, validation, and competitor-analysis logic;
- `lib/xlsx.ts` builds the final Excel report;
- `lib/storage.ts` stores and retrieves analysis history;
- `db/` and `drizzle/` contain the D1 schema and migration;
- `tests/` contains build and behavior checks.

## Deployment to Vercel

Import the GitHub repository in Vercel. The included `vercel.json` builds the
vinext application and routes requests through a Vercel Function, so pushes to
the production branch deploy automatically. Add `YANDEX_SEARCH_API_KEY` and
`YANDEX_SEARCH_FOLDER_ID` in **Project Settings → Environment Variables** for
Production, Preview, and Development. Never commit real API keys or local
environment files.

The analysis history falls back to process memory on Vercel. It is therefore
cleared when a function instance is recycled; connect a persistent database
before relying on the history as a production archive.

## Notes

Search coverage depends on the enabled search sources, API quotas, and the quality of the company description. The more specific the product, audience, geography, and business model are, the more accurate the competitor list will be.
