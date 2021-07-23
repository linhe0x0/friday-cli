import _ from 'lodash'
import { Arguments } from 'yargs'

import logger from '../logger'
import { Endpoint, EndpointProtocol } from '../types'
import { setEnv } from '../utilities/env'
import isValidPort from '../utilities/is-valid-port'
import parseEndpoint from '../utilities/parse-endpoint'
import { gracefulShutdown } from '../utilities/process'
import serve from '../utilities/serve'

interface StartCommandOptions {
  host?: string
  port?: number
  listen?: string
}

export default function start(argv: Arguments<StartCommandOptions>): void {
  const { host, port, listen } = argv
  const defaultHost = '0.0.0.0'
  const defaultPort = parseInt(process.env.PORT || '3000', 10) || 3000

  if (_.isNil(process.env.NODE_ENV)) {
    setEnv('NODE_ENV', 'production')
  }

  setEnv('FRIDAY_ENV', 'production')

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

  serve(endpoint)
    .then((server) => {
      gracefulShutdown(() => {
        logger.info('Gracefully shutting down. Please wait...')

        const { createApp, hooks } = require('@sqrtthree/friday')
        const app = createApp()

        hooks
          .emitHook('beforeClose', app)
          .then(() => {
            logger.debug('Closing app server')

            return new Promise<void>((resolve, reject) => {
              server.close((err) => {
                if (err) {
                  reject(err)

                  return
                }

                logger.debug('Server has been closed')
                resolve()
              })
            })
          })
          .then(() => {
            return hooks.emitHook('onClose', app)
          })
          .then(() => {
            logger.success('Closed successfully')
            process.exit(0)
          })
          .catch((err) => {
            logger.error(`Failed to close the server: ${err.message}`)
            process.exit(1)
          })
      })

      let message = 'Server is running.'

      if (endpoint.protocol === EndpointProtocol.UNIX) {
        message = `Server is running at ${endpoint.host}.\n`
      } else {
        message = `Server is running at ${endpoint.protocol}//${endpoint.host}:${endpoint.port}.\n`
      }

      process.stdout.write(message)
    })
    .catch((err) => {
      logger.error(`Cannot serve app:`, err.message)
      process.exit(2)
    })
}
