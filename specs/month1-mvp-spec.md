# Month 1 MVP Spec

## Objective
Deliver a working MVP for lead capture and basic internal lead management.

## In scope
- Public landing page
- Lead form
- Lead persistence in Supabase
- Admin authentication
- Admin lead list and detail view
- Lead status updates
- Confirmation email and internal notification
- Basic Playwright end-to-end tests

## Out of scope
- Proposal generation in production
- Client portal
- RAG, vector search, chatbot runtime
- Billing integrations
- Advanced analytics dashboards

## Core user flows
1. Visitor opens landing page and submits lead form.
2. System validates and stores the lead.
3. System sends confirmation to the lead and notification to admin.
4. Admin signs in and reviews incoming leads.
5. Admin updates lead status.

## Suggested lead fields
- full_name
- email
- phone
- company
- service_interest
- estimated_budget
- message
- source

## Acceptance criteria
- Lead submission works end to end.
- Submitted leads appear in admin view.
- Admin auth protects admin pages.
- Emails are triggered on lead creation.
- Core flow passes Playwright.
