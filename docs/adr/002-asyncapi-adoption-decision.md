# ADR-002: AsyncAPI Adoption Decision

## Status
DECIDED - 2025-08-16

## Context

During the IPC centralization initiative (ADR-001), AsyncAPI was proposed for documenting IPC events and enabling external integrations. Before proceeding with full AsyncAPI adoption, practical investigation spikes were conducted to validate the benefits versus complexity.

## Question
Should Teams for Linux adopt AsyncAPI for IPC documentation and external integrations?

## Investigation Methodology

### Practical Spikes Conducted
1. **MQTT Integration Spike**: Tested publishing IPC events to MQTT brokers
2. **Webhook Integration Spike**: Tested delivering IPC events via webhooks
3. **Comparative Analysis**: Evaluated AsyncAPI benefits vs. simpler alternatives

### Key Findings

#### Technical Feasibility ✅
- External integrations (MQTT, webhooks) are completely feasible
- Schema validation works effectively for message consistency
- Event transformation patterns are straightforward to implement
- Error handling and retry mechanisms function properly

#### AsyncAPI Value Assessment ❓
- **Schema Definition**: JSON schemas provide equivalent validation capabilities
- **Documentation**: HTML generation adds toolchain complexity without clear benefits
- **Code Generation**: No meaningful advantages over hand-written integration code
- **Maintenance**: AsyncAPI toolchain introduces dependencies and potential fragility

#### Critical Gaps Identified ⚠️
- **No concrete external integration requirements** have been identified
- **No external consumers** currently need Teams for Linux IPC data
- **Documentation benefits** are theoretical without actual API consumers
- **Toolchain overhead** is significant for uncertain value proposition

## Decision

**❌ Do NOT adopt AsyncAPI at this time**

### Rationale

1. **Lack of External Requirements**: No concrete external systems require integration
2. **Complexity Without Value**: AsyncAPI toolchain adds significant complexity for theoretical benefits
3. **Simpler Alternatives Available**: JSON schemas + markdown documentation achieve validation and documentation goals
4. **Premature Optimization**: Adding AsyncAPI without clear requirements violates YAGNI principle

### Alternative Approach

**✅ Proceed with Simple IPC Organization**

1. **Focus on Core Objective**: Organize scattered IPC handlers without external integration complexity
2. **Use Simple Validation**: Add AJV with basic JSON schemas for critical handlers only
3. **Maintain Markdown Documentation**: Update existing `docs/ipc-api.md` with organized handler information
4. **Defer External Integration**: Wait for concrete external requirements before adding integration complexity

## Implementation Plan

### Phase 1: Remove AsyncAPI Infrastructure
- [ ] Remove AsyncAPI dependencies from package.json
- [ ] Remove AsyncAPI documentation generation scripts
- [ ] Keep generated HTML documentation as static reference
- [ ] Update tasks list to remove AsyncAPI integration tasks

### Phase 2: Simplify Validation Approach
- [ ] Add minimal AJV dependency for basic validation
- [ ] Create simple JSON schemas for critical IPC events only
- [ ] Implement validation as optional feature, not mandatory
- [ ] Focus on validation for security-sensitive handlers

### Phase 3: Continue Core Migration
- [ ] Proceed with Tasks 3.0-5.0 using simplified approach
- [ ] Organize handlers into logical modules
- [ ] Maintain backward compatibility during migration
- [ ] Update documentation as handlers are migrated

## Future Reconsideration Triggers

AsyncAPI adoption should be reconsidered if:

1. **Concrete External Requirements Emerge**: Actual external systems need IPC data
2. **Multiple Integration Points**: More than 2-3 external integrations are required
3. **Contract Management Needs**: External teams require formal API contracts
4. **Compliance Requirements**: Formal API documentation becomes mandatory

## Consequences

### Positive
- ✅ Reduced complexity and maintenance burden
- ✅ Faster implementation of core IPC organization
- ✅ No external dependencies for core functionality
- ✅ Simpler developer onboarding and maintenance

### Negative
- ❌ Need to rebuild if external integrations become critical
- ❌ Manual maintenance of API documentation
- ❌ Potential rework if formal API contracts become required

### Mitigation
- Keep AsyncAPI research artifacts for future reference
- Design IPC organization to support future schema addition
- Monitor for concrete external integration requirements
- Maintain flexibility to add AsyncAPI later if needed

## Related Decisions
- [ADR-001: Simplified IPC Centralization](001-simplified-ipc-centralization.md)

## References
- [AsyncAPI Integration Investigation](../research/asyncapi-integration-investigation.md)
- [MQTT Integration Spike](../../spikes/mqtt-integration-spike.js)
- [Webhook Integration Spike](../../spikes/webhook-integration-spike.js)
- [IPC Organization Task List](../../tasks/tasks-prd-ipc-centralization.md)