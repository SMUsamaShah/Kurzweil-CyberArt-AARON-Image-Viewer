#!/usr/bin/env node

// Wrap a standalone Ghidra function report as an honest, offline REA Evidence bundle.
// This script does not launch Ghidra or claim that REA's native Ghidra provider ran.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY = dirname(SCRIPT_PATH);
const EXPECTED_REA_VERSION = "3.2.1";
const PROVIDER = Object.freeze({
  id: "ghidra-standalone",
  name: "Ghidra standalone JSON report",
});
const OPERATION = "standalone_ghidra_function_analysis";
const WRAPPER_LIMITATIONS = Object.freeze([
  "Imported from a standalone Ghidra JSON report; REA did not launch or authenticate its native Ghidra provider session.",
  "The wrapper validates report structure and the reported subject-file SHA-256 binding; it does not authenticate the report origin or independently verify assembly and decompilation claims against the subject bytes.",
  "The report identifies the subject format as raw; REA 3.2.1 has no raw-binary Evidence subject format, so the subject is represented as unknown and the reported raw format is preserved in parameters and results.",
  "The schemaVersion 1 report does not identify the Ghidra execution environment; this Evidence record leaves environment null.",
]);

const usage = [
  "Usage:",
  "  node research/tools/rea-evidence-bundle.mjs <ghidra-report.json> <new-bundle.json> [--rea-package <rea-agents package directory>]",
  "",
  "The report must be schemaVersion 1 and describe one x86 raw-binary function.",
  "The reported subject file must exist and match subject.sha256. Existing output files are never replaced.",
  "The optional package path must point to an installed rea-agents 3.2.1 directory.",
].join("\n");

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage + "\n");
    return;
  }

  const packageRoot = await resolveReaPackage(options.reaPackagePath);
  const helpers = await loadReaHelpers(packageRoot);
  const reportPath = await realpath(resolve(options.reportPath));
  const reportFileStat = await stat(reportPath);
  if (!reportFileStat.isFile()) {
    throw new Error("The Ghidra report path is not a regular file.");
  }
  const reportBytes = await readFile(reportPath);
  let parsedReport;
  try {
    parsedReport = JSON.parse(reportBytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (cause) {
    throw new Error("The Ghidra report is not valid JSON.", { cause });
  }
  const report = validateReport(parsedReport);
  const reportSha256 = createHash("sha256").update(reportBytes).digest("hex");

  const reportedSubjectPath = isAbsolute(report.subject.path)
    ? report.subject.path
    : resolve(dirname(reportPath), report.subject.path);
  const subjectPath = await realpath(reportedSubjectPath);
  const subjectStat = await stat(subjectPath);
  if (!subjectStat.isFile()) {
    throw new Error("The report subject path is not a regular file.");
  }
  const observedSubjectSha256 = await sha256File(subjectPath);
  if (observedSubjectSha256 !== report.subject.sha256.toLowerCase()) {
    throw new Error(
      "The subject file SHA-256 does not match the digest in the Ghidra report. " +
        "Expected " + report.subject.sha256 + ", observed " + observedSubjectSha256 + ".",
    );
  }

  const provider = {
    ...PROVIDER,
    version: report.ghidraVersion,
  };
  const analysisProfile = helpers.createAnalysisProfile(
    { ...provider, version: report.ghidraVersion },
    {
      report_schema_version: report.schemaVersion,
      target_kind: "raw-function-bytes",
      target_format: "raw",
      architecture: report.subject.architecture,
      language_id: report.languageId,
      compiler_spec_id: report.compilerSpecId,
      image_base: report.imageBase,
      entry: report.entry,
      function_name: report.functionName,
      loader: report.loader,
    },
  );
  const limitations = uniqueStrings([
    ...report.limitations,
    ...WRAPPER_LIMITATIONS,
    ...(report.loader === null
      ? ["The standalone report does not identify a Ghidra loader; no loader choice is inferred."]
      : []),
  ]);
  const normalizedResult = {
    report_schema_version: report.schemaVersion,
    provenance: {
      kind: "standalone-ghidra-json-report",
      rea_native_provider_session: false,
      source_report_path: toPortablePath(reportPath),
      source_report_sha256: reportSha256,
    },
    ghidra_version: report.ghidraVersion,
    subject: {
      path: toPortablePath(subjectPath),
      sha256: observedSubjectSha256,
      reported_format: "raw",
      evidence_format: "unknown",
      architecture: report.subject.architecture,
    },
    language_id: report.languageId,
    compiler_spec_id: report.compilerSpecId,
    image_base: report.imageBase,
    entry: report.entry,
    function_name: report.functionName,
    loader: report.loader,
    assembly: report.assembly,
    decompilation: report.decompilation,
    limitations,
  };
  const evidence = helpers.createEvidence(
    {
      path: toPortablePath(subjectPath),
      sha256: observedSubjectSha256,
      format: "unknown",
      architecture: report.subject.architecture,
    },
    provider,
    {
      analysisProfile,
      operation: OPERATION,
      predicateType: "external.ghidra-standalone-function-analysis",
      parameters: {
        report_schema_version: report.schemaVersion,
        source_report_path: toPortablePath(reportPath),
        source_report_sha256: reportSha256,
        source_subject_format: "raw",
        language_id: report.languageId,
        compiler_spec_id: report.compilerSpecId,
        image_base: report.imageBase,
        entry: report.entry,
        function_name: report.functionName,
        loader: report.loader,
        rea_native_provider_session: false,
      },
      rawResult: parsedReport,
      result: normalizedResult,
      confidence: "observed",
      authority: "shipped-artifact",
      environment: null,
      limitations,
      locations: [{ kind: "address", address: report.entry }],
      evidenceLinks: [],
    },
  );

  const ledger = new helpers.EvidenceLedger();
  const recorded = ledger.record(evidence);
  if (!recorded.ok) {
    throw new Error("REA rejected the generated Evidence record.", { cause: recorded.error });
  }
  const bundle = helpers.parseEvidenceBundle(ledger.export());
  const written = await helpers.writeEvidenceBundle(bundle, resolve(options.outputPath), false);
  if (!written.ok) {
    throw new Error("Could not write the new Evidence bundle.", { cause: written.error });
  }

  process.stdout.write(
    JSON.stringify(
      {
        output_path: written.value.path,
        output_bytes: written.value.bytes,
        records: bundle.records.length,
        evidence_id: evidence.evidence_id,
        provider: evidence.provider,
        operation: evidence.operation,
        subject: evidence.subject,
        source_report_sha256: reportSha256,
      },
      null,
      2,
    ) + "\n",
  );
};

const parseArguments = (args) => {
  const positional = [];
  let reaPackagePath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--rea-package") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--rea-package requires a package directory path.\n\n" + usage);
      }
      reaPackagePath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--rea-package=")) {
      reaPackagePath = argument.slice("--rea-package=".length);
      if (reaPackagePath.length === 0) {
        throw new Error("--rea-package requires a package directory path.\n\n" + usage);
      }
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error("Unknown option: " + argument + "\n\n" + usage);
    }
    positional.push(argument);
  }
  if (positional.length !== 2) {
    throw new Error(usage);
  }
  return {
    help: false,
    reportPath: positional[0],
    outputPath: positional[1],
    reaPackagePath,
  };
};

