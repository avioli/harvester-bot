const Botkit = require('botkit')
// const promisify = require('es6-promisify')
// const Rx = require('rxjs/Rx')
// const Observable = Rx.Observable
// const EventEmitter = require('events').EventEmitter
const Store = require('./store')
const harvester = require('./harvester')
const moment = require('moment')
require('moment-duration-format')

const harvestSubdomain = process.env.HARVEST_SUBDOMAIN

// HARVEST
// const harvest = new Harvest({
//   subdomain: process.env.HARVEST_SUBDOMAIN,
//   email: process.env.HARVEST_EMAIL,
//   password: process.env.HARVEST_PASSWORD
// })

// const projectsList = promisify(harvest.Projects.list, harvest.Projects)
// const projectsSource = Observable.fromPromise(projectsList({}))
//   .flatMap((x) => x)
//   .pluck('project')

// SLACK
const controller = Botkit.slackbot({
  debug: false,
  json_file_store: './cache'
  //include "log: false" to disable logging
  //or a "logLevel" integer from 0 to 7 to adjust logging verbosity
})
const store = Store.curry(controller)

// connect the bot to a stream of messages
controller.spawn({
  token: process.env.SLACK_API_TOKEN
  // scopes: ['chat:write:bot', 'chat:write:user']
}).startRTM((err, bot, payload) => {
  if (err) {
    // bot.destroy()
    throw new Error('Could not connect to Slack')
  }

  // console.log('payload', payload)
  const { team, channels, groups, users } = payload
  const { domain } = team

  // store.saveTeamData()

  channels.concat(groups).forEach((item) => {
    // console.log('channel:', channel)
    // NOTE(evo): groups imply membership
    const { id, is_archived, is_member, creator, is_group, name } = item

    if (is_archived || (!is_group && !is_member)) {
      return
    }

    // TODO(evo): Check local channel data if we've got connected HARVEST client/project
    store.saveChanData(id, {
      name
    })
    .catch((err) => {
      console.error('startRTM:store.saveUserData', err)
    })
  })

  users.forEach((user) => {
    const { id, deleted, is_bot, profile, name, real_name } = user

    if (deleted || is_bot || id === 'USLACKBOT') {
      return
    }

    // console.log('user:', name, real_name)
    // console.log('profile:', profile)
    const { email } = profile
    if (!email) {
      return
    }

    store.saveUserData(id, {
      name,
      slackEmail: email
    })
    .catch((err) => {
      console.error('startRTM:store.saveUserData', err)
    })
  })
})

controller.on(['channel_joined', 'group_joined'], (bot, message) => {
  // TODO(evo): track these events too: 'channel_rename', 'group_rename'
  // NOTE(evo): re above: only rename a channel if it does not have a harvest link, yet
  const { type, channel } = message
  const { id, name } = channel
  return store.saveChanData(id, {
    name
  })
  .then(({ harvestProjectId }) => {
    // TODO(evo): check if harvestProjectId is not set and ask for it
  })
  .catch((err) => {
    console.error(type + ':saveChanData', err)
  })
})


