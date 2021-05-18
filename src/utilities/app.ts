// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadApp(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
  const { app } = require('@sqrtthree/friday')

  return app
}
