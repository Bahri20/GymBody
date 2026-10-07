Pod::Spec.new do |s|
  s.name = 'RankVideo'
  s.version = '1.0.0'
  s.summary = 'GymBodyAI sticker video export'
  s.description = 'Composites rank stickers into local videos, preserving audio.'
  s.license = { :type => 'MIT' }
  s.author = 'GymBodyAI'
  s.homepage = 'https://gymbodyai.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
