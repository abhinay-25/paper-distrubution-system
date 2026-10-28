# Implementation Roadmap

Review 1 target: the complete AI-powered question-paper preparation workflow. Blockchain and secure distribution are deferred.

| Step | Scope | Status |
|---|---|---|
| 1 | Project foundation: monorepo layout, Git, scaffolds, health endpoints, docs | **Done** |
| 2 | Frontend foundation: Tailwind, professional accessible design system, app shell | **Done** (see [frontend-design-system.md](frontend-design-system.md)) |
| 3 | Backend and database foundation: Prisma schema, migrations, PostgreSQL via Docker Compose, config, error handling, logging | Planned |
| — | Authentication, roles, institution scoping | Planned (after Step 3) |
| — | Institution admin: academic structure and users | Planned |
| — | Faculty: question banks and authorized source material | Planned |
| — | AI: classification, difficulty estimation, semantic duplicate detection, question generation | Planned |
| — | Exam configuration and paper assembly with constraint validation (marks, counts, syllabus coverage, difficulty distribution) | Planned |
| — | Review/edit, versioning, independent approval/rejection of a specific paper version | Planned |
| — | Protected PDF finalization | Planned |
| Post-Review 1 | Blockchain integrity evidence, encrypted private storage, scheduled secure distribution to centers, cloud hosting | Deferred |

The step numbering after Step 3 is not yet fixed; it will be agreed as each step is planned.
