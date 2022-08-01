import { IConfig } from 'config'
import Debug from 'debug'
import Data, { UserDataError, UserDataErrorCode, UserDataProvider } from './data'
import Bcrypt from 'bcrypt'
import { z } from 'zod'

const debug = Debug('koa-site:services')
const userDebug = Debug('koa-site:data:user-service')

const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  active: z.boolean(),
  deleted: z.boolean(),
  created: z.date(),
  updated: z.date().nullable(),
  lastLogin: z.date().nullable()
})
export type User = z.infer<typeof userSchema>

const userUpdateSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  newPassword: z.string().optional(),
  oldPassword: z.string().optional(),
  active: z.boolean().optional(),
  deleted: z.boolean().optional(),
  lastLogin: z.date().nullable().optional()
})
export type UserUpdate = z.infer<typeof userUpdateSchema>

const userLoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
})
export type UserLogin = z.infer<typeof userLoginSchema>

const userCreateSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  username: z.string().min(1)
})
export type UserCreate = z.infer<typeof userCreateSchema>

export class UserServiceError extends Error {
  constructor (message: string, public readonly innerError?: Error) {
    super(message)
    this.name = 'UserServiceError'
  }
}

class UserServiceProvider {
  constructor (private readonly data: UserDataProvider, private readonly config: IConfig) {
    userDebug('constructor called')
  }

  async getById (id: number): Promise<User> {
    userDebug('getById called')
    z.number().positive().parse(id)
    try {
      const output = await this.data.getById(id)
      if (output == null) throw new UserServiceError('User not found')
      delete output.passwordHash
      return output as User
    } catch (error) {
      throw new UserServiceError('Failed to get user', error as Error)
    }
  }

  async getByEmail (email: string): Promise<User> {
    userDebug('getByEmail called')
    z.string().min(1).parse(email)
    try {
      const output = await this.data.getByEmail(email)
      if (output == null) throw new UserServiceError('User not found')
      delete output.passwordHash
      return output as User
    } catch (error) {
      throw new UserServiceError('Failed to get user', error as Error)
    }
  }

  async getByUsername (username: string): Promise<User> {
    userDebug('getByUsername called')
    z.string().min(1).parse(username)
    try {
      const output = await this.data.getByUsername(username)
      if (output == null) throw new UserServiceError('User not found')
      delete output.passwordHash
      return output as User
    } catch (error) {
      throw new UserServiceError('Failed to get user', error as Error)
    }
  }

  async getByLogIn (login: UserLogin): Promise<User> {
    userDebug('getByLogIn called')
    const { email, password } = userLoginSchema.parse(login)
    try {
      const output = await this.data.getByEmail(email)
      if (output == null) throw new UserServiceError('Invalid email or password')
      const valid = await Bcrypt.compare(password, output.passwordHash as string)
      if (!valid) throw new UserServiceError('Invalid email or password')
      delete output.passwordHash
      await this.update(output.id, { lastLogin: new Date() })
      return output as User
    } catch (error) {
      throw new UserServiceError('Failed to get user', error as Error)
    }
  }

  async create (user: UserCreate): Promise<User> {
    userDebug('create called')
    const { email, password, username } = userCreateSchema.parse(user)
    try {
      const saltRounds = this.config.get<number>('saltRounds')
      const passwordHash = await Bcrypt.hash(password, saltRounds)
      const output = await this.data.create(username, email, passwordHash)
      delete output.passwordHash
      return output as User
    } catch (error: any) {
      if (error instanceof UserDataError) {
        if (error.code === UserDataErrorCode.EmailAlreadyExists) throw new UserServiceError('Email already exists')
        if (error.code === UserDataErrorCode.UsernameAlreadyExists) throw new UserServiceError('Username already exists')
      }
      throw new UserServiceError('Failed to create user', error as Error)
    }
  }

  async update (id: number, toUpdate: UserUpdate): Promise<User> {
    userDebug('update called')
    z.number().positive().parse(id)
    const user = userUpdateSchema.parse(toUpdate)
    try {
      const oldUser = await this.data.getById(id)
      if (oldUser == null) throw new UserServiceError('User not found')
      let passwordHash: string | undefined
      if (user.newPassword != null && user.oldPassword != null) {
        const valid = await Bcrypt.compare(user.oldPassword, oldUser.passwordHash as string)
        if (!valid) throw new UserServiceError('Invalid old password')
        const saltRounds = this.config.get<number>('saltRounds')
        passwordHash = await Bcrypt.hash(user.newPassword, saltRounds)
      }
      const output = await this.data.update({
        id,
        email: user.email ?? oldUser.email,
        username: user.username ?? oldUser.username,
        active: user.active ?? oldUser.active,
        deleted: user.deleted ?? oldUser.deleted,
        passwordHash: passwordHash ?? oldUser.passwordHash,
        created: oldUser.created,
        updated: user.lastLogin != null ? oldUser.updated : new Date(),
        lastLogin: user.lastLogin ?? oldUser.lastLogin
      })
      if (output == null) throw new UserServiceError('User not found')
      delete output.passwordHash
      return output as User
    } catch (error) {
      if (error instanceof UserDataError) {
        if (error.code === UserDataErrorCode.EmailAlreadyExists) throw new UserServiceError('Email already exists')
        if (error.code === UserDataErrorCode.UsernameAlreadyExists) throw new UserServiceError('Username already exists')
      }
      throw new UserServiceError('Failed to update user', error as Error)
    }
  }
}

export interface ServiceProviders {users: () => UserServiceProvider}
export default function services (config: IConfig): ServiceProviders {
  debug('services initialize called')
  const data = Data(config)
  return {
    users: () => new UserServiceProvider(data.users(), config)
  }
}
