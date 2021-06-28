import fastGlob from 'fast-glob'
import _ from 'lodash'
import path from 'path'
import { Arguments } from 'yargs'

import logger from '../logger'
import { outputCode } from '../logger/code-frame'
import { exists, relative } from '../utilities/fs'
import { lintFiles, outputLinterResult } from '../utilities/linter'
import { typeCheck } from '../utilities/ts'

interface LintCommandOptions {
  disableTypeCheck?: boolean
  fix?: boolean
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
      fix: false,
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

      const filePattern = `${opts.src}/**/*.ts`
      const tsFiles: string[] = fastGlob.sync(filePattern)

      if (tsFiles.length > 0) {
        logger.info(
          `Start type-check on all typescript files in ${relativeSrc}`
        )

        return typeCheck(tsFiles)
      }

      return null
    })
    .then((results): void => {
      if (!results) {
        return
      }

      if (results.length) {
        const total = results.length
        const fileCount = _.uniq(_.map(results, (item) => item.filename)).length

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
        fix: opts.fix,
      })
    })
    .then((lintResults) => {
      try {
        outputLinterResult(lintResults)
      } catch (err) {
        process.exit(1)
      }

      logger.success('All the code passed the linter')
    })
    .catch((err) => {
      logger.error(`Failed to lint files:`, err.message)
      process.exit(2)
    })
}
