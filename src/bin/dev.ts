import boxen from 'boxen'
import clipboardy from 'clipboardy'
import getPort from 'get-port'
import ip from 'ip'
import _ from 'lodash'
import path from 'path'
import type { FSWatcher } from 'chokidar'
import type { Server } from 'http'
import type { Arguments } from 'yargs'

import isValidPort from '@sqrtthree/friday/dist/lib/is-valid-port'
import parseEndpoint from '@sqrtthree/friday/dist/lib/parse-endpoint'
import { gracefulShutdown } from '@sqrtthree/friday/dist/lib/process'
import serve, { Endpoint } from '@sqrtthree/friday/dist/lib/serve'

import logger, { blankLine, divider } from '../logger'
import { error, info, strong, success, tips, warn } from '../logger/colorful'
import { getConfigDir, isConfigFile } from '../utilities/config'
import { getEntryFile } from '../utilities/entry'
import { existsSync, relative } from '../utilities/fs'
import { lintFiles, outputLinterResult } from '../utilities/linter'
import watch, { WatchEventName } from '../utilities/watcher'
import { buildDir, buildFiles, cleanOutput, watchFilesToBuild } from './build'

const copyToClipboard = function copyToClipboard(content: string): boolean {
  try {
    clipboardy.writeSync(content)
    return true
  } catch (err) {
    return false
  }
}

interface DevCommandOptions {
  host?: string | undefined
  port?: number | undefined
  listen?: string | undefined
  env?: string | undefined

  // For building
  clean?: boolean | undefined
  build?: boolean | undefined
  skipInitialBuild?: boolean | undefined
  typeCheck?: boolean | undefined
  dist?: string | undefined
}

