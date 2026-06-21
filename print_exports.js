try {
  const client = await import('@mysten/sui/client');
  console.log('sui/client keys:', Object.keys(client));
} catch (e) {
  console.log('failed to import @mysten/sui/client:', e.stack);
}
