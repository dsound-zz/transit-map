<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

These apply to every prompt without exception:
- Never use 'any' types — always use explicit types or generics
- Never put business logic in route/controller files
- Always handle errors explicitly — no silent failures
- Always validate external input before using it
- Always use correct HTTP status codes
- Never expose stack traces or internal errors to the client
- Never invent new patterns — follow what already exists in the codebase
- Never modify files not explicitly listed in the task
- Never add npm packages without flagging them first
- Always name variables and functions descriptively
- Always separate concerns — one file, one responsibility
- Always handle loading, error, and empty states in UI