export default function dev(argv: Arguments<DevCommandOptions>): void {
  const cwd = process.cwd()
  const src = path.resolve(cwd, 'src')

  const defaultPort = parseInt(process.env.PORT || '3000', 10) || 3000
  const defaultHost = '0.0.0.0'

  const opts = _.defaults(argv, {
    host: defaultHost,
    port: defaultPort,
    listen: '',
    env: 'development',
    src,
    clean: true,
    build: true,
    skipInitialBuild: false,
    typeCheck: false,
    dist: 'dist',
  })

  process.env.FRIDAY_ENV = 'development'
  process.env.APP_ENV = opts.env || 'development'

  if (!process.env.NODE_CONFIG_ENV) {
    process.env.NODE_CONFIG_ENV = process.env.APP_ENV
  }

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development'
  }

  if (opts.skipInitialBuild) {
    opts.clean = false

    logger.warn('Disable clean task due to --skip-initial-build option')
  }

  const { host, port, listen } = opts

  const isHostOrPortProvided = !!(host || port)

  if (isHostOrPortProvided && listen) {
    logger.error('Both host/port and tcp provided. You can only use one.')
    process.exit(1)
  }

  if (port) {
    if (!isValidPort(port)) {
      logger.error(`Port option must be a number but got: ${port}`)
      process.exit(1)
    }
  }

  const endpoint: Endpoint = listen
    ? parseEndpoint(listen)
    : {
        protocol: 'http:',
        host: host || defaultHost,
        port: port || defaultPort,
      }

  if (endpoint.protocol !== 'unix:') {
    _.defaults(endpoint, {
      host: defaultHost,
      port: defaultPort,
    })
  }

  const originalPort = endpoint.port

  const restartServer = async function restartServer(
    watcher: FSWatcher,
    filepath: string,
    server: Server
  ): Promise<Server> {
    const relativeFilepath = relative(filepath)
    const configChanged = isConfigFile(filepath)

    process.env.FRIDAY_RESTARTED = 'true'

    logger.info(`${success('File changed:')} ${relativeFilepath}`)
    logger.info(info('Restarting server...'))

    const {
      createApp: createOriginalApp,
      hooks: originalHooks,
    } = require('@sqrtthree/friday')
    const originalApp = createOriginalApp()

    const watched = watcher.getWatched()
    const toDelete: string[] = []

    _.forEach(_.keys(watched), (mainPath: string) => {
      _.forEach(watched[mainPath], (subPath: string) => {
        const fullPath = path.join(mainPath, subPath)

        toDelete.push(fullPath)
      })
    })

    const haveToReloadFiles = _.filter(
      _.keys(require.cache),
      (item: string): boolean => {
        if (item.indexOf('@sqrtthree/friday/dist') !== -1) {
          return true
        }

        const distDir = path.join(process.cwd(), opts.dist)

        if (item.indexOf(distDir) !== -1) {
          return true
        }

        if (configChanged && item.indexOf('node_modules/config') !== -1) {
          return true
        }

        return false
      }
    )

    // Clean cache
    _.forEach(_.concat(toDelete, haveToReloadFiles), (item: string) => {
      let location: string

      try {
        location = require.resolve(item)
      } catch (err) {
        location = ''
      }

      if (location) {
        delete require.cache[location]
      }
    })

    await originalHooks.emitHook('beforeReload', originalApp)
    await originalHooks.emitHook('beforeClose', originalApp)

    await new Promise<void>((resolve): void => {
      server.close((): void => {
        resolve()
      })
    })

    originalHooks.emitHook('onClose', originalApp)

    await originalHooks.emitHook('beforeRestart', originalApp)

    // Reload app and hooks due to cache refreshing.
    const { createApp, hooks } = require('@sqrtthree/friday')
    const app = createApp()

    const newServer = await serve(endpoint)

    hooks.emitHook('onRestart', app)

    logger.info(success('Server is ready.'))

    return newServer
  }

  const buildable = existsSync(opts.src)

  getPort({
    port: endpoint.port || defaultPort,
  })
    .then((result): Promise<void> | void => {
      endpoint.port = result

      if (!buildable) {
        return undefined
      }

      if (!opts.clean) {
        logger.debug('Skip clean task due to --no-clean option')
        return undefined
      }

      return cleanOutput(opts.dist)
    })
    .then((): Promise<void> | void => {
      if (!buildable) {
        return undefined
      }

      if (!opts.build) {
        return undefined
      }

      logger.info(
        'Start watching to build for file changes:',
        tips(relative(opts.src))
      )

      const toWatch = opts.src

      watchFilesToBuild(
        toWatch,
        opts.typeCheck,
        async (filepath: string): Promise<void> => {
          logger.debug(`Find problems in ${relative(filepath)}`)

          const lintResults = await lintFiles(filepath, {
            extensions: ['js', 'json', 'ts'],
          })

          // Will throw an error if cannot pass the liner
          outputLinterResult(lintResults)

          logger.info(info('It seems that all the code is good for linter'))

          await buildFiles([filepath], opts.src, opts.dist)
        }
      )

      if (opts.skipInitialBuild && !opts.clean) {
        logger.debug('Skip initial build due to --skip-initial-build option')

        return undefined
      }

      logger.info('Start initial build')

      return buildDir(opts.src, opts.src, opts.dist)
    })
    .then(() => {
      return serve(endpoint)
    })
    .then((server) => {
      const { isTTY } = process.stdout
      const usedPort = endpoint.port
      const isUnixProtocol = endpoint.protocol === 'unix:'
      const ipAddress = ip.address()
      const entry = getEntryFile()
      const toWatch = path.dirname(entry)
      const configDir = getConfigDir()

      let currentServer = server

      const appWatcher = watch(
        toWatch,
        /\.(?!.*(js|json)$).*$/, // Ignore non js/json files.
        _.debounce(async (event: WatchEventName, filepath: string) => {
          if (event === 'addDir') {
            return
          }

          if (!buildable) {
            blankLine()
            divider()
            blankLine()

            const lintResults = await lintFiles(filepath, {
              extensions: ['js', 'json'],
            })

            // Will throw an error if cannot pass the liner
            outputLinterResult(lintResults)

            logger.info(info('It seems that all the code is good for linter'))
          }

          try {
            currentServer = await restartServer(
              appWatcher,
              filepath,
              currentServer
            )
          } catch (err: any) {
            logger.error(`Failed to restart the server: ${err.message}`)
            process.exit(1)
          }
        }, 500)
      )
      const configWatcher = watch(
        configDir,
        '',
        _.debounce(async (_event: string, filepath: string) => {
          blankLine()
          divider()
          blankLine()

          const relativeFilepath = relative(filepath)

          logger.info(
            `Found a configuration change in ${warn(
              relativeFilepath
            )}. Restart the server to see the changes in effect.`
          )

          try {
            currentServer = await restartServer(
              configWatcher,
              filepath,
              currentServer
            )
          } catch (err: any) {
            logger.error(`Failed to restart the server: ${err.message}`)
            process.exit(1)
          }
        }, 500)
      )

      gracefulShutdown(() => {
        const closeWatcher = (): Promise<void> => {
          logger.debug('Closing watchers...')

          return Promise.all([appWatcher.close(), configWatcher.close()]).then(
            () => {
              logger.debug('Watchers have been closed')
            }
          )
        }
        const closeServer = (): Promise<void> => {
          const { createApp, hooks } = require('@sqrtthree/friday')
          const app = createApp()

          return hooks.emitHook('beforeClose', app).then(() => {
            logger.debug('Closing app server...')

            return new Promise<void>((resolve, reject) => {
              currentServer.close((err) => {
                if (err) {
                  reject(err)

                  return
                }

                logger.debug('Server has been closed')
                hooks.emitHook('onClose', app)
                resolve()
              })
            })
          })
        }

        logger.debug('Gracefully shutting down. Please wait...')

        Promise.all([closeWatcher(), closeServer()])
          .then(() => {
            logger.success('Closed successfully')
            process.exit(0)
          })
          .catch((err) => {
            logger.warn(
              `Failed to close opened watchers or server: ${err.message}`
            )
            process.exit(1)
          })
      })

      // `friday dev` is designed to run only in development, so
      // this message is perfectly for development.
      let message = success('Friday is running:')

      if (originalPort !== usedPort) {
        message += ` ${error(
          `(on port ${usedPort}, because ${originalPort} is already in use.)`
        )}`
      }

      message += '\n\n'

      const localURL = isUnixProtocol
        ? endpoint.host
        : `http://${endpoint.host}:${usedPort}`
      const networkURL = `http://${ipAddress}:${usedPort}`

      message += `• ${strong('Local:           ')} ${localURL}\n`

      if (!isUnixProtocol) {
        message += `• ${strong('On Your Network: ')} ${networkURL}\n\n`
      }

      if (isTTY) {
        const copied = copyToClipboard(localURL)

        if (copied) {
          message += 'Copied local address to clipboard.\n'
        }
      }

      const relativeToWatch = relative(toWatch)

      message += `And watching for file changes: ${tips(
        `./${relativeToWatch}`
      )}`

      const box = boxen(message, {
        padding: 1,
        borderColor: 'green',
        margin: 1,
      })

      // Add delay to make sure the message is printed after the debug routes output.
      setTimeout(() => {
        process.stdout.write(box)
      }, 100)
    })
    .catch((err) => {
      logger.error(err)
      process.exit(2)
    })
}
