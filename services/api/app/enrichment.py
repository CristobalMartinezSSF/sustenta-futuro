"""Lead enrichment service — multi-source.

Sources (in order of execution):
  1. Email domain DNS validation
  2. Corporate website scraping (inferred from email domain)
  3. DuckDuckGo real web search (duckduckgo-search package, no API key)
  4. LinkedIn company page (public meta, best-effort)
"""

import logging
import re
import socket

import httpx

logger = logging.getLogger(__name__)

_GENERIC_DOMAINS = {
    "gmail.com", "hotmail.com", "yahoo.com", "outlook.com",
    "live.com", "icloud.com", "protonmail.com", "mail.com",
    "hotmail.es", "yahoo.es", "outlook.es",
}

_UA_BROWSER = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_UA_BOT = "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.5)"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_meta(html: str) -> dict:
    """Extract <title>, meta description, and og:description from HTML."""
    out: dict = {}

    m = re.search(r"<title[^>]*>([^<]{1,200})</title>", html, re.I)
    if m:
        out["title"] = m.group(1).strip()

    for pattern in [
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{1,500})',
        r'<meta[^>]+content=["\']([^"\']{1,500})["\'][^>]+name=["\']description["\']',
    ]:
        m = re.search(pattern, html, re.I)
        if m:
            out["description"] = m.group(1).strip()
            break

    m = re.search(
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']{1,500})',
        html, re.I,
    )
    if m:
        out["og_description"] = m.group(1).strip()

    return out


def _get(url: str, timeout: float = 10.0, ua: str = _UA_BROWSER,
         follow: bool = True) -> httpx.Response | None:
    try:
        return httpx.get(
            url, timeout=timeout, follow_redirects=follow,
            headers={"User-Agent": ua, "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"},
        )
    except Exception as exc:
        logger.debug("GET %s failed: %s", url, exc)
        return None


# ─── Source 1: Email DNS ─────────────────────────────────────────────────────

def _validate_email_domain(email: str) -> dict:
    domain = email.split("@")[-1].lower() if "@" in email else ""
    if not domain:
        return {"email_valid": False, "email_domain": "", "email_note": "Invalid format"}
    try:
        socket.getaddrinfo(domain, None)
        return {"email_valid": True, "email_domain": domain}
    except socket.gaierror:
        return {"email_valid": False, "email_domain": domain, "email_note": "Domain not found"}


# ─── Source 2: Corporate website ─────────────────────────────────────────────

def _scrape_website(domain: str) -> dict:
    url = f"https://{domain}"
    resp = _get(url)
    if resp and resp.status_code == 200:
        meta = _extract_meta(resp.text[:15_000])
        return {
            k: v for k, v in {
                "website_url": url,
                "website_title": meta.get("title"),
                "website_description": meta.get("description") or meta.get("og_description"),
            }.items() if v
        }
    return {}


# ─── Source 3: DuckDuckGo real search ────────────────────────────────────────

def _search_duckduckgo(company: str, industry: str | None = None) -> dict:
    query = f"{company} Chile empresa {industry or ''}".strip()
    try:
        from duckduckgo_search import DDGS  # type: ignore
        with DDGS() as ddgs:
            hits = list(ddgs.text(query, max_results=5))
        if not hits:
            return {}
        return {
            "web_search_query": query,
            "web_search_results": [
                {
                    "title": h.get("title", ""),
                    "url": h.get("href", ""),
                    "snippet": (h.get("body") or "")[:300],
                }
                for h in hits
            ],
            "web_top_snippet": (hits[0].get("body") or "")[:500],
        }
    except ImportError:
        logger.warning("duckduckgo-search not installed; skipping web search")
    except Exception as exc:
        logger.warning("DDG search failed for '%s': %s", query, exc)
    return {}


# ─── Source 4: LinkedIn company page (public meta) ───────────────────────────

def _scrape_linkedin(company: str) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")
    candidates = [
        f"https://www.linkedin.com/company/{slug}/",
        f"https://www.linkedin.com/company/{slug}-chile/",
        f"https://www.linkedin.com/company/{slug.replace('-', '')}/",
    ]
    for url in candidates:
        resp = _get(url, ua=_UA_BOT, follow=False, timeout=8.0)
        if resp is None:
            continue
        if resp.status_code in (200, 301, 302):
            html = resp.text[:12_000] if resp.text else ""
            meta = _extract_meta(html)
            title = meta.get("title", "")
            desc = meta.get("description") or meta.get("og_description", "")
            # Skip if LinkedIn returned a generic login/error page
            if title and not any(x in title.lower() for x in ["linkedin", "log in", "sign in", "error"]):
                out: dict = {"linkedin_url": url}
                if title:
                    out["linkedin_title"] = title
                if desc:
                    out["linkedin_description"] = desc[:400]
                return out
    return {}


# ─── Main entry point ─────────────────────────────────────────────────────────

def enrich_lead(
    email: str,
    company: str,
    full_name: str | None = None,
    industry: str | None = None,
) -> dict:
    """Run all enrichment sources and return a jsonb-ready dict.

    Stored in leads.enrichment_data.
    """
    result: dict = {"enrichment_version": "2.0", "sources_used": []}

    # 1. Email domain DNS
    email_info = _validate_email_domain(email)
    result.update(email_info)
    result["sources_used"].append("email_dns")

    # 2. Corporate website
    domain = (email.split("@")[-1].lower() if "@" in email else "")
    if domain and domain not in _GENERIC_DOMAINS:
        site = _scrape_website(domain)
        if site:
            result.update(site)
            result["sources_used"].append("website_scrape")

    # 3. DuckDuckGo web search
    if company:
        ddg = _search_duckduckgo(company, industry)
        if ddg:
            result.update(ddg)
            result["sources_used"].append("duckduckgo_search")

    # 4. LinkedIn company page
    if company:
        li = _scrape_linkedin(company)
        if li:
            result.update(li)
            result["sources_used"].append("linkedin_scrape")

    # Build human-readable summary
    parts: list[str] = []
    if result.get("email_valid"):
        parts.append(f"Email válido ({result['email_domain']})")
    else:
        parts.append(f"Email no verificado: {result.get('email_note', 'error')}")

    if result.get("website_title"):
        parts.append(f"Sitio: {result['website_title']}")
    if result.get("website_description"):
        parts.append(result["website_description"][:200])
    if result.get("web_top_snippet"):
        parts.append(f"Web: {result['web_top_snippet'][:200]}")
    if result.get("linkedin_description"):
        parts.append(f"LinkedIn: {result['linkedin_description'][:200]}")

    result["summary"] = ". ".join(parts) or "Sin información adicional encontrada."
    result["sources_count"] = len(result["sources_used"])

    return result
