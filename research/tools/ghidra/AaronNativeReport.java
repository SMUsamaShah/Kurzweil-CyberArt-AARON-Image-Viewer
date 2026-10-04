// Decode one exact PLL payload mapped from a live compiled function.
// @category AARON
// @runtime Java

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.GsonBuilder;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.framework.Application;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;

public class AaronNativeReport extends GhidraScript {
    private static String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length != 4) {
            throw new IllegalArgumentException("Expected output.json payload.bin entry-address function-name");
        }
        Path output = Path.of(args[0]);
        if (Files.exists(output)) throw new IllegalArgumentException("Output must be fresh");
        Path subject = Path.of(args[1]).toAbsolutePath();
        byte[] payload = Files.readAllBytes(subject);
        Address entry = currentProgram.getAddressFactory().getDefaultAddressSpace()
            .getAddress(args[2].replaceFirst("^0x", ""));
        if (!entry.equals(currentProgram.getMinAddress())) {
            throw new IllegalArgumentException("Payload memory block must start at the mapped entry");
        }
        byte[] imported = new byte[payload.length];
        if (currentProgram.getMemory().getBytes(entry, imported) != payload.length
            || !Arrays.equals(imported, payload)) {
            throw new IllegalArgumentException("Imported memory does not equal the payload file");
        }
        if (!disassemble(entry)) throw new IllegalStateException("Entry disassembly failed");
        Function fn = createFunction(entry, args[3]);
        if (fn == null) fn = getFunctionAt(entry);
        if (fn == null) throw new IllegalStateException("Function creation failed");

        List<Map<String, Object>> assembly = new ArrayList<>();
        InstructionIterator instructions = currentProgram.getListing().getInstructions(true);
        while (instructions.hasNext()) {
            Instruction instruction = instructions.next();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("address", "0x" + instruction.getAddress());
            row.put("offset", instruction.getAddress().subtract(entry));
            row.put("bytes", hex(instruction.getBytes()));
            row.put("text", instruction.toString());
            row.put("flowType", instruction.getFlowType().toString());
            row.put("flows", Arrays.stream(instruction.getFlows()).map(a -> "0x" + a).toList());
            row.put("fallThrough", instruction.getFallThrough() == null
                ? null : "0x" + instruction.getFallThrough());
            assembly.add(row);
        }

        DecompInterface decompiler = new DecompInterface();
        Map<String, Object> decompilation = new LinkedHashMap<>();
        try {
            if (!decompiler.openProgram(currentProgram)) {
                throw new IllegalStateException("Decompiler could not open the program");
            }
            DecompileResults result = decompiler.decompileFunction(fn, 60, monitor);
            decompilation.put("completed", result.decompileCompleted());
            decompilation.put("text", result.decompileCompleted()
                ? result.getDecompiledFunction().getC() : null);
            decompilation.put("error", result.getErrorMessage());
        } finally {
            decompiler.dispose();
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("schemaVersion", 1);
        report.put("ghidraVersion", Application.getApplicationVersion());
        report.put("subject", Map.of(
            "path", subject.toString(), "sha256", hex(MessageDigest.getInstance("SHA-256").digest(payload)),
            "format", "raw", "architecture", "x86", "bytes", payload.length));
        report.put("languageId", currentProgram.getLanguageID().toString());
        report.put("compilerSpecId", currentProgram.getCompilerSpec().getCompilerSpecID().toString());
        report.put("imageBase", "0x" + currentProgram.getImageBase());
        report.put("memoryBase", "0x" + currentProgram.getMinAddress());
        report.put("entry", "0x" + entry);
        report.put("functionName", args[3]);
        report.put("disassembledInstructions", assembly.size());
        report.put("assembly", assembly);
        report.put("decompilation", decompilation);
        report.put("limitations", List.of(
            "Standalone Ghidra raw import; not a REA native provider session.",
            "The selected x86 Windows compiler specification does not model Allegro Lisp's register ABI or tagged objects.",
            "Decompiler types, arguments and C expressions are analysis output, not recovered Lisp source.",
            "Indirect call destinations require live constant-slot or runtime evidence; raw bytes do not name symbols.",
            "Only reachable instructions decoded from the mapped entry are listed; the payload can also contain data."));
        Files.writeString(output, new GsonBuilder().disableHtmlEscaping().setPrettyPrinting()
            .create().toJson(report) + "\n");
        println("AARON report: " + output + " (" + assembly.size() + " instructions)");
    }
}
