#!/usr/bin/env node

import _ from 'lodash'
import yargs from 'yargs'

import start from '@sqrtthree/friday/dist/bin/start'

import build from './bin/build'
import dev from './bin/dev'
import lint from './bin/lint'
import script from './bin/script'
import logger from './logger'
import { info } from './logger/colorful'
import { getEnvVersions } from './utilities/env-versions'

const outputVersionInfo = function outputVersionInfo() {
  const versions = getEnvVersions()

  logger.debug(info('Env Info:'))
  logger.debug('')

  const len = _.max(_.map(_.keys(versions), (item) => item.length))

  _.forEach(versions, (value, key) => {
    const name = _.padEnd(key, len)

    logger.debug(info(`  ${name}: ${value}`))
  })

  logger.debug('')
}

outputVersionInfo()

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('friday')
  .usage('$0 <cmd> [args]')
  .command(
    ['start', '$0'],
    'start a server, as it is the default command',
    {
      host: {
        alias: 'h',
        describe: 'specify a host on which to listen',
        type: 'string',
      },
      port: {
        alias: 'p',
        describe: 'specify a port on which to listen',
        type: 'number',
      },
      listen: {
        alias: 'l',
        describe: 'specify a URI endpoint on which to listen',
        type: 'string',
      },
      'unix-socket': {
        alias: 'n',
        describe: 'path to a UNIX socket',
        type: 'string',
      },
      env: {
        alias: 'e',
        describe: 'specify an environment of application and config files',
        type: 'string',
      },
    },
    start
  )
  .command(
    'dev',
    'start a server in development',
    {
      host: {
        alias: 'h',
        describe: 'specify a host on which to listen',
        type: 'string',
      },
      port: {
        alias: 'p',
        describe: 'specify a port on which to listen',
        type: 'number',
      },
      listen: {
        alias: 'l',
        describe: 'specify a URI endpoint on which to listen',
        type: 'string',
      },
      'unix-socket': {
        alias: 'n',
        describe: 'path to a UNIX socket',
        type: 'string',
      },
      env: {
        alias: 'e',
        describe: 'specify an environment of application and config files',
        type: 'string',
      },
      'no-clean': {
        describe: 'disable to delete the outputs of the project',
        type: 'boolean',
      },
      'no-build': {
        describe: 'disable file compilation of the project',
        type: 'boolean',
      },
      'type-check': {
        alias: 't',
        describe: 'run type checking after file changes',
        type: 'boolean',
      },
      'skip-initial-build': {
        describe: 'skip initial build at startup',
        type: 'boolean',
      },
      dist: {
        alias: 'd',
        describe: 'specify an output folder for all emitted files',
        type: 'string',
      },
    },
    dev
  )
  .command(
    'build',
    'build typescript code to js',
    {
      clean: {
        alias: 'c',
        describe: 'delete the outputs of all projects',
        type: 'boolean',
      },
      watch: {
        alias: 'w',
        describe: 'watch input files',
        type: 'boolean',
      },
      dist: {
        alias: 'd',
        describe: 'specify an output folder for all emitted files',
        type: 'string',
      },
    },
    build
  )
  .command(
    'lint',
    'find problems in your JavaScript/Typescript code',
    {
      fix: {
        describe: 'automatically fix problems',
        type: 'boolean',
      },
      'disable-type-check': {
        describe: 'disable type check',
        type: 'boolean',
      },
    },
    lint
  )
  .command(
    'script [name]',
    'run local scripts with a http server',
    {
      host: {
        alias: 'h',
        describe: 'specify a host on which to listen',
        type: 'string',
      },
      port: {
        alias: 'p',
        describe: 'specify a port on which to listen',
        type: 'number',
      },
      debug: {
        describe: 'enable verbose log output in script context',
        type: 'boolean',
      },
      list: {
        describe: 'list all served script names instead of starting the server',
        type: 'boolean',
      },
    },
    script
  )
  .help()
  .example(
    '',
    `
  For TCP (traditional host/port) endpoint:

    $ friday -p 1234
    $ friday -l tcp://hostname:1234

  For UNIX domain socket endpoint:

    $ friday -l unix:/path/to/socket.sock

  For development with belt full of tools:

    $ friday dev
`
  ).argv
