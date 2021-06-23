import fastGlob from 'fast-glob'
import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import _ from 'lodash'
import ms from 'ms'
import path from 'path'
import { Arguments } from 'yargs'

import { transformFileAsync, TransformOptions } from '@babel/core'

import { checkDependencies } from '../utilities/dependency'
import { setEnv } from '../utilities/env'
import {
  copyFile,
  getMirrorFile,
  isTsFile,
  mkdirIfNotExists,
  relative,
  removeFiles,
} from '../utilities/fs'
import logger, { blankLine, list } from '../utilities/logger'
import { gracefulShutdown } from '../utilities/process'
import watch from '../utilities/watcher'

interface BuildCommandOptions {
  clean?: boolean
  watch?: boolean
  dist?: string
}

type BuildOptions = Required<BuildCommandOptions> & {
  src: string
}

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

const cleanOutput = function cleanOutput(target: string): Promise<void> {
  logger.debug(`Deleting the outputs of all projects in ${target}`)

  return removeFiles(target)
}

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
  buildOptions: BuildOptions
): Promise<(boolean | string)[]> {
  const actions = _.map(filenames, (item: string): Promise<
    boolean | string
  > => {
    const to = getMirrorFile(item, buildOptions.src, buildOptions.dist, '.js')

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
      .catch((err) => {
        return err.message
      })
  })

  return Promise.all(actions)
}

export function buildFiles(
  filenames: string[],
  buildOptions: BuildOptions
): Promise<(boolean | string)[]> {
  const { src, dist } = buildOptions
  const tsFiles = _.filter(filenames, (item: string): boolean => isTsFile(item))
  const otherFiles = _.filter(
    filenames,
    (item: string): boolean => !isTsFile(item)
  )

  return copyFiles(otherFiles, src, dist).then(() => {
    return compileFiles(tsFiles, buildOptions)
  })
}

export function buildDir(
  target: string,
  buildOptions: BuildOptions
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

  return copyFiles(otherFiles, target, buildOptions.dist)
    .then(() => {
      return compileFiles(tsFiles, buildOptions)
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
    logger.error(
      'Some dependencies are required but not found in package.json file:'
    )

    list(missingDependencies)

    blankLine()

    logger.info(
      `Run npm i -D ${missingDependencies.join(
        ' '
      )} to install missing dependencies.`
    )

    blankLine()

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

      return buildDir(src, opts)
    })
    .then(() => {
      if (opts.watch) {
        const toWatch = opts.src

        logger.info('Watching for file changes:', relative(toWatch))

        const watcher = watch(
          toWatch,
          /\.(?!.*(ts|json)$).*$/, // Non ts/json files.
          _.debounce(async (_event: string, filepath: string) => {
            const relativeFilepath = relative(filepath)

            logger.debug(`File changed: ${relativeFilepath}`)
            logger.debug(`Rebuilding file: ${relativeFilepath}`)

            const startTime = Date.now()

            buildFiles([filepath], opts)
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

          watcher
            .close()
            .then(() => {
              logger.debug('Watcher has been closed')
            })
            .catch((err) => {
              logger.warn(`Failed to close watcher: ${err.message}`)
            })
        })
      }
    })
    .catch((err) => {
      logger.error(`Failed to build files in ${src}: ${err.message}`)

      process.exit(1)
    })
}
