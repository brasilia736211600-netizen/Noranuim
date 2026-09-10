if (typeof globalThis.location === 'undefined') {
  Object.defineProperty(globalThis, 'location', {
    value: {
      href: 'http://localhost/',
      host: 'localhost',
      hostname: 'localhost',
      protocol: 'http:',
    },
    configurable: true,
  })
}