const resolveReaPackage = async (explicitPath) => {
  const packageRoot = explicitPath === undefined
    ? resolve(SCRIPT_DIRECTORY, "../artifacts/rea-tools/rea-3.2.1/node_modules/rea-agents")
    : resolve(explicitPath);
  let metadata;
  try {
    metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  } catch (cause) {
    throw new Error("Could not read rea-agents package metadata at " + packageRoot, { cause });
  }
  if (metadata.name !== "rea-agents" || metadata.version !== EXPECTED_REA_VERSION) {
    throw new Error(
      "Expected rea-agents " + EXPECTED_REA_VERSION + " at the package path; observed " +
        String(metadata.name) + " " + String(metadata.version) + ".",
    );
  }
  return packageRoot;
};

const loadReaHelpers = async (packageRoot) => {
  const load = (relativePath) =>
    import(pathToFileURL(join(packageRoot, relativePath)).href);
  const [evidence, profile, bundle, ledger, files] = await Promise.all([
    load("dist/domain/evidence.js"),
    load("dist/domain/analysisProfile.js"),
    load("dist/domain/evidenceBundle.js"),
    load("dist/application/EvidenceLedger.js"),
    load("dist/application/EvidenceBundleFiles.js"),
  ]);
  return {
    createEvidence: evidence.createEvidence,
    createAnalysisProfile: profile.createAnalysisProfile,
    parseEvidenceBundle: bundle.parseEvidenceBundle,
    EvidenceLedger: ledger.EvidenceLedger,
    writeEvidenceBundle: files.writeEvidenceBundle,
  };
};

