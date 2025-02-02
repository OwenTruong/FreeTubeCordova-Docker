const path = require('path')
const fs = require('fs')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const VueLoaderPlugin = require('vue-loader/lib/plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const JsonMinimizerPlugin = require('json-minimizer-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const ProcessLocalesPlugin = require('./ProcessLocalesPlugin')
const CordovaPlugin = require('./CordovaPlugin')

const isDevMode = process.env.NODE_ENV === 'development'

const config = {
  name: 'cordova',
  mode: process.env.NODE_ENV,
  devtool: isDevMode ? 'eval-cheap-module-source-map' : false,
  entry: {
    web: path.join(__dirname, '../src/renderer/main.js'),
  },
  output: {
    path: path.join(__dirname, '../dist/cordova/www'),
    filename: '[name].js',
  },
  externals: [
    {
      electron: '{}',
      cordova: 'cordova',
      'music-controls': 'MusicControls',
      'universal-links': 'universalLinks'
    }
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          compilerOptions: {
            whitespace: 'condense',
          }
        }
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
          },
          {
            loader: 'css-loader',
            options: {
              esModule: false
            }
          },
          {
            loader: 'sass-loader',
            options: {
              implementation: require('sass')
            }
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader
          },
          {
            loader: 'css-loader',
            options: {
              esModule: false
            }
          }
        ],
      },
      {
        test: /\.(png|jpe?g|gif|tif?f|bmp|webp|svg)(\?.*)?$/,
        type: 'asset/resource',
        generator: {
          filename: 'imgs/[name][ext]'
        }
      },
      {
        test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name][ext]'
        }
      },
    ],
  },
  // webpack defaults to only optimising the production builds, so having this here is fine
  optimization: {
    minimizer: [
      '...', // extend webpack's list instead of overwriting it
      new JsonMinimizerPlugin({
        exclude: /\/locales\/.*\.json/
      }),
      new CssMinimizerPlugin()
    ]
  },
  node: {
    __dirname: true,
    __filename: isDevMode,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.IS_ELECTRON': false,
      'process.env.IS_ELECTRON_MAIN': false,
      'process.env.IS_CORDOVA': true,

      // video.js' vhs-utils supports both atob() in web browsers and Buffer in node
      // As the FreeTube web build only runs in web browsers, we can override their check for atob() here: https://github.com/videojs/vhs-utils/blob/main/src/decode-b64-to-uint8-array.js#L3
      // overriding that check means we don't need to include a Buffer polyfill
      // https://caniuse.com/atob-btoa

      // NOTE FOR THE FUTURE: this override won't work with vite as their define does a find and replace in the code for production builds,
      // but uses globals in development builds to save build time, so this would replace the actual atob() function with true if used with vite
      // this works in webpack as webpack does a find and replace in the source code for both development and production builds
      // https://vitejs.dev/config/shared-options.html#define
      // https://webpack.js.org/plugins/define-plugin/
      'window.atob': true
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    new HtmlWebpackPlugin({
      excludeChunks: ['processTaskWorker'],
      filename: 'index.html',
      template: path.resolve(__dirname, '../src/index.ejs'),
      nodeModules: false,
      inject: false
    }),
    new VueLoaderPlugin(),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css',
    })
  ],
  resolve: {
    alias: {
      vue$: 'vue/dist/vue.esm.js',
      'jintr': 'jintr-patch',
      'youtubei.js$': 'youtubei.js/web',
      // video.js's mpd-parser uses @xmldom/xmldom so that it can support both node and web browsers
      // As FreeTube only runs in electron and web browsers, we can use the native DOMParser class, instead of the "polyfill"
      // https://caniuse.com/mdn-api_domparser
      '@xmldom/xmldom$': path.resolve(__dirname, '_domParser.js')
    },
    fallback: {
      'fs/promises': path.resolve(__dirname, '_empty.js'),
      path: require.resolve('path-browserify'),
    },
    extensions: ['.js', '.vue']
  },
  target: 'web',
}

const processLocalesPlugin = new ProcessLocalesPlugin({
  compress: false,
  inputDir: path.join(__dirname, '../static/locales'),
  outputDir: 'static/locales',
})

config.plugins.push(
  new CordovaPlugin(),
  processLocalesPlugin,
  new webpack.DefinePlugin({
    'process.env.LOCALE_NAMES': JSON.stringify(processLocalesPlugin.localeNames),
    'process.env.GEOLOCATION_NAMES': JSON.stringify(fs.readdirSync(path.join(__dirname, '..', 'static', 'geolocations')))
  }),
  new CopyWebpackPlugin({
    patterns: [
      {
        from: path.join(__dirname, '../static/pwabuilder-sw.js'),
        to: path.join(__dirname, '../dist/cordova/www/pwabuilder-sw.js'),
      },
      {
        from: path.join(__dirname, '../_icons/iconColor.ico'),
        to: path.join(__dirname, '../dist/cordova/www/favicon.ico'),
      },
      {
        from: path.join(__dirname, '../static'),
        to: path.join(__dirname, '../dist/cordova/www/static'),
        globOptions: {
          dot: true,
          ignore: ['**/.*', '**/locales/**', '**/pwabuilder-sw.js', '**/dashFiles/**', '**/storyboards/**'],
        },
      },
    ]
  })
)

module.exports = config
