Pod::Spec.new do |s|
  s.name           = 'NoraBilling'
  s.version        = '1.0.0'
  s.summary        = 'NoraBilling native module'
  s.description    = 'NoraBilling native module'
  s.license        = 'Unlicense'
  s.author         = 'Nora'
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{swift,h,m,mm,cpp,hpp}"
end
