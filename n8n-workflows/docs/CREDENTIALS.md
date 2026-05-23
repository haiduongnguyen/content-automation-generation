# n8n Credentials Mapping

Voi bo workflow hien tai, n8n chi can quyen chay command tren may local.
Secrets duoc doc tu file `.env` cua project khi script npm chay.

## Bat buoc
- n8n process phai chay tren cung may voi project:
  - `C:/Users/ADMIN/Desktop/content-automation-mvp`
- Node `Execute Command` duoc phep trong n8n instance

## Secrets doc tu .env
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Gemini: `GEMINI_API`
- Facebook: `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_GRAPH_VERSION`
- SMTP report: `REPORT_EMAIL_ENABLED`, `SMTP_*`, `REPORT_EMAIL_*`
- Postgres: `PG*`

## Test command local truoc khi bat workflow
```bash
npm run generate:once
npm run publish:once
npm run report:email
```

Neu 3 lenh tren chay tot, workflow n8n se chay duoc.
