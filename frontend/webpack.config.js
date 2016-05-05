var webpack = require('webpack');

module.exports = {
  entry: './src/app.ts',
  output: {
    filename: 'build/bundle.js'
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension. 
    extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js']
  },
  module: {
    loaders: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader` 
      { test: /\.tsx?$/, loader: 'ts-loader' },
      { test: /\.json$/, loader: "json"}
    ]
  },
  watchOptions: {
    poll: 300
  }
};