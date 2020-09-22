const fs = require('fs')
const debugInfo = require('debug')('info')

module.exports = {
  /*
  ** Headers of the page
  */
  head: {
    title: 'starter',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'Nuxt.js project' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },
  /*
  ** Global CSS
  */
  css: ['~/assets/css/main.css'],
  /*
  ** Add axios globally
  */
  build: {
    vendor: ['axios'],
    /*
    ** Run ESLINT on save
    */
    extend (config, ctx) {
      // debugInfo(ctx)
      // if (ctx.isDev && ctx.isClient) {
      //   config.module.rules.push({
      //     enforce: 'pre',
      //     test: /\.(js|vue)$/,
      //     use: {
      //       loader: 'eslint-loader',
      //       options: {
      //         fix: true
      //       }
      //     },
      //     exclude: /(node_modules)/
      //   })
      // }
      // //
      //   config.target = 'node'
      //   config.externals = fs.readdirSync('node_modules').filter((x) => { return x !== '.bin'; })
    }
  },
  serverMiddleware: [
    // API middleware
    '~/api/index.js'
  ],
  plugins: [
    { src: '~plugins/iview', ssr: true }
  ],
  server: {
    port: 80, // default: 3000
    host: '0.0.0.0' // default: localhost
  }
}
