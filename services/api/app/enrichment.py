"""Lead enrichment service — v4.0 comprehensive.

ALL leads are accepted. Suspicious signals are recorded as flags.
Never raises — all failures are caught and logged.

Design goals (v4): extract the maximum amount of public information from the
few fields a lead submits, using only free / official sources, and *chain*
discovered facts so each one feeds the next query (waterfall enrichment).

Sources:
  1.  Email DNS validation
  2.  Disposable email detection (embedded blocklist)
  3.  Domain age via WHOIS
  4.  Phone format validation (Chilean)
  5.  IP geolocation (ip-api.com, free, no key)
  6.  Corporate website scraping (+ contact/legal extraction: RUT, emails,
      phones, social links, address)
  7.  Web search — Google CSE (free tier) with DuckDuckGo fallback
  8.  News search (DuckDuckGo)
  9.  LinkedIn company page (public meta)
  10. Wikipedia ES API
  11. Rutificador — company/person name → RUT (best-effort)
  12. SII Chile — RUT → razón social, rubro, actividad
  13. Mercado Público — official API (free ticket) with scraper fallback
  14. Boletín Concursal — insolvency / bankruptcy by RUT (economic risk)
  15. Registro de Empresas y Sociedades — partners, capital, incorporation
  16. Diario Oficial — company incorporation / modification notices
  17. INAPI — registered trademarks (best-effort + verifiable link)
  18. Poder Judicial — litigation lookup (verifiable link only; public record)
  19. Optional AI synthesis (Ollama / OpenAI-compatible) — reconciles signals

Every remote source degrades gracefully and, where automated scraping is
unreliable or gated (captcha / JS), emits a *verifiable deep link* so a human
can confirm in one click. Only public information is used (ethics rule D4).

Configuration (all optional, via environment):
  SCRAPER_PROXY              http(s) proxy for fragile scrapers (unblocks
                             datacenter-IP-blocked sources from Render)
  GOOGLE_CSE_KEY / _CX       Google Custom Search (free 100/day) — DDG fallback
  MERCADO_PUBLICO_TICKET     free ChileCompra API ticket — scraper fallback
  ENRICH_LLM_URL / _MODEL    OpenAI-compatible chat endpoint for synthesis
  ENRICH_LLM_KEY             bearer token for the LLM endpoint (blank for Ollama)
"""

from __future__ import annotations

import json
import logging
import os
import re
import socket
import time
from datetime import datetime, timezone
from typing import TypedDict
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

# ─── Optional configuration (env) ──────────────────────────────────────────────
# Everything works without these; they only widen coverage when present.
_PROXY = os.getenv("SCRAPER_PROXY") or None
_GOOGLE_CSE_KEY = os.getenv("GOOGLE_CSE_KEY") or None
_GOOGLE_CSE_CX = os.getenv("GOOGLE_CSE_CX") or None
_MP_TICKET = os.getenv("MERCADO_PUBLICO_TICKET") or None
# AI synthesis: prefer Claude (official SDK) when an Anthropic key is present;
# otherwise fall back to any OpenAI-compatible endpoint (Groq free tier / Ollama).
_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY") or None
_CLAUDE_MODEL = os.getenv("ENRICH_CLAUDE_MODEL", "claude-haiku-4-5")
_LLM_URL = os.getenv("ENRICH_LLM_URL") or None
_LLM_MODEL = os.getenv("ENRICH_LLM_MODEL", "llama3.1")
_LLM_KEY = os.getenv("ENRICH_LLM_KEY", "")

# Per-source verification outcomes. Lets the admin distinguish
# "verified, nothing found" from "couldn't reach / page changed".
STATUS_OK = "ok"                  # source reached and yielded data
STATUS_NO_DATA = "no_data"        # source reached, parsed, but found nothing
STATUS_UNREACHABLE = "unreachable"  # network/HTTP failure
STATUS_PARSE_FAILED = "parse_failed"  # 200 OK but expected fields not found (HTML likely changed)
STATUS_SKIPPED = "skipped"        # not run (missing inputs)

# ─── Disposable email blocklist ───────────────────────────────────────────────

_DISPOSABLE = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "throwaway.email", "yopmail.com", "sharklasers.com", "guerrillamailblock.com",
    "grr.la", "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
    "guerrillamail.net", "guerrillamail.org", "spam4.me", "trashmail.com",
    "trashmail.me", "trashmail.net", "dispostable.com", "mailnull.com",
    "spamgourmet.com", "spamgourmet.net", "spamgourmet.org", "maildrop.cc",
    "fakeinbox.com", "getairmail.com", "mailexpire.com", "mail-temporaire.fr",
    "spamex.com", "discard.email", "filzmail.com", "mytemp.email",
    "temp-mail.org", "tempr.email", "jetable.fr.nf", "kasmail.com",
    "spammotel.com", "inoutmail.de", "mailimate.com", "tempinbox.com",
    "getonemail.net", "mailnew.com", "spamfree24.org", "tempail.com",
    "throwam.com", "wegwerfmail.de", "yuurok.com", "spamherelots.com",
}

_GENERIC = {
    "gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "live.com",
    "icloud.com", "protonmail.com", "mail.com", "hotmail.es", "yahoo.es",
    "outlook.es", "hotmail.cl", "gmail.cl",
}

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ─── Flag schema ─────────────────────────────────────────────────────────────


class EnrichFlag(TypedDict):
    code: str
    severity: str   # "high" | "medium" | "low"
    detail: str
    source: str


_SEVERITY_SCORE = {"high": 30, "medium": 15, "low": 5}


