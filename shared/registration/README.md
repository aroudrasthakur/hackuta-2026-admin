# Shared registration (`shared/registration/`)

Application form schema, types, draft mapping, resume policy, and submit errors. Feeds [convex/applicationFields.ts](../../convex/applicationFields.ts).

> **Register-locked:** Do not edit files in this directory. See [convex/REGISTER_SCHEMA.md](../../convex/REGISTER_SCHEMA.md).

## Overview

| File | Summary |
| --- | --- |
| [applicantFields.ts](applicantFields.ts) | Field registry — names, draft kinds, trimmed vs plain columns |
| [schema.ts](schema.ts) | Zod schema for the full application payload |
| [validation.ts](validation.ts) | Server entry `validateRegistrationPayload()` |
| [types.ts](types.ts) | Form state types and initial empty form |
| [constants.ts](constants.ts) | MLH enums, question labels, field limits |
| [draftPatch.ts](draftPatch.ts) | Draft patch shape and cleared-value sentinel |
| [draftMapping.ts](draftMapping.ts) | Profile row ↔ autosave form mapping |
| [draftLimits.ts](draftLimits.ts) | Draft field length limits |
| [consentTimestamps.ts](consentTimestamps.ts) | MLH / sponsor / waiver timestamp helpers |
| [resume.ts](resume.ts) | Client resume validation, upload headers, size limits |
| [submitErrors.ts](submitErrors.ts) | User-facing error mapping for Convex and HTTP upload |
| [countries.ts](countries.ts) | Generated country list |
| [mlhSchools.ts](mlhSchools.ts) | Generated MLH school list |
| [mlhTexasSchools.ts](mlhTexasSchools.ts) | Texas schools ordering for picker |
| [residence.ts](residence.ts) | Country/state of residence helpers |
| [emergencyContact.ts](emergencyContact.ts) | Emergency contact validation |
| [allergyMigration.ts](allergyMigration.ts) | Legacy allergy field migration |
| [dietaryMigration.ts](dietaryMigration.ts) | Legacy dietary field migration |
| [otherOptionMigration.ts](otherOptionMigration.ts) | “Other” option migration |
| [data/schools.csv](data/schools.csv) | Source CSV for MLH school generator (register repo) |

## Related

| Location | Role |
| --- | --- |
| [../README.md](../README.md) | Shared module index |
| [convex/applicationFields.ts](../../convex/applicationFields.ts) | Convex validators derived from applicantFields |

Parent index: [../README.md](../README.md).
