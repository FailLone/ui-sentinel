import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { config } from '../shared/config.ts'

const DATABASE_URL = config.databaseUrl

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'ui-sentinel-storage',
    url: DATABASE_URL,
  }),
})
