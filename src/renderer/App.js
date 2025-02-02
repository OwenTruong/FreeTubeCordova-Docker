import Vue, { defineComponent } from 'vue'
import { mapActions, mapMutations } from 'vuex'
import { ObserveVisibility } from 'vue-observe-visibility'
import FtFlexBox from './components/ft-flex-box/ft-flex-box.vue'
import TopNav from './components/top-nav/top-nav.vue'
import SideNav from './components/side-nav/side-nav.vue'
import FtNotificationBanner from './components/ft-notification-banner/ft-notification-banner.vue'
import FtPrompt from './components/ft-prompt/ft-prompt.vue'
import FtButton from './components/ft-button/ft-button.vue'
import FtToast from './components/ft-toast/ft-toast.vue'
import FtProgressBar from './components/ft-progress-bar/ft-progress-bar.vue'
import { marked } from 'marked'
import { IpcChannels } from '../constants'
import packageDetails from '../../package.json'
import { openExternalLink, openInternalPath, showToast } from './helpers/utils'
import cordova from 'cordova'
import 'core-js/stable'
import universalLinks from 'universal-links'

let ipcRenderer = null

Vue.directive('observe-visibility', ObserveVisibility)

export default defineComponent({
  name: 'App',
  components: {
    FtFlexBox,
    TopNav,
    SideNav,
    FtNotificationBanner,
    FtPrompt,
    FtButton,
    FtToast,
    FtProgressBar
  },
  data: function () {
    return {
      dataReady: false,
      hideOutlines: true,
      showUpdatesBanner: false,
      showBlogBanner: false,
      showReleaseNotes: false,
      updateBannerMessage: '',
      blogBannerMessage: '',
      latestBlogUrl: '',
      updateChangelog: '',
      changeLogTitle: '',
      lastExternalLinkToBeOpened: '',
      showExternalLinkOpeningPrompt: false,
      externalLinkOpeningPromptValues: [
        'yes',
        'no'
      ]
    }
  },
  computed: {
    showProgressBar: function () {
      return this.$store.getters.getShowProgressBar
    },
    isRightAligned: function () {
      return this.$i18n.locale === 'ar'
    },
    checkForUpdates: function () {
      return this.$store.getters.getCheckForUpdates
    },
    checkForBlogPosts: function () {
      return this.$store.getters.getCheckForBlogPosts
    },
    windowTitle: function () {
      const routeTitle = this.$route.meta.title
      if (routeTitle !== 'Channel' && routeTitle !== 'Watch' && routeTitle !== 'Hashtag') {
        let title =
        this.$route.meta.path === '/home'
          ? packageDetails.productName
          : `${this.$t(this.$route.meta.title)} - ${packageDetails.productName}`
        if (!title) {
          title = packageDetails.productName
        }
        return title
      } else {
        return null
      }
    },
    externalPlayer: function () {
      return this.$store.getters.getExternalPlayer
    },
    defaultInvidiousInstance: function () {
      return this.$store.getters.getDefaultInvidiousInstance
    },

    baseTheme: function () {
      return this.$store.getters.getBaseTheme
    },

    mainColor: function () {
      return this.$store.getters.getMainColor
    },

    secColor: function () {
      return this.$store.getters.getSecColor
    },

    systemTheme: function () {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    },

    externalLinkOpeningPromptNames: function () {
      return [
        this.$t('Yes'),
        this.$t('No')
      ]
    },

    externalLinkHandling: function () {
      return this.$store.getters.getExternalLinkHandling
    }
  },
  watch: {
    windowTitle: 'setWindowTitle',

    baseTheme: 'checkThemeSettings',

    mainColor: 'checkThemeSettings',

    secColor: 'checkThemeSettings',

    $route () {
      // react to route changes...
      // Hide top nav filter panel on page change
      this.$refs.topNav.hideFilters()
    }
  },
  created () {
    this.checkThemeSettings()
    this.setWindowTitle()
  },
  mounted: function () {
    if (process.env.IS_CORDOVA) {
      universalLinks.subscribe('youtube_shortended', (event) => {
        this.$router.push({ path: `/watch${event.path}` })
      })
      universalLinks.subscribe('youtube', (event) => {
        const { url } = event
        const uri = new URL(url)
        // handle youtube link expects the host to be youtube
        uri.host = 'youtube.com'
        this.handleYoutubeLink(uri.toString())
      })
      if ('plugins' in cordova && 'backgroundMode' in cordova.plugins) {
        const { backgroundMode } = cordova.plugins
        backgroundMode.setDefaults({
          title: 'FreeTube',
          // TODO ✏ add this to locale strings
          text: 'FreeTube is running in the background.'
        })
        backgroundMode.enable()
        backgroundMode.on('activate', () => {
          // By default android wants to pause videos in the background, this disables that "optimization"
          backgroundMode.disableWebViewOptimizations()
        })
      } else {
        console.error('Background mode plugin failed to load.')
      }
    }
    this.grabUserSettings().then(async () => {
      this.checkThemeSettings()

      await this.fetchInvidiousInstances()
      if (this.defaultInvidiousInstance === '') {
        await this.setRandomCurrentInvidiousInstance()
      }

      this.grabAllProfiles(this.$t('Profile.All Channels')).then(async () => {
        this.grabHistory()
        this.grabAllPlaylists()

        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) { // if the window was unfocused, the system theme might have changed
            this.watchSystemTheme()
          }
        })
        if (process.env.IS_ELECTRON) {
          ipcRenderer = require('electron').ipcRenderer
          this.setupListenersToSyncWindows()
          this.activateKeyboardShortcuts()
          this.activateIPCListeners()
          this.openAllLinksExternally()
          this.enableSetSearchQueryText()
          this.enableOpenUrl()
          await this.checkExternalPlayer()
        }
        this.watchSystemTheme()

        this.dataReady = true
        setTimeout(() => {
          if (process.env.IS_CORDOVA) {
            // hide the splashscreen
            navigator.splashscreen.hide()
          }
        }, 250)
        setTimeout(() => {
          this.checkForNewUpdates()
          this.checkForNewBlogPosts()
        }, 500)
      })

      this.$router.afterEach((to, from) => {
        this.$refs.topNav.navigateHistory()
      })
    })
  },
  methods: {
    checkThemeSettings: function () {
      const theme = {
        baseTheme: this.baseTheme || 'dark',
        mainColor: this.mainColor || 'mainRed',
        secColor: this.secColor || 'secBlue'
      }

      this.updateTheme(theme)
    },

    updateTheme: function (theme) {
      document.body.className = `${theme.baseTheme} main${theme.mainColor} sec${theme.secColor}`
      document.body.dataset.systemTheme = this.systemTheme
    },

    checkForNewUpdates: function () {
      if (this.checkForUpdates) {
        const requestUrl = 'https://api.github.com/repos/marmadilemanteater/freetubecordova/releases?per_page=1'
        // don't check for updates in nightly
        if (packageDetails.version.indexOf('nightly') === -1) {
          fetch(requestUrl)
            .then((response) => response.json())
            .then((json) => {
              const tagName = json[0].tag_name
              const tagNameParts = tagName.split('.')
              const versionNumber = tagNameParts[tagNameParts.length - 1]
              this.updateChangelog = marked.parse(json[0].body)
              this.changeLogTitle = json[0].name

              const message = this.$t('Version $ is now available!  Click for more details')
              this.updateBannerMessage = message.replace('$', versionNumber)
              const versionParts = packageDetails.version.split('.')
              const appVersion = versionParts[versionParts.length - 1]
              if (parseInt(versionNumber) > parseInt(appVersion)) {
                this.showUpdatesBanner = true
              }
            })
            .catch((error) => {
              console.error('errored while checking for updates', requestUrl, error)
            })
        }
      }
    },

    checkForNewBlogPosts: function () {
      if (this.checkForBlogPosts) {
        let lastAppWasRunning = localStorage.getItem('lastAppWasRunning')

        if (lastAppWasRunning !== null) {
          lastAppWasRunning = new Date(lastAppWasRunning)
        }

        fetch('https://write.as/freetube/feed/')
          .then(response => response.text())
          .then(response => {
            const xmlDom = new DOMParser().parseFromString(response, 'application/xml')

            const latestBlog = xmlDom.querySelector('item')
            const latestPubDate = new Date(latestBlog.querySelector('pubDate').textContent)

            if (lastAppWasRunning === null || latestPubDate > lastAppWasRunning) {
              const title = latestBlog.querySelector('title').textContent

              this.blogBannerMessage = this.$t('A new blog is now available, {blogTitle}. Click to view more', { blogTitle: title })
              this.latestBlogUrl = latestBlog.querySelector('link').textContent
              this.showBlogBanner = true
            }

            localStorage.setItem('lastAppWasRunning', new Date())
          })
      }
    },

    checkExternalPlayer: async function () {
      const payload = {
        externalPlayer: this.externalPlayer
      }
      this.getExternalPlayerCmdArgumentsData(payload)
    },

    handleUpdateBannerClick: function (response) {
      if (response !== false) {
        this.showReleaseNotes = true
      } else {
        this.showUpdatesBanner = false
      }
    },

    handleNewBlogBannerClick: function (response) {
      if (response) {
        openExternalLink(this.latestBlogUrl)
      }

      this.showBlogBanner = false
    },

    openDownloadsPage: function () {
      const url = 'https://github.com/MarmadileManteater/FreeTubeCordova/releases'
      openExternalLink(url)
      this.showReleaseNotes = false
      this.showUpdatesBanner = false
    },

    activateKeyboardShortcuts: function () {
      document.addEventListener('keydown', this.handleKeyboardShortcuts)
      document.addEventListener('mousedown', () => {
        this.hideOutlines = true
      })
    },

    activateIPCListeners: function () {
      // handle menu event updates from main script
      ipcRenderer.on('history-back', (_event) => {
        this.$refs.topNav.historyBack()
      })
      ipcRenderer.on('history-forward', (_event) => {
        this.$refs.topNav.historyForward()
      })
    },

    handleKeyboardShortcuts: function (event) {
      if (event.altKey) {
        switch (event.key) {
          case 'D':
          case 'd':
            this.$refs.topNav.focusSearch()
            break
        }
      }
      switch (event.key) {
        case 'Tab':
          this.hideOutlines = false
          break
        case 'L':
        case 'l':
          if ((process.platform !== 'darwin' && event.ctrlKey) ||
            (process.platform === 'darwin' && event.metaKey)) {
            this.$refs.topNav.focusSearch()
          }
          break
      }
    },

    openAllLinksExternally: function () {
      const isExternalLink = (event) => event.target.tagName === 'A' && !event.target.href.startsWith(window.location.origin)

      document.addEventListener('click', (event) => {
        if (isExternalLink(event)) {
          this.handleLinkClick(event)
        }
      })

      document.addEventListener('auxclick', (event) => {
        // auxclick fires for all clicks not performed with the primary button
        // only handle the link click if it was the middle button,
        // otherwise the context menu breaks
        if (isExternalLink(event) && event.button === 1) {
          this.handleLinkClick(event)
        }
      })
    },

    handleLinkClick: function (event) {
      const el = event.target
      event.preventDefault()

      // Check if it's a YouTube link
      const youtubeUrlPattern = /^https?:\/\/((www\.)?youtube\.com(\/embed)?|youtu\.be)\/.*$/
      const isYoutubeLink = youtubeUrlPattern.test(el.href)

      if (isYoutubeLink) {
        // `auxclick` is the event type for non-left click
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
        this.handleYoutubeLink(el.href, {
          doCreateNewWindow: event.type === 'auxclick'
        })
      } else if (this.externalLinkHandling === 'doNothing') {
        // Let user know opening external link is disabled via setting
        showToast(this.$t('External link opening has been disabled in the general settings'))
      } else if (this.externalLinkHandling === 'openLinkAfterPrompt') {
        // Storing the URL is necessary as
        // there is no other way to pass the URL to click callback
        this.lastExternalLinkToBeOpened = el.href
        this.showExternalLinkOpeningPrompt = true
      } else {
        // Open links externally
        openExternalLink(el.href)
      }
    },

    handleYoutubeLink: function (href, { doCreateNewWindow = false } = { }) {
      this.getYoutubeUrlInfo(href).then((result) => {
        switch (result.urlType) {
          case 'video': {
            const { videoId, timestamp, playlistId } = result

            const query = {}
            if (timestamp) {
              query.timestamp = timestamp
            }
            if (playlistId && playlistId.length > 0) {
              query.playlistId = playlistId
            }

            openInternalPath({
              path: `/watch/${videoId}`,
              query,
              doCreateNewWindow
            })
            break
          }

          case 'playlist': {
            const { playlistId, query } = result

            openInternalPath({
              path: `/playlist/${playlistId}`,
              query,
              doCreateNewWindow
            })
            break
          }

          case 'search': {
            const { searchQuery, query } = result

            openInternalPath({
              path: `/search/${encodeURIComponent(searchQuery)}`,
              query,
              doCreateNewWindow,
              searchQueryText: searchQuery
            })
            break
          }

          case 'hashtag': {
            const { hashtag } = result
            openInternalPath({
              path: `/hashtag/${encodeURIComponent(hashtag)}`,
              doCreateNewWindow
            })
            break
          }

          case 'channel': {
            const { channelId, subPath, url } = result

            openInternalPath({
              path: `/channel/${channelId}/${subPath}`,
              doCreateNewWindow,
              query: {
                url
              }
            })
            break
          }

          case 'invalid_url': {
            // Do nothing
            break
          }

          default: {
            // Unknown URL type
            let message = 'Unknown YouTube url type, cannot be opened in app'
            if (this.$te(message) && this.$t(message) !== '') {
              message = this.$t(message)
            }

            showToast(message)
          }
        }
      })
    },

    /**
     * Linux fix for dynamically updating theme preference, this works on
     * all systems running the electron app.
     */
    watchSystemTheme: function () {
      if (process.env.IS_ELECTRON) {
        ipcRenderer.on(IpcChannels.NATIVE_THEME_UPDATE, (event, shouldUseDarkColors) => {
          document.body.dataset.systemTheme = shouldUseDarkColors ? 'dark' : 'light'
        })
      } else if (process.env.IS_CORDOVA) {
        if ('plugins' in cordova && 'ThemeDetection' in cordova.plugins) {
          cordova.plugins.ThemeDetection.isAvailable((isThemeDetectionAvailable) => {
            if (isThemeDetectionAvailable) {
              cordova.plugins.ThemeDetection.isDarkModeEnabled((message) => {
                document.body.dataset.systemTheme = message.value ? 'dark' : 'light'
              })
            }
          }, console.error)
        } else {
          console.error('Theme detection plugin failed to load.')
        }
      }
    },

    openInternalPath: function({ path, doCreateNewWindow, query = {}, searchQueryText = null }) {
      if (process.env.IS_ELECTRON && doCreateNewWindow) {
        const { ipcRenderer } = require('electron')

        // Combine current document path and new "hash" as new window startup URL
        const newWindowStartupURL = [
          window.location.href.split('#')[0],
          `#${path}?${(new URLSearchParams(query)).toString()}`
        ].join('')
        ipcRenderer.send(IpcChannels.CREATE_NEW_WINDOW, {
          windowStartupUrl: newWindowStartupURL,
          searchQueryText
        })
      } else {
        // Web
        this.$router.push({
          path,
          query
        })
      }
    },

    enableSetSearchQueryText: function () {
      ipcRenderer.on('updateSearchInputText', (event, searchQueryText) => {
        if (searchQueryText) {
          this.$refs.topNav.updateSearchInputText(searchQueryText)
        }
      })

      ipcRenderer.send('searchInputHandlingReady')
    },

    enableOpenUrl: function () {
      ipcRenderer.on('openUrl', (event, url) => {
        if (url) {
          this.handleYoutubeLink(url)
        }
      })

      ipcRenderer.send('appReady')
    },

    handleExternalLinkOpeningPromptAnswer: function (option) {
      this.showExternalLinkOpeningPrompt = false

      if (option === 'yes' && this.lastExternalLinkToBeOpened.length > 0) {
        // Maybe user should be notified
        // if `lastExternalLinkToBeOpened` is empty

        // Open links externally
        openExternalLink(this.lastExternalLinkToBeOpened)
      }
    },

    setWindowTitle: function() {
      if (this.windowTitle !== null) {
        document.title = this.windowTitle
      }
    },

    ...mapMutations([
      'setInvidiousInstancesList'
    ]),

    ...mapActions([
      'grabUserSettings',
      'grabAllProfiles',
      'grabHistory',
      'grabAllPlaylists',
      'getYoutubeUrlInfo',
      'getExternalPlayerCmdArgumentsData',
      'fetchInvidiousInstances',
      'setRandomCurrentInvidiousInstance',
      'setupListenersToSyncWindows',
      'updateBaseTheme',
      'updateMainColor',
      'updateSecColor'
    ])
  }
})