const harvestAuth = (bot, message, args = {}) => {
  const { user: userId } = message
  const { harvestEmail: defaultEmail } = args

  return store.getUserData(userId)
  .then(({ slackEmail, harvestEmail, harvestPassword } = {}) => {
    if ((defaultEmail || slackEmail) && !harvestEmail) {
      harvestEmail = defaultEmail || slackEmail
      harvestPassword = undefined
    }

    let didntWork

    if (harvestEmail && harvestPassword) {
      return harvester(harvestEmail, harvestPassword)
        .getInfo()
        .catch((err) => {
          console.error('harvester.getInfo:err', err)
          harvestEmail = harvestPassword = undefined
          didntWork = true
        })
        .then(() => ({ harvestEmail, harvestPassword, didntWork }))
    }

    return { harvestEmail, harvestPassword, didntWork }
  })
  .then(({ harvestEmail, harvestPassword, didntWork } = {}) => {
    console.log('harvestEmail:', harvestEmail)
    console.log('didntWork:', didntWork ? 'didnt': 'did')
    if (!harvestEmail || !harvestPassword || didntWork) {
      return new Promise((resolve, reject) => {
        bot.startPrivateConversation(message, (err, convo) => {
          if (err) {
            return reject(err)
          }
          resolve(convo)
        })
      })
      .then((convo) => {
        // TODO: add Promise.race with a timeout of 10 minutes or so
        return new Promise((resolve, reject) => {
          let lastAuthError

          const { privateMessageBegin, saySorry } = args
          if (privateMessageBegin) {
            privateMessageBegin()
          }

          let someof = ''
          if (saySorry) {
            if (didntWork) {
              convo.say(`Sorry, but the HARVEST details I've got didn't work.`)
            } else if (harvestEmail || harvestPassword) {
              convo.say(`Sorry, but I don't know some of your HARVEST details.`)
            } else {
              convo.say(`Sorry, but I don't know your HARVEST details.`)
            }
          }

          const cancelUtteranceText = 'cancel( that)/forget( it)'
          const cancelUtterance = /\bcancel\b( that\b)?|\bforget\b( it\b)?/i

          const askEmail = (response, convo) => {
            convo.ask(`What is your HARVEST login *email*? [${cancelUtteranceText}]`, [
              {
                pattern: cancelUtterance,
                callback: (response, convo) => {
                  convo.say('Okay. Maybe later.')
                  // convo.stop()
                  convo.next()
                }
              },
              {
                default: true,
                callback: (response, convo) => {
                  let email = convo.extractResponse('email')
                  const matches = email && email.match(/mailto:([^|]+)\|/)
                  if (matches) {
                    email = matches[1]
                  }
                  harvestEmail = email
                  testDetails(response, convo)
                }
              }
            ], { key: 'email' })
          }

          const askPassword = (response, convo) => {
            convo.ask(`What is your HARVEST login *password*? [${cancelUtteranceText}]`, [
              {
                pattern: cancelUtterance,
                callback: (response, convo) => {
                  convo.say('Okay. Maybe later.')
                  // convo.stop()
                  convo.next()
                }
              },
              {
                default: true,
                callback: (response, convo) => {
                  harvestPassword = convo.extractResponse('password')
                  testDetails(response, convo)
                }
              }
            ], { key: 'password' })
          }

          const testDetails = (response, convo) => {
            if (!harvestEmail) {
              askEmail(response, convo)
              convo.next()
            } else if (!harvestPassword) {
              askPassword(response, convo)
              convo.next()
            } else {
              convo.say('Testing...')
              harvester(harvestEmail, harvestPassword)
                .getInfo()
                .then((info) => {
                  console.log('harvester.getInfo', JSON.stringify(info))
                  convo.say('All good.')
                  lastAuthError = undefined
                }, (err) => {
                  console.error('harvester.getInfo:err', err)
                  convo.say(`Those details didn't work: ${err.message}`)
                  lastAuthError = err
                })
                .then(() => { convo.next() })
            }
          }

          if (harvestEmail) {
            convo.ask(`I've got *${harvestEmail}* on file. Should I use that as HARVEST email? [yes/no]`, [
              {
                pattern: bot.utterances.yes,
                callback: (response, convo) => {
                  convo.say('Okay.')
                  askPassword(response, convo)
                  convo.next()
                }
              },
              {
                pattern: bot.utterances.no,
                callback: (response, convo) => {
                  askEmail(response, convo)
                  convo.next()
                }
              },
              {
                default: true,
                callback: (response, convo) => {
                  convo.say(`Ooookay... didn't get that.`)
                  convo.repeat()
                  convo.next()
                }
              }
            ])
          } else {
            testDetails(null, convo)
          }

          convo.on('end', (convo) => {
            if (convo.status == 'completed') {
              const { privateMessageCompleted } = args
              if (privateMessageCompleted) {
                privateMessageCompleted()
              }

              resolve({ harvestEmail, harvestPassword, lastAuthError })
            } else {
              const { privateMessageCancelled } = args
              if (privateMessageCancelled) {
                privateMessageCancelled()
              }

              resolve({ cancelled: true })
            }
          })
        })
      })
      .then(({ harvestEmail, harvestPassword, lastAuthError } = {}) => {
        if (harvestEmail && harvestPassword && !lastAuthError) {
          return store.saveUserData(userId, {
            harvestEmail,
            harvestPassword
          })
        }

        return { harvestEmail, lastAuthError }
      })
    }

    const { gotDetails } = args
    if (gotDetails) {
      gotDetails()
    }

    return { harvestEmail, harvestPassword }
  })
}

