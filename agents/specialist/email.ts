// ─── Email Agent — IMAP read + triage + SMTP send via Gmail ──────────────
// Uses imapflow for reading, nodemailer (already installed) for sending.
// All email content processed locally by Ollama — never sent to cloud.

import nodemailer from 'nodemailer'
import { callOllama } from '../shared/models'

const GMAIL_USER   = process.env.GMAIL_USER!
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD!
const NOTIFY_EMAIL = process.env.BRIEFING_NOTIFY_EMAIL || GMAIL_USER

// ── SMTP transporter (send) ───────────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  })
}

// ── IMAP reader using imapflow ────────────────────────────────────────────
async function withImap<T>(fn: (client: import('imapflow').ImapFlow) => Promise<T>): Promise<T> {
  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    logger: false,
  })
  try {
    await client.connect()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Gmail IMAP connection failed (check GMAIL_USER / GMAIL_APP_PASSWORD): ${msg}`)
  }
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

// ── Parse plain text from email body ─────────────────────────────────────
function extractText(parsed: { text?: string | boolean | null; html?: string | boolean | null }): string {
  if (typeof parsed.text === 'string' && parsed.text) return parsed.text.slice(0, 3000)
  if (typeof parsed.html === 'string' && parsed.html) {
    return parsed.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000)
  }
  return ''
}

// ── Main executor ─────────────────────────────────────────────────────────
export async function executeEmailAction(action: string, params: Record<string, unknown>): Promise<{ ok: boolean; message: string; data?: unknown }> {
  try {
    return await _executeEmailAction(action, params)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Email agent error: ${msg}` }
  }
}

