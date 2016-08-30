const STYLES = {
  DEFAULT: 'DEFAULT',
  RAW: 'RAW',
  RANDOM: 'RANDOM',
  COLON: 'COLON',
  DASH: 'DASH',
  CODE: 'CODE'
}
const DEFAULT_STYLE = STYLES.COLON
const RANDOM_STYLE_OPTIONS = [
  STYLES.COLON,
  STYLES.DASH,
  STYLES.CODE
]

const invariant = require('invariant')

module.exports = class Styler {
  constructor (options) {
    const {
      stylesFile,
      defaultStyle
    } = options

    let styles
    try {
      styles = require(stylesFile)
    } catch (err) {
      this._initErr = err
    }

    this._defaultStyle = defaultStyle

    const {
      users,
      usersFlags
    } = styles || {}

    if (users) {
      this._users = Object.keys(users).map((pattern) => (
        {
          filter: new RegExp(pattern, usersFlags),
          style: users[pattern]
        }
      ))
    }
  }

  getStyleByUser (name) {
    let style = {
      type: this._defaultStyle || DEFAULT_STYLE,
      short: false,
      useLast: true,
      lowercase: false
    }

    if (this._users) {
      for (let user of this._users) {
        if (user.filter.test(name)) {
          style = Object.assign(style, user.style)
          break
        }
      }
    }

    if (style.short) {
      style.useLast = false
    }

    return style
  }

  getStyledString (style, string) {
    let styledString

    let { type, lowercase } = style

    if (type === STYLES.RAW) {
      return string
    }

    if (type === STYLES.RANDOM) {
      type = getRandomValue(RANDOM_STYLE_OPTIONS)
    }

    switch (type) {
      case STYLES.COLON:
        styledString = `*${string}:*`
        break

      case STYLES.DASH:
        styledString = `*${string}* -`
        break

      case STYLES.CODE:
        styledString = '`' + string + '`'
        break

      case STYLES.RAW:
      default:
        styledString = string
    }

    if (lowercase) {
      styledString = styledString.toLowerCase()
    }

    return styledString
  }

  setStyleForUser (filter, style) {
    invariant(filter instanceof RegExp, 'The filter has to be an instance of RegExp')

    this._users = this._users.concat({
      filter,
      style
    })
  }
}

function getRandomValue (obj) {
  if (Array.isArray(obj)) {
    return obj[Math.floor(Math.random() * obj.length)]
  }

  const keys = Object.keys(obj)
  const key = keys[Math.floor(Math.random() * keys.length)]
  return obj[key]
}