// give the bot something to listen for.

// DIRECT MENTIONS
controller.hears('start', ['direct_mention'], (bot, message) => {
  harvestAuth(bot, message, {
    privateMessageBegin: () => {
      bot.reply(message, 'I just sent you a private message...')
    },
    privateMessageCompleted: () => {
      bot.reply(message, 'All set.')
    }
  })
  .then(({ lastAuthError }) => {
    if (lastAuthError) {
      bot.reply(message, `Something didn't work. Please, try again.`)
      return
    }
  })
  .catch((err) => {
    console.error('error:', err)
  })
})

// DIRECT MESSAGES
controller.hears('start', ['direct_message'], (bot, message) => {
  bot.reply(message, 'This command only makes sense in a channel. Invite me to one first.')
})

controller.hears(['(re-?)?auth(enticate)?', 'set[- ]?up', 'log[- ]?in'], ['direct_message'], (bot, message) => {
  harvestAuth(bot, message, {
    saySorry: false,
    gotDetails: () => {
      bot.reply(message, `The details I've got still work. If you want me to *forget them*, let me know.`)
    }
  })
  .then(({ harvestEmail, harvestPassword, lastAuthError } = {}) => {
    if (!lastAuthError) {
      if (harvestEmail && harvestPassword) {
        bot.reply(message, 'Now you can invite me to a channel and start tracking your time.')
      }
    } else {
      bot.reply(message, `If you want to re-try *${message.text}*, let me know.`)
    }
  })
  .catch((err) => {
    console.error('error:', err)
  })
})

controller.hears(['forget', 'forget me', 'forget (th|\')?em', 'log[- ]?out'], ['direct_message'], (bot, message) => {
  const { user: userId } = message

  store.saveUserData(userId, {
    harvestPassword: undefined
  })
  .then(() => {
    bot.reply(message, 'Done. Password forgotten.')
  }, (err) => {
    console.error('hears:forget:saveUserData', err)
  })
})

controller.hears('forget all', ['direct_message'], (bot, message) => {
  const { user: userId } = message

  store.saveUserData(userId, {
    harvestEmail: undefined,
    harvestPassword: undefined
  })
  .then(() => {
    bot.reply(message, 'Done.')
  }, (err) => {
    console.error('hears:forget:saveUserData', err)
  })
})

controller.hears('projects', ['direct_message'], (bot, message) => {
  const { user: userId } = message

  store.getUserData(userId)
  .then(({ harvestEmail, harvestPassword }) => {
    if (!harvestEmail || !harvestPassword) {
      bot.reply(message, 'Sorry, but you are not authenticated')
      return
    }

    return harvester(harvestEmail, harvestPassword)
      .getProjects()
      .then((projects) => {
        projects.sort((a, b) => {
          return (a.updated_at > b.updated_at) - (a.updated_at < b.updated_at)
        })
        const names = projects.slice(-10).map((project) => project.name).reverse()
        bot.reply(message, {
          attachments: [
            {
              title: 'Latest 10',
              // pretext: 'Pretext _supports_ mrkdwn',
              text: names.join('\n'),
              mrkdwn_in: ['text'] // , 'pretext']
            }
          ]
        })
      }, (err) => {
        bot.reply(message, `Got an error: ${err.message}`)
        console.error('harvester.getProjects:err', err)
      })
      .catch((err) => {
        console.error('getProjects?:', err)
      })
  })
  .catch((err) => {
    console.error('projects:getUserData', err)
  })
})

