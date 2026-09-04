#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SETUP_SHA256 = '8a7717ce66c25540956de5b66a8331b0e904e43bc8bf1b16f8caf87865033a54';
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const MEMBERS = new Map([
  ['F5999_AARON.dxl', 'AARON.dxl'],
  ['F6087_AARON.pll', 'AARON.pll'],
  ['F6057_AARON.exe', 'AARON.exe'],
  ['F6180_AARON_ScreenSaver.scr', 'AARON_ScreenSaver.scr'],
  ['F5315_acl5016.dll', 'acl5016.dll'],
  ['F5373_ktiCompress.dll', 'ktiCompress.dll'],
  ['F5431_license.dll', 'license.dll'],
  ['F5754_registry.dll', 'registry.dll'],
  ['F5812_upload.dll', 'upload.dll'],
  ['F6268_UserDocumentation.html', 'UserDocumentation.html'],
  ['Global_VC_MFC42ANSICore_f0.51D569E2_8A28_11D2_B962_006097C4DE24', 'mfc42.dll'],
  ['Global_VC_IRT_f0.3CE1F932_C090_11D2_977B_006097C4DE24', 'msvcirt.dll'],
]);

function usage() {
  console.error('Usage: node extract-installer.mjs <AARONsetup.exe> [output-directory] [7z-command]');
  process.exit(2);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

const [, , setupArgument, outputArgument = 'aaron-extracted', sevenZip = '7z'] = process.argv;
if (!setupArgument) usage();

const setupPath = resolve(setupArgument);
const outputPath = resolve(outputArgument);
const workPath = join(outputPath, '.work');
const msiPath = join(workPath, 'AARON.msi');
const msiOutputPath = join(workPath, 'msi');
const cabinetOutputPath = join(workPath, 'cabinet');
const applicationOutputPath = join(outputPath, 'application');
const installerOutputPath = join(outputPath, 'installer');

await rm(workPath, { recursive: true, force: true });
await mkdir(workPath, { recursive: true });
await mkdir(applicationOutputPath, { recursive: true });
await mkdir(installerOutputPath, { recursive: true });

const setup = await readFile(setupPath);
const setupHash = sha256(setup);
if (setupHash !== SETUP_SHA256) {
  throw new Error(
    `Unexpected ${basename(setupPath)} SHA-256 ${setupHash}; expected ${SETUP_SHA256}`,
  );
}

const msiOffset = setup.indexOf(OLE_MAGIC);
if (msiOffset < 0) throw new Error('Embedded MSI Compound File signature was not found');
const msi = setup.subarray(msiOffset);
await writeFile(msiPath, msi);

run(sevenZip, ['x', '-y', `-o${msiOutputPath}`, msiPath]);
run(sevenZip, ['x', '-y', `-o${cabinetOutputPath}`, join(msiOutputPath, 'Data.Cab')]);

const manifest = {
  source: {
    filename: basename(setupPath),
    bytes: setup.length,
    sha256: setupHash,
    embeddedMsiOffset: msiOffset,
    embeddedMsiBytes: msi.length,
    embeddedMsiSha256: sha256(msi),
  },
  files: [],
};

for (const [member, installedName] of MEMBERS) {
  const source = join(cabinetOutputPath, member);
  const destination = join(applicationOutputPath, installedName);
  await rm(destination, { force: true });
  await rename(source, destination);
  const contents = await readFile(destination);
  manifest.files.push({
    installedName,
    msiMember: member,
    bytes: contents.length,
    sha256: sha256(contents),
  });
}

manifest.files.sort((left, right) => left.installedName.localeCompare(right.installedName));
await writeFile(join(outputPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await copyFile(msiPath, join(installerOutputPath, 'AARON.msi'));
await rm(workPath, { recursive: true, force: true });

console.log(`Verified and extracted ${manifest.files.length} application files to ${applicationOutputPath}`);
