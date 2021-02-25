export function setEnv(name: string, value: string): void {
  process.env[name] = value
}
