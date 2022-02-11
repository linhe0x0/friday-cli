import chokidar from 'chokidar'
import type fs from 'fs'

export type WatchEventName =
  | 'add'
  | 'addDir'
  | 'change'
  | 'unlink'
  | 'unlinkDir'

export default function watch(
  target: string,
  ignored: string | RegExp | RegExp[],
  callback: (eventName: WatchEventName, path: string, stats?: fs.Stats) => void
): chokidar.FSWatcher {
  const watchConfig: chokidar.WatchOptions = {
    ignoreInitial: true,
    ignored: [
      /(^|[/\\])\../, // .dotfiles
    ],
  }

  if (ignored) {
    if (Array.isArray(ignored)) {
      watchConfig.ignored = (watchConfig.ignored as RegExp[]).concat(ignored)
    } else {
      ;(watchConfig.ignored as (string | RegExp)[]).push(ignored)
    }
  }

  const watcher = chokidar.watch(target, watchConfig)

  watcher.on('all', callback)

  return watcher
}
