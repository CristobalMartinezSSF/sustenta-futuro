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

function applyCms(html: string, key: string, value: string): string {
  const regex = new RegExp(
    `(<!-- CMS:${key}:START -->)[\\s\\S]*?(<!-- CMS:${key}:END -->)`,
    'g'
  )
  return html.replace(regex, `$1${value}$2`)
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
      let value = row.value ?? ''

      // Special case: founder photo — replace SVG placeholder with img tag
      if (
        row.section === 'nosotros' &&
        row.key === 'founder_photo_url' &&
        value
      ) {
        value = `<img src="${value}" alt="Fundador" style="width:100%;height:100%;object-fit:cover;" />`
      }

      html = applyCms(html, cmsKey, value)
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