def _flag(flags: list, code: str, severity: str, detail: str, source: str) -> None:
    flags.append({"code": code, "severity": severity, "detail": detail, "source": source})
    logger.info("FLAG [%s/%s] %s — %s", severity, code, source, detail)


# ─── HTTP helper ─────────────────────────────────────────────────────────────


def _get(url: str, timeout: float = 8.0, ua: str = _UA, follow: bool = True,
         params: dict | None = None, retries: int = 1) -> httpx.Response | None:
    """GET with retries on transient transport/timeout errors.

    Retries only network-level failures (timeouts, connection resets) — never
    HTTP error codes, since those are deterministic. Returns None on exhaustion.
    """
    headers = {"User-Agent": ua, "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"}
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            if _PROXY:
                # Route fragile scrapers through a proxy so a datacenter-IP block
                # (LinkedIn/SII/Rutificador reject Render's IP) can be bypassed.
                with httpx.Client(proxy=_PROXY, timeout=timeout,
                                  follow_redirects=follow, headers=headers) as client:
                    return client.get(url, params=params)
            return httpx.get(
                url, timeout=timeout, follow_redirects=follow, params=params,
                headers=headers,
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt < retries:
                time.sleep(0.4 * (attempt + 1))
                continue
        except Exception as exc:
            logger.debug("GET %s failed (non-retryable): %s", url, exc)
            return None
    logger.debug("GET %s failed after %d retries: %s", url, retries, last_exc)
    return None


# ─── RUT validation (modulo-11 check digit) ──────────────────────────────────


def _valid_rut(rut: str) -> bool:
    """Validate a Chilean RUT/RUN using its modulo-11 check digit.

    Prevents accepting arbitrary number sequences (phones, IDs) that merely
    look like a RUT. Accepts dotted or plain formats, with '-' before the DV.
    """
    clean = re.sub(r"[^0-9kK]", "", rut.upper())
    if len(clean) < 7:  # shortest real RUTs have 7 digits + DV
        return False
    body, dv = clean[:-1], clean[-1]
    if not body.isdigit():
        return False
    total, factor = 0, 2
    for digit in reversed(body):
        total += int(digit) * factor
        factor = 2 if factor == 7 else factor + 1
    remainder = 11 - (total % 11)
    expected = "0" if remainder == 11 else "K" if remainder == 10 else str(remainder)
    return dv == expected


def _extract_meta(html: str) -> dict:
    out: dict = {}
    m = re.search(r"<title[^>]*>([^<]{1,200})</title>", html, re.I)
    if m:
        out["title"] = m.group(1).strip()
    for pat in [
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{1,500})',
        r'<meta[^>]+content=["\']([^"\']{1,500})["\'][^>]+name=["\']description["\']',
    ]:
        m = re.search(pat, html, re.I)
        if m:
            out["description"] = m.group(1).strip()
            break
    m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']{1,500})', html, re.I)
    if m:
        out["og_description"] = m.group(1).strip()
    return out


# Known social domains we surface when found in page links.
_SOCIAL_HOSTS = ("linkedin.com", "facebook.com", "instagram.com", "twitter.com",
                 "x.com", "youtube.com", "tiktok.com")


def _extract_contacts(html: str) -> dict:
    """Pull contact + legal identifiers from a page's HTML.

    Chilean corporate sites very often print the company RUT in the footer and
    list contact emails/phones and social handles. Harvesting these turns a
    bare domain into a chain of new query inputs (RUT → SII, emails → people).
    Only the visible/source markup is read — no logins, no private data (D4).
    """
    out: dict = {}

    ruts = []
    for cand in re.findall(r"\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b", html):
        norm = cand.replace(".", "")
        if _valid_rut(norm) and norm not in ruts:
            ruts.append(norm)
    if ruts:
        out["website_ruts"] = ruts[:3]

    emails = []
    for e in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html):
        el = e.lower()
        if el not in emails and not el.endswith((".png", ".jpg", ".gif", ".svg", ".webp")):
            emails.append(el)
    if emails:
        out["website_emails"] = emails[:5]

    phones = []
    for p in re.findall(r"\+?56[\s\-]?9[\s\-]?\d{4}[\s\-]?\d{4}", html):
        clean = re.sub(r"[\s\-]", "", p)
        if clean not in phones:
            phones.append(clean)
    if phones:
        out["website_phones"] = phones[:5]

    socials = {}
    for m in re.findall(r'https?://(?:www\.)?([a-z0-9.\-]+)/[^\s"\'<>]+', html, re.I):
        host = m.lower()
        for s in _SOCIAL_HOSTS:
            if host.endswith(s) and s not in socials:
                socials[s] = True
    links = sorted({
        u for u in re.findall(r'https?://[^\s"\'<>]+', html, re.I)
        if any(s in u.lower() for s in _SOCIAL_HOSTS)
    })
    if links:
        out["website_social_links"] = links[:6]

    m = re.search(r'(?:Dirección|Direccion|Address)\s*[:\-]?\s*'
                  r'([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\.,#°]{8,120})', html, re.I)
    if m:
        out["website_address"] = m.group(1).strip()

    return out


# ─── Source 1+2+3: Email (DNS + disposable + WHOIS age) ──────────────────────


