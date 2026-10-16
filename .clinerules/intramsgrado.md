# IntramsGrado Project Rules

## Existing Architecture
- Frontend: React 18 and Vite.
- Backend: Node.js ES modules and Express 4.
- Database: MySQL/MariaDB using mysql2.
- Authentication includes JWT and bcryptjs.
- File uploads use Multer.
- Preserve the existing architecture and conventions unless the task requires a justified change.

## Token Efficiency
- Investigate only the files relevant to the requested task.
- Search for existing implementations before creating new ones.
- Avoid reading entire directories or large files when targeted searches are sufficient.
- Do not repeat information already established in the current task.
- Make the smallest complete change that solves the requested problem.
- Do not add dependencies unless necessary.

## Safety and Privacy
- Never expose, copy, or modify real secrets from environment files.
- Never use real student, contestant, judge, or personnel data as test data.
- Do not commit uploaded images, database exports, credentials, or personal data.
- Do not run destructive database commands, reset databases, or delete user files without explicit approval.
- Preserve existing authentication, authorization, and validation controls.
- Validate and authorize access to uploaded files and sensitive endpoints.

## Change Management
- Inspect relevant code and dependencies before editing.
- State the intended changes before a multi-file implementation.
- Keep unrelated refactoring out of the task.
- Do not overwrite existing work without inspecting it.
- Do not install packages, change database schemas, or modify deployment configuration without explaining why and obtaining approval.

## Verification
- Run the narrowest relevant checks first.
- Run the frontend build when frontend changes warrant it.
- Test relevant backend behavior when feasible.
- Never claim a test passed unless it was actually run successfully.
- Report changed files, checks performed, failures, and any remaining risks.
