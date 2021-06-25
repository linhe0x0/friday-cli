import chalk from 'chalk'
import _ from 'lodash'
import ts, {
  CompilerOptions,
  Diagnostic,
  EmitAndSemanticDiagnosticsBuilderProgram,
  ParsedCommandLine,
  SemanticDiagnosticsBuilderProgram,
  WatchOfConfigFile,
  WatchOfFilesAndCompilerOptions,
} from 'typescript'

import logger, { outputCode } from './logger'

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

export function getConfig(ignoreUserConfig?: boolean): ParsedCommandLine {
  let config: tsConfig | undefined

  if (!ignoreUserConfig) {
    const userConfig = getUserConfig()

    if (userConfig) {
      config = userConfig
    }
  }

  if (!config) {
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

interface FormattedCompileError {
  filename: string
  line: number
  column: number
  message: string
}

const formatCompileError = function formatCompileError(
  diagnostics: Diagnostic[]
): FormattedCompileError[] {
  const results = _.map(diagnostics, (diagnostic): FormattedCompileError => {
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

export function compile(
  filenames: string[],
  options: CompilerOptions
): FormattedCompileError[] {
  const config = getConfig()
  const opts: CompilerOptions = _.assign({}, config.options, options)

  const program = ts.createProgram(filenames, opts)
  const emitResult = program.emit()

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  return formatCompileError(allDiagnostics)
}

export function typeCheck(
  filenames: string[],
  options?: CompilerOptions
): FormattedCompileError[] {
  const opts: CompilerOptions = _.assign({}, options, {
    noEmit: true,
  })

  return compile(filenames, opts)
}

const watchedDiagnostics: Diagnostic[] = []

const reportDiagnostic = function reportDiagnostic(diagnostic: Diagnostic) {
  watchedDiagnostics.push(diagnostic)
}

const reportWatchStatusChanged = function reportWatchStatusChanged(
  diagnostic: Diagnostic
) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  const errorMatched = message.match(/\d+/)
  const errorCount: number = errorMatched ? parseInt(errorMatched[0], 10) : 0

  if (errorCount > 0) {
    logger.error(chalk.red.bold('[type-check]'), chalk.red(message))
  }

  if (watchedDiagnostics.length) {
    const results = formatCompileError(watchedDiagnostics)

    outputCode(results)

    watchedDiagnostics.length = 0
  }
}

export interface CompileProgram {
  useUserConfigFile: boolean
  program:
    | WatchOfConfigFile<EmitAndSemanticDiagnosticsBuilderProgram>
    | WatchOfFilesAndCompilerOptions<EmitAndSemanticDiagnosticsBuilderProgram>
}

export function watchFilesToCompile(
  rootFiles: string[],
  options: CompilerOptions
): CompileProgram {
  const userConfigPath = gerUserConfigPath()

  const createProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram

  if (userConfigPath) {
    const host = ts.createWatchCompilerHost(
      userConfigPath,
      {},
      ts.sys,
      createProgram,
      reportDiagnostic,
      reportWatchStatusChanged
    )

    const program = ts.createWatchProgram(host)

    return {
      useUserConfigFile: true,
      program,
    }
  }

  const config = getConfig(true)
  const opts: CompilerOptions = _.assign({}, config.options, options)

  const host = ts.createWatchCompilerHost(
    rootFiles,
    opts,
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportWatchStatusChanged
  )

  const program = ts.createWatchProgram(host)

  return {
    useUserConfigFile: false,
    program,
  }
}

export interface WatchProgram {
  useUserConfigFile: boolean
  program:
    | WatchOfConfigFile<SemanticDiagnosticsBuilderProgram>
    | WatchOfFilesAndCompilerOptions<SemanticDiagnosticsBuilderProgram>
}

export function watchFilesToTypeCheck(
  rootFiles: string[],
  options: CompilerOptions
): WatchProgram {
  const optionsToExtend = {
    noEmit: true,
  }
  const userConfigPath = gerUserConfigPath()

  const createProgram = ts.createSemanticDiagnosticsBuilderProgram

  if (userConfigPath) {
    const host = ts.createWatchCompilerHost(
      userConfigPath,
      optionsToExtend,
      ts.sys,
      createProgram,
      reportDiagnostic,
      reportWatchStatusChanged
    )

    const program = ts.createWatchProgram(host)

    return {
      useUserConfigFile: true,
      program,
    }
  }

  const config = getConfig(true)
  const opts: CompilerOptions = _.assign(
    {},
    config.options,
    options,
    optionsToExtend
  )

  const host = ts.createWatchCompilerHost(
    rootFiles,
    opts,
    ts.sys,
    createProgram,
    reportDiagnostic,
    reportWatchStatusChanged
  )

  const program = ts.createWatchProgram(host)

  return {
    useUserConfigFile: false,
    program,
  }
}
