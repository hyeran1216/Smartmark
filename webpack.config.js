const path = require('path');

module.exports = {
  // Bundle the offscreen script to resolve @xenova/transformers
  entry: './scripts/offscreen-bert.js',
  output: {
    filename: 'offscreen-bert.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    module: true, // Output as ES Module
    library: {
      type: 'module', // Key change: Export as module
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true, // Required for module output
  },
  mode: 'production',
  resolve: {
    extensions: ['.js'],
    fallback: {
      "fs": false,
      "path": false,
      "crypto": false,
      "stream": false
    }
  },
  performance: {
    hints: false,
    maxAssetSize: 5000000,
    maxEntrypointSize: 5000000
  }
};

