// POST /api/signup
// Muse Foundry landing page form -> Brevo contact list (single opt-in).
//
// The Brevo API key stays server-side via Vercel env vars and is never exposed
// in the page.
//
// Required Vercel environment variables (Production):
//   BREVO_API_KEY          Brevo API key for the Muse Foundry account (secret)
//
// Optional (these default to the IDs the lists were created with):
//   BREVO_LIST_LISTENERS   numeric ID of "Muse Foundry Listeners"          (3)
//   BREVO_LIST_ARTISTS     numeric ID of "Muse Foundry Artists and Labels" (4)
//
// Brevo endpoint reference:
//   POST https://api.brevo.com/v3/contacts
//   headers: api-key, Content-Type: application/json
//   body: { email, attributes:{...}, listIds:[..], updateEnabled:true }
//   success: 201 created, or 204 updated when updateEnabled is true.
//
// The WEBSITE attribute must exist in Brevo (Contacts > Settings > Contact
// attributes) for the artist link to be stored. If it does not exist yet the
// call is retried without attributes so a signup is never lost to a config gap.

const BREVO_URL = 'https://api.brevo.com/v3/contacts';

function isEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

async function postToBrevo(apiKey, payload) {
  const r = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text().catch(() => '');
  return { status: r.status, ok: r.ok, text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // The page posts JSON via fetch. A no-JS browser posts form-encoded, in which
  // case we redirect instead of returning JSON.
  const wantsJson = String(req.headers['content-type'] || '').includes('application/json');
  const body = req.body || {};

  const branch  = String(body.branch  || '').trim();
  const name    = String(body.name    || '').trim();
  const email   = String(body.email   || '').trim().toLowerCase();
  const link    = String(body.link    || '').trim();
  const message = String(body.message || '').trim().slice(0, 2000);
  const honey   = String(body.mfxref  || '').trim();

  const bail = (code, msg) =>
    wantsJson
      ? res.status(code).json({ error: msg })
      : res.redirect(302, '/thanks?e=' + encodeURIComponent(msg));

  const win = (already) =>
    wantsJson
      ? res.status(200).json({ ok: true, already: !!already })
      : res.redirect(302, '/thanks');

  // Honeypot. A real person never sees this field, so anything in it is a bot.
  // Return success so the bot does not learn it was filtered.
  //
  // This is logged because a silent drop is indistinguishable from success at
  // the UI. If real signups ever go missing, check here first: an autofill that
  // targets the hidden field would look exactly like bot traffic.
  if (honey) {
    console.warn('signup: honeypot tripped, dropping submission', JSON.stringify({ branch, honeyLength: honey.length }));
    return win(false);
  }

  if (!isEmail(email))                          return bail(400, 'Please enter a valid email address');
  if (!name)                                    return bail(400, 'Please enter your name');
  if (branch !== 'listener' && branch !== 'artist') return bail(400, 'Please choose an option');

  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(
    branch === 'artist'
      ? (process.env.BREVO_LIST_ARTISTS   || '4')
      : (process.env.BREVO_LIST_LISTENERS || '3'),
    10
  );

  if (!apiKey || !listId) {
    console.error('signup: missing Brevo env config (BREVO_API_KEY / list IDs)');
    return bail(500, 'Signup is temporarily unavailable, please try again later');
  }

  // WEBSITE and MESSAGE must exist as text contact attributes in Brevo for
  // these to persist. If either is missing Brevo returns 400 and the retry
  // ladder below strips attributes, so the contact and list membership are
  // never lost, but the link or message would be. Create both in Brevo:
  // Contacts > Settings > Contact attributes.
  const attributes = { FIRSTNAME: name };
  if (branch === 'artist' && link) attributes.WEBSITE = link;
  if (message) attributes.MESSAGE = message;

  try {
    let r = await postToBrevo(apiKey, {
      email,
      attributes,
      listIds: [listId],
      updateEnabled: true,
    });

    // 400 here is most often WEBSITE not existing as a contact attribute in the
    // account. Retry with only FIRSTNAME, which every Brevo account has by
    // default, so a missing WEBSITE costs the link but never the name or the
    // list membership.
    if (r.status === 400) {
      console.error('signup: Brevo 400 with attributes, retrying with FIRSTNAME only', r.text);
      r = await postToBrevo(apiKey, {
        email,
        attributes: { FIRSTNAME: name },
        listIds: [listId],
        updateEnabled: true,
      });
    }

    // Last resort: attributes are not the problem. Get the contact onto the
    // list with nothing but an email address.
    if (r.status === 400) {
      console.error('signup: Brevo 400 with FIRSTNAME only, retrying bare', r.text);
      r = await postToBrevo(apiKey, { email, listIds: [listId], updateEnabled: true });
    }

    // 201 = created, 204 = existing contact updated onto the list.
    if (r.status === 201 || r.status === 204 || r.ok) return win(r.status === 204);

    console.error('signup: Brevo error', r.status, r.text);
    return bail(502, 'Something went wrong, please try again');
  } catch (err) {
    console.error('signup: exception', err);
    return bail(500, 'Something went wrong, please try again');
  }
}
