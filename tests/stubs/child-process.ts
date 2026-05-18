export function spawn() {
  return {
    pid: 12345,
    stdout: { on() {} },
    stderr: { on() {} },
    on() {},
    unref() {},
    kill() { return true },
  }
}

export function exec(command: string, cb?: (err: any, stdout?: string, stderr?: string) => void) {
  cb?.(null, '', '')
  return {} as any
}

export function execSync() {
  return Buffer.from('')
}

export type ChildProcess = any

