import http from 'http'

import { Endpoint, EndpointProtocol } from '../types'
import logger from './logger'
import { gracefulShutdown } from './process'

export default async function serve(
  endpoint: Endpoint,
  isDev: boolean
): Promise<http.Server> {
  return new Promise(function listen(resolve, reject): void {
    // Reload app and hooks due to cache refreshing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    const { createApp, hooks } = require('@sqrtthree/friday')
    const app = createApp()
    const server = http.createServer(app.callback())

    const listenCallback = (): void => {
      resolve(server)

      if (!isDev) {
        gracefulShutdown(() => {
          logger.info('Gracefully shutting down. Please wait...')
          logger.debug('Closing app server')
          server.close()
        })
      }

      hooks.emitHook('onReady', app)
    }

    if (endpoint.protocol === EndpointProtocol.UNIX) {
      /**
       * UNIX domain socket endpoint.
       */
      const path = endpoint.host

      server.listen(path, listenCallback)
    } else {
      const { host, port } = endpoint

      server.listen(port, host, listenCallback)
    }

    server.on('error', (err) => {
      reject(err)
    })
  })
}
