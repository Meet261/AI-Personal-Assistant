import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const STATE_FILE = join(process.cwd(), '.research-enabled')

export function isResearchEnabled(): boolean {
  if (!existsSync(STATE_FILE)) return true
  return readFileSync(STATE_FILE, 'utf-8').trim() === '1'
}

export function setResearchEnabled(v: boolean) {
  writeFileSync(STATE_FILE, v ? '1' : '0', 'utf-8')
}