def _source_email(email: str, flags: list) -> dict:
    out: dict = {}
    domain = email.split("@")[-1].lower() if "@" in email else ""
    out["email_domain"] = domain

    # DNS
    try:
        socket.getaddrinfo(domain, None)
        out["email_valid"] = True
    except socket.gaierror:
        out["email_valid"] = False
        _flag(flags, "EMAIL_DOMAIN_INVALID", "high",
              f"El dominio {domain} no tiene registros DNS.", "email_dns")

    # Disposable
    if domain in _DISPOSABLE:
        out["email_disposable"] = True
        _flag(flags, "DISPOSABLE_EMAIL", "high",
              f"{domain} es un proveedor de emails temporales/desechables.", "disposable_check")
    else:
        out["email_disposable"] = False

    # Generic (informational)
    if domain in _GENERIC:
        out["email_generic"] = True
        _flag(flags, "GENERIC_EMAIL", "low",
              f"Email personal ({domain}), no corporativo.", "disposable_check")

    # WHOIS domain age
    try:
        import whois  # type: ignore
        w = whois.whois(domain)
        created = w.creation_date
        if isinstance(created, list):
            created = created[0]
        if isinstance(created, datetime):
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            days = (datetime.now(timezone.utc) - created).days
            out["domain_age_days"] = days
            out["domain_created"] = created.strftime("%Y-%m-%d")
            if days < 30:
                _flag(flags, "VERY_NEW_DOMAIN", "high",
                      f"Dominio registrado hace solo {days} días.", "whois")
            elif days < 180:
                _flag(flags, "YOUNG_DOMAIN", "medium",
                      f"Dominio tiene solo {days} días de antigüedad.", "whois")
    except Exception as exc:
        logger.debug("WHOIS failed for %s: %s", domain, exc)

    return out


# ─── Source 4: Phone validation ───────────────────────────────────────────────


def _source_phone(phone: str | None, flags: list) -> dict:
    if not phone:
        return {}
    clean = re.sub(r"[\s\-\(\)]", "", phone)
    # Valid Chilean: +569XXXXXXXX, 569XXXXXXXX, 9XXXXXXXX
    is_valid = bool(re.match(r"^(\+?56)?9\d{8}$", clean))
    if not is_valid:
        _flag(flags, "INVALID_PHONE_FORMAT", "low",
              f"El teléfono '{phone}' no tiene formato chileno válido (+569XXXXXXXX).",
              "phone_validation")
    return {"phone_valid": is_valid, "phone_clean": clean if is_valid else None}


# ─── Source 5: IP geolocation ────────────────────────────────────────────────


def _source_ip(ip: str | None, flags: list) -> dict:
    if not ip or ip in ("127.0.0.1", "::1", "testclient"):
        return {}
    resp = _get(f"http://ip-api.com/json/{ip}",
                params={"fields": "status,country,countryCode,regionName,city,org,isp,query"})
    if resp and resp.status_code == 200:
        data = resp.json()
        if data.get("status") == "success":
            out = {
                "ip_address": ip,
                "ip_country": data.get("country"),
                "ip_country_code": data.get("countryCode"),
                "ip_city": data.get("city"),
                "ip_org": data.get("org"),
                "ip_isp": data.get("isp"),
            }
            cc = data.get("countryCode", "")
            if cc and cc not in ("CL", "AR", "PE", "BO", "UY", "BR", "CO", "MX"):
                _flag(flags, "FOREIGN_IP", "medium",
                      f"Formulario enviado desde {data.get('country')} ({cc}), no desde Latinoamérica.",
                      "ip_geolocation")
            elif cc and cc != "CL":
                _flag(flags, "NON_CHILEAN_IP", "low",
                      f"Formulario enviado desde {data.get('country')}, no desde Chile.",
                      "ip_geolocation")
            return out
    return {}


# ─── Source 6: Website scraping ───────────────────────────────────────────────


def _source_website(domain: str, flags: list) -> dict:
    if not domain or domain in _GENERIC:
        return {}
    url = f"https://{domain}"
    resp = _get(url)
    if not resp or resp.status_code != 200:
        _flag(flags, "NO_CORPORATE_WEBSITE", "medium",
              f"El dominio {domain} no tiene sitio web accesible.", "website_scrape")
        return {"inferred_website": url, "website_accessible": False}
    body = resp.text[:120_000]  # enough to reach the footer where RUT/contacts live
    meta = _extract_meta(body[:15_000])
    out: dict = {
        "inferred_website": url,
        "website_accessible": True,
        "website_title": meta.get("title"),
        "website_description": meta.get("description") or meta.get("og_description"),
    }
    out.update(_extract_contacts(body))
    return {k: v for k, v in out.items() if v is not None}


def _domain_from_company(company: str) -> str | None:
    """Guess a company's own domain by probing hostnames built from its name.

    Used when the lead wrote from a free email (gmail/hotmail/…) so we never
    inferred a corporate domain. Probes likely ``.com``/``.cl`` hosts (plus a
    ``home.`` subdomain — several Chilean SaaS serve their site there) and
    returns the first host that responds 200. This is what lets us still find
    the corporate site of a legit company whose contact used a personal email.
    Returns the reachable host (may include a subdomain) or ``None``.
    """
    base = re.sub(r"[^a-z0-9]", "", company.lower())
    if len(base) < 3:
        return None
    words = re.sub(r"[^a-z0-9]+", " ", company.lower()).split()
    hyph = "-".join(words) if len(words) > 1 else ""
    stems = [s for s in dict.fromkeys((base, hyph)) if s]
    for stem in stems:
        for tld in (".com", ".cl", ".com.cl"):
            for host in (f"{stem}{tld}", f"home.{stem}{tld}"):
                resp = _get(f"https://{host}", timeout=6.0)
                if resp is not None and resp.status_code == 200:
                    return host
    return None


# ─── Source 7+8: Web search (Google CSE → DuckDuckGo) + news ─────────────────


