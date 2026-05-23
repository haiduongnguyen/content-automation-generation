# n8n Migration Notes

## Muc tieu
Chuyen orchestration sang n8n, giu code cu de rollback neu can.

## Trang thai hien tai
- n8n da chay local: `http://localhost:5678`
- Da tao 2 workflow JSON de import nhanh:
  - `n8n-workflows/workflows/daily_content_pipeline.json`
  - `n8n-workflows/workflows/daily_report.json`

## Kien truc da chot
### 1) daily_content_pipeline (1 flow)
- Cron 21:00
- Chay `npm run generate:once`
- Wait 5 minutes
- Chay `npm run publish:once`

Luu y:
- Trong code `generate:once`, content generator da duoc cap nhat:
  - Goi Gemini truoc (neu co `GEMINI_API`)
  - Neu Gemini fail / output JSON invalid -> fallback OpenAI

### 2) daily_report
- Cron 22:00
- Chay `npm run report:email`

## Bien moi truong can co (.env)
- DB: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Gemini: `GEMINI_API`
- Facebook: `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_GRAPH_VERSION`
- Report: `REPORT_EMAIL_ENABLED`, `SMTP_*`, `REPORT_EMAIL_FROM`, `REPORT_EMAIL_TO`

## Cac buoc import trong n8n
1. Import `daily_content_pipeline.json`
2. Import `daily_report.json`
3. Test manual tung workflow 1 lan
4. Bat Active cho 2 workflow
5. Tat task scheduler cu cua Windows de tranh chay trung

## Checklist nhanh
- [ ] `npm run generate:once` chay OK
- [ ] `npm run publish:once` post len page OK
- [ ] `npm run report:email` gui mail OK
- [ ] n8n workflow execute thanh cong khi test manual
- [ ] Timezone trong workflow la `Asia/Ho_Chi_Minh`
