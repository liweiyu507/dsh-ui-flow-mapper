// Read-only Electron `app.asar` reader — project tooling for DSH plugin work.
//
// Why: DSH's own client-side source ships *inside* C:\dsh\resources\app.asar
// (only native deps are unpacked next to it). To learn the real plugin API you
// must read that archive. This script parses the asar header and reads single
// entries without extracting the whole 120 MB file.
//
// Usage (args are read from a JSON job file to avoid shell quoting problems):
//   1) write tools/.tmp/job.json, e.g.
//      { "cmd": "list", "a1": "sidebar-right",
//        "out": "tools/.tmp/out.txt" }
//      cmd: list | cat | grep | dump
//        list <pathRegex>
//        cat  <exactInnerPath>                 -> writes the file itself to "out"
//        grep <pathRegex> <contentRegex>
//        dump <pathRegex> <outDir>
//   2) node tools/asar-read.mjs
//
// Defaults: asar = C:\dsh\resources\app.asar, job = tools/.tmp/job.json.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP = path.join(HERE, '.tmp')
fs.mkdirSync(TMP, { recursive: true })

const jobPath = process.env.ASAR_JOB || path.join(TMP, 'job.json')
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'))
const asarPath = job.asar || 'C:\\dsh\\resources\\app.asar'
const outPath = job.out || path.join(TMP, 'out.txt')
const lines = []
const say = (s) => lines.push(s)

// Find the JSON header by scanning for the first '{' and matching braces with
// string-awareness, instead of trusting the pickle length fields.
function extractJsonHeader(buf) {
  const start = buf.indexOf(0x7b /* { */, 8)
  if (start < 0) throw new Error('no JSON header found')
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < buf.length; i++) {
    const c = buf[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === 0x5c) esc = true
      else if (c === 0x22) inStr = false
      continue
    }
    if (c === 0x22) inStr = true
    else if (c === 0x7b) depth++
    else if (c === 0x7d) {
      depth--
      if (depth === 0) return { header: JSON.parse(buf.slice(start, i + 1).toString('utf8')), jsonEnd: i + 1 }
    }
  }
  throw new Error('unterminated JSON header')
}

function openAsar(file) {
  const fd = fs.openSync(file, 'r')
  const probe = Buffer.alloc(Math.min(4 * 1024 * 1024, fs.fstatSync(fd).size))
  fs.readSync(fd, probe, 0, probe.length, 0)
  const { header, jsonEnd } = extractJsonHeader(probe)
  // Data area starts after the aligned pickle payload that carries the header.
  const payloadSize = probe.readUInt32LE(4)
  const candidates = [8 + payloadSize, 8 + jsonEnd, 8 + ((jsonEnd + 3) & ~3)]
  return { fd, header, baseOffset: candidates[0], baseOffsetCandidates: candidates }
}

function walk(node, prefix, out) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? prefix + '/' + name : name, out)
  } else {
    out.push({ path: prefix, size: node.size ?? 0, offset: node.offset ? parseInt(node.offset, 10) : null, unpacked: !!node.unpacked })
  }
}

function readEntry(a, entry) {
  const b = Buffer.alloc(entry.size)
  fs.readSync(a.fd, b, 0, entry.size, a.baseOffset + entry.offset)
  return b
}

try {
  const a = openAsar(asarPath)
  const all = []
  walk(a.header, '', all)
  const files = all.filter((e) => !e.unpacked)

  if (job.cmd === 'list') {
    const re = job.a1 ? new RegExp(job.a1, 'i') : null
    const hit = files.filter((e) => !re || re.test(e.path))
    for (const e of hit) say(`${e.size}\t${e.path}`)
    say(`# total=${files.length} matched=${hit.length}`)
  } else if (job.cmd === 'cat') {
    const e = files.find((x) => x.path === job.a1)
    if (!e) say('NOT FOUND: ' + job.a1)
    else fs.writeFileSync(outPath, readEntry(a, e))
  } else if (job.cmd === 'grep') {
    const re = new RegExp(job.a1, 'i')
    const cre = new RegExp(job.a2)
    for (const e of files) {
      if (!re.test(e.path)) continue
      const ls = readEntry(a, e).toString('utf8').split('\n')
      let hit = false
      for (let i = 0; i < ls.length; i++) {
        if (cre.test(ls[i])) {
          if (!hit) { say(''); say('=== ' + e.path + ' ==='); hit = true }
          say(`${i + 1}: ${ls[i].slice(0, 500)}`)
        }
      }
    }
  } else if (job.cmd === 'dump') {
    const re = new RegExp(job.a1, 'i')
    let n = 0
    for (const e of files) {
      if (!re.test(e.path)) continue
      const dest = path.join(job.a2, e.path)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, readEntry(a, e))
      n++
    }
    say(`# dumped ${n} files to ${job.a2}`)
  } else {
    say('unknown cmd: ' + job.cmd)
  }
} catch (err) {
  say('ERROR: ' + ((err && err.stack) || err))
}
if (job.cmd !== 'cat') fs.writeFileSync(outPath, lines.join('\n'))
