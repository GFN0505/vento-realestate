import { describe, expect, it } from 'vitest'
import { hostOf } from './break-glass'
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

  it('then the SSH client address, masked', () => {
    expect(operatorIdentity({ SSH_CONNECTION: '102.89.34.10 51234 10.0.0.5 22' }, os)).toBe(
      'deploy@api-1 from 102.89.34.x',
    )
    expect(operatorIdentity({ SSH_CONNECTION: '10.0.0.9 51234 10.0.0.5 22' }, os)).toBe(
      'deploy@api-1 from a private network',
    )
  })

  it('falls back to the OS account', () => {
    expect(operatorIdentity({}, os)).toBe('deploy@api-1')
  })
})

describe('hostOf', () => {
  it.each([
    ['ada@api-1', 'api-1'],
    ['deploy@api-1 from 102.89.34.x', 'api-1'],
    ['ada (deploy@api-1)', 'api-1'],
    ['tunde via sudo (deploy@api-1.internal)', 'api-1.internal'],
    ['console · Chrome on Mac · 102.89.34.x', null],
  ])('reads the host from %s', (operator, host) => {
    expect(hostOf(operator)).toBe(host)
  })
})
