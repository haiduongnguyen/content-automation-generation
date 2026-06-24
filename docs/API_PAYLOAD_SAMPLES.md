# API Payload Samples

## OpenAI prompt template (system)
You are a Vietnamese social media copywriter. Return strict JSON with keys: title, body, cta, hashtags.
Rules:
- Write in Vietnamese.
- Keep body 120-220 words.
- No policy-violating, medical, legal, or financial guarantees.
- Practical, clear, and engagement-oriented.
- hashtags must be a JSON array of 3-7 short tags.

## OpenAI prompt template (user)
Topic: {{topic_name}}
Audience: SME owners in Vietnam
Tone: practical, trustworthy, concise
Goal: increase comments and shares

## Facebook publish request
- Method: POST
- URL: `https://graph.facebook.com/{{FB_GRAPH_VERSION}}/{{FB_PAGE_ID}}/feed`
- Headers:
  - `Content-Type: application/x-www-form-urlencoded`
- Body (form-urlencoded):
  - `message={{title}}\n\n{{body}}\n\n{{cta}}\n\n{{hashtags_joined}}`
  - `access_token={{FB_PAGE_ACCESS_TOKEN}}`

## Example success response (Graph API)
```json
{
  "id": "123456789012345_987654321098765"
}
```

## Example failure response (Graph API)
```json
{
  "error": {
    "message": "Invalid OAuth access token.",
    "type": "OAuthException",
    "code": 190
  }
}
```

## Retry policy
- Retry only for transient failures (5xx, network timeout, rate limit).
- Do not retry for invalid token/page permission until credentials are fixed.