def _google_cse(query: str, num: int = 5) -> list[dict] | None:
    """Google Custom Search (free tier: 100 queries/day).

    Unlike DuckDuckGo, this is an official key-based API that runs from any IP,
    so it keeps working from Render's datacenter address. Returns DDG-shaped
    dicts (title/href/body) so callers don't care which backend answered.

    Returns ``None`` when the search could NOT be executed (not configured,
    HTTP error, quota exceeded) so callers can tell "couldn't search" apart
    from "searched and found nothing" (an empty list). This distinction is
    what prevents a blocked/unconfigured backend from being misreported as a
    company having no web presence.
    """
    if not (_GOOGLE_CSE_KEY and _GOOGLE_CSE_CX):
        return None
    resp = _get(
        "https://www.googleapis.com/customsearch/v1",
        params={"key": _GOOGLE_CSE_KEY, "cx": _GOOGLE_CSE_CX, "q": query, "num": num},
        timeout=8.0,
    )
    if not resp or resp.status_code != 200:
        return None
    try:
        items = resp.json().get("items", [])
    except Exception:
        return None
    return [
        {"title": it.get("title", ""), "href": it.get("link", ""),
         "body": it.get("snippet", "")}
        for it in items
    ]


def _source_ddg(company: str, industry: str | None, flags: list,
                known_web_presence: bool = False) -> dict:
    out: dict = {}
    q = f"{company} Chile {industry or ''}".strip()

    # Prefer Google CSE (works from any IP); fall back to DDG (blocked on Render).
    # `search_executed` tracks whether ANY backend actually ran a query, so an
    # empty result from a working backend ("no web presence") is never confused
    # with a backend that couldn't run at all (unconfigured / blocked / quota).
    cse_hits = _google_cse(q, num=5)            # None = couldn't run; [] = ran, empty
    search_executed = cse_hits is not None
    hits = cse_hits or []
    backend = "google_cse" if hits else None
    news: list = []
    try:
        from duckduckgo_search import DDGS  # type: ignore
        with DDGS() as ddgs:
            if not hits:
                ddg_hits = list(ddgs.text(q, max_results=5))
                search_executed = True          # DDG ran without raising
                if ddg_hits:
                    hits = ddg_hits
                    backend = "duckduckgo"
            news = list(ddgs.news(f"{company} Chile", max_results=3))
            search_executed = True
    except ImportError:
        logger.warning("duckduckgo-search not installed")
    except Exception as exc:
        logger.warning("DDG search error for '%s': %s", company, exc)

    try:
        if backend:
            out["web_search_backend"] = backend
        if hits:
            out["web_search_results"] = [
                {"title": h.get("title", ""), "url": h.get("href", ""),
                 "snippet": (h.get("body") or "")[:300]}
                for h in hits
            ]
            out["web_top_snippet"] = (hits[0].get("body") or "")[:500]
        elif search_executed and not known_web_presence:
            # A working backend genuinely returned zero results AND we have no
            # other evidence of a corporate site → real "no web presence".
            _flag(flags, "NO_WEB_PRESENCE", "medium",
                  f"No se encontraron resultados web para '{company} Chile'.", "ddg_search")
        else:
            # No search backend available — informational, NOT a fraud signal.
            out["web_search"] = "unavailable"

        if news:
            out["news_results"] = [
                {"date": n.get("date", ""), "title": n.get("title", ""),
                 "source": n.get("source", ""), "url": n.get("url", ""),
                 "snippet": (n.get("body") or "")[:300]}
                for n in news
            ]
    except Exception as exc:
        logger.warning("Web-search formatting error for '%s': %s", company, exc)
    return out


# ─── Source 9: LinkedIn ───────────────────────────────────────────────────────


def _source_linkedin(company: str) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")
    ua_bot = "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.5)"
    for url in [
        f"https://www.linkedin.com/company/{slug}/",
        f"https://www.linkedin.com/company/{slug}-chile/",
    ]:
        resp = _get(url, ua=ua_bot, follow=False, timeout=6.0)
        if not resp:
            continue
        if resp.status_code in (200, 301, 302):
            html = resp.text[:12_000] if resp.text else ""
            meta = _extract_meta(html)
            title = meta.get("title", "")
            if title and not any(x in title.lower() for x in ["linkedin", "log in", "sign in"]):
                return {
                    "linkedin_url": url,
                    "linkedin_title": title,
                    "linkedin_description": (meta.get("description") or
                                             meta.get("og_description", ""))[:400],
                }
    return {}


# ─── Source 10: Wikipedia ES ─────────────────────────────────────────────────


def _source_wikipedia(company: str) -> dict:
    resp = _get(
        f"https://es.wikipedia.org/api/rest_v1/page/summary/{quote_plus(company)}",
        timeout=5.0,
    )
    if resp and resp.status_code == 200:
        data = resp.json()
        if data.get("type") != "disambiguation" and data.get("extract"):
            return {
                "wikipedia_url": data.get("content_urls", {}).get("desktop", {}).get("page"),
                "wikipedia_extract": data["extract"][:600],
            }
    return {}


# ─── Source 11: Rutificador (name → RUT) ─────────────────────────────────────


def _source_rutificador(full_name: str | None, company: str | None) -> tuple[dict, str]:
    out: dict = {}
    reached = False  # did we successfully reach the service at least once?
    parsed_any = False  # did any response contain a parseable (valid) RUT?

    def _try_search(query: str, tipo: str) -> str | None:
        """Return the first *valid* RUT (modulo-11 checked) from nombrerutificador.com."""
        nonlocal reached, parsed_any
        resp = _get(
            "https://www.nombrerutificador.com/busqueda.php",
            params={"tipo": tipo, "busqueda": query},
            timeout=8.0,
        )
        if not resp or resp.status_code != 200:
            return None
        reached = True
        # RUT pattern: XXXXXXXX-X or XX.XXX.XXX-X
        candidates = re.findall(r"\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b", resp.text)
        for cand in candidates:
            normalized = cand.replace(".", "")
            if _valid_rut(normalized):
                parsed_any = True
                return normalized
        return None

    if company:
        rut = _try_search(company, "empresa")
        if rut:
            out["company_rut"] = rut

    if full_name and not out.get("company_rut"):
        parts = full_name.strip().split()
        if len(parts) >= 2:
            rut = _try_search(full_name, "nombre")
            if rut:
                out["contact_rut"] = rut

    if out:
        return out, STATUS_OK
    if not reached:
        return out, STATUS_UNREACHABLE
    return out, STATUS_NO_DATA


