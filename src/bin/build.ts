import chalk from 'chalk'
import fastGlob from 'fast-glob'
import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import _ from 'lodash'
import ms from 'ms'
import path from 'path'
import { Arguments } from 'yargs'

import { transformFileAsync, TransformOptions } from '@babel/core'

import logger, { blankLine, list } from '../logger'
import {
  checkDependencies,
  outputMissingRequiredDependencies,
} from '../utilities/dependency'
import { setEnv } from '../utilities/env'
import {
  copyFile,
  getMirrorFile,
  isTsFile,
  mkdirIfNotExists,
  relative,
  removeFiles,
} from '../utilities/fs'
import { gracefulShutdown } from '../utilities/process'
import { watchFilesToTypeCheck, WatchProgram } from '../utilities/ts'
import watch from '../utilities/watcher'

interface BuildCommandOptions {
  clean?: boolean
  watch?: boolean
  src?: string
  dist?: string
}

type BuildOptions = Required<BuildCommandOptions>

const babelOptions: TransformOptions = {
  comments: false,
  presets: [
    [
      '@babel/preset-env',
      {
        targets: 'maintained node versions',
      },
    ],
    '@babel/preset-typescript',
  ],
}
const devFriendlyBabelOptions = _.assign({}, babelOptions, {
  retainLines: true,
})

const compile = function compile(
  filename: string,
  devFriendly?: boolean
): Promise<string | null> {
  return transformFileAsync(
    filename,
    devFriendly ? devFriendlyBabelOptions : babelOptions
  ).then((result) => {
    if (result && result.code) {
      return result.code
    }

    return null
  })
}

const copyFiles = function copyFiles(
  filenames: string[],
  baseDir: string,
  outputDir: string
): Promise<string[]> {
  const actions: Promise<string>[] = _.map(
    filenames,
    (item: string): Promise<string> => {
      const to = getMirrorFile(item, baseDir, outputDir)

      logger.debug(`Copy file: ${relative(item)} => ${relative(to)}`)

      return copyFile(item, to)
    }
  )

  return Promise.all(actions)
}

const compileFiles = function compileFiles(
  filenames: string[],
  baseDir: string,
  outputDir: string
): Promise<(boolean | string)[]> {
  const actions = _.map(filenames, (item: string): Promise<
    boolean | string
  > => {
    const to = getMirrorFile(item, baseDir, outputDir, '.js')

    logger.debug(`Compile file: ${relative(item)} => ${to}`)

    return compile(item)
      .then((compileResult: string | null) => {
        if (compileResult === null) {
          throw new Error('no code was generated')
        }

        const dir = path.dirname(to)

        return mkdirIfNotExists(dir).then(() => {
          return writeFile(to, compileResult)
        })
      })
      .then(() => true)
      .catch((err) => err.message)
  })

  return Promise.all(actions)
}

export function cleanOutput(target: string): Promise<void> {
  logger.debug(`Deleting the outputs of all projects in ${target}`)

  return removeFiles(target)
}

export function buildFiles(
  filenames: string[],
  baseDir: string,
  outputDir: string
): Promise<(boolean | string)[]> {
  const tsFiles = _.filter(filenames, (item: string): boolean => isTsFile(item))
  const otherFiles = _.filter(
    filenames,
    (item: string): boolean => !isTsFile(item)
  )

  return copyFiles(otherFiles, baseDir, outputDir).then(() => {
    return compileFiles(tsFiles, baseDir, outputDir)
  })
}

export function buildDir(
  target: string,
  baseDir: string,
  outputDir: string
): Promise<void> {
  const filePattern = `${target}/**`
  const filenames: string[] = fastGlob.sync(filePattern)

  const tsFiles = _.filter(filenames, (item: string): boolean => isTsFile(item))
  const otherFiles = _.filter(
    filenames,
    (item: string): boolean => !isTsFile(item)
  )

  logger.debug(`Files to be compiled: ${tsFiles.length}`)
  logger.debug(`Files to be copied: ${otherFiles.length}`)

  const total = filenames.length
  const copied = otherFiles.length

  const failedFiles: string[] = []

  let compiled = 0
  let failed = 0

  const startTime = Date.now()

  return copyFiles(otherFiles, target, outputDir)
    .then(() => {
      return compileFiles(tsFiles, baseDir, outputDir)
    })
    .then((results: (boolean | string)[]) => {
      const compiledResults: boolean[] = _.filter(
        results,
        (item: boolean | string): boolean => typeof item === 'boolean' && item
      ) as boolean[]

      const failedResults: string[] = _.filter(
        results,
        (item: boolean | string): boolean => typeof item === 'string'
      ) as string[]

      compiled = compiledResults.length
      failed = failedResults.length

      if (failed > 0) {
        _.forEach(results, (item: boolean | string, index: number): void => {
          if (typeof item === 'string') {
            const filename = tsFiles[index]

            const i = item.indexOf(':')
            const errMessage = _.startsWith(item, '/')
              ? item.substring(i + 1)
              : item

            failedFiles.push(filename)
            logger.error(`${relative(filename)}: ${_.trimStart(errMessage)}`)
          }
        })
      }
    })
    .then(() => {
      const endTime = Date.now()
      const diff = ms(endTime - startTime)

      if (failed > 0) {
        logger.error('The following files are not compiled successfully:')

        const relativeFailedFiles = _.map(failedFiles, (item) => relative(item))

        list(relativeFailedFiles)
        blankLine()

        logger.info(
          `Total: ${total}, compiled: ${compiled}, copied: ${copied}, failed: ${failed}`
        )
      } else {
        let actions = `compiled ${compiled} ${
          compiled !== 1 ? 'files' : 'file'
        }`

        if (copied > 0) {
          actions += ` and copied ${copied} ${copied !== 1 ? 'files' : 'file'}`
        }

        logger.success(`Successfully ${actions} with Babel (${diff}).`)
      }
    })
}

