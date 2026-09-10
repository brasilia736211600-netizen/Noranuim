import { describe, expect, it } from 'bun:test'
import { getBase64Payload } from './base64'

describe('getBase64Payload', () => {
  it('strips the data url prefix', () => {
    expect(getBase64Payload('data:image/png;base64,Zm9v')).toBe('Zm9v')
  })

  it('preserves plain base64 content', () => {
    expect(getBase64Payload('YmFy')).toBe('YmFy')
  })
})
