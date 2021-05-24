import consola from 'consola'
import http from 'http'

import { Endpoint, EndpointProtocol } from '../types'

const gracefulShutdown = (fn: () => void): void => {
  let run = false

  const onceWrapper = () => {
    if (!run) {
      run = true

      consola.info('Gracefully shutting down. Please wait...')
      fn()
    }
  }

  process.on('SIGINT', onceWrapper)
  process.on('SIGTERM', onceWrapper)
  process.on('exit', onceWrapper)
}

export default async function serve(
  endpoint: Endpoint,
  isDev: boolean
): Promise<http.Server> {
  return new Promise(function listen(resolve, reject): void {
    // Reload app and hooks due to cache refreshing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    const { app, hooks } = require('@sqrtthree/friday')
    const server = http.createServer(app.callback())

    const listenCallback = (): void => {
      resolve(server)

      if (!isDev) {
        gracefulShutdown(() => {
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
