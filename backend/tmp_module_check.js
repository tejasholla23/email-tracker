try {
  require('./utils/parseEmailWithLLM');
  console.log('MODULE_LOADED');
} catch (err) {
  console.error('MODULE_LOAD_ERROR');
  console.error(err);
  process.exit(1);
}
