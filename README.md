# Slack + Harvest bot

__This is a work in progress.__

This is a Slack bot that connects a team to Harvest app.

Uses node and botkit _(which is awesome)_.

Currently it can:

  * __authenticate__ (DM) a Harvest user with username and password and store it locally for any requests.
  * __forget__ (DM) an authenticated password.
  * Give __today__'s (DM) running timers.
  * __report__ (CH) in a channel what today's and yesterday's timers are.

Soon it will:

  * __start__ (CH) a timer.
  * __pause__ (CH) a timer.
  * __stop__ (CH) a timer.
  * __create__ (DM) a project.

For the above to work it will need to be invited to a channel via `/invite @harvester`. Then the bot will have to link a channel to a client and a project.

__Legend:__  
DM - Direct message (chatting with the bot)  
CH - Channel mention (mentioning the bot via `@harvester: report`)

## Run

```
$ git clone https://github.com/avioli/slack-harvest-bot
$ cd slack-harvest-bot
$ npm install
$ HARVEST_SUBDOMAIN=XYZ SLACK_API_TOKEN=123 node .
```

Where:

  * `HARVEST_SUBDOMAIN` is the harvest subdomain, without `.harvestapp.com`.
  * `SLACK_API_TOKEN` is the API token for your [custom bot user](https://my.slack.com/services/new/bot).

