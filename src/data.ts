import { IConfig } from 'config'
import Debug from 'debug'
import Knex, { Knex as k } from 'knex'
import { z } from 'zod'

const debug = Debug('koa-site:data')
const userDebug = Debug('koa-site:data:user-data')

const userDataSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  passwordHash: z.string().optional(),
  active: z.boolean(),
  deleted: z.boolean(),
  created: z.date(),
  updated: z.date().nullable(),
  lastLogin: z.date().nullable()
})
export type UserData = z.infer<typeof userDataSchema>

export enum UserDataErrorCode {
  UsernameAlreadyExists = 'UsernameAlreadyExists',
  EmailAlreadyExists = 'EmailAlreadyExists',
  UnknownError = 'UnknownError'
}

type PGError = Error & {constraint: string, code: string}

export class UserDataError extends Error {
  private readonly _code: UserDataErrorCode
  constructor (message: string, public readonly innerError: PGError, code: UserDataErrorCode = UserDataErrorCode.UnknownError) {
    super(message)
    this.name = 'UserDataError'
    this._code = code
    if (innerError.code === '23505' && innerError.constraint === 'users_email_key') {
      this._code = UserDataErrorCode.EmailAlreadyExists
    } else if (innerError.code === '23505' && innerError.constraint === 'users_username_key') {
      this._code = UserDataErrorCode.UsernameAlreadyExists
    }
  }

  get code (): UserDataErrorCode {
    return this._code
  }
}

export class UserDataProvider {
  constructor (private readonly db: k) {
    userDebug('constructor called')
  }

  async getById (id: number): Promise<UserData | undefined> {
    userDebug('getById called')
    try {
      const output = await this.db<UserData>('users')
        .where({ id, deleted: false })
        .first()
      return output
    } catch (error) {
      throw new UserDataError('Failed to get user', error as PGError)
    }
  }

  async getByEmail (email: string): Promise<UserData | undefined> {
    userDebug('getByEmail called')
    try {
      const output = await this.db<UserData>('users')
        .where({ email, deleted: false })
        .first()
      return output
    } catch (error) {
      throw new UserDataError('Failed to get user', error as PGError)
    }
  }

  async getByUsername (username: string): Promise<UserData | undefined> {
    userDebug('getByUsername called')
    try {
      const output = await this.db<UserData>('users')
        .where({ username, deleted: false })
        .first()
      return output
    } catch (error) {
      throw new UserDataError('Failed to get user', error as PGError)
    }
  }

  async getByLogIn (email: string, passwordHash: string): Promise<UserData | undefined> {
    userDebug('getByLogIn called')
    try {
      const output = await this.db<UserData>('users')
        .where({ email, passwordHash, active: true, deleted: false })
        .first()
      return output
    } catch (error) {
      throw new UserDataError('Failed to get user', error as PGError)
    }
  }

  async create (username: string, email: string, passwordHash: string): Promise<UserData> {
    userDebug('create called')
    try {
      const output = await this.db<UserData>('users')
        .insert({ username, email, passwordHash, active: true, deleted: false })
        .returning('*')
      return output[0]
    } catch (error) {
      throw new UserDataError('Failed to create user', error as PGError)
    }
  }

  async update (user: UserData): Promise<UserData | undefined> {
    userDebug('update called')
    const data = userDataSchema.parse(user)
    try {
      const output = await this.db<UserData>('users')
        .update(data)
        .where({ id: user.id })
        .returning('*')
      return output[0]
    } catch (error) {
      throw new UserDataError('Failed to update user', error as PGError)
    }
  }
}

export interface Data {users: () => UserDataProvider}
export default function data (config: IConfig): Data {
  debug('data initialize called')
  const knexConfig = config.get<k.Config>('knex')
  const knex = Knex(knexConfig)
  const users = new UserDataProvider(knex)
  return {
    users: () => users
  }
}
