---
title: Recap — refresh-token auth
kind: recap
---

# Recap — refresh-token auth

Two files changed to add rotating refresh tokens.

```file-tree
~ actions/auth.ts   rotate + hash lookup
+ lib/tokens.ts     new helpers
```

## Key changes

:::tabs
```diff file=actions/auth.ts summary="hash lookup + rotation"
-  const s = await db.session.find({ token })
+  const s = await db.session.find({ refreshHash: sha256(token) })
```
```diff file=lib/tokens.ts summary="new sha256 + rotate"
+export const sha256 = (s) => createHash("sha256").update(s).digest("hex")
+export const rotate = (s) => ({ ...s, refreshHash: sha256(randomToken()) })
```
:::
