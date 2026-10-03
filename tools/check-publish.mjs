/**
 * Publication preflight for dsh-ui-flow-mapper.
 *
 * Runs on `npm pack` / `npm publish` (via the `prepack` script) and by hand
 * (`npm run check:publish`). It checks the things that are cheap to check here
 * and expensive to discover after publishing: the manifest's identity contract
 * with the bundle and the Cordis patch, the packed file set, and whether the
 * shipped artifact is actually the current build.
 *
 * Exits non-zero on any ERROR. Placeholder values that only a human can fill in
 * (GitHub owner, author name) are reported as WARN so the pack still works while
 * the repo is being prepared.
 *
 * Usage: node tools/check-publish.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const errors = []
const warnings = []
const passes = []

const fail = (message) => errors.push(message)
const warn = (message) => warnings.push(message)
const pass = (message) => passes.push(message)

function readText(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative))
}

/* ------------------------------------------------------------- the manifest */

let pkg = null
try {
  pkg = JSON.parse(readText('package.json'))
  pass('package.json parses')
} catch (err) {
  fail('package.json does not parse: ' + err.message)
}

if (pkg !== null) {
  if (pkg.private === true) fail('package.json still has "private": true — npm refuses to publish it')
  else pass('no "private" flag')

  if (typeof pkg.name !== 'string' || pkg.name === '') fail('package.json has no "name"')
  else if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkg.name)) fail('package name is not a valid npm name: ' + pkg.name)
  else pass('name is a valid npm name: ' + pkg.name)

  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) fail('version is not semver: ' + pkg.version)
  else pass('version is semver: ' + pkg.version)

  if (typeof pkg.description !== 'string' || pkg.description.length < 20) fail('description is missing or too short')
  else pass('description present (' + pkg.description.length + ' chars)')

  if (typeof pkg.license !== 'string' || pkg.license === '') fail('no license field')
  else pass('license: ' + pkg.license)

  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : []
  if (keywords.indexOf('dsh-plugin') < 0) fail('keywords must include "dsh-plugin" — that is the keyword the DSH ecosystem searches by')
  else pass('keywords include "dsh-plugin"')

  for (const field of ['repository', 'homepage', 'bugs']) {
    if (pkg[field] === undefined) fail('missing "' + field + '" field')
  }
  const repositoryUrl = pkg.repository && (pkg.repository.url || pkg.repository)
  if (typeof repositoryUrl === 'string') {
    if (repositoryUrl.indexOf('YOUR-GH-NAME') >= 0) warn('repository/homepage/bugs still contain the placeholder "YOUR-GH-NAME" — replace it with your GitHub owner before publishing')
    else if (repositoryUrl.indexOf('github.com') < 0) warn('repository url does not look like a GitHub URL: ' + repositoryUrl)
    else pass('repository points at ' + repositoryUrl)
  }
  if (pkg.author === 'YOUR-NAME') warn('author is still the placeholder "YOUR-NAME"')

  if (pkg.engines === undefined) warn('no "engines" field')
  else pass('engines: ' + JSON.stringify(pkg.engines))

  /* ------------------------------------------------------- DSH declarations */

  const dsh = pkg.dsh || {}
  const patch = dsh.bundle && dsh.bundle.patch
  if (typeof patch !== 'string') fail('dsh.bundle.patch is missing — DSH would not load the plugin')
  else if (!exists(patch)) fail('dsh.bundle.patch points at a file that does not exist: ' + patch)
  else pass('cordis patch declared: ' + patch)

  const platform = dsh.client && dsh.client.platform
  if (platform !== 'web') fail('dsh.client.platform must be "web" for a browser-side plugin, got: ' + String(platform))
  else pass('dsh.client.platform = web')

  const clientExport = pkg.exports && pkg.exports['./client']
  const clientEntry = typeof clientExport === 'string' ? clientExport : clientExport && clientExport.default
  if (typeof clientEntry !== 'string') fail('exports["./client"] is missing — the host serves the browser bundle from it')
  else if (!exists(clientEntry)) fail('exports["./client"] points at a missing file: ' + clientEntry)
  else pass('client entry exists: ' + clientEntry)

  if (dsh.compatibility === undefined) warn('no dsh.compatibility.dshReleases map — the market cannot show which DSH releases you verified')
  else pass('compatibility map present: ' + JSON.stringify(dsh.compatibility.dshReleases || {}))

  /* ------------------------------------------------------------ file set */

  const files = Array.isArray(pkg.files) ? pkg.files : null
  if (files === null) fail('no "files" whitelist — npm would pack the whole directory')
  else {
    for (const entry of files) {
      if (!exists(entry)) fail('files entry does not exist: ' + entry)
    }
    const forbidden = files.filter((entry) => /(^|\/)(node_modules|\.design-refs|UI Flow Mapper|tools\/\.tmp)(\/|$)/.test(entry))
    if (forbidden.length > 0) fail('files whitelist leaks non-shippable paths: ' + forbidden.join(', '))
    else pass('no user data or third-party text in the whitelist')

    const mustShip = ['cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'README.md', 'LICENSE']
    const missing = mustShip.filter((needed) => !files.some((entry) => needed === entry || needed.indexOf(entry + '/') === 0))
    if (missing.length > 0) fail('files whitelist does not cover: ' + missing.join(', '))
    else pass('whitelist covers the patch, both halves of the plugin, the README and the LICENSE')
  }

  if (pkg.scripts === undefined || typeof pkg.scripts.build !== 'string') fail('no "build" script — nobody could rebuild the bundle')
  else pass('build script: ' + pkg.scripts.build)

  /* --------------------------------------------- identity across the files */

  if (typeof patch === 'string' && exists(patch)) {
    const patchText = readText(patch)
    const names = Array.from(patchText.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)).map((match) => match[1])
    if (names.length === 0) fail('cordis patch declares no plugin name')
    else if (names.indexOf(pkg.name) < 0) fail('cordis patch names ' + names.join(', ') + ' but package.json is named ' + pkg.name)
    else pass('cordis patch registers the same name as package.json')
  }

  if (typeof clientEntry === 'string' && exists(clientEntry)) {
    const bundle = readText(clientEntry)
    if (bundle.indexOf('window.__ModuleLoader__.load') < 0) fail(clientEntry + ' is not a DSH client bundle (no __ModuleLoader__.load)')
    else pass('bundle uses the __ModuleLoader__ envelope')
    const idMatch = /id:\s*"([^"]+)"/.exec(bundle)
    if (idMatch === null) fail('bundle declares no module id')
    else if (idMatch[1] !== pkg.name) fail('bundle id is ' + idMatch[1] + ' but package.json is named ' + pkg.name)
    else pass('bundle id matches the package name')
  }

  /* -------------------------------------------------- is the artifact fresh? */

  const bundlePath = path.join(ROOT, typeof clientEntry === 'string' ? clientEntry : 'lib/client.js')
  if (fs.existsSync(bundlePath)) {
    const bundleTime = fs.statSync(bundlePath).mtimeMs
    const srcDir = path.join(ROOT, 'src', 'client')
    const newestSource = fs.existsSync(srcDir)
      ? Math.max(...fs.readdirSync(srcDir).filter((name) => name.endsWith('.js')).map((name) => fs.statSync(path.join(srcDir, name)).mtimeMs))
      : 0
    if (newestSource > bundleTime + 1000) fail('lib/client.js is older than src/client/*.js — run `npm run build` before publishing')
    else pass('the shipped bundle is not older than its sources')
  } else {
    fail('no built client bundle at ' + path.relative(ROOT, bundlePath))
  }

  if (exists('lib/index.js')) {
    const host = readText('lib/index.js')
    if (!/export\s*\{[^}]*apply/.test(host) && !/export\s+function\s+apply/.test(host)) fail('lib/index.js does not export apply()')
    else pass('host half exports apply()')
  }
}

/* --------------------------------------------------------------- the report */

console.log('\ndsh-ui-flow-mapper — publication preflight\n')
for (const line of passes) console.log('  ok    ' + line)
for (const line of warnings) console.log('  warn  ' + line)
for (const line of errors) console.log('  FAIL  ' + line)
console.log('')

if (errors.length > 0) {
  console.log(errors.length + ' blocking problem(s) — fix them before publishing.')
  process.exit(1)
}
console.log('ready to publish' + (warnings.length > 0 ? ' (with ' + warnings.length + ' thing(s) only you can fill in)' : ''))
