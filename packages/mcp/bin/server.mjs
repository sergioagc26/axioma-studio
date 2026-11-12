// Punto de entrada del servidor MCP (stdio). Se usa desde el plugin de Claude Code.
// stdout está reservado para el protocolo MCP: cualquier log va a stderr.
for (const k of ['log', 'info', 'warn', 'debug']) console[k] = (...a) => console.error(...a);

const { register } = await import('tsx/esm/api');
register();
const { main } = await import('../src/server.ts');
await main();
