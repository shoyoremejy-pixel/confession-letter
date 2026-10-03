# Secure answer-email setup

The site remains static on GitHub Pages. Answer email now goes through a Cloudflare Worker, which validates the site origin, accepts only four fixed answer values, checks Turnstile, limits each IP to five submissions per hour, and sends through Resend. The recipient address and provider credentials are not stored in the browser files.

Until setup is complete, the site still lets visitors choose an answer but does not email it.

## 1. Configure Resend

1. Create a Resend account and verify a domain you control for sending.
2. Create an API key with permission to send mail.
3. Keep the API key private. Do not add it to this repository or `site-config.js`.

Resend requires a verified sender. `EMAIL_FROM` must be an address on that verified domain.

## 2. Configure Cloudflare Turnstile

1. Create a Turnstile widget in Cloudflare.
2. Allow the hostname `shoyoremejy-pixel.github.io`.
3. Copy its **site key**; this key is public and belongs in `site-config.js`.
4. Keep its **secret key** private for the Worker.

## 3. Configure and deploy the Worker

Before deploying, edit `worker/wrangler.toml` and replace the example `EMAIL_FROM` with an address on your verified Resend domain. This sender address is configuration, not a credential.

Install Node.js, open PowerShell in the `worker` folder, then run:

```powershell
npx wrangler@4 login
npx wrangler@4 deploy
```

The first deployment creates the Worker and Durable Object namespace. Wrangler prints the Worker URL. The API will return a configuration error until all secrets are set.

Add secrets with Wrangler prompts:

```powershell
npx wrangler@4 secret put RESEND_API_KEY
npx wrangler@4 secret put TURNSTILE_SECRET
npx wrangler@4 secret put EMAIL_TO
```

Wrangler prompts for each secret; enter it directly into that prompt. Do not paste secrets into chat, source files, or command-line arguments.

For `RATE_LIMIT_HMAC_KEY`, generate a value first, then paste its output only into Wrangler's prompt:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npx wrangler@4 secret put RATE_LIMIT_HMAC_KEY
```

The Worker URL is public; the API remains fail-closed until the secrets are configured.

## 4. Connect the public site

Edit `site-config.js` with the Worker endpoint and Turnstile site key:

```js
window.CONFESSION_CONFIG = Object.freeze({
  answerApiUrl: "https://confession-answer-api.YOUR-SUBDOMAIN.workers.dev/answer",
  turnstileSiteKey: "YOUR_PUBLIC_TURNSTILE_SITE_KEY"
});
```

These two values are public configuration. Never put `RESEND_API_KEY`, `TURNSTILE_SECRET`, `EMAIL_TO`, or `RATE_LIMIT_HMAC_KEY` here.

Commit and push the changes to `main`; GitHub Actions publishes the updated site. Test both an opted-in and unchecked choice. An unchecked choice should never result in an email.

## What the controls do

- The Worker accepts only `yes`, `no`, `chance`, or `friends`; it ignores client-supplied email content and timestamps.
- Browser requests must come from the GitHub Pages origin.
- Turnstile tokens are checked server-side for success, the expected hostname, and the expected action.
- The Durable Object allows at most five attempts per IP-derived HMAC key per hour. It stores no raw IP address and deletes the rate record at the end of its window.
- Resend API credentials and the destination address are Worker secrets; the browser never calls Resend directly.
- Email sending is optional and still requires the visitor's explicit consent.
- The Turnstile script is loaded only after the visitor opts in to email sharing.

This reduces automated abuse; it cannot prevent every determined attacker or guarantee email delivery. Review Cloudflare, Turnstile, and Resend account activity and limits.
