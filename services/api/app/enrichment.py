"""Lead enrichment service — v3.0 comprehensive.

ALL leads are accepted. Suspicious signals are recorded as flags.
Never raises — all failures are caught and logged.

Sources:
  1.  Email DNS validation
  2.  Disposable email detection (embedded blocklist)
  3.  Domain age via WHOIS
  4.  Phone format validation (Chilean)
  5.  IP geolocation (ip-api.com, free, no key)
  6.  Corporate website scraping
  7.  DuckDuckGo web search
  8.  DuckDuckGo news search
  9.  LinkedIn company page (public meta)
  10. Wikipedia ES API
  11. Rutificador — company/person name → RUT (best-effort)
  12. SII Chile — RUT → razón social, rubro, actividad
  13. Mercado Público — company in ChileCompra (best-effort)
"""

from __future__ import annotations

import logging
import re
import socket
import time
from datetime import datetime, timezone
from typing import TypedDict
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

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
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return httpx.get(
                url, timeout=timeout, follow_redirects=follow, params=params,
                headers={"User-Agent": ua, "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"},
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
    meta = _extract_meta(resp.text[:15_000])
    out: dict = {
        "inferred_website": url,
        "website_accessible": True,
        "website_title": meta.get("title"),
        "website_description": meta.get("description") or meta.get("og_description"),
    }
    return {k: v for k, v in out.items() if v is not None}


# ─── Source 7+8: DuckDuckGo web + news ───────────────────────────────────────


def _source_ddg(company: str, industry: str | None, flags: list) -> dict:
    out: dict = {}
    try:
        from duckduckgo_search import DDGS  # type: ignore
        q = f"{company} Chile {industry or ''}".strip()
        with DDGS() as ddgs:
            hits = list(ddgs.text(q, max_results=5))
            news = list(ddgs.news(f"{company} Chile", max_results=3))

        if hits:
            out["web_search_results"] = [
                {"title": h.get("title", ""), "url": h.get("href", ""),
                 "snippet": (h.get("body") or "")[:300]}
                for h in hits
            ]
            out["web_top_snippet"] = (hits[0].get("body") or "")[:500]
        else:
            _flag(flags, "NO_WEB_PRESENCE", "medium",
                  f"No se encontraron resultados web para '{company} Chile'.", "ddg_search")

        if news:
            out["news_results"] = [
                {"date": n.get("date", ""), "title": n.get("title", ""),
                 "source": n.get("source", ""), "url": n.get("url", ""),
                 "snippet": (n.get("body") or "")[:300]}
                for n in news
            ]
    except ImportError:
        logger.warning("duckduckgo-search not installed")
    except Exception as exc:
        logger.warning("DDG search error for '%s': %s", company, exc)
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


def _source_mercado_publico(company: str) -> tuple[dict, str]:
    """Search for company activity in ChileCompra."""
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
        "enrichment_version": "3.1",
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
    if domain and domain not in _GENERIC:
        r = _source_website(domain, flags)
        if r:
            result.update(r)
            result["sources_used"].append("website_scrape")

    # ── 7+8. DDG web + news ──
    if company:
        r = _source_ddg(company, industry, flags)
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

    # ── 12. SII ──
    rut = result.get("company_rut") or result.get("contact_rut")
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

    # ── 13. Mercado Público ──
    if company:
        r, status = _source_mercado_publico(company)
        verification["mercado_publico"] = status
        if r:
            result.update(r)
            result["sources_used"].append("mercado_publico")
    else:
        verification["mercado_publico"] = STATUS_SKIPPED

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
        parts.append("Registrado en Mercado Público (ChileCompra).")

    # Operational note: a claimed RUT we couldn't verify in SII (page changed
    # or captcha) — flagged for manual review, separate from fraud signals.
    if verification.get("sii") in (STATUS_PARSE_FAILED, STATUS_UNREACHABLE):
        parts.append("ⓘ SII no verificable automáticamente — revisar a mano.")

    result["summary"] = " | ".join(parts) or "Sin información adicional encontrada."

    logger.info(
        "Enrichment v3.1 done — risk=%s/%s flags=%d sources=%d verification=%s",
        score, result["risk_level"], len(flags), len(result["sources_used"]),
        verification,
    )
    return result
