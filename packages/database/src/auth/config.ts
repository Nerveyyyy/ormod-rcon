import { organization, twoFactor } from 'better-auth/plugins'
import { uuidv7 } from 'uuidv7'

export const authPlugins = [
  organization({
    allowUserToCreateOrganization: false,
    schema: {
      organization: {
        additionalFields: {
          status: {
            type: 'string',
            required: false,
            defaultValue: 'active',
          },
        },
      },
    },
  }),
  twoFactor(),
]

export const authBaseOptions = {
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
}
