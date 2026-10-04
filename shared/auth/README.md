# Shared auth (`shared/auth/`)

Password rules and OTP rate-limit helpers used by registration Convex auth.

> **Register-locked:** Do not edit files in this directory. See [convex/REGISTER_SCHEMA.md](../../convex/REGISTER_SCHEMA.md).

## Overview

| File | Summary |
| --- | --- |
| [errorMessages.ts](errorMessages.ts) | User-facing auth error copy |
| [otpRateLimit.ts](otpRateLimit.ts) | OTP cooldown and hourly limit helpers |
| [password.ts](password.ts) | Password validation rules |
| [passwordResetMessages.ts](passwordResetMessages.ts) | Password-reset UI messages |

## Related

| Location | Role |
| --- | --- |
| [../README.md](../README.md) | Shared module index |
| [convex/auth.ts](../../convex/auth.ts) | Convex Auth wiring (locked) |

Parent index: [../README.md](../README.md).
