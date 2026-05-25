"""Lead enrichment service.

Validates email domain, searches for company info via web,
and generates a structured summary stored in enrichment_data.
"""

import logging
import re
import socket
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)


def _validate_email_domain(email: str) -> dict:
    """Check if the email domain has valid MX/A records."""
    domain = email.split("@")[-1] if "@" in email else ""
    if not domain:
        return {"email_valid": False, "email_domain": domain, "email_note": "Invalid format"}

    try:
        socket.getaddrinfo(domain, None)
        return {"email_valid": True, "email_domain": domain}
    except socket.gaierror:
        return {"email_valid": False, "email_domain": domain, "email_note": "Domain not found"}


def _search_company_web(company: str) -> dict:
    """Search for basic company info using a simple web query.

    Uses DuckDuckGo instant answer API (no key needed).
    """
    if not company:
        return {}

    results: dict = {}
    try:
        resp = httpx.get(
            "https://api.duckduckgo.com/",
            params={"q": f"{company} Chile empresa", "format": "json", "no_html": "1"},
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            abstract = data.get("Abstract", "")
            url = data.get("AbstractURL", "")
            if abstract:
                results["company_description"] = abstract[:500]
            if url:
                results["company_url"] = url

            # Check related topics for more info
            related = data.get("RelatedTopics", [])
            snippets = []
            for topic in related[:3]:
                text = topic.get("Text", "")
                if text:
                    snippets.append(text[:200])
            if snippets:
                results["related_info"] = " | ".join(snippets)

    except Exception as exc:
        logger.warning("DuckDuckGo search failed for %s: %s", company, exc)

    return results


def _extract_domain_from_email(email: str) -> str | None:
    """Extract company website from email domain (skip generic providers)."""
    generic = {"gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "live.com", "icloud.com"}
    domain = email.split("@")[-1].lower() if "@" in email else ""
    if domain and domain not in generic:
        return f"https://{domain}"
    return None


def _scrape_website_meta(url: str) -> dict:
    """Fetch a website and extract title and meta description."""
    results: dict = {}
    try:
        resp = httpx.get(
            url,
            timeout=10.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SustentaFuturo/1.0)"},
        )
        if resp.status_code == 200:
            text = resp.text[:10000]

            title_match = re.search(r"<title[^>]*>([^<]+)</title>", text, re.IGNORECASE)
            if title_match:
                results["website_title"] = title_match.group(1).strip()[:200]

            desc_match = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)',
                text,
                re.IGNORECASE,
            )
            if desc_match:
                results["website_description"] = desc_match.group(1).strip()[:500]

    except Exception as exc:
        logger.warning("Website scrape failed for %s: %s", url, exc)

    return results


def enrich_lead(
    email: str,
    company: str,
    full_name: str | None = None,
    industry: str | None = None,
) -> dict:
    """Run all enrichment steps and return a structured summary.

    Returns a dict suitable for storing in leads.enrichment_data (jsonb).
    """
    result: dict = {"enrichment_version": "1.0"}

    # 1. Validate email domain
    email_info = _validate_email_domain(email)
    result.update(email_info)

    # 2. Check if email domain is a company website
    company_site = _extract_domain_from_email(email)
    if company_site:
        result["inferred_website"] = company_site
        site_meta = _scrape_website_meta(company_site)
        result.update(site_meta)

    # 3. Search for company info
    if company:
        search_results = _search_company_web(company)
        result.update(search_results)

    # 4. Generate summary
    parts = []
    if result.get("email_valid"):
        parts.append(f"Email verificado ({result['email_domain']})")
    else:
        parts.append(f"Email no verificado: {result.get('email_note', 'error')}")

    if result.get("website_title"):
        parts.append(f"Sitio web: {result['website_title']}")
    if result.get("website_description"):
        parts.append(f"Descripcion: {result['website_description'][:150]}")
    if result.get("company_description"):
        parts.append(f"Info publica: {result['company_description'][:150]}")

    result["summary"] = ". ".join(parts) if parts else "Sin informacion adicional encontrada."

    return result
