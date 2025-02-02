const pkg = require('../../package.json')
const invidiousInstancesList = require('../../static/invidious-instances.json')
const fs = require('fs')
const util = require('util')
const xml2js = require('xml2js')
const parseXMLString = util.promisify(xml2js.parseString)
const createXMLStringFromObject = (obj) => {
  const builder = new xml2js.Builder()
  return builder.buildObject(obj)
}

module.exports = (async () => {
  const configXML = await parseXMLString((await util.promisify(fs.readFile)('./src/cordova/config.xml')).toString())
  configXML.widget.$.id = `io.freetubeapp.${pkg.name}`
  const versionParts = pkg.version.split('-')
  const versionNumbers = versionParts[0].split('.')
  const [major, minor, patch] = versionNumbers
  let build = 0
  if (versionParts.length > 2) {
    // if the build number comes after -{environment}-
    build = versionParts[2]
  } else if (versionNumbers.length > 3) {
    // if the build number comes after a final .
    build = parseInt(versionNumbers[3])
  }
  // eslint-disable-next-line
  configXML.widget.$['android-versionCode'] = `${major * 10000000 + minor * 10000000 + patch * 1000 + build * 1}`
  configXML.widget.$.version = pkg.version
  configXML.widget.author[0].$.email = pkg.author.email
  configXML.widget.author[0]._ = pkg.author.name
  configXML.widget.author[0].$.href = pkg.author.url
  configXML.widget.name[0] = pkg.productName
  configXML.widget.description[0] = pkg.description
  for (let i = 0; i < invidiousInstancesList.length; i++) {
    const { url } = invidiousInstancesList[i]
    configXML.widget['universal-links'][0].host.push({ $: { name: url.replace('https://', ''), scheme: 'https', event: 'youtube' } })// treat invidious instance links the same as links on youtube domains: youtube.com & m.youtube.com
  }
  const configXMLString = createXMLStringFromObject(configXML)
  return { string: configXMLString, object: configXML }
})()
