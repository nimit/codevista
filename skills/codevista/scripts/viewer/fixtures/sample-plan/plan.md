---
title: Refresh-token auth
kind: plan
---

# Refresh-token auth

Add rotating refresh tokens so sessions survive access-token expiry without
forcing re-login. Reuses the existing `sessions` table and `actions/auth.ts`.

:::callout tone=decision
Chosen: opaque refresh tokens stored hashed, rotated on every use. Rejected JWT
refresh (can't revoke without a denylist).
:::

## Data shape

```data-model
entity Session [modified]
  id: uuid [pk]
  refreshHash: text [added] -- sha256 of the rotating token
  expiresAt: timestamptz [modified] (was: integer) -- now a real timestamp
```

## UI

:::columns
```wireframe surface=mobile label="Before"
<div style="display:flex;flex-direction:column;gap:10px;padding:16px;height:100%">
  <h1>Signed out</h1>
  <p class="wf-muted">Your session expired. Please sign in again.</p>
  <button class="primary">Sign in</button>
</div>
```
```wireframe surface=mobile label="After"
<div style="display:flex;flex-direction:column;gap:10px;padding:16px;height:100%">
  <h1>Welcome back</h1>
  <p class="wf-muted">We kept you signed in.</p>
  <span class="wf-pill accent">Session refreshed</span>
</div>
```
:::

```prototype surface=mobile label="Refreshed session — final look"
<style>
  body{ display:flex; align-items:center; justify-content:center; height:100vh; }
  .card{ width:80%; padding:24px; border-radius:16px; background:var(--wf-card);
    border:1px solid var(--wf-line); box-shadow:0 8px 30px rgba(0,0,0,.08); text-align:center; }
  .card h1{ margin:0 0 8px; font-size:20px; }
  .card p{ margin:0 0 16px; color:var(--wf-muted); }
  .pill{ display:inline-block; padding:4px 12px; border-radius:999px;
    background:var(--wf-accent-soft); color:var(--wf-accent); font-size:13px; font-weight:600; }
</style>
<div class="card">
  <h1>Welcome back</h1>
  <p>We kept you signed in.</p>
  <span class="pill">Session refreshed</span>
</div>
```

## Key change

```diff file=actions/auth.ts lang=ts summary="rotate refresh token on use"
 export async function refresh(token: string) {
-  const s = await db.session.find({ token })
-  return s
+  const s = await db.session.find({ refreshHash: sha256(token) })
+  if (!s) throw new Unauthorized()
+  const next = rotate(s)
+  return next
}
note@4: new lookup is by hash, not raw token
```

```file-tree
~ actions/auth.ts   rotate + hash lookup
+ lib/tokens.ts     sha256 + rotate helpers
```

## Tests

```tests title="Tests to add" id=tests-auth
- "rotates the refresh token and invalidates the old one on use"
- "rejects a reused (already-rotated) refresh token" skip
- "hashes tokens at rest (no plaintext in the store)"
```

:::question-form title="Open Questions" id=open-questions
q single "Refresh token lifetime?" answer="oifo"
  - "30 days" recommended detail="matches current mobile expectation"
  - "7 days" detail="tighter, more re-logins"
:::
