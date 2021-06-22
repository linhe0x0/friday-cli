import consola, { LogLevel } from 'consola'
import _ from 'lodash'

const isVerbose = _.includes(process.argv, '--verbose')

const logger = consola.create({
  level: isVerbose ? LogLevel.Verbose : LogLevel.Info,
})

export default logger

export function blankLine(): void {
  // eslint-disable-next-line no-console
  console.log('')
}

export function list(data: string[], padding = 2): void {
  let padString = ''

  for (let i = 0; i < padding; i += 1) {
    padString += ' '
  }

  _.forEach(data, (item) => {
    // eslint-disable-next-line no-console
    console.log(`${padString}${item}`)
  })
}
