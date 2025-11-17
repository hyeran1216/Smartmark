const path = require('path');

module.exports = {
  entry: './offscreen-bert-source.js',
  output: {
    filename: 'offscreen-bert.bundle.js',
    path: path.resolve(__dirname),
    library: {
      type: 'window'
    }
  },
  mode: 'production',
  resolve: {
    extensions: ['.js'],
    fallback: {
      "fs": false,
      "path": false,
      "crypto": false
    }
  },
  performance: {
    hints: false,
    maxAssetSize: 5000000,
    maxEntrypointSize: 5000000
  }
};