# ─── Source 12: SII Chile ─────────────────────────────────────────────────────


def _source_sii(rut: str, declared_company: str, flags: list) -> tuple[dict, str]:
    """Query SII with a RUT and compare with declared company name.

    The RUT is modulo-11 validated before any request. A 200 that yields no
    razón social is reported as PARSE_FAILED (likely captcha/HTML change), so a
    silent scraper breakage is distinguishable from a genuine "no data".
    """
    if not _valid_rut(rut):
        return {}, STATUS_SKIPPED
    clean = re.sub(r"[^0-9kK]", "", rut.upper())
    # Format: 12345678-K
    formatted = f"{clean[:-1]}-{clean[-1]}"

    resp = _get(
        f"https://zeus.sii.cl/cvc_cgi/stc/getstc",
        params={"RUT": formatted},
        timeout=8.0,
    )
    if not resp or resp.status_code != 200:
        return {}, STATUS_UNREACHABLE

    html = resp.text
    # Extract razon social — several layouts seen over time.
    razon_match = (
        re.search(r"NOM_RAZON[^>]*>([^<]+)</", html, re.I)
        or re.search(r"(?:Nombre|Razón Social|Razon Social)\s*[:\-]?\s*"
                     r"([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\.,&]{3,120})", html)
        or re.search(r'razon[_-]?social["\'>\s:]+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\.,&]{3,120})', html, re.I)
    )

    actividad_match = re.search(
        r"(?:Actividad|Giro)[:\s]+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\.,]+)", html, re.I
    )
    inicio_match = re.search(r"(?:Inicio Actividades|Fecha)[:\s:]+(\d{2}/\d{2}/\d{4})", html)

    out: dict = {"sii_rut": formatted}

    if razon_match:
        razon = razon_match.group(1).strip()
        out["sii_razon_social"] = razon
        # Cross-check with declared company name
        declared_words = set(re.findall(r"\w{4,}", declared_company.upper()))
        sii_words = set(re.findall(r"\w{4,}", razon.upper()))
        overlap = declared_words & sii_words
        if not overlap:
            _flag(flags, "COMPANY_NAME_MISMATCH", "high",
                  f"La empresa declarada '{declared_company}' no coincide con SII: '{razon}'.",
                  "sii_lookup")

    if actividad_match:
        out["sii_actividad"] = actividad_match.group(1).strip()

    if inicio_match:
        out["sii_inicio_actividades"] = inicio_match.group(1)
        try:
            day, month, year = map(int, inicio_match.group(1).split("/"))
            age_days = (datetime.now() - datetime(year, month, day)).days
            out["sii_age_days"] = age_days
            if age_days < 180:
                _flag(flags, "RECENTLY_FORMED_COMPANY", "medium",
                      f"Empresa formada hace solo {age_days} días según SII.",
                      "sii_lookup")
        except Exception:
            pass

    # 200 OK but nothing parsed beyond the echoed RUT → page structure changed
    # or a captcha/interstitial was served. Surface it instead of failing silently.
    if not razon_match:
        return out, STATUS_PARSE_FAILED
    return out, STATUS_OK


# ─── Source 13: Mercado Público ───────────────────────────────────────────────


def _source_mercado_publico(company: str, rut: str | None = None) -> tuple[dict, str]:
    """Look up company activity in ChileCompra.

    Preferred path (when MERCADO_PUBLICO_TICKET is set and a RUT was resolved
    upstream): the official API, which counts public-sector purchase orders —
    a genuine signal of economic scale and an established supplier relationship.
    Falls back to the name-based web scraper otherwise.
    """
    if _MP_TICKET and rut and _valid_rut(rut):
        clean = re.sub(r"[^0-9kK]", "", rut.upper())
        formatted = f"{clean[:-1]}-{clean[-1]}"
        resp = _get(
            "https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json",
            params={"proveedor": formatted, "ticket": _MP_TICKET},
            timeout=10.0,
        )
        if resp and resp.status_code == 200:
            try:
                data = resp.json()
                count = data.get("Cantidad", len(data.get("Listado", []) or []))
                if count:
                    return {
                        "mercado_publico_found": True,
                        "mercado_publico_rut": formatted,
                        "mercado_publico_ordenes": count,
                        "mercado_publico_url":
                            f"https://www.mercadopublico.cl/Portal/Modules/Site/"
                            f"Busquedas/ResultadosBusqueda.aspx?qs={quote_plus(company)}",
                    }, STATUS_OK
                return {"mercado_publico_found": False}, STATUS_NO_DATA
            except Exception:
                pass  # fall through to scraper

    resp = _get(
        "https://www.mercadopublico.cl/Home/Empresa/BuscarEmpresa",
        params={"nombre": company},
        timeout=8.0,
    )
    if not resp or resp.status_code != 200:
        return {"mercado_publico_found": False}, STATUS_UNREACHABLE

    # Look for contract count or company entries (keep only valid RUTs)
    count_match = re.search(r"(\d+)\s+(?:resultado|empresa|proveedor)", resp.text, re.I)
    entries = [
        r for r in re.findall(r'<td[^>]*>\s*(\d{1,2}\.\d{3}\.\d{3}-[\dkK])\s*</td>', resp.text)
        if _valid_rut(r)
    ]
    if entries or count_match:
        return {
            "mercado_publico_found": True,
            "mercado_publico_ruts": entries[:3],
            "mercado_publico_url": f"https://www.mercadopublico.cl/Home/Empresa/BuscarEmpresa?nombre={quote_plus(company)}",
        }, STATUS_OK
    return {"mercado_publico_found": False}, STATUS_NO_DATA


