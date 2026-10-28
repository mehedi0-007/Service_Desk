// Imported first by the global setup. It has to run before @prisma/client is loaded: Prisma reads
// .env on import, and since a variable that is already set is never overridden, the development
// settings would otherwise win. Variables set in the shell still take precedence over both files.
process.loadEnvFile('.env.test');
