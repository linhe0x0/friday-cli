import { ESLint } from 'eslint'
import _ from 'lodash'

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