controller.hears(['today', 'timers'], ['direct_message'], (bot, message) => {
  const { user: userId } = message

  store.getUserData(userId)
  .then(({ name, harvestEmail, harvestPassword }) => {
    if (!harvestEmail || !harvestPassword) {
      bot.reply(message, 'Sorry, but you are not authenticated')
      return
    }

    return harvester(harvestEmail, harvestPassword)
      .getDaily({ slim: 1 })
      .then(({ day_entries: timers }) => {
        // console.log('timers:', timers)

        if (!timers || timers.length < 0) {
          bot.reply(message, `Sorry ${name}, but there are no timers.`)
          return
        }

        timers.sort((a, b) => {
          return (a.updated_at > b.updated_at) - (a.updated_at < b.updated_at)
        })

        const content = timers.map(({ client, project, task, hours, timer_started_at }) => {
          const duration = moment.duration(hours, 'hours')
          const durationString = duration.format('h:mm', { trim: false })
          let text = `• ${project} (${client}): *${durationString}*`
          if (timer_started_at) {
            text += ' _(running)_'
          }
          if (task && task.length > 0) {
            text += `\n_${task}_`
          }
          return text
        }).reverse()

        bot.reply(message, {
          attachments: [
            {
              title: `Today's timers`,
              // pretext: 'Pretext _supports_ mrkdwn',
              text: content.join('\n'),
              mrkdwn_in: ['text'] // , 'pretext']
            }
          ]
        })
      })
      .catch((err) => {
        console.error('getDaily?:', err)
      })
  })
  .catch((err) => {
    console.error('today:getUserData', err)
  })
})

const rnd = (array) => {
  return array[Math.floor(Math.random() * array.length)]
}

