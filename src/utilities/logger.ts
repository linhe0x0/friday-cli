import consola, { LogLevel } from 'consola'
import _ from 'lodash'

const isVerbose = _.includes(process.argv, '--verbose')

const logger = consola.create({
  level: isVerbose ? LogLevel.Verbose : LogLevel.Info,
})

export default logger
