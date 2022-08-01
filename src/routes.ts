import KoaRouter from '@koa/router'
import Validator from 'validator'
import { AuthenticatedUser, ServerContext, ServerContextState } from './middleware'

export default function registerRoutes (): KoaRouter<ServerContextState, ServerContext> {
  const router = new KoaRouter<ServerContextState, ServerContext>()

  router.get('/about', async (ctx) => {
    ctx.render('about', { title: 'about' })
  })

  router.get('/login', async (ctx) => {
    const status = ctx.state.getValue('status') ?? []
    const errors = ctx.state.getValue('errors') ?? []
    ctx.render('login', { title: 'login', errors, status })
  })

  router.get('/logout', async (ctx) => {
    ctx.state.logout()
    ctx.state.setValue('status', ['You are logged out.'])
    ctx.redirect('/')
  })

  router.post('/login', async (ctx) => {
    const form = ctx.request.body
    const errors: string[] = []

    if (Validator.isEmpty(form.email)) {
      errors.push('Email is required')
    } else if (!Validator.isEmail(form.email)) {
      errors.push('Email is invalid')
    }

    if (Validator.isEmpty(form.password)) {
      errors.push('Password is required')
    }

    if (errors.length === 0) {
      try {
        const { users } = ctx.state.services
        const userLogin = {
          email: form.email,
          password: form.password
        }
        const user = await users().getByLogIn(userLogin)
        ctx.state.setUserToken(user)
        ctx.log.debug(`logged in user ${user.id}`)
        ctx.state.setValue('status', ['You are logged in.'])
        ctx.redirect('/')
      } catch (error: any) {
        ctx.state.setValue('errors', [error.message])
        ctx.redirect('/login')
      }
    } else {
      ctx.state.setValue('errors', errors)
      ctx.redirect('/login')
    }
  })

  router.get('/register', async (ctx) => {
    const form = ctx.state.getValue('register') ?? {}
    const errors = ctx.state.getValue('errors') ?? []
    ctx.render('register', { title: 'register', form, errors })
  })

  router.post('/register', async (ctx) => {
    const form = ctx.request.body
    const errors: string[] = []

    if (Validator.isEmpty(form.email)) {
      errors.push('Email is required')
    } else if (!Validator.isEmail(form.email)) {
      errors.push('Email is invalid')
    }

    if (Validator.isEmpty(form.password)) {
      errors.push('Password is required')
    } else if (!Validator.isStrongPassword(form.password)) {
      errors.push('Password is weak (min 8 characters, 1 Upper, 1 Lower, 1 Number, 1 Symbol)')
    }

    if (Validator.isEmpty(form.confirmPassword)) {
      errors.push('Confirm password is required')
    } else if (form.password !== form.confirmPassword) {
      errors.push('Passwords do not match')
    }

    if (errors.length === 0) {
      try {
        const { users } = ctx.state.services
        const userCreate = {
          email: form.email,
          password: form.password,
          username: form.username
        }
        const user = await users().create(userCreate)
        ctx.log.debug(`Created user ${user.id}`)
        ctx.state.setValue('status', ['You are registered. Go ahead, log in.'])
        ctx.redirect('/login')
      } catch (error: any) {
        ctx.state.setValue('errors', [error.message])
        ctx.state.setValue('register', form)
        ctx.redirect('/register')
      }
    } else {
      ctx.state.setValue('errors', errors)
      ctx.state.setValue('register', form)
      ctx.redirect('/register')
    }
  })

  router.get('/', async (ctx) => {
    const status = ctx.state.getValue('status') ?? []
    const template = ctx.state.authenticated ? 'index-user' : 'index-public'
    const title = ctx.state.authenticated ? `home for ${(ctx.state.user as AuthenticatedUser).username}` : 'home'
    ctx.render(template, { title, status })
  })

  return router
}
