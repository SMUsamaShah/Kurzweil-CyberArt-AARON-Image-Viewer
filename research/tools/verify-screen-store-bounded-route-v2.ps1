# Read-only receipt validation shared by the V2 launcher and triplet coordinator.
# Dot-source this file, then call Assert-ScreenStoreBoundedRouteV2. No oracle is launched.
function Assert-ScreenStoreBoundedRouteV2 {
    param([Parameter(Mandatory = $true)]$Receipt,
        [Parameter(Mandatory = $true)][string]$PayloadSha256,
        [Parameter(Mandatory = $true)][uint32]$LiveEntry,
        [Parameter(Mandatory = $true)][uint32]$ProcessId)

    function Need-V2([bool]$Condition, [string]$Message) {
        if (-not $Condition) { throw "V2 bounded-route receipt: $Message" }
    }
    function Num-V2($Value) {
        Need-V2 ($Value -is [string] -and $Value -cmatch '^0x[0-9a-f]{8,16}$') 'invalid hexadecimal value'
        return [Convert]::ToUInt64($Value.Substring(2), 16)
    }
    function Hex-V2([uint64]$Value) { return ('0x{0:x8}' -f $Value) }
    function At-V2([uint32]$Offset) { return (Hex-V2 ([uint64]$LiveEntry + $Offset)) }
    function Payload-V2($Check, [string]$Phase) {
        Need-V2 ($Check.phase -ceq $Phase -and $Check.exactMatch -eq $true -and
            $Check.address -ceq (Hex-V2 $LiveEntry) -and $Check.bytesRequested -eq 1224 -and
            $Check.bytesRead -eq 1224 -and $Check.observedSha256 -ceq $PayloadSha256 -and
            $Check.expectedSha256 -ceq $PayloadSha256) "payload mismatch or missing comparison at $Phase"
    }

    Need-V2 ($LiveEntry -gt 0 -and ([uint64]$LiveEntry + 1224) -le 0x100000000L) 'entry/payload range invalid'
    Need-V2 ($PayloadSha256 -cmatch '^[0-9a-f]{64}$') 'payload hash invalid'
    $counts = @{ 'alternate-2b9' = 5; 'alternate-324' = 7; 'alternate-363' = 9; 'direct-331' = 10 }
    $outcome = [string]$Receipt.pathOutcome
    Need-V2 ($counts.ContainsKey($outcome)) 'unknown or absent path outcome'
    Need-V2 ($Receipt.schemaVersion -eq 2 -and $Receipt.accepted -eq $true -and
        $Receipt.captureCompleted -eq $true -and $Receipt.terminalInstructionNotYetExecuted -eq $true -and
        $Receipt.reached331 -eq ($outcome -ceq 'direct-331') -and
        $Receipt.terminalReason -ceq "bounded-route-$outcome" -and -not $Receipt.captureError -and
        $Receipt.payloadBytes -eq 1224 -and $Receipt.payloadSha256 -ceq $PayloadSha256 -and
        $Receipt.liveEntry -ceq (Hex-V2 $LiveEntry) -and $Receipt.processId -eq $ProcessId -and
        $Receipt.debuggerAttached -eq $true -and $Receipt.breakpointsArmedBeforeRelease -eq $true -and
        $Receipt.readyPauseReleased -eq $true -and $Receipt.debugRegistersRestored -eq $true -and
        $Receipt.detachSucceeded -eq $true -and @($Receipt.cleanupErrors).Count -eq 0) 'completion or cleanup gate failed'
    $cleanup = $Receipt.cleanupReceipt
    Need-V2 ($cleanup.restoreAttempted -eq $true -and $cleanup.restoreSucceeded -eq $true -and
        $cleanup.pendingEventContinued -eq $true -and $cleanup.detachAttempted -eq $true -and
        $cleanup.detached -eq $true -and $cleanup.releaseMarkerCreated -eq $true -and
        $cleanup.killOnExitFallbackUsed -eq $false -and $cleanup.processTerminationConfirmed -eq $false -and
        @($cleanup.cleanupErrors).Count -eq 0) 'cleanup receipt incomplete'
    $events = @($Receipt.events)
    Need-V2 ($events.Count -eq $counts[$outcome]) 'event count does not match outcome'
    $target = [string]$Receipt.ediTarget
    $continuation = At-V2 0x2a8
    Need-V2 ((Num-V2 $target) -gt 0 -and $target -cne $continuation) 'invalid initial dynamic target'
    # Each descriptor is kind, EIP, fired slot, DR0, DR1, DR7 low byte.
    $firstSlot = if ($outcome -ceq 'alternate-2b9') { 0 } else { 1 }
    $firstSuccessor = if ($firstSlot -eq 0) { At-V2 0x2b9 } else { At-V2 0x2bc }
    $expected = [Collections.Generic.List[object]]::new()
    $expected.Add(@('source-hit', (At-V2 0x2a6), 0, (At-V2 0x2a6), (Hex-V2 0), 1))
    $expected.Add(@('target-entry', $target, 0, $target, $continuation, 5))
    $expected.Add(@('call-return', $continuation, 1, $target, $continuation, 4))
    $expected.Add(@('branch-hit', (At-V2 0x2b7), 0, (At-V2 0x2b7), (Hex-V2 0), 1))
    $expected.Add(@('branch-successor', $firstSuccessor, $firstSlot, (At-V2 0x2b9), (At-V2 0x2bc), 5))
    if ($events.Count -ge 7) {
        $tagSlot = if ($outcome -ceq 'alternate-324') { 1 } else { 0 }
        $tagSuccessor = if ($tagSlot -eq 1) { At-V2 0x324 } else { At-V2 0x2c5 }
        $expected.Add(@('tag-branch', (At-V2 0x2c3), 0, (At-V2 0x2c3), (Hex-V2 0), 1))
        $expected.Add(@('tag-successor', $tagSuccessor, $tagSlot, (At-V2 0x2c5), (At-V2 0x324), 5))
    }
    if ($events.Count -ge 9) {
        $equalitySlot = if ($outcome -ceq 'alternate-363') { 1 } else { 0 }
        $equalitySuccessor = if ($equalitySlot -eq 1) { At-V2 0x363 } else { At-V2 0x2cd }
        $expected.Add(@('equality-branch', (At-V2 0x2c7), 0, (At-V2 0x2c7), (Hex-V2 0), 1))
        $expected.Add(@('equality-successor', $equalitySuccessor, $equalitySlot, (At-V2 0x2cd), (At-V2 0x363), 5))
    }
    if ($events.Count -eq 10) { $expected.Add(@('jump-target', (At-V2 0x331), 0, (At-V2 0x331), (Hex-V2 0), 1)) }
    for ($i = 0; $i -lt $events.Count; $i++) {
        $event = $events[$i]; $want = $expected[$i]; $regs = $event.registers
        Need-V2 ($event.kind -ceq $want[0] -and $event.order -eq ($i + 1) -and $event.slot -eq $want[2] -and
            $event.threadId -eq $Receipt.selectedThreadId -and $event.processId -eq $ProcessId -and
            $regs.threadId -eq $Receipt.selectedThreadId -and $regs.eip -ceq $want[1] -and
            $regs.ebp -ceq $Receipt.sourceEbp -and $regs.dr0 -ceq $want[3] -and $regs.dr1 -ceq $want[4] -and
            ((Num-V2 $regs.dr7) -band 0xff) -eq $want[5] -and ((Num-V2 $regs.dr7) -band 0xffff0000L) -eq 0 -and
            ((Num-V2 $regs.dr6) -band 0xe00f) -eq (1 -shl [int]$want[2]) -and
            ((Num-V2 $regs.eflags) -band 0x100) -eq 0 -and
            $event.exception.firstChance -eq 1 -and $event.exception.threadId -eq $Receipt.selectedThreadId -and
            $event.exception.code -cin @('0x80000004', '0x4000001e') -and
            (Num-V2 $event.exception.exceptionAddress) -eq (Num-V2 $regs.eip)) "hardware event $($i + 1) failed cause/address/thread/frame checks"
    }
    $source = $events[0]; $entry = $events[1]; $returned = $events[2]
    Need-V2 ($source.details.callBytesHex -ceq 'ffd7' -and $source.details.continuationBytesHex -ceq '8945bc' -and
        $source.details.ediTarget -ceq $target -and $source.registers.edi -ceq $target -and
        $source.registers.esp -ceq $Receipt.sourceEsp -and $entry.registers.edi -ceq $target -and
        (Num-V2 $entry.registers.esp) + 4 -eq (Num-V2 $source.registers.esp) -and
        $entry.details.returnAddressAtEsp -ceq $continuation -and $entry.details.espEqualsSourceMinusFour -eq $true -and
        $entry.details.targetWindowAtEntryHex -ceq $source.details.targetWindowAtSourceHex -and
        $entry.stackAtEspHex.Substring(0, 8) -ceq (([BitConverter]::ToString([BitConverter]::GetBytes([uint32](Num-V2 $continuation)))) -replace '-', '').ToLowerInvariant() -and
        $returned.details.captureBeforeContinuationInstruction -eq $true -and $returned.details.localStoreExecuted -eq $false -and
        $returned.details.eaxReturnValue -ceq $returned.registers.eax) 'initial CALL push, target entry, or return observation mismatch'
    # Return ESP and its recorded delta are observations; no stack-cleanup ABI is assumed.
    $branchSpecs = [Collections.Generic.List[object]]::new()
    $branchSpecs.Add(@(3, '7503', 0x2b7, 0x2b9, 0x2bc, $false))
    if ($events.Count -ge 7) { $branchSpecs.Add(@(5, '755f', 0x2c3, 0x2c5, 0x324, $false)) }
    if ($events.Count -ge 9) { $branchSpecs.Add(@(7, '0f8496000000', 0x2c7, 0x2cd, 0x363, $true)) }
    foreach ($spec in $branchSpecs) {
        $branch = $events[[int]$spec[0]]; $successor = $events[[int]$spec[0] + 1]
        $b = $branch.details; $s = $successor.details
        $zf = (((Num-V2 $branch.registers.eflags) -band 0x40) -ne 0)
        $take = if ([bool]$spec[5]) { $zf } else { -not $zf }
        $slot = if ($take) { 1 } else { 0 }
        $predicted = if ($take) { At-V2 $spec[4] } else { At-V2 $spec[3] }
        Need-V2 ($b.branchAddress -ceq (At-V2 $spec[2]) -and $b.branchBytesHex -ceq $spec[1] -and
            $b.branchEflags -ceq $branch.registers.eflags -and $b.zeroFlag -eq $zf -and
            $b.predictedSuccessorSlot -eq $slot -and $b.predictedSuccessorAddress -ceq $predicted -and
            $b.fallthroughAddress -ceq (At-V2 $spec[3]) -and $b.takenAddress -ceq (At-V2 $spec[4]) -and
            $s.branchAddress -ceq $b.branchAddress -and $s.branchEflags -ceq $branch.registers.eflags -and
            $s.zeroFlagAtBranch -eq $zf -and $s.predictedSuccessorSlot -eq $slot -and
            $s.observedSuccessorSlot -eq $slot -and $successor.slot -eq $slot -and
            $s.predictedSuccessorAddress -ceq $predicted -and $s.observedSuccessorAddress -ceq $predicted -and
            $successor.registers.eip -ceq $predicted -and $s.observedEdgeMatchesPrediction -eq $true -and
            $s.fallthroughAddress -ceq (At-V2 $spec[3]) -and $s.takenAddress -ceq (At-V2 $spec[4])) "branch edge at $(At-V2 $spec[2]) does not match its flags/prediction"
    }
    Need-V2 ($Receipt.branchEflags -ceq $events[3].registers.eflags -and
        $Receipt.branchZeroFlag -eq $events[3].details.zeroFlag -and
        $Receipt.predictedSuccessorAddress -ceq $firstSuccessor -and $Receipt.observedSuccessorAddress -ceq $firstSuccessor -and
        $Receipt.observedSuccessorSlot -eq $firstSlot) 'initial branch summary mismatch'
    if ($outcome -ceq 'direct-331') {
        $jumpSource = $events[8].details; $jumpTarget = $events[9].details
        Need-V2 ($jumpSource.jumpSourceObserved -eq $true -and $jumpSource.jumpBytesHex -ceq 'eb62' -and
            $jumpSource.jumpTargetAddress -ceq (At-V2 0x331) -and $jumpSource.jumpInstructionNotYetExecuted -eq $true -and
            $jumpTarget.jumpSourceAddress -ceq (At-V2 0x2cd) -and $jumpTarget.jumpBytesHex -ceq 'eb62' -and
            $jumpTarget.predictedTargetAddress -ceq (At-V2 0x331) -and $jumpTarget.observedTargetAddress -ceq (At-V2 0x331) -and
            $jumpTarget.observedEdgeMatchesPrediction -eq $true -and $jumpTarget.captureBeforeTargetInstruction -eq $true -and
            $jumpTarget.targetBytesHex -ceq '8b467e') 'JMP source/target boundary mismatch'
    }

    Payload-V2 $Receipt.preArmPayloadComparison 'before-attach'
    $phases = @('immediately-before-arm') + @($expected | ForEach-Object { $_[0] })
    Need-V2 (@($Receipt.payloadRechecks).Count -eq $phases.Count) 'missing or extra full-payload recheck'
    for ($i = 0; $i -lt $phases.Count; $i++) { Payload-V2 $Receipt.payloadRechecks[$i] $phases[$i] }
    $instructionPhases = @('before-attach') + $phases
    $routeOffsets = @(0x2bc, 0x2c3, 0x2c5, 0x2c7, 0x2cd, 0x324, 0x331, 0x363)
    $routeBytes = @('8bd8', '755f', '3bc2', '0f8496000000', 'eb62', '8b9f9bfeffff', '8b467e', '8b45e4')
    Need-V2 (@($Receipt.routeInstructionRechecks).Count -eq $instructionPhases.Count -and
        @($Receipt.instructionRechecks).Count -eq (2 * $instructionPhases.Count)) 'instruction recheck count mismatch'
    for ($i = 0; $i -lt $instructionPhases.Count; $i++) {
        $route = $Receipt.routeInstructionRechecks[$i]
        Need-V2 ($route.phase -ceq $instructionPhases[$i] -and $route.allExact -eq $true -and @($route.sites).Count -eq 8) 'route recheck missing or unordered'
        for ($j = 0; $j -lt 8; $j++) {
            Need-V2 ($route.sites[$j].offset -ceq (Hex-V2 $routeOffsets[$j]) -and
                $route.sites[$j].address -ceq (At-V2 $routeOffsets[$j]) -and $route.sites[$j].bytesHex -ceq $routeBytes[$j]) 'route signature mismatch'
        }
        $call = $Receipt.instructionRechecks[2 * $i]; $branch = $Receipt.instructionRechecks[2 * $i + 1]
        Need-V2 ($call.phase -ceq $instructionPhases[$i] -and $call.callAddress -ceq (At-V2 0x2a6) -and
            $call.callBytesHex -ceq 'ffd7' -and $call.continuationAddress -ceq $continuation -and $call.continuationBytesHex -ceq '8945bc' -and
            $branch.phase -ceq $instructionPhases[$i] -and $branch.branchAddress -ceq (At-V2 0x2b7) -and
            $branch.branchBytesHex -ceq '7503' -and $branch.branchLength -eq 2 -and $branch.signedDisplacement -eq 3 -and
            $branch.fallthroughAddress -ceq (At-V2 0x2b9) -and $branch.fallthroughBytesHex -ceq 'ff578f' -and
            $branch.derivedTakenAddress -ceq (At-V2 0x2bc) -and $branch.expectedTakenAddress -ceq (At-V2 0x2bc)) 'call/branch instruction recheck mismatch'
    }
    # phase, old DR0, old DR1, old low byte, new DR0, new DR1, new low byte.
    $transitions = [Collections.Generic.List[object]]::new()
    $transitions.Add(@('return-to-branch', $target, $continuation, 4, (At-V2 0x2b7), (Hex-V2 0), 1))
    $transitions.Add(@('branch-to-successors', (At-V2 0x2b7), (Hex-V2 0), 1, (At-V2 0x2b9), (At-V2 0x2bc), 5))
    if ($events.Count -ge 7) {
        $transitions.Add(@('successor-to-tag-branch', (At-V2 0x2b9), (At-V2 0x2bc), 5, (At-V2 0x2c3), (Hex-V2 0), 1))
        $transitions.Add(@('tag-branch-to-successors', (At-V2 0x2c3), (Hex-V2 0), 1, (At-V2 0x2c5), (At-V2 0x324), 5))
    }
    if ($events.Count -ge 9) {
        $transitions.Add(@('tag-successor-to-equality-branch', (At-V2 0x2c5), (At-V2 0x324), 5, (At-V2 0x2c7), (Hex-V2 0), 1))
        $transitions.Add(@('equality-branch-to-successors', (At-V2 0x2c7), (Hex-V2 0), 1, (At-V2 0x2cd), (At-V2 0x363), 5))
    }
    if ($events.Count -eq 10) { $transitions.Add(@('jump-source-to-target', (At-V2 0x2cd), (At-V2 0x363), 5, (At-V2 0x331), (Hex-V2 0), 1)) }
    Need-V2 (@($Receipt.debugStateTransitions).Count -eq $transitions.Count) 'transition count mismatch'
    for ($i = 0; $i -lt $transitions.Count; $i++) {
        $t = $Receipt.debugStateTransitions[$i]; $want = $transitions[$i]
        Need-V2 ($t.phase -ceq $want[0] -and $t.threadId -eq $Receipt.selectedThreadId -and
            $t.oldDr0 -ceq $want[1] -and $t.oldDr1 -ceq $want[2] -and (Num-V2 $t.oldDr7LowByte) -eq $want[3] -and
            $t.newDr0 -ceq $want[4] -and $t.newDr1 -ceq $want[5] -and (Num-V2 $t.newDr7LowByte) -eq $want[6] -and
            ((Num-V2 $t.newDr7) -band 0xff) -eq $want[6] -and ((Num-V2 $t.newDr7) -band 0xffff0000L) -eq 0 -and
            ((Num-V2 $t.newDr6) -band 0xe00f) -eq 0 -and $t.trapFlagClear -eq $true) 'debug-register transition mismatch'
    }
    Need-V2 (@($Receipt.threadStateSnapshots).Count -gt 0 -and @($Receipt.debugStateRestorations).Count -gt 0) 'missing restoration evidence'
    foreach ($restore in @($Receipt.debugStateRestorations)) {
        Need-V2 ($restore.exactMatch -eq $true) 'restoration comparison failed'
        foreach ($reg in @('dr0', 'dr1', 'dr2', 'dr3', 'dr6', 'dr7')) {
            Need-V2 ($restore.saved.$reg -ceq $restore.restored.$reg) "restoration mismatch for $reg"
        }
    }
    foreach ($snapshot in @($Receipt.threadStateSnapshots)) {
        Need-V2 ($snapshot.activeSlotsBeforeHelper -eq $false -and $snapshot.trapFlagBeforeHelper -eq $false) 'unsafe initial debug state'
        $matches = @($Receipt.debugStateRestorations | Where-Object { $_.threadId -eq $snapshot.threadId })
        $exits = @($Receipt.debugEvents | Where-Object { $_.eventType -eq 4 -and $_.threadId -eq $snapshot.threadId -and $_.processId -eq $ProcessId })
        Need-V2 ($matches.Count -gt 0 -or ($snapshot.threadId -ne $Receipt.selectedThreadId -and $exits.Count -gt 0)) 'live thread lacks restoration'
        foreach ($restore in $matches) {
            foreach ($reg in @('dr0', 'dr1', 'dr2', 'dr3', 'dr6', 'dr7')) {
                Need-V2 ($restore.saved.$reg -ceq $snapshot.savedDebugState.$reg) 'restoration does not match original snapshot'
            }
        }
    }
}