async function _executeEmailAction(action: string, params: Record<string, unknown>): Promise<{ ok: boolean; message: string; data?: unknown }> {
  if (!GMAIL_USER || !GMAIL_PASS) {
    return { ok: false, message: 'Gmail not configured — set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local' }
  }

  switch (action) {

    // ── Fetch inbox (unread or recent) ────────────────────────────────────
    case 'fetch_inbox': {
      const limit     = (params.limit as number) || 10
      const unreadOnly = params.unread_only !== false // default true

      return withImap(async client => {
        await client.mailboxOpen('INBOX')
        const { simpleParser } = await import('mailparser')
        const emails: {
          uid: number; from: string; subject: string; date: string; snippet: string; unread: boolean
        }[] = []

        const searchCriteria = unreadOnly ? { seen: false } : '1:*'
        for await (const msg of client.fetch(searchCriteria, { source: true, flags: true })) {
          if (emails.length >= limit) break
          try {
            if (!msg.source) continue
            const parsed = await simpleParser(msg.source)
            emails.push({
              uid: msg.uid,
              from: parsed.from?.text ?? 'Unknown',
              subject: parsed.subject ?? '(no subject)',
              date: parsed.date?.toISOString().slice(0, 10) ?? '',
              snippet: extractText(parsed).slice(0, 200),
              unread: !msg.flags?.has('\\Seen'),
            })
          } catch { /* skip malformed */ }
        }

        return {
          ok: true,
          message: `${emails.length} ${unreadOnly ? 'unread' : 'recent'} emails`,
          data: emails,
        }
      })
    }

    // ── Read a single email by UID ────────────────────────────────────────
    case 'read_email': {
      const uid = params.uid as number
      if (!uid) return { ok: false, message: 'uid required' }

      return withImap(async client => {
        await client.mailboxOpen('INBOX')
        const { simpleParser } = await import('mailparser')

        for await (const msg of client.fetch({ uid: String(uid) }, { source: true, flags: true })) {
          if (!msg.source) continue
          const parsed = await simpleParser(msg.source)
          // Mark as read
          await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'])
          return {
            ok: true,
            message: `Email: ${parsed.subject}`,
            data: {
              uid,
              from: parsed.from?.text ?? 'Unknown',
              to: Array.isArray(parsed.to) ? parsed.to.map(a => a.text).join(', ') : (parsed.to?.text ?? ''),
              subject: parsed.subject ?? '(no subject)',
              date: parsed.date?.toISOString() ?? '',
              body: extractText(parsed),
            },
          }
        }
        return { ok: false, message: `Email UID ${uid} not found` }
      })
    }

    // ── Triage inbox — categorize + prioritize unread emails ──────────────
    case 'triage_inbox': {
      const limit = (params.limit as number) || 15

      return withImap(async client => {
        await client.mailboxOpen('INBOX')
        const { simpleParser } = await import('mailparser')
        const rawEmails: { uid: number; from: string; subject: string; snippet: string }[] = []

        for await (const msg of client.fetch({ seen: false }, { source: true })) {
          if (rawEmails.length >= limit) break
          try {
            if (!msg.source) continue
            const parsed = await simpleParser(msg.source)
            rawEmails.push({
              uid: msg.uid,
              from: parsed.from?.text ?? 'Unknown',
              subject: parsed.subject ?? '(no subject)',
              snippet: extractText(parsed).slice(0, 300),
            })
          } catch { /* skip */ }
        }

        if (!rawEmails.length) return { ok: true, message: 'Inbox is empty — no unread emails', data: [] }

        const emailList = rawEmails.map((e, i) =>
          `[${i + 1}] UID:${e.uid} From: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}`
        ).join('\n\n')

        const triagePrompt = `Triage these ${rawEmails.length} emails. For each:
- Priority: urgent / important / low / can-ignore
- Category: action-required / reply-needed / fyi / newsletter / automated
- One sentence summary

Emails:
${emailList}

Respond as JSON array:
[{"uid":<uid>,"from":"...","subject":"...","priority":"...","category":"...","summary":"..."}]`

        const raw = await callOllama(
          [{ role: 'user', content: triagePrompt }],
          'You are an email assistant. Triage emails concisely. Respond only with valid JSON array.'
        )
        const jsonMatch = raw.match(/\[[\s\S]*\]/)
        const triage = jsonMatch ? JSON.parse(jsonMatch[0]) : rawEmails.map(e => ({
          uid: e.uid, from: e.from, subject: e.subject, priority: 'unknown', category: 'unknown', summary: e.snippet.slice(0, 80)
        }))

        return {
          ok: true,
          message: `Triaged ${triage.length} emails`,
          data: triage,
        }
      })
    }

    // ── Summarize a single email ──────────────────────────────────────────
    case 'summarize_email': {
      const uid = params.uid as number
      if (!uid) return { ok: false, message: 'uid required' }

      const readResult = await executeEmailAction('read_email', { uid })
      if (!readResult.ok) return readResult
      const email = readResult.data as { from: string; subject: string; body: string }

      const summary = await callOllama(
        [{ role: 'user', content: `Summarize this email in 2-3 sentences and list any action items:\n\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body}` }],
        'You are an email summarizer. Be concise and action-focused.'
      )

      return { ok: true, message: `Summary of: ${email.subject}`, data: { summary, from: email.from, subject: email.subject } }
    }

    // ── Draft a reply ─────────────────────────────────────────────────────
    case 'draft_reply': {
      const uid         = params.uid as number
      const instruction = (params.instruction as string) || 'write a professional reply'
      if (!uid) return { ok: false, message: 'uid required' }

      const readResult = await executeEmailAction('read_email', { uid })
      if (!readResult.ok) return readResult
      const email = readResult.data as { from: string; subject: string; body: string }

      const draft = await callOllama(
        [{ role: 'user', content: `Draft a reply to this email. Instruction: ${instruction}\n\nOriginal email:\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body}` }],
        `You are drafting an email reply for ${GMAIL_USER}. Be professional and concise. Start directly with the reply content, no preamble.`
      )

      return {
        ok: true,
        message: `Draft reply to: ${email.subject}`,
        data: { draft, reply_to: email.from, subject: `Re: ${email.subject}` },
      }
    }

    // ── Send an email ─────────────────────────────────────────────────────
    case 'send_email': {
      const to      = params.to as string
      const subject = params.subject as string
      const body    = params.body as string
      if (!to || !subject || !body) return { ok: false, message: 'to, subject, and body are required' }

      const transporter = getTransporter()
      await transporter.sendMail({
        from: `"Personal Assistant" <${GMAIL_USER}>`,
        to,
        subject,
        text: body,
      })

      return { ok: true, message: `Email sent to ${to}: "${subject}"` }
    }

    // ── Send a reply to a specific email ──────────────────────────────────
    case 'send_reply': {
      const uid  = params.uid as number
      const body = params.body as string
      if (!uid || !body) return { ok: false, message: 'uid and body required' }

      const readResult = await executeEmailAction('read_email', { uid })
      if (!readResult.ok) return readResult
      const email = readResult.data as { from: string; subject: string }

      const transporter = getTransporter()
      await transporter.sendMail({
        from: `"Personal Assistant" <${GMAIL_USER}>`,
        to: email.from,
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        text: body,
      })

      return { ok: true, message: `Reply sent to: ${email.from}` }
    }

    // ── Search emails ─────────────────────────────────────────────────────
    case 'search_emails': {
      const query = params.query as string
      const limit = (params.limit as number) || 10
      if (!query) return { ok: false, message: 'query required' }

      return withImap(async client => {
        await client.mailboxOpen('INBOX')
        const { simpleParser } = await import('mailparser')
        const results: { uid: number; from: string; subject: string; date: string; snippet: string }[] = []

        // Gmail supports IMAP search
        for await (const msg of client.fetch({ text: query }, { source: true })) {
          if (results.length >= limit) break
          try {
            if (!msg.source) continue
            const parsed = await simpleParser(msg.source)
            results.push({
              uid: msg.uid,
              from: parsed.from?.text ?? 'Unknown',
              subject: parsed.subject ?? '(no subject)',
              date: parsed.date?.toISOString().slice(0, 10) ?? '',
              snippet: extractText(parsed).slice(0, 200),
            })
          } catch { /* skip */ }
        }

        return { ok: true, message: `${results.length} emails matching "${query}"`, data: results }
      })
    }

    // ── Get unread count ──────────────────────────────────────────────────
    case 'get_unread_count': {
      return withImap(async client => {
        const status = await client.status('INBOX', { unseen: true, messages: true })
        return {
          ok: true,
          message: `${status.unseen ?? 0} unread of ${status.messages ?? 0} total`,
          data: { unread: status.unseen ?? 0, total: status.messages ?? 0 },
        }
      })
    }

    default:
      return { ok: false, message: `Unknown email action: ${action}` }
  }
}