# ─── Source 14: Boletín Concursal (insolvency / bankruptcy) ───────────────────


def _source_boletin_concursal(rut: str, flags: list) -> tuple[dict, str]:
    """Check the Boletín Concursal (Superir) for insolvency proceedings.

    A hit means the company/person is in a liquidation or reorganización
    procedure — a strong economic-viability risk (feeds verdict rule D3).
    Always returns a verifiable link so a human can confirm.
    """
    if not _valid_rut(rut):
        return {}, STATUS_SKIPPED
    clean = re.sub(r"[^0-9kK]", "", rut.upper())
    formatted = f"{clean[:-1]}-{clean[-1]}"
    link = f"https://www.boletinconcursal.cl/boletin/procedimientos?rut={formatted}"
    out: dict = {"boletin_concursal_url": link}

    resp = _get(link, timeout=8.0)
    if not resp or resp.status_code != 200:
        return out, STATUS_UNREACHABLE

    text = resp.text
    has_proc = bool(re.search(r"(Liquidaci[oó]n|Reorganizaci[oó]n|Procedimiento Concursal)",
                              text, re.I))
    no_results = bool(re.search(r"(sin resultados|no se encontraron|0 resultados)", text, re.I))
    if has_proc and not no_results:
        out["boletin_concursal_found"] = True
        _flag(flags, "INSOLVENCY_PROCEEDING", "high",
              f"RUT {formatted} aparece con procedimiento concursal (insolvencia) "
              f"en el Boletín Concursal.", "boletin_concursal")
        return out, STATUS_OK
    if no_results:
        out["boletin_concursal_found"] = False
        return out, STATUS_NO_DATA
    return out, STATUS_PARSE_FAILED


# ─── Source 15: Registro de Empresas y Sociedades (RES) ───────────────────────


def _source_registro_empresas(company: str, rut: str | None) -> tuple[dict, str]:
    """Best-effort lookup in the Registro de Empresas y Sociedades.

    The RES (Empresa en un Día) holds incorporation data: tipo societario,
    capital, socios. The portal is JS-heavy, so this is best-effort plus a
    verifiable search link the admin can open.
    """
    link = "https://www.registrodeempresasysociedades.cl/Empresa/BuscarEmpresa.aspx"
    out: dict = {"registro_empresas_url": link}
    query = rut if (rut and _valid_rut(rut)) else company
    resp = _get(link, params={"q": query}, timeout=8.0)
    if not resp or resp.status_code != 200:
        return out, STATUS_UNREACHABLE
    m = re.search(r"(Sociedad por Acciones|Responsabilidad Limitada|E\.I\.R\.L\.|"
                  r"Sociedad An[oó]nima|SpA)", resp.text, re.I)
    if m:
        out["registro_empresas_tipo"] = m.group(1)
        return out, STATUS_OK
    return out, STATUS_NO_DATA


# ─── Source 16: Diario Oficial (incorporation / modification notices) ─────────


def _source_diario_oficial(company: str) -> tuple[dict, str]:
    """Search the Diario Oficial for company constitution / modification notices.

    Confirms the company was legally published and gives an incorporation date
    reference. Returns a verifiable search link regardless of parse outcome.
    """
    link = ("https://www.diariooficial.interior.gob.cl/edicionelectronica/"
            f"empresas_cooperativas.php?q={quote_plus(company)}")
    out: dict = {"diario_oficial_url": link}
    resp = _get(link, timeout=8.0)
    if not resp or resp.status_code != 200:
        return out, STATUS_UNREACHABLE
    if re.search(re.escape(company.split()[0]), resp.text, re.I):
        out["diario_oficial_found"] = True
        return out, STATUS_OK
    return out, STATUS_NO_DATA


# ─── Source 17+18: INAPI (trademarks) + Poder Judicial (litigation) ───────────


def _source_verifiable_links(company: str, rut: str | None) -> dict:
    """Emit verifiable deep links for sources that are gated (JS/captcha).

    These can't be scraped freely without risking ToS/captcha, so instead of
    guessing we hand the admin a one-click public lookup — useful, free, and
    fully within the public-information rule (D4).
    """
    out: dict = {
        "inapi_marcas_url":
            f"https://ion.inapi.cl/Marca/BuscarMarca.aspx?q={quote_plus(company)}",
    }
    if rut and _valid_rut(rut):
        clean = re.sub(r"[^0-9kK]", "", rut.upper())
        formatted = f"{clean[:-1]}-{clean[-1]}"
        out["poder_judicial_url"] = (
            "https://oficinajudicialvirtual.pjud.cl/indexN.php"
            f"#rut={formatted}")
    return out


# ─── Source 19: Optional AI synthesis (Claude SDK → OpenAI-compatible) ────────

# Structured shape the synthesis must return.
_SYNTHESIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "profile": {"type": "string"},
        "viability": {"type": "string", "enum": ["alta", "media", "baja"]},
        "reasons": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["profile", "viability", "reasons"],
}

_SYNTHESIS_PROMPT = (
    "Eres un analista de inteligencia comercial. Con SOLO los datos públicos "
    "entregados (no inventes nada), redacta un perfil breve de la empresa y un "
    "pre-veredicto de viabilidad (técnica, económica, legal) en JSON con las "
    "claves: profile (string), viability (alta|media|baja), reasons (array de "
    "strings).\nDatos:\n{facts}"
)


