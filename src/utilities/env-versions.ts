import path from 'path'
import readPkgUp from 'read-pkg-up'

export function getEnvVersions(): Record<string, string> {
  const versions: Record<string, string> = {}

  versions.platform = process.platform
  versions.node = process.version

  const pkgResult = readPkgUp.sync({
    cwd: __dirname,
  })

  if (pkgResult) {
    versions['friday-cli'] = pkgResult.packageJson.version
  }

  const fridayPath = require.resolve('@sqrtthree/friday')

  const fridayResult = readPkgUp.sync({
    cwd: path.dirname(fridayPath),
  })

  if (fridayResult) {
    versions.friday = fridayResult.packageJson.version
  }

  return versions
}
