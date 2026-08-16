import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateSwaggerSpec } from '../src/config/swagger.js';

async function main(): Promise<void> {
  const outputPath = resolve(process.cwd(), 'openapi.json');
  const spec = generateSwaggerSpec();

  await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI spec generated at ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error('Failed to generate OpenAPI spec', error);
  process.exit(1);
});
