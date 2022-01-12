import fastGlob from 'fast-glob'
import http, { Server } from 'http'
import Koa, { Context } from 'koa'
import _ from 'lodash'
import minimist from 'minimist'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { Arguments } from 'yargs'

import Router from '@koa/router'
import { useLogger, validate } from '@sqrtthree/friday'
import errorHandlerMiddleware from '@sqrtthree/friday/dist/middleware/error-handler'
import loader from '@sqrtthree/friday/dist/utilities/loader'

import logger, { blankLine, list } from '../logger'
import { error, info, text, tips } from '../logger/colorful'
import { getEntryFile } from '../utilities/entry'
import { relative } from '../utilities/fs'

const ignoredFile = (filename: string): boolean => {
  if (_.startsWith(filename, '.')) {
    return true
  }

  if (_.startsWith(filename, '_')) {
    return true
  }

  if (_.endsWith(filename, '.test.js')) {
    return true
  }

  if (_.endsWith(filename, '.spec.js')) {
    return true
  }

  return false
}

const getScriptFiles = function getScriptFiles() {
  const entry = getEntryFile()
  const dir = path.dirname(entry)
  const scriptDir = path.join(dir, 'scripts')
  const filePattern = `${scriptDir}/*.js`
  const files: string[] = fastGlob.sync(filePattern)

  logger.debug(text(`script dir: ${relative(scriptDir)}`))

  const matchedFiles = _.filter(files, (item: string) => {
    const name = path.basename(item)
    const ignore = ignoredFile(name)

    return !ignore
  })

  const scripts = _.map(matchedFiles, (item: string) => {
    const { base, name } = path.parse(item)

    return {
      path: item,
      filename: base,
      name,
    }
  })

  return scripts
}

interface Route {
  schema?: any
  handler: any
}

const pathToRoute = function pathToRoute(filePath: string): Route {
  const route = loader(filePath)
  const { schema } = route
  const handler = route.handler || route.default

  if (typeof handler !== 'function') {
    throw new Error(
      `Failed to load your routes from ${filePath}. Expect function but got ${typeof handler}.`
    )
  }

  return {
    schema,
    handler,
  }
}

interface ServeScriptsOptions {
  host?: string
  port?: number
  debug?: boolean
}

export function serveScripts(options: ServeScriptsOptions): Promise<Server> {
  const opts = _.defaults(options, {
    host: '0.0.0.0',
    port: 3001,
    debug: false,
  })

  const app = new Koa()

  app.use(errorHandlerMiddleware)

  // Add logger to context
  app.use((ctx, next) => {
    const requestID = uuidv4()
    ctx.logger = useLogger(`[${ctx.method}] ${ctx.path}`, {
      'x-request-id': requestID,
    })

    return next()
  })

  const router = new Router()
  const scripts = getScriptFiles()

  _.forEach(scripts, (item) => {
    const { schema, handler } = pathToRoute(item.path)
    const routerPath = `${item.filename} => /${item.name}`

    logger.debug(`Registering script: ${tips(routerPath)}`)

    router.all(`/${item.name}`, async (ctx: Context): Promise<void> => {
      const data = _.assign({}, ctx.query, ctx.request.body)
      const hasSchema = !_.isEmpty(schema)

      ctx.logger.info('request data: %o', data)

      if (hasSchema) {
        const s = _.defaults(schema, {
          type: 'object',
        })

        try {
          validate(s, data)
        } catch (err) {
          ctx.throw(400, err)
        }
      }

      await handler(ctx, data)

      ctx.body = 'success'
    })
  })

  app.use(router.routes())
  app.use(router.allowedMethods())

  const server = http.createServer(app.callback())

  return new Promise<Server>((resolve, reject) => {
    server.listen(opts.port, opts.host, () => {
      logger.info(`Scripts are served at ${opts.port}`)

      resolve(server)
    })

    server.on('error', (err) => {
      logger.error(`Cannot not serve scripts: ${err.message}`)

      reject(err)
    })
  })
}

interface ScriptCommandOptions {
  name?: string
  host?: string
  port?: number
  debug?: boolean
  list?: boolean
}

export default function script(argv: Arguments<ScriptCommandOptions>): void {
  if (argv.debug) {
    process.env.LOGGER_LEVEL = 'debug'
  }

  /**
   * List all scripts and exit.
   */
  if (argv.list) {
    const scripts = getScriptFiles()
    const names = _.map(scripts, 'name')

    if (names.length) {
      logger.info(info('The following scripts will be served:'))

      list(names)
      blankLine()
    } else {
      logger.info(info('There are no scripts that will be served.'))
    }

    return
  }

  /**
   * Run single script.
   */
  if (argv.name) {
    const scripts = getScriptFiles()
    const targetScript = _.find(scripts, (item) => item.name === argv.name)

    if (!targetScript) {
      logger.error(`script ${tips(argv.name)} dose not exist.`)

      process.exit(1)
    }

    const loadedScript = loader(targetScript.path)
    const { schema } = loadedScript
    const handler = loadedScript.handler || loadedScript.default

    if (typeof handler !== 'function') {
      logger.error(
        `Expect function but got ${typeof handler} when loading script ${tips(
          targetScript.name
        )}.`
      )

      process.exit(1)
    }

    const args = minimist(process.argv.slice(2))
    const data = _.omit(args, ['_'])

    logger.info(
      `run script ${tips(targetScript.name)} with data:`,
      JSON.stringify(data)
    )

    const hasSchema = !_.isEmpty(schema)

    if (hasSchema) {
      const s = _.defaults(schema, {
        type: 'object',
      })

      try {
        validate(s, data)
      } catch (err) {
        const errors = _.map(
          err.errors,
          (item) => `data${item.dataPath} ${item.message}`
        )

        logger.error('Invalid options:')
        list(errors)
        blankLine()

        process.exit(1)
      }
    }

    Promise.resolve()
      .then(() => {
        const requestID = uuidv4()
        const contextLogger = useLogger(`[cli] ${targetScript.name}`, {
          'x-request-id': requestID,
        })

        const ctx = {
          logger: contextLogger,
        }

        return handler(ctx, data)
      })
      .then(() => {
        logger.success('Done.')
        process.exit(0)
      })
      .catch((err) => {
        console.error(err)
        logger.error(
          `Failed to run script ${tips(targetScript.name)}: ${error(
            err.message
          )}.`
        )
        process.exit(1)
      })

    return
  }

  /**
   * Start a http server to serve scripts.
   */
  serveScripts(argv).catch(() => {
    process.exit(1)
  })
}
