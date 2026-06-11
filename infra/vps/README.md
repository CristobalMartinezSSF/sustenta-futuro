# VPS deployment — Sustenta Futuro

Consolidates the **static landing** + **FastAPI backend (the enrichment bot)**
onto a single small VPS, with TLS via Caddy. AI synthesis runs on the
**Anthropic API** (Claude Haiku — cheap, no self-hosted model). LinkedIn/SII
scraping goes out through a **residential proxy**.

Supabase (DB/Auth) and Resend (email) stay managed. The Vercel admin panel
stays where it is for now.

```
Internet ──TLS──> Caddy ──┬─ static landing (apps/web → /var/www/sustenta/web)
   (VPS, Hetzner CX22)     └─ api.sustentafuturo.com → uvicorn 127.0.0.1:8000
                                     │
                     ANTHROPIC_API_KEY│ (HTTPS)          SCRAPER_PROXY
                                     ▼                            ▼
                       Claude API (Haiku synthesis)   residential proxy → LinkedIn/SII
```

Target cost: ~€4/mo VPS + ~cents/lead proxy + ~US$0.005/lead Claude synthesis.

---

## Phase 1 — Create the VPS (Hetzner)

1. Sign up at https://console.hetzner.cloud → new **Project** "sustenta".
2. **Add Server**:
   - Location: **Ashburn (US-East)** or **Hillsboro** (lower latency to Chile).
   - Image: **Ubuntu 24.04**.
   - Type: **CX22** (2 vCPU / 4 GB) — ~€4.5/mo.
   - SSH key: paste your public key (see below). Avoids password login.
   - Name: `sustenta-prod`.
3. Note the **public IPv4** it assigns.

Generate an SSH key on your Windows PC (PowerShell) if you don't have one:
```powershell
ssh-keygen -t ed25519 -C "sustenta-vps"
type $env:USERPROFILE\.ssh\id_ed25519.pub   # paste this into Hetzner
```

## Phase 2 — First login + bootstrap

```powershell
ssh root@<VPS_IP>
```
Copy and run the bootstrap (from your PC, in the repo):
```powershell
scp infra/vps/bootstrap.sh root@<VPS_IP>:/root/
ssh root@<VPS_IP> "bash /root/bootstrap.sh"
```
This installs Caddy + Python 3.12 + git, creates the `sustenta` user, and
enables the firewall (22/80/443 only).

## Phase 3 — Deploy the app

```bash
# On the VPS, as root:
sudo -u sustenta git clone https://github.com/CristobalMartinezSSF/sustenta-futuro.git /opt/sustenta/repo

# Python venv + deps
sudo -u sustenta python3.12 -m venv /opt/sustenta/venv
sudo -u sustenta /opt/sustenta/venv/bin/pip install -r /opt/sustenta/repo/services/api/requirements.txt

# Static landing → web root
cp -r /opt/sustenta/repo/apps/web/* /var/www/sustenta/web/
chown -R sustenta:sustenta /var/www/sustenta/web

# API env file (fill in real secrets — see services/api and root .env.example)
sudo -u sustenta cp /opt/sustenta/repo/.env.example /opt/sustenta/repo/services/api/.env
sudo -u sustenta nano /opt/sustenta/repo/services/api/.env   # add Supabase, Resend, etc.

# systemd service
cp /opt/sustenta/repo/infra/vps/sustenta-api.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now sustenta-api
systemctl status sustenta-api --no-pager

# Caddy config
cp /opt/sustenta/repo/infra/vps/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

**DNS (Squarespace):** point A records to `<VPS_IP>`:
`sustentafuturo.com`, `www`, `api`. Caddy issues TLS automatically once DNS
resolves. Verify: `https://api.sustentafuturo.com/health` → `{"status":"ok"}`.

## Phase 4 — AI synthesis (Claude API — recommended)

Use the Anthropic API for the synthesis pass. It's cheap (~US$0.005/lead with
Haiku), needs no self-hosted model, and keeps the VPS light — no Ollama, no
Tailscale, no PC kept running. Just set the key in the API `.env` and restart:
```
ANTHROPIC_API_KEY=sk-ant-...
ENRICH_CLAUDE_MODEL=claude-haiku-4-5
```
```bash
systemctl restart sustenta-api
```
If the key is absent, enrichment simply skips synthesis — no errors.

> **Free alternatives** (used automatically only when `ANTHROPIC_API_KEY` is empty),
> via any OpenAI-compatible endpoint:
> - Groq free tier: `ENRICH_LLM_URL=https://api.groq.com/openai`,
>   `ENRICH_LLM_MODEL=llama-3.3-70b-versatile`, `ENRICH_LLM_KEY=<groq key>`.
> - Local Ollama on your PC over Tailscale: `ENRICH_LLM_URL=http://<PC_TAILSCALE_IP>:11434`,
>   `ENRICH_LLM_MODEL=llama3.1` (requires your PC running + `OLLAMA_HOST=0.0.0.0:11434`).

## Phase 5 — Residential proxy (LinkedIn / SII)

Sign up for a pay-as-you-go residential proxy (e.g. IPRoyal), set a low spend
cap, copy the endpoint URL, add to `.env` and restart:
```
SCRAPER_PROXY=http://user:pass@proxy-host:port
```
Only the fragile scrapers route through it (~<1 MB/lead). Google CSE and the
Mercado Público API do not need it.

## Updating after a git push
```bash
sudo -u sustenta git -C /opt/sustenta/repo pull
sudo -u sustenta /opt/sustenta/venv/bin/pip install -r /opt/sustenta/repo/services/api/requirements.txt
cp -r /opt/sustenta/repo/apps/web/* /var/www/sustenta/web/
systemctl restart sustenta-api
```
