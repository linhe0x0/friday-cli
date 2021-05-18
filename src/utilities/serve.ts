import http from 'http'

import { emitHook } from '@sqrtthree/friday/dist/services/hooks'

import { Endpoint, EndpointProtocol } from '../types'
import { loadApp } from './app'

export default async function serve(endpoint: Endpoint): Promise<http.Server> {
  return new Promise(function listen(resolve, reject): void {
    // Reload app due to cache refreshing.
    const app = loadApp()
    const server = http.createServer(app.callback())

    const listenCallback = (): void => {
      resolve(server)

      emitHook('onReady', app)
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