export function watchFilesToBuild(
  toWatch: string,
  lintBeforeBuild: boolean,
  fn: (filepath: string) => Promise<void>
): void {
  const filePattern = `${toWatch}/**/*.ts`
  const tsFiles: string[] = fastGlob.sync(filePattern)

  let typeCheckWatcher: WatchProgram | undefined

  if (lintBeforeBuild) {
    typeCheckWatcher = watchFilesToTypeCheck(tsFiles, {})
  }

  const buildWatcher = watch(
    toWatch,
    /\.(?!.*(ts|json)$).*$/, // Ignore non ts/json files.
    _.debounce((event: string, filepath: string): void => {
      const relativeFilepath = relative(filepath)

      if (event === 'add') {
        logger.debug(`File created: ${relativeFilepath}`)

        if (
          lintBeforeBuild &&
          typeCheckWatcher &&
          !typeCheckWatcher.useUserConfigFile
        ) {
          const tsFile = isTsFile(filepath)

          if (tsFile) {
            const newTsFile = tsFiles.indexOf(filepath) === -1

            if (newTsFile) {
              tsFiles.push(filepath)
            }

            typeCheckWatcher.program.close()

            typeCheckWatcher = watchFilesToTypeCheck(tsFiles, {})

            logger.debug('Restart new type-check watcher due to file creation')
          }
        }
      } else if (event === 'unlink') {
        logger.debug(`File deleted: ${relativeFilepath}`)

        if (
          lintBeforeBuild &&
          typeCheckWatcher &&
          !typeCheckWatcher.useUserConfigFile
        ) {
          const index = tsFiles.indexOf(filepath)

          if (index !== -1) {
            tsFiles.splice(index, 1)
          }

          typeCheckWatcher.program.close()

          typeCheckWatcher = watchFilesToTypeCheck(tsFiles, {})

          logger.debug('Restart new type-check watcher due to file deletion')
        }

        return
      }

      logger.info(`${chalk.green('File changed:')} ${relativeFilepath}`)
      logger.debug(`${chalk.blue('Rebuilding file:')} ${relativeFilepath}`)

      const startTime = Date.now()

      fn(filepath)
        .then(() => {
          const endTime = Date.now()
          const diff = ms(endTime - startTime)

          logger.success(`Rebuilt file: ${relativeFilepath} (${diff})`)
        })
        .catch((err) => {
          logger.error(
            `Cannot rebuild file ${relativeFilepath}, Error: ${err.message}`
          )
        })
    }, 500)
  )

  gracefulShutdown(() => {
    logger.debug('Gracefully shutting down. Please wait...')
    logger.debug('Closing watcher')

    Promise.all([
      buildWatcher.close(),
      typeCheckWatcher ? typeCheckWatcher.program.close() : null,
    ])
      .then(() => {
        logger.debug('Watcher has been closed')
        process.exit(0)
      })
      .catch((err) => {
        logger.warn(`Failed to close watcher: ${err.message}`)
        process.exit(1)
      })
  })
}

export default function build(argv: Arguments<BuildCommandOptions>): void {
  const cwd = process.cwd()
  const src = path.resolve(cwd, 'src')
  const opts: BuildOptions = _.assign(
    {
      src,
      clean: true,
      watch: false,
      dist: 'dist',
    },
    argv
  )

  const dist = path.resolve(cwd, opts.dist)

  if (_.isNil(process.env.NODE_ENV)) {
    setEnv('NODE_ENV', 'production')
  }

  logger.debug('Checking required dependencies')

  const dependencies = checkDependencies([
    '@babel/preset-env',
    '@babel/preset-typescript',
  ])
  const missingDependencies = _.filter(
    _.keys(dependencies),
    (item: string): boolean => !dependencies[item]
  )

  if (missingDependencies.length) {
    outputMissingRequiredDependencies(missingDependencies, 'build', true)

    process.exit(1)
  }

  logger.debug(`Source dir: ${src}`)
  logger.debug(`Output dir: ${dist}`)
  logger.info(`Compile files: ${relative(src)} => ${relative(dist)}`)

  const cleanAction: Promise<void> = opts.clean
    ? cleanOutput(dist)
    : Promise.resolve()

  cleanAction
    .then(() => {
      mkdirSync(opts.dist, { recursive: true })

      return buildDir(src, src, opts.dist)
    })
    .then(() => {
      if (opts.watch) {
        const toWatch = opts.src

        watchFilesToBuild(toWatch, false, (filepath: string): Promise<void> => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          return buildFiles([filepath], opts.src, opts.dist).then(() => {})
        })

        logger.info('Watching for file changes:', relative(toWatch))
      }
    })
    .catch((err) => {
      logger.error(`Failed to build files in ${src}: ${err.message}`)
      process.exit(2)
    })
}
