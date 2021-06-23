import boxen from 'boxen'
import chalk from 'chalk'
import chokidar from 'chokidar'
import clipboardy from 'clipboardy'
import getPort from 'get-port'
import http from 'http'
import ip from 'ip'
import _ from 'lodash'
import path from 'path'
import { Arguments } from 'yargs'

import { Endpoint, EndpointProtocol } from '../types'
import { getConfigDir, isConfigFile } from '../utilities/config'
import { getEntryFile } from '../utilities/entry'
import { setEnv } from '../utilities/env'
import { relative } from '../utilities/fs'
import isValidPort from '../utilities/is-valid-port'
import logger from '../utilities/logger'
import parseEndpoint from '../utilities/parse-endpoint'
import { gracefulShutdown } from '../utilities/process'
import serve from '../utilities/serve'
import watch from '../utilities/watcher'

interface DevCommandOptions {
  host?: string
  port?: number
  listen?: string
}

export default function dev(argv: Arguments<DevCommandOptions>): void {
  const { host, port, listen } = argv
  const defaultPort = parseInt(process.env.PORT || '3000', 10) || 3000
  const defaultHost = '0.0.0.0'

  if (_.isNil(process.env.NODE_ENV)) {
    setEnv('NODE_ENV', 'development')
  }

  setEnv('FRIDAY_ENV', 'development')

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
        protocol: EndpointProtocol.HTTP,
        host: host || defaultHost,
        port,
      }

  if (endpoint.protocol !== EndpointProtocol.UNIX) {
    _.defaults(endpoint, {
      host: defaultHost,
      port: defaultPort,
    })
  }

  const originalPort = endpoint.port

  const copyToClipboard = function copyToClipboard(content: string): boolean {
    try {
      clipboardy.writeSync(content)
      return true
    } catch (err) {
      return false
    }
  }

  const restartServer = async function restartServer(
    watcher: chokidar.FSWatcher,
    filepath: string,
    server: http.Server
  ): Promise<http.Server> {
    const relativeFilepath = relative(filepath)
    const configChanged = isConfigFile(filepath)

    logger.info(`${chalk.green('File changed:')} ${relativeFilepath}`)

    if (configChanged) {
      logger.info(
        `${chalk.yellow(
          'Reload due to configuration file changes:'
        )} ${relativeFilepath}`
      )
    }

    logger.info(chalk.blue('Restarting server...'))

    const {
      createApp: createOriginalApp,
      hooks: originalHooks,
      // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
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

        const distDir = path.join(process.cwd(), 'dist')

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

    // Reload app and hooks due to cache refreshing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    const { createApp, hooks } = require('@sqrtthree/friday')
    const app = createApp()

    await originalHooks.emitHook('beforeClose', originalApp)

    await new Promise<void>((resolve): void => {
      server.close((): void => {
        resolve()
      })
    })

    await originalHooks.emitHook('onClose', originalApp)
    await originalHooks.emitHook('beforeRestart', originalApp)

    const newServer = await serve(endpoint, true)

    await hooks.emitHook('onRestart', app)

    logger.info(chalk.green('Server is ready.'))

    return newServer
  }

  getPort({
    port: endpoint.port,
  })
    .then((result) => {
      endpoint.port = result

      return serve(endpoint, true)
    })
    .then((server) => {
      const { isTTY } = process.stdout
      const usedPort = endpoint.port
      const isUnixProtocol = endpoint.protocol === EndpointProtocol.UNIX
      const ipAddress = ip.address()
      const entry = getEntryFile()
      const toWatch = path.dirname(entry)
      const configDir = getConfigDir()

      let currentServer = server

      const appWatcher = watch(
        toWatch,
        /\.(?!.*(js|json)$).*$/, // Non js/json files.
        _.debounce(async (_event: string, filepath: string) => {
          try {
            currentServer = await restartServer(
              appWatcher,
              filepath,
              currentServer
            )
          } catch (err) {
            logger.error(`Failed to restart the server: ${err.message}`)
            process.exit(1)
          }
        }, 500)
      )
      const configWatcher = watch(
        configDir,
        '',
        _.debounce(async (_event: string, filepath: string) => {
          try {
            currentServer = await restartServer(
              configWatcher,
              filepath,
              currentServer
            )
          } catch (err) {
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
          return new Promise<void>((resolve, reject) => {
            logger.debug('Closing server...')

            currentServer.close((err) => {
              if (err) {
                reject(err)

                return
              }

              logger.debug('Server has been closed')
              resolve()
            })
          })
        }

        logger.debug('Gracefully shutting down. Please wait...')

        Promise.all([closeWatcher(), closeServer()]).catch((err) => {
          logger.warn(
            `Failed to close opened watchers or server: ${err.message}`
          )
        })
      })

      let message = chalk.green('Friday is running:')

      if (originalPort !== usedPort) {
        message += ` ${chalk.red(
          `(on port ${usedPort}, because ${originalPort} is already in use.)`
        )}`
      }

      message += '\n\n'

      const localURL = isUnixProtocol
        ? endpoint.host
        : `http://${endpoint.host}:${usedPort}`
      const networkURL = `http://${ipAddress}:${usedPort}`

      message += `• ${chalk.bold('Local:           ')} ${localURL}\n`

      if (!isUnixProtocol) {
        message += `• ${chalk.bold('On Your Network: ')} ${networkURL}\n\n`
      }

      if (isTTY) {
        const copied = copyToClipboard(localURL)

        if (copied) {
          message += 'Copied local address to clipboard.\n'
        }
      }

      message += `And watching for file changes: ./${relative(toWatch)}`

      const box = boxen(message, {
        padding: 1,
        borderColor: 'green',
        margin: 1,
      })

      process.stdout.write(box)
    })
    .catch((err) => {
      logger.error(err)
      process.exit(1)
    })
}
