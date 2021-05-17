import http from 'http'

import { Endpoint, EndpointProtocol } from '../types'
import useHooks from './hooks'

export default async function serve(
  endpoint: Endpoint,
  entryFile: string
): Promise<http.Server> {
  const hooks = useHooks(entryFile)

  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
  const { app } = require('@sqrtthree/friday')

  hooks.beforeStart()

  const server = http.createServer(app.callback())

  return new Promise(function listen(resolve, reject): void {
    const listenCallback = (): void => {
      hooks.afterStart()

      resolve(server)
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
