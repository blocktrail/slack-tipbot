Slack TipBot
============
Slack TipBot using BlockTrail API.


How to Run a TipBot
-------------------
### Setup
 - Create a blocktrail account 
 - Create an API key
    - Copy the API key and secret (don't forget the secret!)
 - Add a bot integration to slack at https://my.slack.com/services/new/bot
    - Copy the token

### Install
 - `npm install`

### Run
```sh
DEBUG="tipbot:*" node bot.js \
  --slack-token="YOUR_SLACK_TOKEN" \
  --blocktrail-apikey="YOUR_API_KEY" \
  --blocktrail-apisecret="YOUR_API_SECRET" \
  --secret="somethingveryverysecret"
```

You can also use ENV vars instead of arguments:
 - `TIPBOT_SLACK_TOKEN`, `TIPBOT_BLOCKTRAIL_APIKEY`, `TIPBOT_BLOCKTRAIL_APISECRET`, `TIPBOT_SECRET`

You should use something like (https://www.npmjs.com/package/forever)[forever] or (http://supervisord.org/)[supervisord] to keep it running on a server,
but using a `screen` does the job too xD


ToDo
----
 - withdraw EVERYTHING
 - transaction history
 - better way of dealing with errors
 - think of a way to deal with deleted users with BTC balance
 - respond to being the receiver of the action
 - use the `Trigger` class for all triggers, not just temporary ones
