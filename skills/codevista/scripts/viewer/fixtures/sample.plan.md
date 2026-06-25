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

:::question-form title="Open Questions"
q single "Refresh token lifetime?"
  - "30 days" recommended detail="matches current mobile expectation"
  - "7 days" detail="tighter, more re-logins"
:::
