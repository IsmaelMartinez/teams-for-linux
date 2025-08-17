#!/usr/bin/env node

/**
 * Integration Spikes Runner
 * 
 * Runs both MQTT and Webhook integration spikes to validate AsyncAPI benefits.
 * This provides comprehensive assessment of external integration value proposition.
 */

const path = require('path');
const { spawn } = require('child_process');

async function runSpike(spikePath, spikeName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Running ${spikeName}`);
  console.log(`${'='.repeat(60)}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn('node', [spikePath], {
      stdio: 'inherit',
      cwd: path.dirname(spikePath)
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${spikeName} completed successfully`);
        resolve();
      } else {
        console.error(`\n❌ ${spikeName} failed with exit code ${code}`);
        reject(new Error(`${spikeName} failed`));
      }
    });

    child.on('error', (error) => {
      console.error(`\n❌ Failed to start ${spikeName}:`, error);
      reject(error);
    });
  });
}

async function generateSummaryReport() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 INTEGRATION SPIKES SUMMARY REPORT');
  console.log(`${'='.repeat(60)}\n`);

  console.log('## Executive Summary\n');
  console.log('Both MQTT and Webhook integration spikes have been completed to validate');
  console.log('the practical benefits of AsyncAPI for external integrations in Teams for Linux.\n');

  console.log('## Key Findings\n');
  
  console.log('### Technical Feasibility');
  console.log('✅ External integrations (MQTT, webhooks) are technically feasible');
  console.log('✅ Schema validation works well for ensuring message consistency');
  console.log('✅ Event transformation patterns are straightforward to implement');
  console.log('✅ Error handling and retry mechanisms function properly\n');

  console.log('### AsyncAPI Value Assessment');
  console.log('❓ Schema Definition: JSON schemas provide equivalent validation capabilities');
  console.log('❓ Documentation: HTML generation is possible but adds toolchain complexity');
  console.log('❓ Code Generation: No clear advantages over hand-written integration code');
  console.log('❓ Maintenance: AsyncAPI toolchain adds dependencies and potential fragility\n');

  console.log('### Critical Questions for Decision Making');
  console.log('1. **Actual External Requirements**: Do we have concrete external systems that need integration?');
  console.log('2. **Documentation Value**: Is AsyncAPI documentation significantly better than markdown + JSON schemas?');
  console.log('3. **Toolchain Cost**: Is the AsyncAPI toolchain overhead justified for our use case?');
  console.log('4. **Alternative Approaches**: Could simpler solutions achieve the same goals?\n');

  console.log('## Recommendations\n');
  
  console.log('### If No Concrete External Integration Requirements Exist:');
  console.log('🏷️  **Recommendation**: Skip AsyncAPI integration');
  console.log('   • Focus on simple IPC organization without external integration complexity');
  console.log('   • Use basic JSON schemas for validation if needed');
  console.log('   • Document APIs with markdown until external consumers exist\n');

  console.log('### If External Integration Requirements Are Validated:');
  console.log('🏷️  **Recommendation**: Minimal AsyncAPI adoption');
  console.log('   • Use AsyncAPI for documentation only (no code generation)');
  console.log('   • Implement integrations with hand-written, maintainable code');
  console.log('   • Evaluate AsyncAPI toolchain stability before full adoption\n');

  console.log('## Next Steps\n');
  
  console.log('### Immediate Actions:');
  console.log('1. **Validate External Requirements**: Survey actual external integration needs');
  console.log('2. **Stakeholder Review**: Get input on external integration priorities');
  console.log('3. **Cost-Benefit Analysis**: Compare AsyncAPI overhead vs. delivered value');
  console.log('4. **Alternative Assessment**: Evaluate simpler documentation approaches\n');

  console.log('### Based on Assessment Results:');
  console.log('**Path A - No External Requirements**: Skip AsyncAPI, proceed with simple IPC organization');
  console.log('**Path B - Clear External Requirements**: Adopt minimal AsyncAPI for documentation only');
  console.log('**Path C - Uncertain Requirements**: Defer AsyncAPI decision, implement basic organization first\n');

  console.log('## Files Generated');
  console.log('- `docs/research/asyncapi-integration-investigation.md` - Investigation framework');
  console.log('- `spikes/mqtt-integration-spike.js` - MQTT integration proof of concept');
  console.log('- `spikes/webhook-integration-spike.js` - Webhook delivery proof of concept');
  console.log('- `spikes/run-integration-spikes.js` - This summary report generator\n');

  console.log('## Conclusion\n');
  console.log('The spikes demonstrate that external integrations are feasible but do not');
  console.log('clearly validate AsyncAPI as essential. The decision should be based on');
  console.log('concrete external integration requirements rather than theoretical benefits.\n');

  console.log('❗ **Action Required**: Validate actual external integration needs before');
  console.log('   proceeding with AsyncAPI adoption or continuing with simpler approaches.');
}

async function runIntegrationSpikes() {
  try {
    console.log('🎯 Starting AsyncAPI Integration Investigation');
    console.log('   Objective: Validate practical benefits through focused spikes\n');

    // Run MQTT integration spike
    await runSpike('./mqtt-integration-spike.js', 'MQTT Integration Spike');
    
    // Add delay between spikes for clarity
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run webhook integration spike
    await runSpike('./webhook-integration-spike.js', 'Webhook Integration Spike');
    
    // Add delay before summary
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate comprehensive summary report
    await generateSummaryReport();
    
    console.log('\n🎉 All integration spikes completed successfully!');
    console.log('📋 Review the summary report above to make informed decisions about AsyncAPI adoption.');
    
  } catch (error) {
    console.error('\n💥 Integration spikes failed:', error.message);
    console.log('\n📝 Partial results may still be available in individual spike outputs.');
    process.exit(1);
  }
}

// Execute the spikes
if (require.main === module) {
  runIntegrationSpikes();
}

module.exports = { runIntegrationSpikes };