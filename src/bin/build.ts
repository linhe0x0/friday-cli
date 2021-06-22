import fastGlob from 'fast-glob'
import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import _ from 'lodash'
import ms from 'ms'
import path from 'path'
import { Arguments } from 'yargs'

import { transformFileAsync, TransformOptions } from '@babel/core'

import { setEnv } from '../utilities/env'
import {
  copyFile,
  getMirrorFile,
  isTsFile,
  mkdirIfNotExists,
  relative,
  removeFiles,
} from '../utilities/fs'
import logger from '../utilities/logger'

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
      )

      const failedResults: string[] = _.filter(
        results,
        (item: boolean | string): boolean => typeof item === 'string'
      )

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

        _.forEach(failedFiles, (item: string): void => {
          // eslint-disable-next-line no-console
          console.log(`    ${relative(item)}`)
        })

        // eslint-disable-next-line no-console
        console.log('')
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
    .catch((err) => {
      logger.error(`Failed to build files in ${src}: ${err.message}`)

      process.exit(1)
    })
}
