import _ from 'lodash'
import readPkgUp, { NormalizedReadResult } from 'read-pkg-up'

import logger from './logger'

export function getPkg(cwd?: string): NormalizedReadResult | undefined {
  const result = readPkgUp.sync({ cwd })

  logger.debug(
    'Read the closest package.json file:',
    result ? result.path : 'not found'
  )

  return result
}

export function checkDependency(name: string): boolean {
  const pkg = getPkg()

  if (!pkg) {
    return false
  }

  const { dependencies, devDependencies } = pkg.packageJson

  const allDependencies = _.concat(
    _.keys(dependencies),
    _.keys(devDependencies)
  )

  return _.includes(allDependencies, name)
}

export function checkDependencies(names: string[]): Record<string, boolean> {
  const pkg = getPkg()
  let result: Record<string, boolean> = {}

  if (!pkg) {
    const exists = _.map(names, () => false)

    result = _.zipObject(names, exists)
  } else {
    const { dependencies, devDependencies } = pkg.packageJson

    const allDependencies = _.concat(
      _.keys(dependencies),
      _.keys(devDependencies)
    )

    const exists = _.map(names, (name) => {
      const including = _.includes(allDependencies, name)

      logger.debug(`  (${including ? '√' : 'x'}) ${name}`)

      return including
    })

    result = _.zipObject(names, exists)
  }

  return result
}
