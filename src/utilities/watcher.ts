import chokidar from 'chokidar'
import fs from 'fs'

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
      watchConfig.ignored = watchConfig.ignored.concat(ignored)
    } else {
      watchConfig.ignored.push(ignored)
    }
  }

  const watcher = chokidar.watch(target, watchConfig)

  watcher.on('all', callback)

  return watcher
}
