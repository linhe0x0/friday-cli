import _ from 'lodash'
import ts, { ParsedCommandLine } from 'typescript'

import logger from './logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type tsConfig = Record<string, any>

const readConfigFile = function readConfigFile(filename: string): tsConfig {
  const { config, error } = ts.readConfigFile(filename, ts.sys.readFile)

  if (error) {
    throw new Error(
      `Cannot read a tsconfig.json file at the specified ${filename}: ${error.messageText}`
    )
  }

  return config
}

const gerUserConfigPath = function gerUserConfigPath(): string | undefined {
  const searchPath = process.cwd()
  const configPath = ts.findConfigFile(
    searchPath,
    ts.sys.fileExists,
    'tsconfig.json'
  )

  if (configPath) {
    logger.debug(`Found user tsconfig.json file at the specified ${searchPath}`)
  } else {
    logger.debug(
      `Cannot find user tsconfig.json file at the specified ${searchPath}`
    )
  }

  return configPath
}

const getUserConfig = function getUserConfig(): tsConfig | undefined {
  const configPath = gerUserConfigPath()

  if (!configPath) {
    return undefined
  }

  return readConfigFile(configPath)
}

export function getConfig(): ParsedCommandLine {
  let config: tsConfig = {}

  const userConfig = getUserConfig()

  if (userConfig) {
    config = userConfig
  } else {
    const sharedTSConfigPath = require.resolve('@sqrtthree/tsconfig')

    logger.debug(
      "The user's tsconfig.json wat not found and will be default to @sqrtthree/tsconfig"
    )

    config = readConfigFile(sharedTSConfigPath)
  }

  return ts.parseJsonConfigFileContent(
    config,
    {
      useCaseSensitiveFileNames: false,
      readDirectory: ts.sys.readDirectory,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
    },
    process.cwd()
  )
}

interface CompileError {
  filename: string
  line: number
  column: number
  message: string
}

export function compile(
  filenames: string[],
  options: ts.CompilerOptions
): CompileError[] {
  const config = getConfig()
  const opts = _.assign({}, config.options, options)

  const program = ts.createProgram(filenames, opts)
  const emitResult = program.emit()

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  const results = _.map(allDiagnostics, (diagnostic): CompileError => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n'
    )

    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file,
        diagnostic.start || 0
      )

      return {
        filename: diagnostic.file.fileName,
        line: line + 1,
        column: character + 1,
        message,
      }
    }

    return {
      filename: '',
      line: 0,
      column: 0,
      message,
    }
  })

  return results
}

export function typeCheck(
  filenames: string[],
  options?: ts.CompilerOptions
): CompileError[] {
  const opts: ts.CompilerOptions = _.assign({}, options, {
    noEmit: true,
  })

  return compile(filenames, opts)
}
