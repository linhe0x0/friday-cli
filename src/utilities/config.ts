import path from 'path'

export function getConfigDir(): string {
  return process.env.NODE_CONFIG_DIR || path.join(process.cwd(), 'config')
}

export function isConfigFile(filename: string): boolean {
  const configDir = getConfigDir()

  return filename.startsWith(configDir)
}