const validateReport = (input) => {
  const report = requireObject(input, "report");
  if (report.schemaVersion !== 1) {
    throw new Error("Expected report schemaVersion 1.");
  }
  const subject = requireObject(report.subject, "subject");
  const subjectPath = requireNonEmptyString(subject.path, "subject.path");
  const subjectSha256 = requireNonEmptyString(subject.sha256, "subject.sha256");
  if (!/^[a-f0-9]{64}$/iu.test(subjectSha256)) {
    throw new Error("subject.sha256 must be a 64-character hexadecimal SHA-256 digest.");
  }
  if (subject.format !== "raw") {
    throw new Error("Expected subject.format to be raw.");
  }
  if (subject.architecture !== "x86") {
    throw new Error("Expected subject.architecture to be x86.");
  }
  const assembly = requireArray(report.assembly, "assembly").map((instruction, index) => {
    const item = requireObject(instruction, "assembly[" + index + "]");
    return {
      address: requireAddress(item.address, "assembly[" + index + "].address"),
      bytes: requireNonEmptyString(item.bytes, "assembly[" + index + "].bytes"),
      text: requireString(item.text, "assembly[" + index + "].text"),
      flows: requireArray(item.flows, "assembly[" + index + "].flows"),
    };
  });
  const decompilation = requireObject(report.decompilation, "decompilation");
  if (typeof decompilation.completed !== "boolean") {
    throw new Error("decompilation.completed must be a boolean.");
  }
  const limitations = requireArray(report.limitations, "limitations").map((limitation, index) =>
    requireString(limitation, "limitations[" + index + "]"),
  );
  return {
    schemaVersion: report.schemaVersion,
    ghidraVersion: requireNonEmptyString(report.ghidraVersion, "ghidraVersion"),
    subject: {
      path: subjectPath,
      sha256: subjectSha256,
      format: subject.format,
      architecture: subject.architecture,
    },
    languageId: requireNonEmptyString(report.languageId, "languageId"),
    compilerSpecId: requireNonEmptyString(report.compilerSpecId, "compilerSpecId"),
    imageBase: requireAddress(report.imageBase, "imageBase"),
    entry: requireAddress(report.entry, "entry"),
    functionName: requireNonEmptyString(report.functionName, "functionName"),
    loader: report.loader === undefined || report.loader === null
      ? null
      : requireNonEmptyString(report.loader, "loader"),
    assembly,
    decompilation: {
      completed: decompilation.completed,
      text: requireNullableString(decompilation.text, "decompilation.text"),
      error: requireNullableString(decompilation.error, "decompilation.error"),
    },
    limitations,
  };
};

const requireObject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object.");
  }
  return value;
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(label + " must be an array.");
  }
  return value;
};

const requireString = (value, label) => {
  if (typeof value !== "string") {
    throw new Error(label + " must be a string.");
  }
  return value;
};

const requireNonEmptyString = (value, label) => {
  const result = requireString(value, label);
  if (result.trim().length === 0) {
    throw new Error(label + " must not be empty.");
  }
  return result.trim();
};

const requireNullableString = (value, label) => {
  if (value !== null && typeof value !== "string") {
    throw new Error(label + " must be a string or null.");
  }
  return value;
};

const requireAddress = (value, label) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return "0x" + value.toString(16);
  }
  throw new Error(label + " must be a non-empty address string or a non-negative safe integer.");
};

const sha256File = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
};

const uniqueStrings = (values) => [...new Set(values)];
const toPortablePath = (path) => path.replaceAll("\\", "/");

const invokedPath = process.argv[1] === undefined
  ? null
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write("rea-evidence-bundle: " + message + "\n");
    process.exitCode = 1;
  });
}
