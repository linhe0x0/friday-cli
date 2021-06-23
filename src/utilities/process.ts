export function gracefulShutdown(fn: () => void): void {
  let run = false

  const onceWrapper = () => {
    if (!run) {
      run = true

      fn()
    }
  }

  process.on('SIGINT', onceWrapper)
  process.on('SIGTERM', onceWrapper)
  process.on('exit', onceWrapper)
}
