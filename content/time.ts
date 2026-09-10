export const getTimeSpoofScript = (timezone: string, offsetMin: number) => `
(function() {
  const originalDate = window.Date;
  const originalIntl = window.Intl;

  // We are not mocking Date.now() directly for performance, 
  // but we modify toString and timezone offsets to spoof the location.
  
  class MockDate extends originalDate {
    constructor(...args) {
      if (args.length === 0) {
        super();
      } else {
        super(...args);
      }
    }
    
    getTimezoneOffset() {
      return ${offsetMin}; // Minutes
    }
    
    // Some naive overriding to enforce timezone in string representations
    toString() {
      return new originalDate(this.getTime() - (${offsetMin} * 60000)).toUTCString().replace('GMT', '') + ' (Spoofed)';
    }
  }
  
  // Override Intl.DateTimeFormat
  const OrigDateTimeFormat = Intl.DateTimeFormat;
  window.Intl.DateTimeFormat = function(locales, options) {
    const opts = options || {};
    if (!opts.timeZone) {
      opts.timeZone = '${timezone}';
    }
    return new OrigDateTimeFormat(locales, opts);
  };
  
  window.Intl.DateTimeFormat.prototype = OrigDateTimeFormat.prototype;
  window.Intl.DateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;
  
  // Attach overrides
  window.Date = MockDate;
})();
`
