if (typeof globalThis.location === 'undefined') {
  Object.defineProperty(globalThis, 'location', {
    value: {
      href: 'http://localhost/',
      host: 'localhost',
      hostname: 'localhost',
      protocol: 'http:',
    },
    writable: true,
    configurable: true,
  })
}
