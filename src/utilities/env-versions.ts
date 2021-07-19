import path from 'path'
import readPkgUp from 'read-pkg-up'

const getPackageVersion = function getPackageVersion(name: string): string {
  const pkgPath = require.resolve(name)

  const result = readPkgUp.sync({
    cwd: path.dirname(pkgPath),
  })

  if (!result) {
    return ''
  }

  return result.packageJson.version
}

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

  versions.friday = getPackageVersion('@sqrtthree/friday')
  versions.babel = getPackageVersion('@babel/core')
  versions.typescript = getPackageVersion('typescript')

  return versions
}
