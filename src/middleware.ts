import Services, { ServiceProviders, User } from './services'
import Config, { IConfig } from 'config'
import { StaticOptions, JwtOptions } from '../config/default'
import Koa from 'koa'
import { Logger } from 'pino'
import Debug from 'debug'
import KoaLogger from 'koa-pino-logger'
import KoaStatic from 'koa-static'
import Routes from './routes'
import Uniquey from 'uniquey'
import JWT from 'jsonwebtoken'
import BodyParser from 'koa-bodyparser'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Render = require('koa-art-template')

const debug = Debug('koa-site:middleware')

const uniquey = new Uniquey()

function createAnonymousToken (jwt: JwtOptions, ctx: Koa.ParameterizedContext<ServerContextState>): { type: string, id: string } {
  const anonymous = { type: 'anonymous', id: uniquey.create() }
  const bearer = JWT.sign(anonymous, jwt.secret, { expiresIn: jwt.expiresIn })
  ctx.state.user = anonymous
  ctx.cookies.set(jwt.cookieName, bearer, { signed: true, expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) })
  return anonymous
}

export function createUserToken (user: User, jwt: JwtOptions, ctx: Koa.ParameterizedContext<ServerContextState>): void {
  const payload = { type: 'user', ...user }
  const bearer = JWT.sign(payload, jwt.secret, { expiresIn: jwt.expiresIn })
  ctx.state.user = payload
  ctx.cookies.set(jwt.cookieName, bearer, { signed: true, expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) })
}

export type ServerContextState = Koa.DefaultState & {
  config: Config.IConfig
  name: string
  environment: string
  dev: boolean
  host: string
  user: User | { type: string, id: string }
  authenticated: boolean
  services: ServiceProviders
  getValue: (key: string) => any
  setValue: (key: string, value: any) => void
  setUserToken: (user: User) => void
  logout: () => void
}

export type ServerContext = Koa.ParameterizedContext<ServerContextState>

export function Authorize (): Koa.Middleware {
  return async (ctx, next) => {
    const { user } = ctx.state
    if (user.type === 'anonymous') {
      ctx.throw(401, 'Unauthorized')
    }
    await next()
  }
}

export default function registerMiddleware (app: Koa<ServerContextState, ServerContext>, config: IConfig, logger: Logger): void {
  debug('Registering middleware')

  debug('Registering logger middleware')
  app.use(KoaLogger({ logger }))

  debug('Registering authenticate middleware')
  app.use(async (ctx, next) => {
    ctx.state.setUserToken = (user: User) => {
      const jwt = config.get<JwtOptions>('jwt')
      createUserToken(user, jwt, ctx)
    }
    ctx.state.logout = () => {
      const jwt = config.get<JwtOptions>('jwt')
      createAnonymousToken(jwt, ctx)
    }
    await next()
  })

  debug('Registering state getter/setter')
  app.use(async (ctx, next) => {
    ctx.state.getValue = (key: string): any | undefined => {
      const store: { [key: string]: string | undefined } = (ctx.state.store ?? {}) as { [key: string]: string | undefined }
      let value: string | undefined = store[key]
      if (value == null) {
        value = ctx.cookies.get(key)
      }
      if (value == null) return undefined
      const output = JSON.parse(Buffer.from(value, 'base64url').toString('utf-8'))
      store[key] = undefined
      ctx.state.store = store
      ctx.cookies.set(key, null, { signed: true })
      return output
    }
    ctx.state.setValue = (key: string, value: any): void => {
      const v = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
      const store: { [key: string]: string } = (ctx.state.store ?? {}) as { [key: string]: string }
      store[key] = v
      ctx.cookies.set(key, v, { signed: true })
      ctx.state.store = store
    }
    await next()
  })

  debug('Registering authentication middleware')
  app.keys = config.get<string[]>('keys')
  const jwt = config.get<JwtOptions>('jwt')
  app.use(async (ctx, next) => {
    const token = ctx.cookies.get(jwt.cookieName)
    let payload: any | undefined
    if (token == null) {
      payload = createAnonymousToken(jwt, ctx)
    } else {
      try {
        payload = JWT.verify(token, jwt.secret)
      } catch (error: any) {
        payload = createAnonymousToken(jwt, ctx)
      }
      ctx.state.user = payload
      ctx.state.authenticated = payload.type === 'user'
    }
    await next()
  })

  debug('Registering Body Parser')
  app.use(BodyParser())

  debug('Registering error middleware')
  app.use(async (ctx, next) => {
    try {
      await next()
      if (ctx.status === 404) ctx.throw('Page is not found!', 404)
      else if (ctx.status > 400) ctx.throw(ctx.status)
    } catch (error: any) {
      ctx.status = error.status ?? 500
      ctx.log.error(error.stack)
      ctx.render('error', { message: error.message, error })
    }
  })

  debug('Registering state middleware')
  const services = Services(config)
  app.use(async (ctx, next) => {
    ctx.state.services = services
    ctx.state.config = config
    ctx.state.logger = logger
    ctx.state.dev = config.get<boolean>('dev')
    ctx.state.name = config.get<string>('name')
    ctx.state.person = config.get<string>('person')
    await next()
  })

  debug('Registering art template middleware')
  Render(app, config.get('template'))

  debug('Registering routes middleware')
  const routes = Routes()
  app.use(routes.routes())
  app.use(routes.allowedMethods())

  debug('Registering static middleware')
  const staticOptions = config.get<StaticOptions>('staticOptions')
  app.use(KoaStatic(staticOptions.root, staticOptions.options))

  debug('Completed registering middleware')
}