def _build_synthesis_prompt(result: dict) -> str:
    """Assemble the synthesis prompt from harvested signals only (never raw HTML)."""
    signal_keys = (
        "company", "sii_razon_social", "sii_actividad", "website_title",
        "website_description", "website_address", "web_top_snippet",
        "linkedin_description", "wikipedia_extract", "mercado_publico_found",
        "boletin_concursal_found", "registro_empresas_tipo", "industry",
        "flags",
    )
    facts = {k: result.get(k) for k in signal_keys if result.get(k) is not None}
    return _SYNTHESIS_PROMPT.format(facts=json.dumps(facts, ensure_ascii=False))


def _synthesize_claude(prompt: str) -> dict:
    """Synthesise via the official Anthropic SDK (Claude Haiku by default).

    Haiku is cheap enough (~US$0.005/lead) for per-lead synthesis and needs no
    self-hosted model. Uses structured outputs so the result matches the schema.
    """
    try:
        import anthropic  # type: ignore
    except ImportError:
        logger.warning("anthropic SDK not installed — Claude synthesis skipped")
        return {}
    try:
        client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
        resp = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1024,
            system="Responde únicamente con los datos entregados; no inventes nada.",
            messages=[{"role": "user", "content": prompt}],
            output_config={"format": {"type": "json_schema", "schema": _SYNTHESIS_SCHEMA}},
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return {"ai_synthesis": json.loads(text)}
    except Exception as exc:
        logger.debug("Claude synthesis skipped: %s", exc)
        return {}


def _synthesize_openai_compatible(prompt: str) -> dict:
    """Synthesise via any OpenAI-compatible /v1/chat/completions endpoint.

    Covers a local Ollama server or a free Groq tier. Used only when no
    Anthropic key is configured.
    """
    headers = {"Content-Type": "application/json"}
    if _LLM_KEY:
        headers["Authorization"] = f"Bearer {_LLM_KEY}"
    try:
        resp = httpx.post(
            _LLM_URL.rstrip("/") + "/v1/chat/completions",
            json={
                "model": _LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "stream": False,
            },
            headers=headers,
            timeout=30.0,
        )
        if resp.status_code != 200:
            return {}
        content = resp.json()["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", content, re.S)
        parsed = json.loads(m.group(0)) if m else {"profile": content[:600]}
        return {"ai_synthesis": parsed}
    except Exception as exc:
        logger.debug("AI synthesis (OpenAI-compatible) skipped: %s", exc)
        return {}


def _source_ai_synthesis(result: dict) -> dict:
    """Reconcile collected signals into a structured profile + viability verdict.

    Prefers Claude (official SDK) when ANTHROPIC_API_KEY is set; otherwise uses
    an OpenAI-compatible endpoint (ENRICH_LLM_URL — Groq/Ollama). The model only
    *synthesises* already-collected public data — it performs no searches
    (rule D2). Degrades silently if no provider is configured or reachable.
    """
    if not (_ANTHROPIC_KEY or _LLM_URL):
        return {}
    prompt = _build_synthesis_prompt(result)
    if _ANTHROPIC_KEY:
        return _synthesize_claude(prompt)
    return _synthesize_openai_compatible(prompt)


# ─── Risk score ───────────────────────────────────────────────────────────────


def _risk_score(flags: list) -> int:
    total = sum(_SEVERITY_SCORE.get(f["severity"], 0) for f in flags)
    return min(total, 100)


def _risk_level(score: int) -> str:
    if score >= 60:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


# ─── Main entry point ─────────────────────────────────────────────────────────


