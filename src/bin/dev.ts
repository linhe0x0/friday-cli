import boxen from 'boxen'
import chalk from 'chalk'
import chokidar from 'chokidar'
import clipboardy from 'clipboardy'
import consola from 'consola'
import getPort from 'get-port'
import http from 'http'
import ip from 'ip'
import _ from 'lodash'
import path from 'path'
import { Arguments } from 'yargs'

import { entry } from '@sqrtthree/friday/dist/utilities/entry'

import { Endpoint, EndpointProtocol } from '../types'
import { setEnv } from '../utilities/env'
import useHooks from '../utilities/hooks'
import isValidPort from '../utilities/is-valid-port'
import parseEndpoint from '../utilities/parse-endpoint'
import serve from '../utilities/serve'
import watch from '../utilities/watcher'

interface DevCommandOptions {
  host?: string
  port?: number
  listen?: string
}

export default function dev(argv: Arguments<DevCommandOptions>): void {
  const { host, port, listen, silent } = argv
  const defaultPort = parseInt(process.env.PORT || '3000', 10) || 3000
  const defaultHost = '0.0.0.0'

  if (_.isNil(process.env.NODE_ENV)) {
    setEnv('NODE_ENV', 'development')
  }

  setEnv('FRIDAY_ENV', 'development')

  if (silent) {
    process.env.LOGGER_LEVEL = 'silent'
  }

  const isHostOrPortProvided = !!(host || port)

  if (isHostOrPortProvided && listen) {
    console.error('Both host/port and tcp provided. You can only use one.')
    process.exit(1)
  }

  if (port) {
    if (!isValidPort(port)) {
      console.error(`Port option must be a number. Got: ${port}`)
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
  const hooks = useHooks(entry)

  const copyToClipboard = function copyToClipboard(content: string): boolean {
    try {
      clipboardy.writeSync(content)
      return true
    } catch (err) {
      return false
    }
  }

  const restartServer = (
    watcher: chokidar.FSWatcher,
    filepath: string,
    server: http.Server
  ): Promise<http.Server> => {
    consola.info(
      `${chalk.green('File changed:')} ${path.relative(
        process.cwd(),
        filepath
      )}`
    )
    consola.info(chalk.blue('Restarting server...'))

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
      (item: string) => item.indexOf('@sqrtthree/friday/dist') !== -1
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

    return new Promise(function restart(resolve, reject): void {
      hooks.beforeClose()

      // Restart the server
      server.close(() => {
        hooks.afterClose()
        hooks.beforeRestart()

        serve(endpoint, entry)
          .then((newServer) => {
            hooks.afterRestart()

            consola.info(chalk.blue('Server is ready.'))

            resolve(newServer)
          })
          .catch(reject)
      })
    })
  }

  getPort({
    port: endpoint.port,
  })
    .then((result) => {
      endpoint.port = result

      return serve(endpoint, entry)
    })
    .then((curretServer) => {
      const { isTTY } = process.stdout
      const usedPort = endpoint.port
      const isUnixProtocol = endpoint.protocol === EndpointProtocol.UNIX
      const ipAddress = ip.address()

      const toWatch = path.dirname(entry)

      const watcher = watch(
        toWatch,
        '',
        _.debounce(async (_event: string, filepath: string) => {
          try {
            // eslint-disable-next-line no-param-reassign
            curretServer = await restartServer(watcher, filepath, curretServer)
          } catch (err) {
            consola.error('Failed to restart the server.', err)
            process.exit(1)
          }
        }, 200)
      )

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
          message += chalk.grey('Copied local address to clipboard.\n')
        }
      }

      message += chalk.grey(`And watching for file changes: ${toWatch}`)

      const box = boxen(message, {
        padding: 1,
        borderColor: 'green',
        margin: 1,
      })

      process.stdout.write(box)
    })
    .catch((err) => {
      consola.error(err)
      process.exit(1)
    })
}
