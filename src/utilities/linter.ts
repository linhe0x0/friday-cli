import { ESLint } from 'eslint'
import _ from 'lodash'

import logger, { blankLine } from '../logger'
import { error, link, tips, warn } from '../logger/colorful'

interface LintResult {
  errorCount: number
  warningCount: number
  message: string
}

export function lintFiles(
  patterns: string | string[],
  options?: ESLint.Options
): Promise<LintResult> {
  const eslint = new ESLint(options)

  return eslint.lintFiles(patterns).then((results) => {
    const errorCount: number = _.reduce(
      _.map(results, (item: ESLint.LintResult) => item.errorCount),
      (prev: number, curr: number): number => prev + curr,
      0
    )
    const warningCount: number = _.reduce(
      _.map(results, (item: ESLint.LintResult) => item.warningCount),
      (prev: number, curr: number): number => prev + curr,
      0
    )

    return eslint.loadFormatter('stylish').then((formatter) => {
      const message = formatter.format(results)

      return {
        errorCount,
        warningCount,
        message,
      }
    })
  })
}

export function outputLinterResult(lintResults: LintResult): void {
  if (lintResults.message) {
    // eslint-disable-next-line no-console
    console.log(lintResults.message)
  }

  if (lintResults.errorCount > 0) {
    logger.info(
      `Search for the ${link(
        error('keywords')
      )} to learn more about each error.`
    )
    blankLine()

    throw new Error('Cannot pass the linter')
  }

  if (lintResults.warningCount > 0) {
    logger.info(
      `Search for the ${link(
        warn('keywords')
      )} to learn more about each warning.`
    )
    logger.info(
      `To ignore, add ${tips(
        '// eslint-disable-next-line'
      )} to the line before.`
    )
    blankLine()
  }
}
