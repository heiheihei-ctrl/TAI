const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const generatedClientDir = path.join(backendRoot, 'node_modules', '.prisma', 'client');
const generatedSchemaPath = path.join(generatedClientDir, 'schema.prisma');
const generatedTypesPath = path.join(generatedClientDir, 'index.d.ts');
const prismaCliPath = require.resolve('prisma/build/index.js');

const result = spawnSync(
  process.execPath,
  [prismaCliPath, 'generate', '--schema=prisma/schema.prisma'],
  {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.status === 0) {
  process.exit(0);
}

function getSchemaStructure(schema) {
  const models = {};
  const modelPattern = /^model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^\}/gm;

  for (const match of schema.matchAll(modelPattern)) {
    const fields = match[2]
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/, 1)[0])
      .sort();
    models[match[1]] = fields;
  }

  return models;
}

function hasCurrentGeneratedClient() {
  if (!fs.existsSync(generatedSchemaPath) || !fs.existsSync(generatedTypesPath)) {
    return false;
  }

  const sourceSchema = fs.readFileSync(schemaPath, 'utf8');
  const generatedSchema = fs.readFileSync(generatedSchemaPath, 'utf8');
  if (
    JSON.stringify(getSchemaStructure(sourceSchema)) !==
    JSON.stringify(getSchemaStructure(generatedSchema))
  ) {
    return false;
  }

  const generatedTypes = fs.readFileSync(generatedTypesPath, 'utf8');
  const modelNames = [
    ...sourceSchema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^\}/gm),
  ]
    .filter((match) => !/^\s*@@ignore\s*$/m.test(match[2]))
    .map((match) => match[1]);

  return (
    generatedTypes.includes('export class PrismaClient') &&
    generatedTypes.includes('export namespace Prisma') &&
    generatedTypes.includes('$transaction') &&
    modelNames.every((modelName) =>
      generatedTypes.includes(`Prisma.${modelName}Delegate`),
    )
  );
}

if (hasCurrentGeneratedClient()) {
  console.warn(
    'Prisma Client generation failed, but the existing generated client matches the current schema. Continuing build.',
  );
  process.exit(0);
}

console.error(
  'Prisma Client generation failed and no current generated client is available. Build cannot continue.',
);
process.exit(result.status || 1);
