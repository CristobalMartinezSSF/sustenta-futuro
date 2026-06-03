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
from datetime import datetime, timezone
from typing import TypedDict
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

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
         params: dict | None = None) -> httpx.Response | None:
    try:
        return httpx.get(
            url, timeout=timeout, follow_redirects=follow, params=params,
            headers={"User-Agent": ua, "Accept-Language": "es-CL,es;q=0.9,en;q=0.8"},
        )
    except Exception as exc:
        logger.debug("GET %s failed: %s", url, exc)
        return None


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


def _source_rutificador(full_name: str | None, company: str | None) -> dict:
    out: dict = {}

    def _try_search(query: str, tipo: str) -> str | None:
        """Try to get a RUT from nombrerutificador.com."""
        try:
            resp = _get(
                "https://www.nombrerutificador.com/busqueda.php",
                params={"tipo": tipo, "busqueda": query},
                timeout=8.0,
            )
            if resp and resp.status_code == 200:
                # RUT pattern: XXXXXXXX-X or XX.XXX.XXX-X
                rut_matches = re.findall(
                    r"\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b", resp.text
                )
                if rut_matches:
                    return rut_matches[0].replace(".", "")
        except Exception as exc:
            logger.debug("Rutificador search failed: %s", exc)
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

    return out


# ─── Source 12: SII Chile ─────────────────────────────────────────────────────


def _source_sii(rut: str, declared_company: str, flags: list) -> dict:
    """Query SII with a RUT and compare with declared company name."""
    clean = re.sub(r"[^0-9kK]", "", rut.upper())
    if len(clean) < 7:
        return {}
    # Format: 12345678-K
    formatted = f"{clean[:-1]}-{clean[-1]}"

    resp = _get(
        f"https://zeus.sii.cl/cvc_cgi/stc/getstc",
        params={"RUT": formatted},
        timeout=8.0,
    )
    if not resp or resp.status_code != 200:
        return {}

    html = resp.text
    # Extract razon social
    razon_match = re.search(
        r"NOM_RAZON[^>]*>([^<]+)</", html, re.I
    ) or re.search(r"(?:Nombre|Razón Social)[:\s]+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\.,&]+)", html)

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

    return out


# ─── Source 13: Mercado Público ───────────────────────────────────────────────


def _source_mercado_publico(company: str) -> dict:
    """Search for company activity in ChileCompra."""
    try:
        resp = _get(
            "https://www.mercadopublico.cl/Home/Empresa/BuscarEmpresa",
            params={"nombre": company},
            timeout=8.0,
        )
        if resp and resp.status_code == 200:
            # Look for contract count or company entries
            count_match = re.search(r"(\d+)\s+(?:resultado|empresa|proveedor)", resp.text, re.I)
            entries = re.findall(r'<td[^>]*>\s*(\d{1,2}\.\d{3}\.\d{3}-[\dkK])\s*</td>', resp.text)
            if entries or count_match:
                return {
                    "mercado_publico_found": True,
                    "mercado_publico_ruts": entries[:3],
                    "mercado_publico_url": f"https://www.mercadopublico.cl/Home/Empresa/BuscarEmpresa?nombre={quote_plus(company)}",
                }
    except Exception as exc:
        logger.debug("Mercado Público search failed: %s", exc)
    return {"mercado_publico_found": False}


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
    result: dict = {"enrichment_version": "3.0", "sources_used": [], "flags": []}
    flags: list = result["flags"]

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
    r = _source_rutificador(full_name, company)
    if r:
        result.update(r)
        result["sources_used"].append("rutificador")

    # ── 12. SII ──
    rut = result.get("company_rut") or result.get("contact_rut")
    if rut and company:
        r = _source_sii(rut, company, flags)
        if r:
            result.update(r)
            result["sources_used"].append("sii_lookup")

    # ── 13. Mercado Público ──
    if company:
        r = _source_mercado_publico(company)
        if r:
            result.update(r)
            result["sources_used"].append("mercado_publico")

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

    result["summary"] = " | ".join(parts) or "Sin información adicional encontrada."

    logger.info(
        "Enrichment v3 done — risk=%s/%s flags=%d sources=%d",
        score, result["risk_level"], len(flags), len(result["sources_used"]),
    )
    return result
