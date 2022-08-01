import Config from 'config'
import Debug from 'debug'
import Pino, { LoggerOptions } from 'pino'
import Koa from 'koa'
import { Server } from 'http'
import Middleware, { ServerContext, ServerContextState } from './middleware'
import { ServerOptions } from '../config/default'

const debug = Debug('koa-site:server')
const logger = Pino(Config.get<LoggerOptions>('pino'))

debug('Initializing server')
const app = new Koa<ServerContextState, ServerContext>()
Middleware(app, Config, logger)

debug('Starting server')
const { port, host } = Config.get<ServerOptions>('server')
const name = Config.get<string>('name')
const server: Server = app.listen(port, host, () => {
  logger.info(
    `${name} server running at http://${host}:${port.toString()}`
  )
})

// handle shutdown
function stop (): void {
  debug('Stopping server')
  server.close((err) => {
    if (err != null) {
      logger.error(err)
      process.exit(1)
    } else {
      logger.info('Server stopped.')
      process.exit(0)
    }
  })
}

// watch for SIGINT and SIGTERM signals
process.once('SIGTERM', () => {
  console.warn('\nSIGTERM received...')
  stop()
})

process.once('SIGINT', () => {
  console.warn('\nSIGINT received...')
  stop()
})
