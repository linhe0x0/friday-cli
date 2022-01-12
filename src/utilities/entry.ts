export function getEntryFile(): string {
  const { entry } = require('@sqrtthree/friday/dist/lib/entry')

  return entry
}