def enrich_lead(
    email: str,
    company: str,
    full_name: str | None = None,
    phone: str | None = None,
    industry: str | None = None,
    ip_address: str | None = None,
) -> dict:
    """Run all enrichment sources. Returns a jsonb-ready dict for leads.enrichment_data.

    NEVER raises. All failures are caught and logged.
    """
    result: dict = {
        "enrichment_version": "4.1",
        "sources_used": [],
        "flags": [],
        "verification": {},
    }
    flags: list = result["flags"]
    verification: dict = result["verification"]

    # ── 1-3. Email (DNS + disposable + WHOIS) ──
    r = _source_email(email, flags)
    result.update(r)
    result["sources_used"].append("email_analysis")

    domain = email.split("@")[-1].lower() if "@" in email else ""

    # ── 4. Phone ──
    if phone:
        r = _source_phone(phone, flags)
        result.update(r)
        result["sources_used"].append("phone_validation")

    # ── 5. IP geolocation ──
    if ip_address:
        r = _source_ip(ip_address, flags)
        if r:
            result.update(r)
            result["sources_used"].append("ip_geolocation")

    # ── 6. Website ──
    web_domain = domain if (domain and domain not in _GENERIC) else None
    if not web_domain and company:
        # Free email → infer the corporate domain from the company name.
        web_domain = _domain_from_company(company)
        if web_domain:
            result["website_from_company_name"] = True
    if web_domain:
        r = _source_website(web_domain, flags)
        if r:
            result.update(r)
            result["sources_used"].append("website_scrape")

    # ── 7+8. DDG web + news ──
    if company:
        # If we already reached the corporate site, a web-search miss is not a
        # "no web presence" signal — don't let a blocked backend flag a real co.
        known_web = bool(result.get("website_accessible"))
        r = _source_ddg(company, industry, flags, known_web_presence=known_web)
        if r:
            result.update(r)
            result["sources_used"].append("ddg_search")

    # ── 9. LinkedIn ──
    if company:
        r = _source_linkedin(company)
        if r:
            result.update(r)
            result["sources_used"].append("linkedin_scrape")

    # ── 10. Wikipedia ──
    if company:
        r = _source_wikipedia(company)
        if r:
            result.update(r)
            result["sources_used"].append("wikipedia")

    # ── 11. Rutificador ──
    r, status = _source_rutificador(full_name, company)
    verification["rutificador"] = status
    if r:
        result.update(r)
        result["sources_used"].append("rutificador")

    # ── Waterfall: resolve a single best RUT for the verification chain ──
    # Only RUTs from a *targeted* lookup (Rutificador, queried by company /
    # contact name) are trusted as the entity's own RUT. RUTs merely scraped
    # from the website body are kept as informational `website_ruts` but are
    # NOT used to drive high-severity checks (SII / Boletín Concursal): a RUT
    # appearing anywhere on a site is frequently a client's, an employee's, or
    # an example — using it would raise a false insolvency flag against a real
    # company (e.g. HCMFront's site lists a third party's RUT).
    rut = result.get("company_rut") or result.get("contact_rut")
    if rut:
        result["resolved_rut"] = rut

    # ── 12. SII (fed by the resolved RUT) ──
    if rut and company:
        r, status = _source_sii(rut, company, flags)
        verification["sii"] = status
        if r:
            result.update(r)
            result["sources_used"].append("sii_lookup")
        # PARSE_FAILED is an operational signal (scraper broke / captcha), not a
        # lead-quality risk — kept in `verification`, not in the scored flags.
    else:
        verification["sii"] = STATUS_SKIPPED

    # ── 13. Mercado Público (official API when RUT + ticket, else scraper) ──
    if company:
        r, status = _source_mercado_publico(company, rut)
        verification["mercado_publico"] = status
        if r:
            result.update(r)
            result["sources_used"].append("mercado_publico")
    else:
        verification["mercado_publico"] = STATUS_SKIPPED

    # ── 14. Boletín Concursal (insolvency by RUT) ──
    if rut:
        r, status = _source_boletin_concursal(rut, flags)
        verification["boletin_concursal"] = status
        if r:
            result.update(r)
            result["sources_used"].append("boletin_concursal")
    else:
        verification["boletin_concursal"] = STATUS_SKIPPED

    # ── 15. Registro de Empresas y Sociedades ──
    if company:
        r, status = _source_registro_empresas(company, rut)
        verification["registro_empresas"] = status
        if r:
            result.update(r)
            result["sources_used"].append("registro_empresas")

    # ── 16. Diario Oficial ──
    if company:
        r, status = _source_diario_oficial(company)
        verification["diario_oficial"] = status
        if r:
            result.update(r)
            result["sources_used"].append("diario_oficial")

    # ── 17+18. Verifiable links (INAPI trademarks, Poder Judicial) ──
    if company:
        r = _source_verifiable_links(company, rut)
        if r:
            result.update(r)
            result["sources_used"].append("verifiable_links")

    # ── 19. Optional AI synthesis (runs last, over collected signals) ──
    r = _source_ai_synthesis(result)
    if r:
        result.update(r)
        result["sources_used"].append("ai_synthesis")

    # ── Risk score ──
    score = _risk_score(flags)
    result["risk_score"] = score
    result["risk_level"] = _risk_level(score)
    result["sources_count"] = len(result["sources_used"])
    result["flags_count"] = len(flags)

    # ── Human-readable summary ──
    parts: list[str] = []
    if flags:
        high = [f for f in flags if f["severity"] == "high"]
        med  = [f for f in flags if f["severity"] == "medium"]
        if high:
            parts.append(f"⚠️ {len(high)} alerta(s) crítica(s): " +
                         "; ".join(f["detail"] for f in high))
        if med:
            parts.append(f"⚡ {len(med)} advertencia(s): " +
                         "; ".join(f["detail"] for f in med))
    if result.get("sii_razon_social"):
        parts.append(f"SII: {result['sii_razon_social']}" +
                     (f" — {result['sii_actividad']}" if result.get("sii_actividad") else ""))
    if result.get("website_title"):
        parts.append(f"Web: {result['website_title']}")
    if result.get("web_top_snippet"):
        parts.append(result["web_top_snippet"][:200])
    if result.get("linkedin_description"):
        parts.append(f"LinkedIn: {result['linkedin_description'][:150]}")
    if result.get("wikipedia_extract"):
        parts.append(f"Wikipedia: {result['wikipedia_extract'][:200]}")
    if result.get("mercado_publico_found"):
        ordenes = result.get("mercado_publico_ordenes")
        parts.append("Registrado en Mercado Público (ChileCompra)" +
                     (f" — {ordenes} órdenes de compra." if ordenes else "."))
    if result.get("registro_empresas_tipo"):
        parts.append(f"Sociedad: {result['registro_empresas_tipo']}")
    if result.get("ai_synthesis", {}).get("viability"):
        parts.append(f"IA pre-veredicto viabilidad: {result['ai_synthesis']['viability']}")

    # Operational note: a claimed RUT we couldn't verify in SII (page changed
    # or captcha) — flagged for manual review, separate from fraud signals.
    if verification.get("sii") in (STATUS_PARSE_FAILED, STATUS_UNREACHABLE):
        parts.append("ⓘ SII no verificable automáticamente — revisar a mano.")

    result["summary"] = " | ".join(parts) or "Sin información adicional encontrada."

    logger.info(
        "Enrichment v4.0 done — risk=%s/%s flags=%d sources=%d verification=%s",
        score, result["risk_level"], len(flags), len(result["sources_used"]),
        verification,
    )
    return result
