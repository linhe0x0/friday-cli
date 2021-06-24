import chalk from 'chalk'
import fastGlob from 'fast-glob'
import _ from 'lodash'
import path from 'path'
import { Arguments } from 'yargs'

import { exists, isTsFile, relative } from '../utilities/fs'
import { lintFiles } from '../utilities/linter'
import logger, { blankLine, outputCode } from '../utilities/logger'
import * as ts from '../utilities/ts'

interface LintCommandOptions {
  disableTypeCheck?: boolean
  src?: string
}

type LintOptions = Required<LintCommandOptions>

export default function lint(argv: Arguments<LintCommandOptions>): void {
  const cwd = process.cwd()
  const src = path.resolve(cwd, 'src')
  const relativeSrc = relative(src)
  const opts: LintOptions = _.assign(
    {
      src,
      disableTypeCheck: false,
    },
    argv
  )

  let srcDirExists = true

  exists(opts.src)
    .then((result) => {
      srcDirExists = result

      if (!result) {
        return null
      }

      if (opts.disableTypeCheck) {
        logger.debug('Skip type-check due to --disable-type-check option')
        return null
      }

      const filePattern = `${opts.src}/**`
      const filenames: string[] = fastGlob.sync(filePattern)

      const tsFiles = _.filter(filenames, (item: string): boolean =>
        isTsFile(item)
      )

      if (tsFiles.length > 0) {
        logger.info(
          `Start type-check on all typescript files in ${relativeSrc}`
        )

        return ts.typeCheck(filenames)
      }

      return null
    })
    .then((results): void => {
      if (!results) {
        return
      }

      if (results.length) {
        const fileCount = _.uniq(_.map(results, (item) => item.filename)).length
        const total = results.length

        outputCode(results)
        logger.error(
          `${total} ${total > 1 ? 'problems' : 'problem'} in ${fileCount} ${
            fileCount > 1 ? 'files' : 'file'
          }`
        )
        process.exit(1)
      }

      logger.success('All the code passed type-check')
    })
    .then(() => {
      const targetDir = srcDirExists ? opts.src : process.cwd()

      logger.info(
        `Find problems in all files in ${
          srcDirExists ? relativeSrc : 'current directory'
        }`
      )

      const pattern = `${targetDir}/**`

      return lintFiles(pattern, {
        extensions: ['js', 'json', 'ts'],
      })
    })
    .then((lintResults) => {
      // eslint-disable-next-line no-console
      console.log(lintResults.message)

      if (lintResults.errorCount > 0) {
        logger.info(
          `Search for the ${chalk.red.underline(
            'keywords'
          )} to learn more about each error.`
        )
        blankLine()
        process.exit(1)
      }

      if (lintResults.warningCount > 0) {
        logger.info(
          `Search for the ${chalk.yellow.underline(
            'keywords'
          )} to learn more about each warning.`
        )
        logger.info(
          `To ignore, add ${chalk.cyan(
            '// eslint-disable-next-line'
          )} to the line before.`
        )
        blankLine()
      }

      logger.success('All the code passed linter')
    })
    .catch((err) => {
      logger.error(`Failed to lint files:`, err.message)
      process.exit(2)
    })
}
