const Generator = require('@asyncapi/generator');
const path = require('path');

async function generateDocs() {
  try {
    const generator = new Generator('@asyncapi/html-template', path.resolve('docs/ipc-api/'), {
      forceWrite: true,
      templateParams: {
        sidebarOrganization: 'byTags'
      }
    });

    await generator.generateFromFile(path.resolve('docs/asyncapi/teams-for-linux-ipc.yaml'));
    console.log('✅ AsyncAPI documentation generated successfully in docs/ipc-api/');
  } catch (error) {
    console.error('❌ Failed to generate documentation:', error.message);
    process.exit(1);
  }
}

generateDocs();