controller.hears([/\breport\b( w(ith)?( (no|the)( \b[\w]+\b)?)? (notes|task)( and( (no|the)( \b[\w]+\b)?)? (notes|task))?)?/], ['direct_mention'], (bot, message) => {
  const { user: userId, match } = message
  // console.log('message:', message)

  let withTask = false
  let withNotes = false
  if (match[6] === 'task' && match[4] !== 'no') {
    withTask = true
  }
  if (match[6] === 'notes' && match[4] !== 'no') {
    withNotes = true
  }
  if (match[11] === 'task' && match[9] !== 'no') {
    withTask = true
  }
  if (match[11] === 'notes' && match[9] !== 'no') {
    withNotes = true
  }

  store.getUserData(userId)
  .then(({ name = rnd(['sport', 'friend', 'mate', 'friend', 'buddy', 'mate']), harvestEmail, harvestPassword }) => {
    if (!harvestEmail || !harvestPassword) {
      bot.reply(message, `Sorry *${name}*, but I don't know you!`)
      return
    }

    const now = moment()
    const today = now.clone().startOf('day')
    const yesterday = today.clone().subtract(1, 'day')

    const h = harvester(harvestEmail, harvestPassword)

    return Promise.all([
      h.getDaily({ date: today.toDate(), slim: 1 }),
      h.getDaily({ date: yesterday.toDate(), slim: 1 })
    ])
      .then(([todayTimers, yesterdayTimers]) => {
        // console.log('todayTimers:', todayTimers)
        // console.log('yesterdayTimers:', yesterdayTimers)
        let harvestUserId

        const content = [yesterdayTimers, todayTimers].map(({ for_day, day_entries }) => {
          if (!day_entries || day_entries.length < 1) {
            return ''
          }

          const date = moment(for_day)

          day_entries.sort((a, b) => {
            return (a.updated_at > b.updated_at) - (a.updated_at < b.updated_at)
          })

          const dateString = date.calendar(now, {
            sameDay: '[Today]',
            nextDay: '[Tomorrow]',
            nextWeek: 'dddd',
            lastDay: '[Yesterday]',
            lastWeek: '[Last] dddd',
            sameElse: 'DD/MM/YYYY'
          })

          return [`*${dateString}:*`]
            .concat(
              day_entries.map(({ user_id, client, project, task, hours, timer_started_at, notes }) => {
                if (!harvestUserId) {
                  harvestUserId = user_id
                }
                const duration = moment.duration(hours, 'hours')
                const durationString = duration.format('h:mm', { trim: false })
                let text = `• ${project} (${client}): *${durationString}*`
                if (timer_started_at) {
                  text += ' _(running)_'
                }
                if (withTask && task && task.length > 0) {
                  text += `\n_${task}_`
                }
                if (withNotes && notes && notes.length > 0) {
                  text += `\n_Notes: ${notes}_`
                }
                return text
              }).reverse()
            )
            .join('\n')
        })

        const text = content.join('\n').trim()

        if (text.length > 0) {
          let title_link
          if (harvestUserId) {
            const todayFormatted = today.format('YYYYMMDD')
            const yesterdayFormatted = yesterday.format('YYYYMMDD')
            title_link = `https://${harvestSubdomain}.harvestapp.com/reports/users/${harvestUserId}?from=${yesterdayFormatted}&kind=custom&till=${todayFormatted}`
          }

          bot.reply(message, {
            attachments: [
              {
                title: `Here is ${name}'s report`,
                title_link,
                // pretext: 'Pretext _supports_ mrkdwn',
                text,
                mrkdwn_in: ['text'] // , 'pretext']
              }
            ]
          })
        } else {
          bot.reply(message, `Sorry ${name}, but there is nothing to report :)`)
        }
      })
      .catch((err) => {
        console.error('Promise.all:getDaily?:', err)
        bot.startPrivateConversation(message, (_err, convo) => {
          if (_err) {
            // NOTE(evo): ignore, since we can't do much about it
            return
          }
          convo.say(`Here is the error message from your report:\n${err.message}`)
          convo.next()
        })
        bot.reply(message, 'Sorry, but there was an error fetching your timers.')
      })
  })
  .catch((err) => {
    console.error('report:getUserData', err)
  })
})

controller.hears(['help', 'info', '[?]+'], ['direct_message'], (bot, message) => {
  const { text } = message

  bot.startConversation(message, (err, convo) => {
    if (err) {
      console.error(`${text}:`, err)
      return
    }

    convo.say(`I'm a work in progress.`)
    convo.say(`Ask Evo what I'm for, but he'll let you know soon.`)
    convo.next()
  })
})

controller.hears([/\bcommands\b/], ['direct_message'], (bot, message) => {
  bot.reply(message, `Sorry, but I can't say yet... since I'm a work in progress.`)
})

controller.hears('', ['direct_message'], (bot, message) => {
  bot.reply(message, `Sorry, but I'm not aware of such command... you know I'm a bot, right?\nTry asking for *help*, *info* of *commands*.`)
})

// function emitify (obj, key, keys) {
//   let eventEmitter
//   let controller = obj

//   if (obj instanceof EventEmitter && obj._source) {
//     eventEmitter = obj
//     controller = obj._source
//   } else {
//     eventEmitter = new EventEmitter()
//     eventEmitter._source = obj
//   }

//   controller.on(key, (...args) => {
//     eventEmitter.emit(key, keys.reduce((agg, k, i) => {
//       agg[k] = args[i]
//       return agg
//     }, {}))
//   })
//   return eventEmitter
// }

// const messageReceived = emitify(controller, 'message_received', ['bot', 'message'])
// var source = Observable.fromEvent(messageReceived, 'message_received')

// Observable.fromEvent(messageReceived, 'message_received')
// // .map((data) => { console.log(data); return data })
// .subscribe(({ message }) => {
//   console.log(JSON.stringify(message))
// })
