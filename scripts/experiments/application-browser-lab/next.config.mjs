import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default {
  turbopack:{root},outputFileTracingRoot:root,
  serverExternalPackages: ['@browserbasehq/stagehand', '@browserbasehq/sdk', 'playwright-core'],
  outputFileTracingIncludes:{'/api/run':['./node_modules/playwright-core/**/*','./node_modules/@browserbasehq/stagehand/**/*']},
  poweredByHeader: false,
};
