# CLAUDE.md

This file provides persistent guidance to Claude Code for the **SG Sustenta Futuro** repository.

## 1. Project identity
- Project: **Sistema de Gestión Sustenta Futuro**
- Company tone: **experto, confiable, moderno, premium**
- Primary language for user-facing communication: **Spanish**
- Primary language for code, identifiers, comments, commit messages, and technical docs: **English**
- Methodology: **Spec-Driven Development (SDD)**
- Rule: **specification first, code second**

## 2. Month 1 goal
Build a working MVP for:
- public landing page
- lead capture form
- persistent lead storage
- admin login
- admin lead review panel
- confirmation email + internal notification
- basic end-to-end testing

Do not overengineer month 1.
Do not add multi-agent runtime, RAG, pgvector, Redis, Celery, Kubernetes, LangGraph, or complex workflow engines unless explicitly requested.

## 3. Approved stack for MVP
- Frontend: **Next.js + Tailwind CSS**
- Backend: **Python + FastAPI**
- Database: **Supabase Postgres**
- Auth: **Supabase Auth**
- Storage: **Supabase Storage** only if attachments are needed
- Email: **Resend**
- Testing: **Playwright**
- VCS: **GitHub**
- Optional local AI lab: **Ollama**
- Development copilot/orchestrator: **Claude**

## 4. Architectural rules
- Keep the architecture modular but simple.
- Prefer monorepo structure for month 1.
- Keep business logic in FastAPI, not in frontend pages.
- Use Supabase as the system of record.
- Protect all admin routes.
- Use environment variables for secrets. Never hardcode tokens or credentials.
- Use structured JSON between services and agents whenever possible.
- Validate all API inputs with Pydantic.
- Design for future scaling, but only implement what the MVP needs.

## 5. Security and privacy
- Never expose keys, passwords, tokens, service-role credentials, or secrets.
- Treat Chilean PII as sensitive: RUT, phone numbers, personal addresses, emails, IDs.
- Minimize PII shown in logs.
- Sanitize all inputs and outputs.
- Use Supabase Row Level Security if user-specific data access is introduced.
- Human approval is mandatory before production deployment, destructive deletes, billing actions, or sending sensitive client communications.

## 6. Coding standards
### Python / FastAPI
- Python 3.10+
- PEP 8
- Type hints required
- Pydantic for input/output models
- Small modules and clear separation of concerns
- Docstrings on public functions/classes

### Next.js / frontend
- Use App Router unless the repo already uses Pages Router
- Keep components small and reusable
- Separate UI components from data-fetching concerns
- Favor server-safe patterns and explicit loading/error states

### Database
- Start with a small, explicit schema
- Use migrations
- Avoid premature abstraction
- Prefer normalized tables for core entities

## 7. MVP data model baseline
Start with these entities unless the spec changes:
- `leads`
- `lead_status_history`
- `admin_profiles`
- `lead_notes` (optional in month 1)
- `attachments` (optional in month 1)

Suggested initial lead statuses:
- `new`
- `reviewing`
- `contacted`
- `qualified`
- `proposal_pending`
- `won`
- `lost`

## 8. Month 1 implementation order
1. Define the month 1 spec
2. Define database schema
3. Build landing page and lead form
4. Implement FastAPI lead endpoints
5. Connect frontend to backend
6. Add Supabase Auth for admin area
7. Build admin panel to review leads
8. Add Resend email flows
9. Add Playwright e2e tests
10. Prepare deployment checklist

## 9. Working style
- First produce or update the spec before coding.
- Break work into atomic tasks.
- After each task: verify, summarize, and note open risks.
- If a requirement is ambiguous, propose the safest MVP default and document it.
- When coding, explain tradeoffs briefly and keep momentum.

## 10. Definition of done for month 1
The MVP is done when:
- a public user can submit a lead successfully
- the lead is stored in Supabase
- an admin can log in and review leads
- lead status can be updated
- confirmation/internal emails are sent
- the critical user flow passes Playwright tests
- the repo has a clear README and env setup instructions

## 11. Preferred repository structure
```text
apps/
  web/
services/
  api/
infra/
  supabase/
docs/
specs/
.claude/
  agents/
```

## 12. Delegation rules for subagents
Use subagents aggressively to keep context clean:
- `spec-architect` for requirements, specs, acceptance criteria
- `backend-fastapi` for API and domain logic
- `frontend-nextjs` for landing/admin UI
- `supabase-architect` for schema, auth, storage, policies
- `qa-playwright` for e2e testing and verification
- `ai-prototyper` for Ollama, prompts, local AI experiments
- `delivery-manager` for sequencing, checkpoints, handoff, and rollout readiness

## 13. Anti-scope-creep rules
Reject or defer these to later phases unless explicitly required:
- multi-tenant billing logic
- AI proposal generation in production
- full CRM automation
- project delivery portal for clients
- dashboards with advanced KPIs
- chatbot orchestration runtime
- document RAG / vector search

## 14. If the repository is still empty
Before generating large amounts of code, create:
- `specs/month1-mvp-spec.md`
- `docs/roadmap-month1.md`
- `.env.example`
- minimal monorepo folder structure
- database migration plan

## 15. Output preference
Default to concise, execution-focused updates:
- what changed
- what remains
- risks/blockers
- next action
