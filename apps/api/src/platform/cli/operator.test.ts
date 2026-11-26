import { describe, expect, it } from 'vitest'
import { operatorIdentity } from './operator'

const os = { user: 'deploy', host: 'api-1' }

describe('operatorIdentity', () => {
  it('prefers the name devops set for the person', () => {
    expect(
      operatorIdentity(
        { VENTO_OPERATOR: 'ada', SUDO_USER: 'x', SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' },
        os,
      ),
    ).toBe('ada (deploy@api-1)')
  })

  it('then the person behind sudo', () => {
    expect(operatorIdentity({ SUDO_USER: 'tunde' }, os)).toBe('tunde via sudo (deploy@api-1)')
  })

  it('then the SSH client address', () => {
    expect(operatorIdentity({ SSH_CONNECTION: '102.89.34.10 51234 10.0.0.5 22' }, os)).toBe(
      'deploy@api-1 from 102.89.34.10',
    )
  })

  it('falls back to the OS account', () => {
    expect(operatorIdentity({}, os)).toBe('deploy@api-1')
  })
})
