# muse-foundry

Landing page for musefoundry.studio. A demand test: one page, one branching
signup form, no store.

Static HTML plus a single Vercel serverless function. No framework, no build
step. Same pattern as `mfi-website`.

## Layout

```
index.html        the page
styles.css        all styling
api/signup.js     form handler -> Brevo
thanks/           no-JS fallback success page
img/              logo artwork
```

## How the form works

One question branches the form:

- **I want to buy music** collects name and email, and lands on Brevo list
  "Muse Foundry Listeners".
- **I release music** collects name, email, and a link, and lands on Brevo list
  "Muse Foundry Artists and Labels".

Single opt-in. The submission itself adds the contact, so nothing depends on a
confirmation email being delivered.

Spam protection is an off-screen honeypot field named `company`. Anything that
fills it gets a success response and is silently dropped.

## Environment variables (Vercel, Production)

| Variable | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | yes | Muse Foundry Brevo account. Secret, server-side only. |
| `BREVO_LIST_LISTENERS` | no | Defaults to `3`. |
| `BREVO_LIST_ARTISTS` | no | Defaults to `4`. |

## Brevo setup this depends on

- Two contact lists, IDs 3 and 4.
- A contact attribute named `WEBSITE` (text) to store the artist link. If it is
  missing, `api/signup.js` retries without attributes so the signup still lands
  on the list, but the link is not saved.

## DNS

Nameservers are at Porkbun. The domain currently points at Squarespace, which
301s to musicalform.org. Cutting over means changing the A records at Porkbun to
Vercel's.

`musefoundry.studio` is the primary Google Workspace mail domain and its DMARC
policy is `p=quarantine`. Change A records and add the CNAME Vercel asks for.
Do not touch the MX records or the `google-site-verification` TXT.
