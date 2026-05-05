import { createClient } from '@supabase/supabase-js'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = 'CristobalMartinezSSF'
const GITHUB_REPO = 'sustenta-futuro'
const GITHUB_PATH = 'apps/web/index.html'
const GITHUB_BRANCH = 'main'

interface ConfigRow {
  section: string
  key: string
  value: string
}

function applyCms(html: string, key: string, replacement: string): string {
  const regex = new RegExp(
    `(<!-- CMS:${key}:START -->)[\\s\\S]*?(<!-- CMS:${key}:END -->)`,
    'g'
  )
  return html.replace(regex, `$1${replacement}$2`)
}

// Wraps plain text values in the correct HTML element for each CMS key
function wrapValue(section: string, key: string, value: string): string {
  const text = value.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (section === 'hero' && key === 'description') {
    return `<p>\n          ${text}\n        </p>`
  }
  if (section === 'metrics' && key.endsWith('_label')) {
    return `<span class="hfs-label">${text}</span>`
  }
  if (section === 'nosotros' && (key === 'text_1' || key === 'text_2')) {
    return `<p>${text}</p>`
  }
  if (section === 'nosotros' && key === 'founder_name') {
    return `<span>${text}</span>`
  }
  if (section === 'testimonios' && key.endsWith('_text')) {
    return `<p class="tc-text">${text}</p>`
  }
  if (section === 'testimonios' && key.endsWith('_name')) {
    return `<strong>${text}</strong>`
  }
  if (section === 'testimonios' && key.endsWith('_role')) {
    return `<span>${text}</span>`
  }
  return value
}

export async function POST(): Promise<Response> {
  try {
    // 1. Read all landing_config rows using service role (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: rows, error: dbError } = await supabase
      .from('landing_config')
      .select('section, key, value')

    if (dbError) {
      return Response.json(
        { error: `Error reading config: ${dbError.message}` },
        { status: 500 }
      )
    }

    const configRows = (rows ?? []) as ConfigRow[]

    // Pre-build testimonial names for initials fallback
    const testimonialsNames: Record<number, string> = {}
    for (const row of configRows) {
      if (row.section === 'testimonios') {
        const m = row.key.match(/^tc_(\d)_name$/)
        if (m) testimonialsNames[parseInt(m[1])] = row.value ?? ''
      }
    }

    function getInitials(name: string): string {
      return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'GF'
    }

    // 2. Read current index.html from GitHub
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!getRes.ok) {
      const body = await getRes.text()
      return Response.json(
        { error: `GitHub GET failed (${getRes.status}): ${body}` },
        { status: 500 }
      )
    }

    const githubFile = await getRes.json()
    const { content: encodedContent, sha } = githubFile as {
      content: string
      sha: string
    }

    let html = Buffer.from(encodedContent, 'base64').toString('utf-8')

    // 3. Apply CMS replacements
    for (const row of configRows) {
      const cmsKey = `${row.section}-${row.key}`
      const value = row.value ?? ''

      // Testimonial avatar photo: inject img or revert to initials
      if (row.section === 'testimonios' && row.key.match(/^tc_(\d)_photo_url$/)) {
        const m = row.key.match(/^tc_(\d)_photo_url$/)!
        const n = parseInt(m[1])
        const cmsKey = `testimonios-tc_${n}_photo`
        if (value) {
          const imgTag = `<img src="${value}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`
          html = applyCms(html, cmsKey, imgTag)
        } else {
          html = applyCms(html, cmsKey, getInitials(testimonialsNames[n] ?? ''))
        }
        continue
      }

      // Testimonial company logo: inject img or revert to default SVG icon when cleared
      if (row.section === 'testimonios' && row.key.match(/^tc_(\d)_company_url$/)) {
        const m = row.key.match(/^tc_(\d)_company_url$/)!
        const n = parseInt(m[1])
        const cmsKey = `testimonios-tc_${n}_company`
        if (value) {
          const imgTag = `<img src="${value}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:4px;display:block;" />`
          html = applyCms(html, cmsKey, imgTag)
        } else {
          const svgDefault = `<svg viewBox="0 0 24 24" fill="none" stroke="#0093B2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 7V5a2 2 0 00-4 0v2"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></svg>`
          html = applyCms(html, cmsKey, svgDefault)
        }
        continue
      }

      // Founder photo: skip if empty (keep SVG placeholder), inject img if URL present.
      // nosotros-founder_name markers are nested INSIDE nosotros-founder_photo, so we
      // must re-embed them in the replacement to prevent losing them on publish.
      if (row.section === 'nosotros' && row.key === 'founder_photo_url') {
        if (value) {
          const founderName = configRows.find(
            (r) => r.section === 'nosotros' && r.key === 'founder_name'
          )?.value ?? ''
          const nameContent = founderName
            ? `<span>${founderName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
            : ''
          const replacement =
            `<img src="${value}" alt="Héctor Molt" style="width:200px;height:200px;object-fit:cover;border-radius:12px;" />\n            ` +
            `<!-- CMS:nosotros-founder_name:START -->${nameContent}<!-- CMS:nosotros-founder_name:END -->`
          html = applyCms(html, 'nosotros-founder_photo', replacement)
        }
        continue
      }

      // Site logo: apply to both navbar and footer markers
      if (row.section === 'marca' && row.key === 'logo_url') {
        const src = value || 'logo-full.webp'
        html = applyCms(html, 'marca-logo_navbar', `<img class="logo" src="${src}" alt="Sustenta Futuro" />`)
        html = applyCms(html, 'marca-logo_footer', `<img class="logo-footer" src="${src}" alt="Sustenta Futuro" />`)
        continue
      }

      // Service card images: inject img or fallback to original asset
      if (row.section === 'producto' && row.key.match(/^svc_(\d)_img_url$/)) {
        const m = row.key.match(/^svc_(\d)_img_url$/)!
        const n = parseInt(m[1])
        const defaults = [
          'img/diseño web.webp',
          'img/desarrollo de software.webp',
          'img/apps moviles.webp',
          'img/automatizaciones.webp',
          'img/chatbots y landing.webp',
        ]
        const src = value || (defaults[n] ?? '')
        if (src) {
          html = applyCms(html, `producto-svc_${n}_img`, `<img src="${src}" alt="" loading="lazy" />`)
        }
        continue
      }

      // Metric nums: skip — managed in code, not editable via CMS
      if (row.section === 'metrics' && row.key.endsWith('_num')) {
        continue
      }

      html = applyCms(html, cmsKey, wrapValue(row.section, row.key, value))
    }

    // 4. Commit updated file back to GitHub
    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'chore: update landing content from admin panel',
          content: Buffer.from(html).toString('base64'),
          sha,
          branch: GITHUB_BRANCH,
        }),
      }
    )

    if (!putRes.ok) {
      const body = await putRes.text()
      return Response.json(
        { error: `GitHub PUT failed (${putRes.status}): ${body}` },
        { status: 500 }
      )
    }

    return Response.json({ success: true, publishedAt: new Date().toISOString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
