console.error(`Convex pushes run from hackuta-2026-profile, not this repo.

An upload from admin would replace the shared deployment with this repo's convex/ tree and drop convex/profile. Push shared dev or production from the profile repo after admin edits are copied in:

  cd ../hackuta-2026-profile
  npm run admin-schema-lock:refresh
  npm run convex:push-dev
  npm run convex:deploy

This repo can still run npm run convex:codegen and npm run verify:register-schema-lock.
`);
process.exit(1);
